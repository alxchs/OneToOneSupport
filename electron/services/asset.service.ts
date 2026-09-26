import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Database as DatabaseType } from 'better-sqlite3';
import {
  createAsset as repoCreateAsset,
  getAssetById as repoGetAssetById,
  listAssetsBySessao as repoListAssetsBySessao,
  AssetRecord,
} from '../db/repositories/asset.repo';
import { getConfig } from '../db/repositories/configuracao.repo';
import { IPCResult } from '../../src/shared/ipc-contract';

export interface SupportedMimeInfo {
  mime: string;
  tipo: 'image' | 'pdf' | 'video' | 'audio';
  ext: string;
}

export const ALLOWLIST_MIMES: Record<string, SupportedMimeInfo> = {
  'image/png': { mime: 'image/png', tipo: 'image', ext: 'png' },
  'image/jpeg': { mime: 'image/jpeg', tipo: 'image', ext: 'jpg' },
  'image/webp': { mime: 'image/webp', tipo: 'image', ext: 'webp' },
  'image/gif': { mime: 'image/gif', tipo: 'image', ext: 'gif' },
  'application/pdf': { mime: 'application/pdf', tipo: 'pdf', ext: 'pdf' },
  'video/mp4': { mime: 'video/mp4', tipo: 'video', ext: 'mp4' },
  'video/webm': { mime: 'video/webm', tipo: 'video', ext: 'webm' },
  'video/ogg': { mime: 'video/ogg', tipo: 'video', ext: 'ogv' },
  'audio/mpeg': { mime: 'audio/mpeg', tipo: 'audio', ext: 'mp3' },
  'audio/wav': { mime: 'audio/wav', tipo: 'audio', ext: 'wav' },
  'audio/ogg': { mime: 'audio/ogg', tipo: 'audio', ext: 'ogg' },
};

/**
 * Retorna o diretório base de assets respeitando a variável de ambiente ONETOONE_ASSETS_DIR.
 * Obrigatório para testes e sondas (isolamento em diretório temporário).
 */
export function getDefaultAssetsDir(): string {
  if (process.env.ONETOONE_ASSETS_DIR) {
    return process.env.ONETOONE_ASSETS_DIR;
  }
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
  return path.join(appData, 'OneToOneSupport', 'assets');
}

/**
 * Detecta o tipo MIME do arquivo inspecionando exclusivamente sua assinatura (magic bytes).
 * Nunca confia na extensão informada. Rejeita SVG (XML executável) com erro apropriado.
 */
