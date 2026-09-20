import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from '../connection';

export interface ConfiguracaoRecord {
  chave: string;
  valor: string;
  atualizado_em: number;
}

export type SetConfigResult =
  | { success: true; chave: string; action: 'created' | 'updated' }
  | { success: false; reason: 'DUPLICATE'; chave: string };

/**
 * Define uma configuração global respeitando a Regra Técnica #1 (SQLite):
 * Rejeita duplicatas exatas através de cláusulas NOT EXISTS.
 */
export function setConfig(
  chave: string,
  valor: string,
  dbInstance?: DatabaseType
): SetConfigResult {
  const db = dbInstance || getDb();
  const now = Date.now();

  const findStmt = db.prepare(`
    SELECT chave, valor, atualizado_em
    FROM ConfiguracaoGlobal
    WHERE chave = ?
  `);

  const insertStmt = db.prepare(`
    INSERT INTO ConfiguracaoGlobal (chave, valor, atualizado_em)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM ConfiguracaoGlobal
      WHERE chave = ? AND valor = ?
    )
  `);

  const updateStmt = db.prepare(`
    UPDATE ConfiguracaoGlobal
    SET valor = ?, atualizado_em = ?
    WHERE chave = ?
      AND NOT EXISTS (
        SELECT 1 FROM ConfiguracaoGlobal
        WHERE chave = ? AND valor = ?
      )
  `);

  const executeAtomic = db.transaction(() => {
    const existing = findStmt.get(chave) as ConfiguracaoRecord | undefined;

    if (!existing) {
      const info = insertStmt.run(chave, valor, now, chave, valor);
      if (info.changes > 0) {
        return { success: true, chave, action: 'created' } as SetConfigResult;
      }
      return { success: false, reason: 'DUPLICATE', chave } as SetConfigResult;
    }

    // Se a chave já possui exatamente o mesmo valor, duplicidade detectada
    if (existing.valor === valor) {
      return { success: false, reason: 'DUPLICATE', chave } as SetConfigResult;
    }

    const info = updateStmt.run(valor, now, chave, chave, valor);
    if (info.changes > 0) {
      return { success: true, chave, action: 'updated' } as SetConfigResult;
    }

    return { success: false, reason: 'DUPLICATE', chave } as SetConfigResult;
  });

  return executeAtomic();
}

/**
 * Obtém o valor de uma configuração global.
 */
export function getConfig(
  chave: string,
  dbInstance?: DatabaseType
): string | null {
  const db = dbInstance || getDb();
  const row = db
    .prepare('SELECT valor FROM ConfiguracaoGlobal WHERE chave = ?')
    .get(chave) as { valor: string } | undefined;
  return row ? row.valor : null;
}

/**
 * Retorna todas as configurações como um mapa chave -> valor.
 */
export function getAllConfigs(
  dbInstance?: DatabaseType
): Record<string, string> {
  const db = dbInstance || getDb();
  const rows = db
    .prepare('SELECT chave, valor FROM ConfiguracaoGlobal')
    .all() as { chave: string; valor: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.chave] = row.valor;
  }
  return result;
}

/**
 * Remove uma configuração (útil para testes).
 */
export function deleteConfig(
  chave: string,
  dbInstance?: DatabaseType
): boolean {
  const db = dbInstance || getDb();
  const info = db.prepare('DELETE FROM ConfiguracaoGlobal WHERE chave = ?').run(chave);
  return info.changes > 0;
}
