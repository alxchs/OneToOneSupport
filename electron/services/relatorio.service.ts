import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Database as DatabaseType } from 'better-sqlite3';
import { BrowserWindow, ipcMain, WebContents } from 'electron';
import { getDb } from '../db/connection';
import { getSessaoById } from '../db/repositories/sessao.repo';
import { getAtendidoById } from '../db/repositories/atendido.repo';
import { listAbasBySessao, AbaRecord } from '../db/repositories/aba.repo';
import { getRevisaoByVersao, listRevisoesBySessao, RevisaoRecord } from '../db/repositories/revisao.repo';
import {
  assetService as defaultAssetService,
  AssetService,
  getDefaultArquivoRootDir,
  slugifyAtendidoNome,
  formatSessaoTimestamp,
  sanitizeAssetTitle,
} from './asset.service';
import { EventoService, isValidId } from './evento.service';
import { configService as defaultConfigService, ConfigService } from './config.service';
import { escapeHtml } from '../server/http';
import { getVisibleElements } from '../../src/shared/events/reducer';
import { IPCResult, DEFAULT_DICTIONARY } from '../../src/shared/ipc-contract';

export interface RelatorioServiceOptions {
  db?: DatabaseType;
  timeoutMs?: number;
  eventoService?: EventoService;
  assetService?: AssetService;
  configService?: ConfigService;
}

export interface GerarRelatorioOpcoes {
  onBeforePrint?: (win: BrowserWindow) => Promise<void>;
  timeoutMs?: number;
  forcarScriptInseguroParaTesteXss?: string;
  urlExternaParaTesteBloqueioRede?: string;
}

export class RelatorioService {
  private readonly db: DatabaseType;
  private readonly timeoutMs: number;
  private readonly eventoService: EventoService;
  private readonly assetService: AssetService;
  private readonly configService: ConfigService;
  public lastBlockedNetworkRequests: number = 0;

  constructor(options: RelatorioServiceOptions = {}) {
    this.db = options.db || getDb();
    this.timeoutMs = options.timeoutMs || 15000;
    this.eventoService = options.eventoService || new EventoService({ db: this.db });
    this.assetService = options.assetService || defaultAssetService;
    this.configService = options.configService || defaultConfigService;
  }

