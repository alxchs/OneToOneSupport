import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export interface AssetInput {
  sessao_id?: string | null;
  tipo: string;
  mime: string;
  tamanho: number;
  hash_sha256: string;
  path: string;
}

export interface AssetRecord {
  id: string;
  sessao_id: string | null;
  tipo: string;
  mime: string;
  tamanho: number;
  hash_sha256: string;
  path: string;
  criado_em: number;
}

export type CreateAssetResult =
  | { created: true; id: string; asset: AssetRecord }
  | { created: false; reason: 'DUPLICATE'; existingId?: string };

/**
 * Cria um registro de asset no banco SQLite com idempotência (WHERE NOT EXISTS).
 * Impede duplicação do mesmo hash_sha256 na mesma sessão.
 */
export function createAsset(
  data: AssetInput,
  now = Date.now(),
  dbInstance?: DatabaseType
): CreateAssetResult {
  const db = dbInstance || getDb();
  const id = crypto.randomUUID();
  const sessaoId = data.sessao_id !== undefined ? data.sessao_id : null;

  const executeAtomic = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO Assets (id, sessao_id, tipo, mime, tamanho, hash_sha256, path, criado_em)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM Assets
        WHERE sessao_id IS ?
          AND hash_sha256 IS ?
      )
    `);

    const info = insertStmt.run(
      id,
      sessaoId,
      data.tipo,
      data.mime,
      data.tamanho,
      data.hash_sha256,
      data.path,
      now,
      sessaoId,
      data.hash_sha256
    );

    if (info.changes === 0) {
      const existing = db.prepare(`
        SELECT id FROM Assets
        WHERE sessao_id IS ?
          AND hash_sha256 IS ?
        LIMIT 1
      `).get(sessaoId, data.hash_sha256) as { id: string } | undefined;

      return {
        created: false,
        reason: 'DUPLICATE',
        existingId: existing ? existing.id : undefined,
      } as CreateAssetResult;
    }

    const asset: AssetRecord = {
      id,
      sessao_id: sessaoId,
      tipo: data.tipo,
      mime: data.mime,
      tamanho: data.tamanho,
      hash_sha256: data.hash_sha256,
      path: data.path,
      criado_em: now,
    };

    return { created: true, id, asset } as CreateAssetResult;
  });

  return executeAtomic();
}

/**
 * Obtém um asset por ID.
 */
export function getAssetById(id: string, dbInstance?: DatabaseType): AssetRecord | null {
  const db = dbInstance || getDb();
  const row = db.prepare('SELECT * FROM Assets WHERE id = ?').get(id) as AssetRecord | undefined;
  return row || null;
}

/**
 * Lista todos os assets de uma sessão.
 */
export function listAssetsBySessao(sessaoId: string, dbInstance?: DatabaseType): AssetRecord[] {
  const db = dbInstance || getDb();
  return db
    .prepare('SELECT * FROM Assets WHERE sessao_id = ? ORDER BY criado_em ASC')
    .all(sessaoId) as AssetRecord[];
}

/**
 * Remove um asset pelo ID.
 */
export function deleteAsset(id: string, dbInstance?: DatabaseType): boolean {
  const db = dbInstance || getDb();
  const info = db.prepare('DELETE FROM Assets WHERE id = ?').run(id);
  return info.changes > 0;
}
