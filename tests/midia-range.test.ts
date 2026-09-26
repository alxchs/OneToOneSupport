import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { SessionManager } from '../electron/server/session-manager';
import { startHttpServer, HttpServerHandle } from '../electron/server/http';
import { assetService } from '../electron/services/asset.service';

function httpRequest(
  url: string,
  options: http.RequestOptions = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('M3 — Servir Mídia por HTTP com Range Requests e Autenticação Criptográfica', () => {
  let db: DatabaseType;
  let tempAssetsDir: string;
  let sessionManager: SessionManager;
  let serverHandle: HttpServerHandle;
  let sessaoId: string;
  let mediaToken: string;
  let assetId: string;
  let testContent: Buffer;
  const TOTAL_SIZE = 1000;

  beforeEach(async () => {
    tempAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-midia-test-'));
    process.env.ONETOONE_ASSETS_DIR = tempAssetsDir;

    db = initDb({ dbPath: ':memory:' });

    const atendidoRes = createAtendido({ nome: 'Atendido Midia' }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido');

    const sessaoRes = createSessao({ atendido_id: atendidoRes.id, titulo: 'Sessão Mídia' }, Date.now(), db);
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão');
    sessaoId = sessaoRes.id;

    sessionManager = new SessionManager({ sessaoId, atendidoId: atendidoRes.id });
    mediaToken = sessionManager.getMediaToken();

    // Cria um buffer de 1000 bytes com cabeçalho MP3 válido (ID3)
    testContent = Buffer.alloc(TOTAL_SIZE);
    testContent.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // ID3v2 header
    for (let i = 10; i < TOTAL_SIZE; i++) {
      testContent[i] = i % 256;
    }

    const importRes = assetService.importAsset(sessaoId, testContent, 'audio_teste.mp3');
    if (!importRes.success || !importRes.data) throw new Error('Falha ao importar asset de teste');
    assetId = importRes.data.id;

    serverHandle = await startHttpServer(sessionManager, 0, '127.0.0.1');
  });

  afterEach(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
    try {
      if (fs.existsSync(tempAssetsDir)) {
        fs.rmSync(tempAssetsDir, { recursive: true, force: true });
      }
    } catch {}
    delete process.env.ONETOONE_ASSETS_DIR;
  });

  afterAll(() => {
    closeDb();
  });

  it('exige token de autorização válido (401 Unauthorized para ausente ou inválido)', async () => {
    // 1. Sem token
    const resNoToken = await httpRequest(`http://127.0.0.1:${serverHandle.port}/midia/${assetId}`);
    expect(resNoToken.statusCode).toBe(401);

    // 2. Token incorreto (mesmo tamanho)
    const badToken = 'X'.repeat(mediaToken.length);
    const resBadToken = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${badToken}`
    );
    expect(resBadToken.statusCode).toBe(401);
  });

  it('retorna 404 para asset de outra sessão ou inexistente (não vaza existência nem paths)', async () => {
    // 1. ID inexistente
    const resInexistente = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/asset-nao-existe?token=${mediaToken}`
    );
    expect(resInexistente.statusCode).toBe(404);
    expect(resInexistente.body.toString()).not.toContain('C:\\');
    expect(resInexistente.body.toString()).not.toContain('/home/');

    // 2. Asset de outra sessão
    const outraSessaoRes = createSessao({ atendido_id: 'atendido-qualquer', titulo: 'Outra' }, Date.now(), db);
    const assetOutraSessao = assetService.importAsset(
      outraSessaoRes.created ? outraSessaoRes.id : 'outra-id',
      testContent,
      'outro.mp3'
    );
    if (assetOutraSessao.success && assetOutraSessao.data) {
      const resOutraSessao = await httpRequest(
        `http://127.0.0.1:${serverHandle.port}/midia/${assetOutraSessao.data.id}?token=${mediaToken}`
      );
      // Deve retornar 404 e não 403 para não revelar a existência do asset de outra sessão
      expect(resOutraSessao.statusCode).toBe(404);
    }
  });

  it('serve arquivo completo com 200 OK quando não há cabeçalho Range (suporte a GET e HEAD)', async () => {
    // GET completo
    const resGet = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`
    );
    expect(resGet.statusCode).toBe(200);
    expect(resGet.headers['content-type']).toBe('audio/mpeg');
    expect(resGet.headers['accept-ranges']).toBe('bytes');
    expect(resGet.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(resGet.headers['content-length'])).toBe(TOTAL_SIZE);
    expect(resGet.body).toEqual(testContent);

    // HEAD completo
    const resHead = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { method: 'HEAD' }
    );
    expect(resHead.statusCode).toBe(200);
    expect(resHead.headers['content-type']).toBe('audio/mpeg');
    expect(resHead.headers['accept-ranges']).toBe('bytes');
    expect(Number(resHead.headers['content-length'])).toBe(TOTAL_SIZE);
    expect(resHead.body).toHaveLength(0);
  });

  it('atende Range Requests com status 206 (bytes=0-0, bytes=0-, bytes=-500, saturação)', async () => {
    // 1. bytes=0-0 (apenas o primeiro byte)
    const resByteZero = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=0-0' } }
    );
    expect(resByteZero.statusCode).toBe(206);
    expect(resByteZero.headers['content-range']).toBe(`bytes 0-0/${TOTAL_SIZE}`);
    expect(Number(resByteZero.headers['content-length'])).toBe(1);
    expect(resByteZero.body[0]).toBe(testContent[0]);

    // 2. bytes=0- (do início até o fim)
    const resAll = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=0-' } }
    );
    expect(resAll.statusCode).toBe(206);
    expect(resAll.headers['content-range']).toBe(`bytes 0-${TOTAL_SIZE - 1}/${TOTAL_SIZE}`);
    expect(Number(resAll.headers['content-length'])).toBe(TOTAL_SIZE);
    expect(resAll.body).toEqual(testContent);

    // 3. bytes=-500 (sufixo: últimos 500 bytes)
    const resSuffix = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=-500' } }
    );
    expect(resSuffix.statusCode).toBe(206);
    expect(resSuffix.headers['content-range']).toBe(`bytes 500-${TOTAL_SIZE - 1}/${TOTAL_SIZE}`);
    expect(Number(resSuffix.headers['content-length'])).toBe(500);
    expect(resSuffix.body).toEqual(testContent.subarray(500));

    // 4. Faixa além do fim (satura no tamanho real)
    const resBeyond = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=900-5000' } }
    );
    expect(resBeyond.statusCode).toBe(206);
    expect(resBeyond.headers['content-range']).toBe(`bytes 900-${TOTAL_SIZE - 1}/${TOTAL_SIZE}`);
    expect(Number(resBeyond.headers['content-length'])).toBe(100);
    expect(resBeyond.body).toEqual(testContent.subarray(900));
  });

  it('rejeita ranges inválidos ou não suportados com 416 Range Not Satisfiable', async () => {
    // 1. Range invertido (bytes=500-200)
    const resInverted = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=500-200' } }
    );
    expect(resInverted.statusCode).toBe(416);
    expect(resInverted.headers['content-range']).toBe(`bytes */${TOTAL_SIZE}`);

    // 2. Range não numérico (bytes=abc)
    const resMalformado = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=abc' } }
    );
    expect(resMalformado.statusCode).toBe(416);

    // 3. Multi-range (rejeitado em V1)
    const resMulti = await httpRequest(
      `http://127.0.0.1:${serverHandle.port}/midia/${assetId}?token=${mediaToken}`,
      { headers: { Range: 'bytes=0-10,20-30' } }
    );
    expect(resMulti.statusCode).toBe(416);
  });
});