export function detectMimeFromBuffer(buffer: Buffer): SupportedMimeInfo | null {
  if (!buffer || buffer.length === 0) return null;

  // 1. Checagem explícita de SVG/XML (Rejeitado por segurança em V1)
  const previewText = buffer.slice(0, Math.min(buffer.length, 2048)).toString('utf8');
  if (
    /^\s*<\?xml/i.test(previewText) ||
    /^\s*<!DOCTYPE\s+svg/i.test(previewText) ||
    /^\s*<svg\b/i.test(previewText) ||
    previewText.includes('<svg')
  ) {
    // Retorna null pois SVG não está na allowlist e é banido
    return null;
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return ALLOWLIST_MIMES['image/png'];
  }

  // 3. JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return ALLOWLIST_MIMES['image/jpeg'];
  }

  // 4. GIF: GIF87a ou GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return ALLOWLIST_MIMES['image/gif'];
  }

  // 5. RIFF (WebP ou WAV)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    // WebP: RIFF .... WEBP
    if (
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return ALLOWLIST_MIMES['image/webp'];
    }
    // WAV: RIFF .... WAVE
    if (
      buffer[8] === 0x57 &&
      buffer[9] === 0x41 &&
      buffer[10] === 0x56 &&
      buffer[11] === 0x45
    ) {
      return ALLOWLIST_MIMES['audio/wav'];
    }
  }

  // 6. PDF: %PDF- nos primeiros 1024 bytes
  const searchLimit = Math.min(buffer.length, 1024);
  const pdfIndex = buffer.subarray(0, searchLimit).indexOf(Buffer.from('%PDF-'));
  if (pdfIndex !== -1) {
    return ALLOWLIST_MIMES['application/pdf'];
  }

  // 7. MP4: bytes 4..7 ftyp
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return ALLOWLIST_MIMES['video/mp4'];
  }

  // 8. WebM: 1A 45 DF A3 (EBML)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    const ebmlHeader = buffer.slice(0, Math.min(buffer.length, 128)).toString('binary');
    if (ebmlHeader.includes('webm') || ebmlHeader.includes('matroska')) {
      return ALLOWLIST_MIMES['video/webm'];
    }
  }

  // 9. Ogg: OggS (audio/ogg ou video/ogg)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    const oggHeader = buffer.slice(0, Math.min(buffer.length, 128)).toString('binary');
    if (oggHeader.includes('theora') || oggHeader.includes('dirac')) {
      return ALLOWLIST_MIMES['video/ogg'];
    }
    return ALLOWLIST_MIMES['audio/ogg'];
  }

  // 10. MP3 (audio/mpeg): ID3 ou Sync frame (FF FB, FF F3, FF F2)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0x49 &&
    buffer[1] === 0x44 &&
    buffer[2] === 0x33
  ) {
    return ALLOWLIST_MIMES['audio/mpeg'];
  }
  if (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0 &&
    (buffer[1] & 0x06) !== 0x00
  ) {
    return ALLOWLIST_MIMES['audio/mpeg'];
  }

  return null;
}

/**
 * Sanitiza o nome do arquivo em profundidade para exibição em Abas.titulo.
 * Neutraliza path traversal, nomes reservados do Windows, caracteres nulos,
 * unicode de confusão (RTL override, zero-width) e nomes gigantes.
 */
export function sanitizeAssetTitle(originalName: string | null | undefined): string {
  if (!originalName || typeof originalName !== 'string') {
    return 'Sem título';
  }

  let name = originalName;

  // 1. Trunca em byte nulo (%00 ou \0)
  const nullIdx = name.indexOf('\0');
  if (nullIdx !== -1) {
    name = name.slice(0, nullIdx);
  }
  name = name.replace(/%00/g, '');

  // 2. Remove unicode de confusão: RTL overrides (U+202A a U+202E), zero-width (U+200B a U+200D, U+FEFF)
  name = name.replace(/[\u202A-\u202E\u200B-\u200D\uFEFF]/g, '');

  // 3. Remove separadores de diretório e path traversal
  name = name.replace(/[/\\]+/g, '_');
  name = name.replace(/\.{2,}/g, '_');
  name = name.replace(/:/g, '_');

  // 4. Remove caracteres proibidos no Windows: < > " | ? *
  name = name.replace(/[<>"|?*]/g, '_');

  // 5. Remove espaços, pontos e underscores no final
  name = name.trim().replace(/[\s._]+$/, '');

  // 6. Sanitiza nomes reservados do Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
  const reservedRegex = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reservedRegex.test(name)) {
    name = `arquivo_${name}`;
  }

  // 7. Limite de tamanho (máximo 255 caracteres, mantendo extensão se houver)
  if (name.length > 255) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    name = `${base.slice(0, 255 - ext.length)}${ext}`;
  }

  if (!name.trim()) {
    return 'Sem título';
  }

  return name;
}

export const sanitizeAssetName = sanitizeAssetTitle;

export class AssetService {
  private clock: () => number;
  private db?: DatabaseType;
  private assetsBaseDir?: string;

