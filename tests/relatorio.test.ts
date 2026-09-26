import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { createAba } from '../electron/db/repositories/aba.repo';
import { appendEvento } from '../electron/db/repositories/evento.repo';
import { createRevisao } from '../electron/db/repositories/revisao.repo';
import { RelatorioService } from '../electron/services/relatorio.service';
import { EventoService } from '../electron/services/evento.service';
import { AssetService } from '../electron/services/asset.service';
import { ConfigService } from '../electron/services/config.service';
import {
  handleRelatorioGerar,
  handleRelatorioListarRevisoes,
  handleRelatorioAbrir,
} from '../electron/ipc/relatorio.ipc';
import { escapeHtml } from '../electron/server/http';

describe('Fase 09 — Relatório em PDF da Sessão (R1..R8)', () => {
  let db: DatabaseType;
  let tempAssetsDir: string;
  let tempArquivoDir: string;
  let assetService: AssetService;
  let configService: ConfigService;
  let eventoService: EventoService;
  let relatorioService: RelatorioService;
  let sessaoId: string;
  let atendidoId: string;

  beforeEach(() => {
    tempAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-rel-assets-'));
    tempArquivoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-rel-arquivo-'));

    process.env.ONETOONE_ASSETS_DIR = tempAssetsDir;
    process.env.ONETOONE_ARQUIVO_DIR = tempArquivoDir;

    db = initDb({ dbPath: ':memory:' });
    assetService = new AssetService(db, tempAssetsDir);
    configService = new ConfigService(db);
    eventoService = new EventoService({ db });

    relatorioService = new RelatorioService({
      db,
      assetService,
      configService,
      eventoService,
      timeoutMs: 5000,
    });

    const atendidoRes = createAtendido({ nome: 'Carlos Drumond de Andrade' }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido para teste');
    atendidoId = atendidoRes.id;

    const sessaoRes = createSessao(
      { atendido_id: atendidoId, titulo: 'Sessão de Avaliação Psicológica' },
      1700000000000,
      db
    );
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão para teste');
    sessaoId = sessaoRes.id;
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempAssetsDir)) {
        fs.rmSync(tempAssetsDir, { recursive: true, force: true });
      }
      if (fs.existsSync(tempArquivoDir)) {
        fs.rmSync(tempArquivoDir, { recursive: true, force: true });
      }
    } catch {}
    delete process.env.ONETOONE_ASSETS_DIR;
    delete process.env.ONETOONE_ARQUIVO_DIR;
  });

  afterAll(() => {
    closeDb();
  });

  // =========================================================================
  // CATEGORIA 1: IPC Handlers e Validação Rigorosa de Payload (R5, R6)
  // =========================================================================
  describe('1. IPC Handlers: Validação de Payload, Tipos e Path Traversal', () => {
    it('handleRelatorioGerar rejeita payload nulo, indefinido ou não-objeto com VALIDATION', async () => {
      const resNull = await handleRelatorioGerar(null);
      expect(resNull.success).toBe(false);
      if (resNull.success) return;
      expect(resNull.error).toBe('VALIDATION');

      const resString = await handleRelatorioGerar('string-invalida');
      expect(resString.success).toBe(false);
      if (resString.success) return;
      expect(resString.error).toBe('VALIDATION');
    });

    it('handleRelatorioGerar rejeita sessaoId vazio ou apenas espaços', async () => {
      const resVazio = await handleRelatorioGerar({ sessaoId: '' });
      expect(resVazio.success).toBe(false);
      if (resVazio.success) return;
      expect(resVazio.error).toBe('VALIDATION');
      expect(resVazio.message).toContain('sessaoId é obrigatório');

      const resEspacos = await handleRelatorioGerar({ sessaoId: '   ' });
      expect(resEspacos.success).toBe(false);
      if (resEspacos.success) return;
      expect(resEspacos.error).toBe('VALIDATION');
    });

    it('handleRelatorioGerar barra tentativas de Path Traversal em sessaoId com VALIDATION', async () => {
      const traversalAttacks = [
        '../sessao',
        '../../../../etc/passwd',
        'C:\\Windows\\System32',
        'sessao/com/barras',
        'sessao\\com\\barras',
        'sessao;rm -rf /',
        'sessao|calc.exe',
        'a'.repeat(65), // excede limite de 64 chars
      ];

      for (const attack of traversalAttacks) {
        const res = await handleRelatorioGerar({ sessaoId: attack });
        expect(res.success).toBe(false);
        if (res.success) return;
        expect(res.error).toBe('VALIDATION');
        expect(res.message).toContain('sessaoId inválido');
      }
    });

    it('handleRelatorioGerar valida numeroVersao rejeitando não-inteiros, negativos ou zero', async () => {
      const invalidVersions = [0, -1, -10, 1.5, '1', true, {}, []];

      for (const v of invalidVersions) {
        const res = await handleRelatorioGerar({ sessaoId, numeroVersao: v });
        expect(res.success).toBe(false);
        if (res.success) return;
        expect(res.error).toBe('VALIDATION');
        expect(res.message).toContain('numeroVersao inválido');
      }
    });

    it('handleRelatorioListarRevisoes valida payload e barra Path Traversal', async () => {
      const resNull = await handleRelatorioListarRevisoes(null);
      expect(resNull.success).toBe(false);
      if (resNull.success) return;
      expect(resNull.error).toBe('VALIDATION');

      const resAttack = await handleRelatorioListarRevisoes({ sessaoId: '../../admin' });
      expect(resAttack.success).toBe(false);
      if (resAttack.success) return;
      expect(resAttack.error).toBe('VALIDATION');
    });

    it('handleRelatorioAbrir valida caminho, exige extensão .pdf e existência no disco', async () => {
      // 1. Payload inválido
      const resNull = await handleRelatorioAbrir(null);
      expect(resNull.success).toBe(false);
      if (resNull.success) return;
      expect(resNull.error).toBe('VALIDATION');

      // 2. Extensão não-PDF (bloqueio de execução de binários ou scripts)
      const nonPdfFiles = ['malware.exe', 'script.bat', 'data.json', 'foto.png', 'texto.txt'];
      for (const f of nonPdfFiles) {
        const resExt = await handleRelatorioAbrir({ caminho: f });
        expect(resExt.success).toBe(false);
        if (resExt.success) return;
        expect(resExt.error).toBe('VALIDATION');
        expect(resExt.message).toContain('Apenas arquivos PDF');
      }

      // 3. Arquivo PDF inexistente
      const resNotFound = await handleRelatorioAbrir({ caminho: 'C:\\inexistente\\relatorio.pdf' });
      expect(resNotFound.success).toBe(false);
      if (resNotFound.success) return;
      expect(resNotFound.error).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // CATEGORIA 2: Segurança, XSS e Defesa em Profundidade (R4, R6)
  // =========================================================================
  describe('2. Sanitização HTML Rigorosa contra Injeção de Código (XSS)', () => {
    it('escapa entidades HTML críticas com escapeHtml (&, <, >, ", \')', () => {
      expect(escapeHtml('Normal text')).toBe('Normal text');
      expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml("João & Maria's")).toBe('João &amp; Maria&#039;s');
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as unknown as string)).toBe('');
    });

    it('imuniza template contra XSS injetado em atendido.nome, sessao.titulo, notas_host e aba.titulo', async () => {
      // 1. Cria atendido com payload de ataque XSS no nome
      const atendidoXss = createAtendido(
        {
          nome: '<script id="canario">window.__XSS_CANARIO__ = true;</script>',
          contato: '11999999999',
        },
        db
      );
      expect(atendidoXss.created).toBe(true);
      if (!atendidoXss.created) return;

      // 2. Cria sessão com payload de ataque XSS no título e notas do host
      const sessaoXss = createSessao(
        {
          atendido_id: atendidoXss.id,
          titulo: '"><img src=x onerror="window.__IMG_ERR__=1">',
          notas_host: '<iframe src="javascript:alert(1)"></iframe>',
        },
        1700000000000,
        db
      );
      expect(sessaoXss.created).toBe(true);
      if (!sessaoXss.created) return;

      // 3. Cria aba com payload de ataque XSS no título
      const abaXss = createAba(
        {
          sessao_id: sessaoXss.id,
          tipo: 'blank',
          ordem: 0,
          asset_id: null,
          titulo: '<svg onload=alert("svg-xss")>',
        },
        1700000000000,
        db
      );
      expect(abaXss.created).toBe(true);

      // 4. Monta o HTML do relatório
      const res = await relatorioService.prepararDadosERecursos(sessaoXss.id);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const html = res.data.htmlMontado;

      // 5. Assevera que nenhum dos payloads XSS aparece cru no HTML montado
      expect(html).not.toContain('<script id="canario">');
      expect(html).toContain('&lt;script id=&quot;canario&quot;&gt;');

      expect(html).not.toContain('<img src=x onerror=');
      expect(html).toContain('&quot;&gt;&lt;img src=x onerror=');

      expect(html).not.toContain('<iframe src="javascript:alert(1)">');
      expect(html).toContain('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;');

      expect(html).not.toContain('<svg onload=');
      expect(html).toContain('&lt;svg onload=alert(&quot;svg-xss&quot;)&gt;');
    });

    it('suporta strings gigantes (10.000 caracteres), acentos, unicode e emojis com integridade', async () => {
      const textoGigante = 'A'.repeat(10000);
      const textoUnicode = 'Avaliação de Português & Neuropsicologia 🧠 — Crianças & Jovens (100% Ok)';

      const atendidoUni = createAtendido({ nome: textoUnicode }, db);
      expect(atendidoUni.created).toBe(true);
      if (!atendidoUni.created) return;

      const sessaoUni = createSessao(
        {
          atendido_id: atendidoUni.id,
          titulo: 'Sessão com texto grande',
          notas_host: textoGigante,
        },
        1700000000000,
        db
      );
      expect(sessaoUni.created).toBe(true);
      if (!sessaoUni.created) return;

      const res = await relatorioService.prepararDadosERecursos(sessaoUni.id);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const html = res.data.htmlMontado;
      expect(html).toContain(escapeHtml(textoUnicode));
      expect(html).toContain(textoGigante);
    });
  });

  // =========================================================================
  // CATEGORIA 3: Reconstrução de Estado, Abas e Miniaturas (R1, R2, R4)
  // =========================================================================
  describe('3. Reconstrução de Estado das Abas e Decisão de Miniaturas', () => {
    it('aba em branco sem eventos não gera miniatura gráfica (exibe aviso no sumário)', async () => {
      const abaVazia = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'blank',
          ordem: 0,
          asset_id: null,
          titulo: 'Quadro Inicial Vazio',
        },
        1700000000000,
        db
      );
      expect(abaVazia.created).toBe(true);
      if (!abaVazia.created) return;

      const res = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const abaPayload = res.data.abasPayloadParaJanela.find((a) => a.id === abaVazia.id);
      expect(abaPayload).toBeDefined();
      expect(abaPayload?.renderMiniatura).toBe(false);

      expect(res.data.htmlMontado).toContain('Aba em branco / sem anotações registradas.');
      expect(res.data.htmlMontado).not.toContain(`miniatura-${abaVazia.id}`);
    });

    it('aba em branco com desenhos visíveis habilita renderMiniatura = true', async () => {
      const abaDesenho = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'blank',
          ordem: 0,
          asset_id: null,
          titulo: 'Quadro com Desenho',
        },
        1700000000000,
        db
      );
      expect(abaDesenho.created).toBe(true);
      if (!abaDesenho.created) return;

      // Adiciona um evento de desenho na aba
      appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: abaDesenho.id,
          autor: 'host',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({
            id: 'rect-01',
            tipo: 'rectangle',
            data: {
              left: 100,
              top: 100,
              width: 200,
              height: 150,
              color: '#0284c7',
            },
          }),
        },
        db
      );

      const res = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const abaPayload = res.data.abasPayloadParaJanela.find((a) => a.id === abaDesenho.id);
      expect(abaPayload).toBeDefined();
      expect(abaPayload?.renderMiniatura).toBe(true);

      expect(res.data.htmlMontado).toContain(`miniatura-${abaDesenho.id}`);
    });

    it('abas multimodal de imagem e PDF resolvem assetDataUri e habilitam renderMiniatura = true', async () => {
      // 1. Cria asset de imagem simulado
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89,
      ]);
      const assetPng = assetService.importAsset(sessaoId, pngBuffer, 'esquema.png');
      expect(assetPng.success).toBe(true);
      if (!assetPng.success) return;

      const abaImg = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'image',
          ordem: 0,
          asset_id: assetPng.data.id,
          titulo: 'Aba Imagem Técnica',
        },
        1700000000000,
        db
      );
      expect(abaImg.created).toBe(true);
      if (!abaImg.created) return;

      // 2. Cria asset de PDF simulado
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const assetPdf = assetService.importAsset(sessaoId, pdfBuffer, 'guia.pdf');
      expect(assetPdf.success).toBe(true);
      if (!assetPdf.success) return;

      const abaPdf = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'pdf',
          ordem: 1,
          asset_id: assetPdf.data.id,
          titulo: 'Aba Documento PDF',
        },
        1700000000000,
        db
      );
      expect(abaPdf.created).toBe(true);
      if (!abaPdf.created) return;

      const res = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const payloadImg = res.data.abasPayloadParaJanela.find((a) => a.id === abaImg.id);
      expect(payloadImg?.renderMiniatura).toBe(true);
      expect(payloadImg?.assetDataUri).toContain('data:image/png;base64,');

      const payloadPdf = res.data.abasPayloadParaJanela.find((a) => a.id === abaPdf.id);
      expect(payloadPdf?.renderMiniatura).toBe(true);
      expect(payloadPdf?.assetDataUri).toContain('data:application/pdf;base64,');
    });

    it('abas de vídeo e áudio não geram miniatura gráfica (exibem aviso de mídia anexada)', async () => {
      const abaVideo = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'video',
          ordem: 0,
          asset_id: null,
          titulo: 'Aba Vídeo Gravado',
        },
        1700000000000,
        db
      );
      const abaAudio = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'audio',
          ordem: 1,
          asset_id: null,
          titulo: 'Aba Áudio Gravado',
        },
        1700000000000,
        db
      );
      expect(abaVideo.created).toBe(true);
      expect(abaAudio.created).toBe(true);

      const res = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const pVideo = res.data.abasPayloadParaJanela.find((a) => a.id === (abaVideo as any).id);
      const pAudio = res.data.abasPayloadParaJanela.find((a) => a.id === (abaAudio as any).id);

      expect(pVideo?.renderMiniatura).toBe(false);
      expect(pAudio?.renderMiniatura).toBe(false);

      expect(res.data.htmlMontado).toContain(
        'Mídia reproduzível anexada (sem quadro de anotação gráfica).'
      );
    });
  });

  // =========================================================================
  // CATEGORIA 4: Seleção de Revisão Histórica e Estado Temporal (R1)
  // =========================================================================
  describe('4. Suporte a Revisões Históricas da Sessão', () => {
    it('rejeita revisão inexistente com NOT_FOUND', async () => {
      const res = await relatorioService.prepararDadosERecursos(sessaoId, 999);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('NOT_FOUND');
      expect(res.message).toContain('Revisão versão 999 não encontrada');
    });

    it('reconstrói estado da aba até o índice exato da revisão solicitada', async () => {
      const aba = createAba(
        {
          sessao_id: sessaoId,
          tipo: 'blank',
          ordem: 0,
          asset_id: null,
          titulo: 'Quadro com Histórico',
        },
        1700000000000,
        db
      );
      if (!aba.created) return;

      // Evento 0: Retângulo
      appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: aba.id,
          autor: 'host',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({
            id: 'rect-v1',
            tipo: 'rectangle',
            data: { left: 10, top: 10, width: 50, height: 50 },
          }),
        },
        db
      );

      // Cria Revisão 1 apontando para o evento 1 (1 evento acumulado)
      createRevisao(
        {
          sessao_id: sessaoId,
          numero_versao: 1,
          snapshot_evento_idx: 1,
          titulo: 'Marco Inicial',
          autor: 'host',
        },
        db
      );

      // Evento 1: Círculo posterior à Revisão 1
      appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: aba.id,
          autor: 'host',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({
            id: 'rect-v2',
            tipo: 'rectangle',
            data: { left: 60, top: 60, width: 50, height: 50 },
          }),
        },
        db
      );

      // Relatório gerado com a Revisão 1
      const resV1 = await relatorioService.prepararDadosERecursos(sessaoId, 1);
      expect(resV1.success).toBe(true);
      if (!resV1.success) return;

      expect(resV1.data.htmlMontado).toContain('Revisão 1: Marco Inicial');

      const payloadV1 = resV1.data.abasPayloadParaJanela.find((a) => a.id === aba.id);
      const stateV1 = payloadV1?.state as any;
      expect(Object.keys(stateV1.elements)).toHaveLength(1);
      expect(stateV1.elements['rect-v1']).toBeDefined();
      expect(stateV1.elements['rect-v2']).toBeUndefined();

      // Relatório gerado sem versão (estado atual)
      const resAtual = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(resAtual.success).toBe(true);
      if (!resAtual.success) return;

      expect(resAtual.data.htmlMontado).toContain('Estado atual (mais recente)');
      const payloadAtual = resAtual.data.abasPayloadParaJanela.find((a) => a.id === aba.id);
      const stateAtual = payloadAtual?.state as any;
      expect(Object.keys(stateAtual.elements)).toHaveLength(2);
      expect(stateAtual.elements['rect-v2']).toBeDefined();
    });
  });

  // =========================================================================
  // CATEGORIA 5: Convenção de Diretórios e Escrita Atômica (R1)
  // =========================================================================
  describe('5. Estrutura de Arquivos e Escrita Atômica', () => {
    it('calcula caminho de destino seguindo a convenção <raiz>/<slug>/<pasta_sessao>/relatorio.pdf', async () => {
      const res = await relatorioService.prepararDadosERecursos(sessaoId);
      expect(res.success).toBe(true);
      if (!res.success) return;

      const caminhoPdf = res.data.caminhoFinalPdf;
      expect(caminhoPdf).toContain(tempArquivoDir);
      expect(caminhoPdf).toContain('carlos-drumond-de-andrade');
      expect(caminhoPdf).toContain(sessaoId);
      expect(caminhoPdf.endsWith('relatorio.pdf')).toBe(true);
    });

    it('simula escrita atômica via arquivo temporário + rename sem deixar lixo', () => {
      const pastaDestino = path.join(tempArquivoDir, 'teste-atomico');
      fs.mkdirSync(pastaDestino, { recursive: true });

      const destinoFinal = path.join(pastaDestino, 'relatorio.pdf');
      const tempArquivo = path.join(pastaDestino, 'relatorio.pdf.tmp');

      const conteudoPdf = Buffer.from('%PDF-1.4\nConteudo simulado atomico');

      // Escrita no temporário
      fs.writeFileSync(tempArquivo, conteudoPdf);
      expect(fs.existsSync(tempArquivo)).toBe(true);
      expect(fs.existsSync(destinoFinal)).toBe(false);

      // Rename atômico
      fs.renameSync(tempArquivo, destinoFinal);
      expect(fs.existsSync(destinoFinal)).toBe(true);
      expect(fs.existsSync(tempArquivo)).toBe(false);

      // Sobrescrita atômica idempotente
      const novoConteudo = Buffer.from('%PDF-1.4\nConteudo sobrescrito');
      fs.writeFileSync(tempArquivo, novoConteudo);
      fs.renameSync(tempArquivo, destinoFinal);

      expect(fs.existsSync(destinoFinal)).toBe(true);
      expect(fs.readFileSync(destinoFinal).toString()).toContain('Conteudo sobrescrito');
    });
  });
});
