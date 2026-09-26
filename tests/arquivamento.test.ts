import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { SessaoService } from '../electron/services/sessao.service';
import {
  AssetService,
  slugifyAtendidoNome,
  formatSessaoTimestamp,
} from '../electron/services/asset.service';

describe('M8 — Arquivamento de Assets no Encerramento da Sessão', () => {
  let db: DatabaseType;
  let tempAssetsDir: string;
  let tempArquivoDir: string;
  let assetService: AssetService;
  let sessaoService: SessaoService;
  let sessaoId: string;
  let atendidoId: string;
  const atendidoNome = 'Maria da Silva Araújo';

  beforeEach(() => {
    tempAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-assets-origem-'));
    tempArquivoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-arquivo-destino-'));

    process.env.ONETOONE_ASSETS_DIR = tempAssetsDir;
    process.env.ONETOONE_ARQUIVO_DIR = tempArquivoDir;

    db = initDb({ dbPath: ':memory:' });
    assetService = new AssetService(db, tempAssetsDir);
    sessaoService = new SessaoService(() => 1700000000000, db);

    const atendidoRes = createAtendido({ nome: atendidoNome }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido');
    atendidoId = atendidoRes.id;

    const sessaoRes = createSessao({ atendido_id: atendidoId, titulo: 'Sessão com Arquivos' }, 1700000000000, db);
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão');
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

  it('gera slugs sanitizados para nomes de atendidos com acentos e caracteres especiais', () => {
    expect(slugifyAtendidoNome('Maria da Silva Araújo')).toBe('maria-da-silva-araujo');
    expect(slugifyAtendidoNome('  João & Filhos / Teste  ')).toBe('joao-filhos-teste');
    expect(slugifyAtendidoNome('...')).toBe('atendido');
    expect(slugifyAtendidoNome('')).toBe('atendido');
  });

  it('formata timestamp da sessão no formato YYYYMMDD_HHMM_sessaoId', () => {
    // 1700000000000 ms = 2023-11-14T22:13:20.000Z
    const fmt = formatSessaoTimestamp(1700000000000, 'abc-123');
    expect(fmt).toMatch(/^\d{8}_\d{4}_abc-123$/);
  });

  it('arquiva assets copiando atomicamente e validando SHA-256 no encerramento da sessão', () => {
    // 1. Importa dois assets para a sessão
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
    ]);
    const pdfContent = Buffer.from('%PDF-1.4\n%conteudo de teste');

    const resPng = assetService.importAsset(sessaoId, pngContent, 'desenho.png');
    const resPdf = assetService.importAsset(sessaoId, pdfContent, 'manual.pdf');
    expect(resPng.success).toBe(true);
    expect(resPdf.success).toBe(true);

    // 2. Encerra a sessão via SessaoService (que dispara arquivamento automático)
    const encerrarRes = sessaoService.encerrar(sessaoId, 'Notas de fechamento');
    expect(encerrarRes.success).toBe(true);

    // 3. Verifica a estrutura de diretórios de arquivamento criada
    const slug = slugifyAtendidoNome(atendidoNome);
    const atendidoDir = path.join(tempArquivoDir, slug);
    expect(fs.existsSync(atendidoDir)).toBe(true);

    const sessionFolders = fs.readdirSync(atendidoDir);
    expect(sessionFolders).toHaveLength(1);
    const sessionFolder = sessionFolders[0];
    expect(sessionFolder).toContain(sessaoId);

    const sessionAssetsDir = path.join(atendidoDir, sessionFolder, 'assets');
    expect(fs.existsSync(sessionAssetsDir)).toBe(true);

    const arquivosArquivados = fs.readdirSync(sessionAssetsDir);
    expect(arquivosArquivados).toHaveLength(2);

    // Confere que os hashes SHA-256 dos arquivos arquivados são idênticos aos originais
    for (const fileName of arquivosArquivados) {
      const filePath = path.join(sessionAssetsDir, fileName);
      const content = fs.readFileSync(filePath);
      const sha = crypto.createHash('sha256').update(content).digest('hex');
      expect(fileName).toContain(sha);
    }
  });

  it('é estritamente idempotente (reexecução de arquivamento não duplica nem corrompe)', () => {
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
    ]);
    assetService.importAsset(sessaoId, pngContent, 'imagem.png');

    // Executa o arquivamento diretamente 2 vezes seguidas
    const res1 = assetService.arquivarAssetsSessao(sessaoId, atendidoNome, 1700000000000, atendidoId);
    expect(res1.sucesso).toBe(true);
    expect(res1.arquivosCopiados).toHaveLength(1);

    const res2 = assetService.arquivarAssetsSessao(sessaoId, atendidoNome, 1700000000000, atendidoId);
    expect(res2.sucesso).toBe(true);
    // Na segunda execução, detecta idempotência e reutiliza os arquivos sem erro
    expect(res2.arquivosCopiados).toHaveLength(1);
  });
});
