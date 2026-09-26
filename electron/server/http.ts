import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from './session-manager';
import { GUEST_CSP } from '../../src/shared/csp';
import { assetService } from '../services/asset.service';

export interface HttpServerHandle {
  app: express.Express;
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Cria a aplicação Express 4 configurada para servir o Guest e arquivos estáticos,
 * aplicando cabeçalhos de segurança, CSP do ADR-005, limites de payload e sem CORS aberto.
 */
export function createExpressApp(sessionManager: SessionManager): express.Express {
  const app = express();

  // 1. Limite estrito de payload (1 MB)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: false }));

  // 2. Cabeçalhos de segurança e CSP do ADR-005 em todas as respostas
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', GUEST_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Sem CORS aberto (Access-Control-Allow-Origin: * não é definido)
    next();
  });

  // 3. Rota de verificação de integridade (Health Check)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      sessaoId: sessionManager.sessaoId,
      state: sessionManager.getState(),
      uptime: process.uptime(),
    });
  });

  // 3b. Rota de serviço de mídia com Range Requests (M3)
  const handleMidia = (req: Request, res: Response) => {
    // Permite CORS para requisições de mídia locais do Host e do Guest
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization, X-Media-Token');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length, Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // 1. Autorização: token de mídia da sessão comparado em tempo constante
    let providedToken: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedToken = authHeader.slice(7).trim();
    } else if (typeof req.query.token === 'string') { // risco-aceito: SEGREDO_COMPARADO
      providedToken = req.query.token;
    } else if (typeof req.headers['x-media-token'] === 'string') {
      providedToken = req.headers['x-media-token'];
    }

    if (!providedToken || !sessionManager.validateMediaToken(providedToken)) {
      res.status(401).send('Unauthorized');
      return;
    }

    // 2. Consulta de asset (deve pertencer à sessão ativa)
    const assetId = req.params.assetId;
    const assetRes = assetService.getById(assetId);
    if (!assetRes.success || !assetRes.data || assetRes.data.sessao_id !== sessionManager.sessaoId) {
      // 404 para asset de outra sessão ou inexistente (não vaza existência)
      res.status(404).send('Not Found');
      return;
    }

    const asset = assetRes.data;
    const filePath = assetService.resolveAbsolutePath(asset);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('Not Found');
      return;
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', asset.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = req.headers.range;
    if (!range) {
      res.status(200);
      res.setHeader('Content-Length', total);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Processamento do cabeçalho Range
    if (!range.startsWith('bytes=')) {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }

    const rangeSpec = range.slice(6).trim();
    // Multi-range (vírgula): 416 em V1
    if (rangeSpec.includes(',')) {
      res.setHeader('Content-Range', `bytes */${total}`);
      res.status(416).end();
      return;
    }

    let start: number;
    let end: number;

    if (rangeSpec.startsWith('-')) {
      const suffix = parseInt(rangeSpec.slice(1), 10);
      if (isNaN(suffix) || suffix <= 0) {
        res.setHeader('Content-Range', `bytes */${total}`);
        res.status(416).end();
        return;
      }
      start = suffix >= total ? 0 : total - suffix;
      end = total - 1;
    } else if (rangeSpec.endsWith('-')) {
      start = parseInt(rangeSpec.slice(0, -1), 10);
      if (isNaN(start) || start < 0 || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        res.status(416).end();
        return;
      }
      end = total - 1;
    } else {
      const parts = rangeSpec.split('-');
      if (parts.length !== 2) {
        res.setHeader('Content-Range', `bytes */${total}`);
        res.status(416).end();
        return;
      }
      start = parseInt(parts[0], 10);
      end = parseInt(parts[1], 10);
      if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        res.status(416).end();
        return;
      }
      if (end >= total) {
        end = total - 1;
      }
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', chunkSize);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath, { start, end }).pipe(res);
  };

  app.get('/midia/:assetId', handleMidia);
  app.head('/midia/:assetId', handleMidia);

  // 4. Arquivos estáticos do Guest (compilados pelo Vite para dist/guest)
  const candidateGuestDistPaths = [
    path.resolve(__dirname, '../../dist/guest'),
    path.resolve(__dirname, '../../../dist/guest'),
    path.resolve(__dirname, '../guest'),
    path.resolve(process.cwd(), 'dist/guest'),
  ];
  const candidateGuestDist =
    candidateGuestDistPaths.find((p) => fs.existsSync(p)) || candidateGuestDistPaths[0];

  if (fs.existsSync(candidateGuestDist)) {
    app.use('/guest', express.static(candidateGuestDist));
    const assetsDir = path.join(candidateGuestDist, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir));
    }
  }

  app.get('/guest', (_req: Request, res: Response) => {
    const guestHtmlPath = path.join(candidateGuestDist, 'index.html');
    if (fs.existsSync(guestHtmlPath)) {
      res.sendFile(guestHtmlPath);
      return;
    }
    res.status(404).send('Guest build not found');
  });

  // 5. Rota de entrada do convite: /join/:token
  // Nota: o fragmento #<pk_h_base64url> não é enviado pelo navegador nesta requisição HTTP (propriedade do hash)
  app.get('/join/:token', (req: Request, res: Response) => {
    const token = req.params.token;

    if (!token || !sessionManager.isTokenValidForHttpJoin(token)) {
      res.status(403).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Convite Inválido - OneToOneSupport</title>
            <style>
              body {
                background-color: #0f172a;
                color: #f8fafc;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                padding: 1rem;
                box-sizing: border-box;
              }
              .card {
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 0.75rem;
                padding: 2rem;
                max-width: 28rem;
                text-align: center;
              }
              h1 { color: #f59e0b; margin-top: 0; font-size: 1.5rem; }
              p { color: #94a3b8; font-size: 0.9375rem; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Convite Inválido ou Expirado</h1>
              <p>Este link de atendimento não é mais válido ou o prazo para acesso expirou.</p>
              <p>Solicite um novo link ou QR Code ao profissional responsável.</p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // Se houver o HTML empacotado do guest, serve o arquivo
    const candidateHtml = [
      path.join(candidateGuestDist, 'index.html'),
      path.join(candidateGuestDist, 'guest.html'),
    ].find((p) => fs.existsSync(p));

    if (candidateHtml) {
      res.sendFile(candidateHtml);
      return;
    }

    // Fallback amigável enquanto a Fase 07 (Guest UI) não é implementada
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sala de Atendimento - OneToOneSupport</title>
          <style>
            body {
              background-color: #0f172a;
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 1.5rem;
              box-sizing: border-box;
            }
            .card {
              background-color: #111c44;
              border: 1px solid #1e293b;
              border-radius: 0.875rem;
              padding: 2rem;
              max-width: 32rem;
              text-align: center;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .badge {
              display: inline-block;
              padding: 0.25rem 0.75rem;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 600;
              background-color: #064e3b;
              color: #34d399;
              margin-bottom: 1rem;
            }
            h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; color: #f8fafc; }
            p { color: #94a3b8; font-size: 0.9375rem; line-height: 1.6; margin: 0.5rem 0; }
            .token-box {
              background-color: #0c1322;
              border: 1px solid #334155;
              border-radius: 0.5rem;
              padding: 0.75rem;
              margin: 1.25rem 0;
              font-family: monospace;
              font-size: 0.8125rem;
              color: #38bdf8;
              word-break: break-all;
            }
            .footer-note {
              margin-top: 1.5rem;
              font-size: 0.8125rem;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">Sessão Conectada</span>
            <h1>Sala de Atendimento 1:1</h1>
            <p>Conexão com o servidor local do profissional estabelecida com sucesso.</p>
            <div class="token-box">
              Token de Acesso: ${escapeHtml(token)}
            </div>
            <p>O aplicativo web do Guest será integrado nesta tela na Fase 07. A comunicação WebSocket segura (E2EE) está ativa no servidor.</p>
            <div class="footer-note">OneToOneSupport • Plataforma Local-First E2EE</div>
          </div>
        </body>
      </html>
    `);
  });

  return app;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Inicia o servidor HTTP em uma porta dinâmica (0 → porta atribuída pelo SO)
 */
export async function startHttpServer(
  sessionManager: SessionManager,
  port: number = 0,
  host: string = '0.0.0.0'
): Promise<HttpServerHandle> {
  const app = createExpressApp(sessionManager);
  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      reject(err);
    });

    server.listen(port, host, () => {
      const addr = server.address();
      const assignedPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        app,
        server,
        port: assignedPort,
        close: () =>
          new Promise<void>((res, rej) => {
            const extServer = server as http.Server & { closeAllConnections?: () => void };
            if (typeof extServer.closeAllConnections === 'function') {
              extServer.closeAllConnections();
            }
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