  constructor(
    clockOrDb?: (() => number) | DatabaseType,
    dbOrDir?: DatabaseType | string,
    assetsBaseDir?: string
  ) {
    if (typeof clockOrDb === 'function') {
      this.clock = clockOrDb;
      this.db = dbOrDir as DatabaseType | undefined;
      this.assetsBaseDir = assetsBaseDir;
    } else {
      this.clock = Date.now;
      this.db = clockOrDb as DatabaseType | undefined;
      this.assetsBaseDir = typeof dbOrDir === 'string' ? dbOrDir : assetsBaseDir;
    }
  }

  private getAssetsDir(): string {
    return this.assetsBaseDir || getDefaultAssetsDir();
  }

  private getMaxAssetSizeMb(): number {
    try {
      const row = getConfig('asset.tamanho_max_mb', this.db);
      if (row) {
        const val = parseInt(row, 10);
        if (Number.isFinite(val) && val > 0) return val;
      }
    } catch {
      // Valor padrão de 250 MB conforme especificação M2
    }
    return 250;
  }

  /**
   * Importa um asset de forma atômica:
   * 1. Valida tamanho contra limite configurável.
   * 2. Grava em arquivo temporário isolado (.tmp).
   * 3. Calcula hash SHA-256 incremental e detecta MIME por magic bytes.
   * 4. Valida allowlist de MIME (rejeita SVG e formatos não suportados).
   * 5. Renomeia atomicamente para o caminho definitivo: <sessao_id>/<sha256>.<ext>.
   * 6. Registra na tabela Assets com caminho relativo.
   * Queda ou erro em qualquer etapa limpa os arquivos temporários sem deixar órfãos.
   */
  public importAsset(
    sessaoId: string,
    sourceBufferOrPath: Buffer | string,
    _originalName?: string
  ): IPCResult<AssetRecord> {
    const baseDir = this.getAssetsDir();
    const tempDir = path.join(baseDir, '.tmp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFileName = `${crypto.randomUUID()}.tmp`;
    const tempFilePath = path.join(tempDir, tempFileName);

    let isBuffer = false;
    let sourceBuffer: Buffer | null = null;
    let sourcePath = '';

    if (Buffer.isBuffer(sourceBufferOrPath)) {
      isBuffer = true;
      sourceBuffer = sourceBufferOrPath;
    } else if (typeof sourceBufferOrPath === 'string') {
      sourcePath = sourceBufferOrPath;
    } else {
      return {
        success: false,
        error: 'VALIDATION',
        message: 'Fonte de asset inválida (esperado Buffer ou caminho em string).',
      };
    }

    const maxSizeBytes = this.getMaxAssetSizeMb() * 1024 * 1024;
    let finalSha256 = '';
    let finalSize = 0;
    let detectedMime: SupportedMimeInfo | null = null;

    try {
      if (isBuffer && sourceBuffer) {
        finalSize = sourceBuffer.length;
        if (finalSize > maxSizeBytes) {
          return {
            success: false,
            error: 'ASSET_MUITO_GRANDE' as any,
            message: 'Tamanho excede o limite configurado.',
            details: { tamanho: finalSize, limiteBytes: maxSizeBytes },
          };
        }

        detectedMime = detectMimeFromBuffer(sourceBuffer);
        if (!detectedMime) {
          return {
            success: false,
            error: 'ASSET_TIPO_NAO_SUPORTADO' as any,
            message: 'Tipo de arquivo não suportado ou proibido por segurança (ex: SVG).',
          };
        }

        const hash = crypto.createHash('sha256');
        hash.update(sourceBuffer);
        finalSha256 = hash.digest('hex');

        fs.writeFileSync(tempFilePath, sourceBuffer);
      } else {
        if (!fs.existsSync(sourcePath)) {
          return {
            success: false,
            error: 'NOT_FOUND',
            message: 'Arquivo de origem do asset não encontrado.',
          };
        }

        const stat = fs.statSync(sourcePath);
        finalSize = stat.size;
        if (finalSize > maxSizeBytes) {
          return {
            success: false,
            error: 'ASSET_MUITO_GRANDE' as any,
            message: 'Tamanho excede o limite configurado.',
            details: { tamanho: finalSize, limiteBytes: maxSizeBytes },
          };
        }

        // Lê primeiros 4096 bytes para detecção de magic bytes
        const fd = fs.openSync(sourcePath, 'r');
        const headerBuf = Buffer.alloc(Math.min(finalSize, 4096));
        fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
        fs.closeSync(fd);

        detectedMime = detectMimeFromBuffer(headerBuf);
        if (!detectedMime) {
          return {
            success: false,
            error: 'ASSET_TIPO_NAO_SUPORTADO' as any,
            message: 'Tipo de arquivo não suportado ou proibido por segurança (ex: SVG).',
          };
        }

        // Cópia para tempFilePath calculando hash
        const fileContent = fs.readFileSync(sourcePath);
        const hash = crypto.createHash('sha256');
        hash.update(fileContent);
        finalSha256 = hash.digest('hex');

        fs.writeFileSync(tempFilePath, fileContent);
      }

      // Validação pós-gravação do hash do que foi gravado em disco no .tmp
      const recordedContent = fs.readFileSync(tempFilePath);
      const verifyHash = crypto.createHash('sha256').update(recordedContent).digest('hex');
      if (verifyHash !== finalSha256) {
        throw new Error('Falha de integridade do arquivo temporário gravado.');
      }

      // Destino definitivo dentro da pasta da sessão
      const sessionAssetsDir = path.join(baseDir, sessaoId);
      if (!fs.existsSync(sessionAssetsDir)) {
        fs.mkdirSync(sessionAssetsDir, { recursive: true });
      }

      const destFileName = `${finalSha256}.${detectedMime.ext}`;
      const destFilePath = path.join(sessionAssetsDir, destFileName);
      const relativePath = `${sessaoId}/${destFileName}`;

      // Move atomicamente do arquivo temporário para o destino final
      fs.renameSync(tempFilePath, destFilePath);

      // Insere no banco SQLite respeitando idempotência
      const now = this.clock();
      const dbResult = repoCreateAsset(
        {
          sessao_id: sessaoId,
          tipo: detectedMime.tipo,
          mime: detectedMime.mime,
          tamanho: finalSize,
          hash_sha256: finalSha256,
          path: relativePath, // Caminho relativo: nunca absoluto!
        },
        now,
        this.db
      );

      if (!dbResult.created) {
        if (dbResult.reason === 'DUPLICATE' && dbResult.existingId) {
          const existing = repoGetAssetById(dbResult.existingId, this.db);
          if (existing) {
            return { success: true, data: existing };
          }
        }
        // Se falhou no banco e não é duplicate, remove o arquivo definitivo criado
        try {
          if (fs.existsSync(destFilePath)) fs.unlinkSync(destFilePath);
        } catch {}
        return {
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Falha ao registrar asset no banco de dados.',
        };
      }

      return { success: true, data: dbResult.asset };
    } catch (err: unknown) {
      // Limpeza de emergência do arquivo temporário
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}

      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Obtém metadados de um asset pelo ID.
   */
  public getById(id: string): IPCResult<AssetRecord> {
    try {
      const asset = repoGetAssetById(id, this.db);
      if (!asset) {
        return { success: false, error: 'NOT_FOUND', message: 'Asset não encontrado.' };
      }
      return { success: true, data: asset };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Retorna o caminho físico absoluto do arquivo no disco (usado pelo backend/servidor HTTP de mídia).
   * Nunca vaza para o renderer nem para o Guest.
   */
  public resolveAbsolutePath(asset: AssetRecord): string {
    const baseDir = this.getAssetsDir();
    return path.resolve(baseDir, asset.path);
  }

  /**
   * Lista todos os assets pertencentes a uma sessão.
   */
  public listBySessao(sessaoId: string): IPCResult<AssetRecord[]> {
    try {
      const list = repoListAssetsBySessao(sessaoId, this.db);
      return { success: true, data: list };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Arquiva os assets da sessão para a pasta definitiva do atendido (M8).
   * Destino: <raiz_arquivo>/<slug_atendido>/<YYYYMMDD_HHMM_sessao_id>/assets/
   * Copia atômica via .tmp, validação de SHA-256 pós-cópia e idempotência.
   */
  public arquivarAssetsSessao(
    sessaoId: string,
    atendidoNome: string,
    sessaoCriadaEm: number,
    atendidoId: string
  ): { sucesso: boolean; arquivosCopiados: string[]; erro?: string } {
    try {
      const assets = repoListAssetsBySessao(sessaoId, this.db);
      if (assets.length === 0) {
        return { sucesso: true, arquivosCopiados: [] };
      }

      const slug = slugifyAtendidoNome(atendidoNome) || `atendido_${atendidoId}`;
      const pastaSessao = `${formatSessaoTimestamp(sessaoCriadaEm)}_${sessaoId}`;
      const arquivoRoot = getDefaultArquivoRootDir();
      const destinoDir = path.join(arquivoRoot, slug, pastaSessao, 'assets');

      if (!fs.existsSync(destinoDir)) {
        fs.mkdirSync(destinoDir, { recursive: true });
      }

      const copiados: string[] = [];

      for (const asset of assets) {
        const origemPath = this.resolveAbsolutePath(asset);
        if (!fs.existsSync(origemPath)) {
          console.warn(`[AssetService] Arquivo de origem não encontrado ao arquivar: ${origemPath}`);
          continue;
        }

        const fileName = path.basename(asset.path);
        const destinoFinal = path.join(destinoDir, fileName);

        // Idempotência: se já existe no destino com mesmo SHA-256 e tamanho, pula
        if (fs.existsSync(destinoFinal)) {
          const destBuffer = fs.readFileSync(destinoFinal);
          const destSha = crypto.createHash('sha256').update(destBuffer).digest('hex');
          if (destSha === asset.hash_sha256) {
            copiados.push(destinoFinal);
            continue;
          }
        }

        // Cópia atômica com arquivo temporário
        const tempDestino = path.join(destinoDir, `${crypto.randomUUID()}.tmp`);
        fs.copyFileSync(origemPath, tempDestino);

        // Verificação do hash SHA-256 do arquivo gravado
        const tempBuffer = fs.readFileSync(tempDestino);
        const tempSha = crypto.createHash('sha256').update(tempBuffer).digest('hex');

        if (tempSha !== asset.hash_sha256) {
          try {
            fs.unlinkSync(tempDestino);
          } catch {}
          throw new Error(`Falha de integridade: SHA-256 divergente após cópia do asset ${asset.id}`);
        }

        // Renomeia atomicamente para o destino final
        fs.renameSync(tempDestino, destinoFinal);
        copiados.push(destinoFinal);
      }

      return { sucesso: true, arquivosCopiados: copiados };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { sucesso: false, arquivosCopiados: [], erro: msg };
    }
  }
}

/**
 * Retorna o diretório base de arquivos definitivos dos atendidos respeitando ONETOONE_ARQUIVO_DIR.
 * Padrão: %APPDATA%/OneToOneSupport/atendidos/
 */
export function getDefaultArquivoRootDir(): string {
  if (process.env.ONETOONE_ARQUIVO_DIR) {
    return process.env.ONETOONE_ARQUIVO_DIR;
  }
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
  return path.join(appData, 'OneToOneSupport', 'atendidos');
}

export function slugifyAtendidoNome(nome: string): string {
  if (!nome || !nome.trim()) return 'atendido';
  const slug = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'atendido';
}

export function formatSessaoTimestamp(timestampMs: number, sessaoId?: string): string {
  const d = new Date(timestampMs);
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const base = `${YYYY}${MM}${DD}_${HH}${mm}`;
  return sessaoId ? `${base}_${sessaoId}` : base;
}

export const assetService = new AssetService();
