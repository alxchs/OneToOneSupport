import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { setConfig } from '../electron/db/repositories/configuracao.repo';
import {
  AssetService,
  sanitizeAssetName,
  detectMimeFromBuffer,
} from '../electron/services/asset.service';

describe('M2 — Importação de Assets, Magic Bytes, Sanitização e Isolamento', () => {
  let db: DatabaseType;
  let tempAssetsDir: string;
  let assetService: AssetService;
  let sessaoId: string;

  beforeEach(() => {
    tempAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-assets-test-'));
    process.env.ONETOONE_ASSETS_DIR = tempAssetsDir;

    db = initDb({ dbPath: ':memory:' });
    assetService = new AssetService(db, tempAssetsDir);

    const atendidoRes = createAtendido({ nome: 'Atendido Teste Assets' }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido');

    const sessaoRes = createSessao({ atendido_id: atendidoRes.id, titulo: 'Sessão Assets' }, Date.now(), db);
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão');
    sessaoId = sessaoRes.id;
  });

  afterEach(() => {
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

  it('detecta os 11 tipos suportados por magic bytes (assinatura binária)', () => {
    // 1. PNG
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectMimeFromBuffer(png)?.mime).toBe('image/png');

    // 2. JPEG
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(detectMimeFromBuffer(jpeg)?.mime).toBe('image/jpeg');

    // 3. WebP
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
    ]);
    expect(detectMimeFromBuffer(webp)?.mime).toBe('image/webp');

    // 4. GIF
    const gif = Buffer.from('GIF89a...');
    expect(detectMimeFromBuffer(gif)?.mime).toBe('image/gif');

    // 5. PDF
    const pdf = Buffer.from('%PDF-1.7\n%teste');
    expect(detectMimeFromBuffer(pdf)?.mime).toBe('application/pdf');

    // 6. MP4
    const mp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);
    expect(detectMimeFromBuffer(mp4)?.mime).toBe('video/mp4');

    // 7. WebM
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);
    expect(detectMimeFromBuffer(webm)?.mime).toBe('video/webm');

    // 8. MP3 (ID3v2)
    const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMimeFromBuffer(mp3)?.mime).toBe('audio/mpeg');

    // 9. WAV
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20
    ]);
    expect(detectMimeFromBuffer(wav)?.mime).toBe('audio/wav');

    // 10. OGG Áudio / Geral
    const ogg = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
    expect(detectMimeFromBuffer(ogg)?.mime).toBe('audio/ogg');
  });

  it('rejeita categoricamente SVG como XML executável com ASSET_TIPO_NAO_SUPORTADO', () => {
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = assetService.importAsset(sessaoId, svgContent, 'ataque.svg');

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe('ASSET_TIPO_NAO_SUPORTADO');

    // Garante que nenhum arquivo parcial ficou no disco
    const sessionDir = path.join(tempAssetsDir, sessaoId);
    expect(fs.existsSync(sessionDir)).toBe(false);
  });

  it('rejeita arquivos arbitrários/desconhecidos (ex: binário executável, texto puro)', () => {
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    const resExe = assetService.importAsset(sessaoId, exe, 'programa.exe');
    expect(resExe.success).toBe(false);
    if (!resExe.success) expect(resExe.error).toBe('ASSET_TIPO_NAO_SUPORTADO');

    const txt = Buffer.from('Texto puro sem magic bytes');
    const resTxt = assetService.importAsset(sessaoId, txt, 'nota.txt');
    expect(resTxt.success).toBe(false);
    if (!resTxt.success) expect(resTxt.error).toBe('ASSET_TIPO_NAO_SUPORTADO');
  });

  it('sanitiza nomes em profundidade (path traversal, nomes reservados Windows, RTL overrides, null bytes)', () => {
    // Path traversal e caracteres proibidos neutralizados
    const trav = sanitizeAssetName('../../../etc/passwd');
    expect(trav).not.toContain('/');
    expect(trav).not.toContain('..');

    const charProib = sanitizeAssetName('pasta\\arquivo:teste*?.png');
    expect(charProib).not.toContain('\\');
    expect(charProib).not.toContain(':');
    expect(charProib).not.toContain('*');
    expect(charProib).not.toContain('?');

    // Nomes reservados Windows protegidos (com e sem extensão)
    expect(sanitizeAssetName('CON')).toBe('arquivo_CON');
    expect(sanitizeAssetName('aux.txt')).toBe('arquivo_aux.txt');
    expect(sanitizeAssetName('prn.png')).toBe('arquivo_prn.png');
    expect(sanitizeAssetName('nul')).toBe('arquivo_nul');
    expect(sanitizeAssetName('COM1.dat')).toBe('arquivo_COM1.dat');
    expect(sanitizeAssetName('LPT9')).toBe('arquivo_LPT9');

    // Ponto ou espaço no fim (Windows proíbe)
    expect(sanitizeAssetName('arquivo. ')).toBe('arquivo');
    expect(sanitizeAssetName('ponto...')).toBe('ponto');

    // Null bytes e Unicode de confusão (RTL override U+202E, zero-width)
    expect(sanitizeAssetName('teste\0perigo.png')).toBe('teste');
    expect(sanitizeAssetName('teste%00perigo.png')).toBe('testeperigo.png');
    expect(sanitizeAssetName('documento\u202Efdp.exe')).toBe('documentofdp.exe');
    expect(sanitizeAssetName('segredo\u200B.pdf')).toBe('segredo.pdf');

    // Nomes gigantes (4096 caracteres)
    const longName = 'A'.repeat(4096) + '.png';
    const sanitizedLong = sanitizeAssetName(longName);
    expect(sanitizedLong.length).toBeLessThanOrEqual(255);
    expect(sanitizedLong.endsWith('.png')).toBe(true);
  });

  it('respeita limite de tamanho configurável e rejeita ASSET_MUITO_GRANDE sem deixar arquivo parcial', () => {
    // Configura limite para 1 MB
    setConfig('asset.tamanho_max_mb', '1', db);

    // Cria um buffer de 2 MB (acima do limite) com assinatura PNG válida
    const bigPng = Buffer.alloc(2 * 1024 * 1024);
    bigPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const res = assetService.importAsset(sessaoId, bigPng, 'imagem-pesada.png');
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe('ASSET_MUITO_GRANDE');

    // Diretório .tmp deve estar limpo (sem sobras)
    const tmpDir = path.join(tempAssetsDir, '.tmp');
    if (fs.existsSync(tmpDir)) {
      expect(fs.readdirSync(tmpDir)).toHaveLength(0);
    }
  });

  it('realiza import atômico, calcula SHA-256 e armazena com caminho relativo à raiz de assets', () => {
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
    ]);
    const expectedSha256 = crypto.createHash('sha256').update(pngContent).digest('hex');

    const res = assetService.importAsset(sessaoId, pngContent, 'pixel.png');
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.hash_sha256).toBe(expectedSha256);
    expect(res.data.mime).toBe('image/png');
    expect(res.data.tipo).toBe('image');
    expect(res.data.tamanho).toBe(pngContent.length);

    // O path no banco DEVE ser estritamente relativo: <sessao_id>/<sha256>.<ext>
    const expectedRelativePath = `${sessaoId}/${expectedSha256}.png`;
    expect(res.data.path).toBe(expectedRelativePath);
    expect(path.isAbsolute(res.data.path)).toBe(false);

    // O arquivo físico existe no local correto
    const absoluteDiskPath = path.join(tempAssetsDir, expectedRelativePath);
    expect(fs.existsSync(absoluteDiskPath)).toBe(true);
    const diskContent = fs.readFileSync(absoluteDiskPath);
    expect(diskContent).toEqual(pngContent);
  });

  it('rejeita sessaoId com path traversal em vez de escrever fora da raiz de assets (ataque)', () => {
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
    ]);

    // Diretório "vítima" fora da raiz de assets, onde a travessia tentaria escrever
    const victimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-assets-victim-'));
    try {
      const sessaoIdsMaliciosos = [
        `../../../../${path.basename(victimDir)}`,
        '..\\..\\windows\\system32',
        '../outra-sessao',
        '',
        '   ',
      ];

      for (const sessaoIdMalicioso of sessaoIdsMaliciosos) {
        const res = assetService.importAsset(sessaoIdMalicioso, pngContent, 'pixel.png');
        expect(res.success).toBe(false);
        if (res.success) continue;
        expect(res.error).toBe('VALIDATION');
      }

      // Nada foi escrito fora da raiz de assets nem dentro do diretório vítima
      expect(fs.readdirSync(victimDir)).toHaveLength(0);
    } finally {
      fs.rmSync(victimDir, { recursive: true, force: true });
    }
  });
});