  public listarRevisoes(sessaoId: string): IPCResult<RevisaoRecord[]> {
    if (!isValidId(sessaoId)) {
      return {
        success: false,
        error: 'VALIDATION',
        message: 'sessaoId inválido: deve conter apenas letras, números, "_" ou "-".',
      };
    }
    try {
      const revisoes = listRevisoesBySessao(sessaoId, this.db);
      return { success: true, data: revisoes };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  private resolveTemplatePath(): string {
    const candidatePaths = [
      path.resolve(__dirname, '../reports/templates/sessao.html'),
      path.resolve(__dirname, '../../electron/reports/templates/sessao.html'),
      path.resolve(process.cwd(), 'dist/electron/reports/templates/sessao.html'),
      path.resolve(process.cwd(), 'electron/reports/templates/sessao.html'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('Template HTML de relatório não encontrado em nenhum dos caminhos esperados.');
  }

  private resolvePreloadPath(): string {
    const candidatePaths = [
      path.resolve(__dirname, '../reports/preload-relatorio.js'),
      path.resolve(__dirname, '../../dist/electron/reports/preload-relatorio.js'),
      path.resolve(process.cwd(), 'dist/electron/reports/preload-relatorio.js'),
      path.resolve(__dirname, '../reports/preload-relatorio.ts'),
      path.resolve(__dirname, '../../electron/reports/preload-relatorio.ts'),
      path.resolve(process.cwd(), 'electron/reports/preload-relatorio.ts'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('Preload de relatório não encontrado. Execute npm run build antes de gerar relatórios.');
  }

  private resolveBundlePath(): string {
    const candidatePaths = [
      path.resolve(__dirname, '../reports/report-renderer.bundle.js'),
      path.resolve(__dirname, '../../dist/electron/reports/report-renderer.bundle.js'),
      path.resolve(process.cwd(), 'dist/electron/reports/report-renderer.bundle.js'),
      path.resolve(process.cwd(), 'electron/reports/report-renderer.bundle.js'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('Bundle de renderização de relatório (report-renderer.bundle.js) não encontrado.');
  }

  private formatarTimestamp(timestampMs: number): string {
    const d = new Date(timestampMs);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hora}:${min}`;
  }

  private traduzirTipoAba(tipo: AbaRecord['tipo']): string {
    switch (tipo) {
      case 'blank':
        return 'Quadro em Branco';
      case 'image':
        return 'Imagem';
      case 'pdf':
        return 'Documento PDF';
      case 'video':
        return 'Vídeo';
      case 'audio':
        return 'Áudio';
      default:
        return String(tipo);
    }
  }

  /**
   * Gera o relatório da sessão em formato PDF conforme os requisitos R1..R7 (ADR-015).
   */
  /**
   * Prepara os dados da sessão, reconstrói os estados vetoriais e monta o HTML do relatório (R1, R4).
   * Método exposto para permitir auditoria e testes unitários diretos de sanitização e reconstrução.
   */
  public async prepararDadosERecursos(
    sessaoId: string,
    numeroVersao?: number,
    opcoes?: GerarRelatorioOpcoes
  ): Promise<
    IPCResult<{
      htmlMontado: string;
      pastaDestinoSessao: string;
      caminhoFinalPdf: string;
      preloadPath: string;
      abasPayloadParaJanela: Array<{
        id: string;
        tipo: AbaRecord['tipo'];
        renderMiniatura: boolean;
        state: unknown;
        assetDataUri?: string | null;
      }>;
    }>
  > {
    // 1. Validação de identificador seguro contra Path Traversal
    if (!isValidId(sessaoId)) {
      return {
        success: false,
        error: 'VALIDATION',
        message: 'sessaoId inválido: deve conter apenas letras, números, "_" ou "-".',
      };
    }

    // 2. Validação de número de versão (se informado)
    if (numeroVersao !== undefined) {
      if (
        typeof numeroVersao !== 'number' ||
        !Number.isInteger(numeroVersao) ||
        numeroVersao <= 0
      ) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'numeroVersao inválido: deve ser um número inteiro positivo.',
        };
      }
    }

    // 3. Consulta de dados essenciais no SQLite
    const sessao = getSessaoById(sessaoId, this.db);
    if (!sessao) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `Sessão com id '${sessaoId}' não encontrada.`,
      };
    }

    const atendido = getAtendidoById(sessao.atendido_id, this.db);
    if (!atendido) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `Atendido associado à sessão não encontrado.`,
      };
    }

    const dictRes = this.configService.getDictionary();
    const dicionario = dictRes.success && dictRes.data ? dictRes.data : DEFAULT_DICTIONARY;

    const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';
    const rotuloSessao = dicionario['rotulo.sessao'] || 'Sessão';
    const rotuloHost = dicionario['rotulo.host'] || 'Profissional';

    // 4. Resolução da revisão selecionada
    let corteIdx: number | undefined;
    let versaoInfoTexto: string;

    if (numeroVersao !== undefined) {
      const revisao = getRevisaoByVersao(sessaoId, numeroVersao, this.db);
      if (!revisao) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: `Revisão versão ${numeroVersao} não encontrada para a sessão '${sessaoId}'.`,
        };
      }
      corteIdx = revisao.snapshot_evento_idx;
      versaoInfoTexto = `Revisão ${numeroVersao}${revisao.titulo ? ': ' + revisao.titulo : ''}`;
    } else {
      corteIdx = undefined;
      versaoInfoTexto = 'Estado atual (mais recente)';
    }

    // 5. Consulta e preparação das abas da sessão
    const abas = listAbasBySessao(sessaoId, this.db);
    const abasPayloadParaJanela: Array<{
      id: string;
      tipo: AbaRecord['tipo'];
      renderMiniatura: boolean;
      state: unknown;
      assetDataUri?: string | null;
    }> = [];

    const secoesAbasHtmlPartes: string[] = [];

    for (const aba of abas) {
      // Reconstrução do estado vetorial da aba até o índice de corte
      const targetSubAbaId = aba.tipo === 'pdf' ? `${aba.id}_p1` : aba.id;
      let state = this.eventoService.reconstruirEstadoAba(sessaoId, targetSubAbaId, corteIdx);

      // Fallback para abas PDF que possam ter recebido anotações no id base
      if (aba.tipo === 'pdf' && getVisibleElements(state).length === 0) {
        const fallbackState = this.eventoService.reconstruirEstadoAba(sessaoId, aba.id, corteIdx);
        if (getVisibleElements(fallbackState).length > 0) {
          state = fallbackState;
        }
      }

      const visibleElements = getVisibleElements(state);
      const temElementosVisiveis = visibleElements.length > 0;
      const temAsset = Boolean(aba.asset_id);

      // Resolução de asset (se presente)
      let assetNomeSanitizado: string | null = null;
      let assetDataUri: string | null = null;

      if (temAsset && aba.asset_id) {
        const assetRes = this.assetService.getById(aba.asset_id);
        if (assetRes.success && assetRes.data) {
          const assetRecord = assetRes.data;
          assetNomeSanitizado = sanitizeAssetTitle(path.basename(assetRecord.path));
          const absPath = this.assetService.resolveAbsolutePath(assetRecord);
          if (fs.existsSync(absPath)) {
            const buf = fs.readFileSync(absPath);
            assetDataUri = `data:${assetRecord.mime};base64,${buf.toString('base64')}`;
          }
        }
      }

      // Regra de geração de miniatura (R1/R2):
      // Vídeo e áudio: sem miniatura de mídia (fora de escopo de miniatura gráfica)
      // Aba em branco sem elementos: pula miniatura
      let renderMiniatura = false;
      if (aba.tipo === 'video' || aba.tipo === 'audio') {
        renderMiniatura = false;
      } else if (temElementosVisiveis || (temAsset && (aba.tipo === 'image' || aba.tipo === 'pdf'))) {
        renderMiniatura = true;
      }

      abasPayloadParaJanela.push({
        id: aba.id,
        tipo: aba.tipo,
        renderMiniatura,
        state,
        assetDataUri,
      });

      // Montagem da seção HTML da aba com todo o texto rigorosamente escapado (R4, R6)
      const abaTipoFormatado = this.traduzirTipoAba(aba.tipo);
      const secaoHtml = `
        <div class="secao-bloco" id="secao-aba-${escapeHtml(aba.id)}">
          <div class="secao-titulo">
            <span>${escapeHtml(aba.titulo || 'Sem título')}</span>
            <span class="badge-tipo">${escapeHtml(abaTipoFormatado)}</span>
          </div>
          ${
            assetNomeSanitizado
              ? `<div class="asset-meta">Arquivo original: <strong>${escapeHtml(assetNomeSanitizado)}</strong></div>`
              : ''
          }
          ${
            renderMiniatura
              ? `<div class="miniatura-container">
                   <img id="miniatura-${escapeHtml(aba.id)}" class="miniatura-img" alt="Miniatura da aba ${escapeHtml(aba.titulo || 'Sem título')}" />
                 </div>`
              : `<div class="sem-conteudo">
                   ${
                     aba.tipo === 'video' || aba.tipo === 'audio'
                       ? 'Mídia reproduzível anexada (sem quadro de anotação gráfica).'
                       : 'Aba em branco / sem anotações registradas.'
                   }
                 </div>`
          }
        </div>
      `;
      secoesAbasHtmlPartes.push(secaoHtml);
    }

    const secoesAbasHtml =
      secoesAbasHtmlPartes.length > 0
        ? secoesAbasHtmlPartes.join('\n')
        : '<div class="sem-conteudo">Nenhuma aba registrada nesta sessão.</div>';

    // 6. Resolução de caminhos e diretórios de destino
    const templatePath = this.resolveTemplatePath();
    const preloadPath = this.resolvePreloadPath();

    const slugAtendido = slugifyAtendidoNome(atendido.nome || 'atendido') || `atendido_${atendido.id}`;
    const pastaSessao = `${formatSessaoTimestamp(sessao.iniciado_em)}_${sessao.id}`;
    const raizArquivo = getDefaultArquivoRootDir();
    const pastaDestinoSessao = path.join(raizArquivo, slugAtendido, pastaSessao);

    if (!fs.existsSync(pastaDestinoSessao)) {
      fs.mkdirSync(pastaDestinoSessao, { recursive: true });
    }

    const caminhoFinalPdf = path.join(pastaDestinoSessao, 'relatorio.pdf');

    // 7. Montagem do HTML com Handlebars-like string templating e escape de HTML (R1, R4)
    const templateRaw = fs.readFileSync(templatePath, 'utf8');

    let htmlMontado = templateRaw
      .replace(/\{\{sessao_titulo\}\}/g, escapeHtml(sessao.titulo || `${rotuloSessao} sem título`))
      .replace(/\{\{sessao_titulo_meta\}\}/g, escapeHtml(sessao.titulo || 'Sem título'))
      .replace(/\{\{versao_info\}\}/g, escapeHtml(versaoInfoTexto))
      .replace(/\{\{rotulo_guest\}\}/g, escapeHtml(rotuloGuest))
      .replace(/\{\{rotulo_sessao\}\}/g, escapeHtml(rotuloSessao))
      .replace(/\{\{rotulo_host\}\}/g, escapeHtml(rotuloHost))
      .replace(/\{\{atendido_nome\}\}/g, escapeHtml(atendido.nome || 'Atendido sem nome'))
      .replace(/\{\{data_inicio\}\}/g, escapeHtml(this.formatarTimestamp(sessao.iniciado_em)))
      .replace(
        /\{\{data_encerramento\}\}/g,
        escapeHtml(sessao.encerrado_em ? this.formatarTimestamp(sessao.encerrado_em) : 'Em andamento')
      )
      .replace(
        /\{\{notas_host\}\}/g,
        escapeHtml(sessao.notas_host || 'Nenhuma anotação privada registrada.')
      )
      .replace(/\{\{total_abas\}\}/g, String(abas.length))
      .replace(/\{\{secoes_abas\}\}/g, secoesAbasHtml);

    // Suporte a injeção controlada de script para teste adversarial de XSS (R6)
    if (opcoes?.forcarScriptInseguroParaTesteXss) {
      htmlMontado = htmlMontado.replace(
        '</body>',
        `${opcoes.forcarScriptInseguroParaTesteXss}\n</body>`
      );
    }

    // Suporte a injeção controlada de imagem externa para teste de bloqueio de rede (R6)
    if (opcoes?.urlExternaParaTesteBloqueioRede) {
      htmlMontado = htmlMontado.replace(
        '</body>',
        `<img src="${opcoes.urlExternaParaTesteBloqueioRede}" alt="teste-rede" />\n</body>`
      );
    }

    return {
      success: true,
      data: {
        htmlMontado,
        pastaDestinoSessao,
        caminhoFinalPdf,
        preloadPath,
        abasPayloadParaJanela,
      },
    };
  }

  /**
   * Gera o relatório da sessão em formato PDF conforme os requisitos R1..R7 (ADR-015).
   */
  public async gerar(
    sessaoId: string,
    numeroVersao?: number,
    opcoes?: GerarRelatorioOpcoes
  ): Promise<IPCResult<{ path: string }>> {
    const recursosRes = await this.prepararDadosERecursos(sessaoId, numeroVersao, opcoes);
    if (!recursosRes.success) {
      return { success: false, error: recursosRes.error, message: recursosRes.message };
    }

    const {
      htmlMontado,
      pastaDestinoSessao,
      caminhoFinalPdf,
      preloadPath,
      abasPayloadParaJanela,
    } = recursosRes.data;

    // Gravação do HTML temporário na pasta da sessão
    const tempHtmlFileName = `.relatorio-${crypto.randomUUID()}.html`;
    const tempHtmlFilePath = path.join(pastaDestinoSessao, tempHtmlFileName);
    fs.writeFileSync(tempHtmlFilePath, htmlMontado, 'utf8');

    // Cópia temporária do bundle de renderização para a pasta da sessão (se não estiver lá)
    const bundleSrcPath = this.resolveBundlePath();
    const tempBundlePath = path.join(pastaDestinoSessao, 'report-renderer.bundle.js');
    let bundleCopiadoTemporario = false;
    if (!fs.existsSync(tempBundlePath)) {
      fs.copyFileSync(bundleSrcPath, tempBundlePath);
      bundleCopiadoTemporario = true;
    }

    // 8. Renderização via BrowserWindow offscreen nativo (R3)
    let win: BrowserWindow | null = null;
    let timerTimeout: NodeJS.Timeout | null = null;
    let rendererProntoHandler: ((event: Electron.IpcMainEvent) => void) | null = null;
    this.lastBlockedNetworkRequests = 0;

    try {
      const offlinePartition = `relatorio-offline-${crypto.randomUUID()}`;
      win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: preloadPath,
          partition: offlinePartition,
        },
      });

      const webContents: WebContents = win.webContents;

      // Interceptação obrigatória de tráfego de rede: bloqueia qualquer URL não-local (R3, R6)
      webContents.session.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        const permitida =
          url.startsWith('file:') ||
          url.startsWith('data:') ||
          url.startsWith('blob:') ||
          url.startsWith('chrome-devtools:');

        if (permitida) {
          callback({ cancel: false });
        } else {
          this.lastBlockedNetworkRequests++;
          console.warn(`[RelatorioService] Requisição de rede bloqueada por segurança: ${url}`);
          callback({ cancel: true });
        }
      });

      // Aguarda sinal de prontidão emitido pelo preload após desenho das miniaturas
      const timeoutLimiteMs = opcoes?.timeoutMs || this.timeoutMs;
      const promessaPronto = new Promise<void>((resolve, reject) => {
        const canalPronto = 'relatorio:pronto';
        const canalErro = 'relatorio:erro';

        const prontoHandler = (event: Electron.IpcMainEvent) => {
          if (event.sender.id === webContents.id) {
            cleanup();
            resolve();
          }
        };

        const erroHandler = (event: Electron.IpcMainEvent, erroMsg: string) => {
          if (event.sender.id === webContents.id) {
            cleanup();
            reject(new Error(`Erro retornado pela janela de relatório: ${erroMsg}`));
          }
        };

        const cleanup = () => {
          if (timerTimeout) {
            clearTimeout(timerTimeout);
            timerTimeout = null;
          }
          ipcMain.removeListener(canalPronto, prontoHandler);
          ipcMain.removeListener(canalErro, erroHandler);
        };

        ipcMain.on(canalPronto, prontoHandler);
        ipcMain.on(canalErro, erroHandler);

        timerTimeout = setTimeout(() => {
          cleanup();
          reject(new Error(`TIMEOUT_RELATORIO: Tempo limite de ${timeoutLimiteMs}ms excedido ao renderizar miniaturas.`));
        }, timeoutLimiteMs);
      });

      // Handshake bidirecional: registra listener para confirmar que o renderer carregou
      let rendererPronto = false;
      rendererProntoHandler = (event: Electron.IpcMainEvent) => {
        if (event.sender.id === webContents.id) {
          rendererPronto = true;
        }
      };
      ipcMain.on('relatorio:renderer-pronto', rendererProntoHandler);

      await win.loadFile(tempHtmlFilePath);

      // Aguarda sinal de prontidão do renderer com fallback de segurança
      if (!rendererPronto) {
        await new Promise<void>((resolve) => {
          const checkTimer = setInterval(() => {
            if (rendererPronto) {
              clearInterval(checkTimer);
              resolve();
            }
          }, 40);
          setTimeout(() => {
            clearInterval(checkTimer);
            resolve();
          }, 2500);
        });
      }

      if (rendererProntoHandler) {
        ipcMain.removeListener('relatorio:renderer-pronto', rendererProntoHandler);
        rendererProntoHandler = null;
      }

      // Dispara renderização das miniaturas com o payload preparado
      webContents.send('relatorio:iniciar', {
        sessaoId,
        abas: abasPayloadParaJanela,
      });

      await promessaPronto;

      // Gancho de inspeção pré-impressão (usado para captura de tela real e prova de pixel nos testes)
      if (opcoes?.onBeforePrint) {
        await opcoes.onBeforePrint(win);
      }

      // 9. Geração nativa do PDF via webContents.printToPDF (R3, R4)
      const footerTemplate = `
        <div style="font-size: 8px; text-align: right; width: 100%; padding-right: 15mm; color: #64748b; font-family: -apple-system, sans-serif;">
          OneToOneSupport &bull; Página <span class="pageNumber"></span> de <span class="totalPages"></span>
        </div>
      `;

      const headerTemplate = `
        <div style="font-size: 8px; color: #94a3b8; width: 100%; padding-left: 15mm; font-family: -apple-system, sans-serif;">
          OneToOneSupport &bull; Relatório de Atendimento 1:1
        </div>
      `;

      const pdfBuffer = await webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0.4,
          bottom: 0.4,
          left: 0.4,
          right: 0.4,
        },
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
      });

      // 10. Gravação Atômica em disco (R1): arquivo temporário seguido de rename
      const tempPdfPath = path.join(pastaDestinoSessao, `relatorio.pdf.${crypto.randomUUID()}.tmp`);
      fs.writeFileSync(tempPdfPath, pdfBuffer);
      fs.renameSync(tempPdfPath, caminhoFinalPdf);

      return { success: true, data: { path: caminhoFinalPdf } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message: msg };
    } finally {
      if (rendererProntoHandler) {
        ipcMain.removeListener('relatorio:renderer-pronto', rendererProntoHandler);
      }
      if (timerTimeout) {
        clearTimeout(timerTimeout);
      }
      if (win && !win.isDestroyed()) {
        win.close();
      }
      try {
        if (fs.existsSync(tempHtmlFilePath)) {
          fs.unlinkSync(tempHtmlFilePath);
        }
      } catch (_cleanupErr) {
        void _cleanupErr;
      }
      try {
        if (bundleCopiadoTemporario && fs.existsSync(tempBundlePath)) {
          fs.unlinkSync(tempBundlePath);
        }
      } catch (_bundleErr) {
        void _bundleErr;
      }
    }
  }
}

export const relatorioService = new RelatorioService();
