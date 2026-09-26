import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export type AbaTipo = 'blank' | 'image' | 'pdf' | 'video' | 'audio';

export interface AbaInput {
  sessao_id: string;
  tipo: AbaTipo;
  ordem?: number;
  asset_id?: string | null;
  titulo?: string | null;
}

export interface AbaRecord {
  id: string;
  sessao_id: string;
  tipo: AbaTipo;
  ordem: number;
  asset_id: string | null;
  titulo: string | null;
  criado_em: number;
}

export type CreateAbaResult =
  | { created: true; id: string; aba: AbaRecord }
  | { created: false; reason: 'SESSAO_NOT_FOUND' | 'DUPLICATE'; existingId?: string };

export type DeleteAbaResult =
  | { deleted: true; id: string }
  | { deleted: false; reason: 'NOT_FOUND' | 'ABA_POSSUI_EVENTOS' };

export type ReorderAbasResult =
  | { success: true; abas: AbaRecord[] }
  | { success: false; reason: 'INVALID_ABA_LIST' | 'NOT_FOUND' };

/**
 * Cria uma nova aba respeitando a Regra Técnica #1 (INSERT idempotente com WHERE NOT EXISTS e IS para colunas anuláveis).
 * Clique duplo não cria duas abas iguais.
 * A ordem é calculada como contígua caso não especificada.
 */
export function createAba(
  data: AbaInput,
  now = Date.now(),
  dbInstance?: DatabaseType
): CreateAbaResult {
  const db = dbInstance || getDb();

  // 1. Verifica existência da sessão vinculada
  const sessaoExiste = db
    .prepare('SELECT id FROM Sessoes WHERE id = ?')
    .get(data.sessao_id);

  if (!sessaoExiste) {
    return { created: false, reason: 'SESSAO_NOT_FOUND' };
  }

  const id = crypto.randomUUID();
  const assetId = data.asset_id !== undefined ? data.asset_id : null;
  const titulo = data.titulo !== undefined ? data.titulo : null;

  const executeAtomic = db.transaction(() => {
    // Calcula próxima ordem se não informada
    let ordem = data.ordem;
    if (ordem === undefined || ordem === null) {
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(ordem), -1) as max_ordem FROM Abas WHERE sessao_id = ?')
        .get(data.sessao_id) as { max_ordem: number };
      ordem = maxRow.max_ordem + 1;
    }

    // INSERT idempotente comparando todas as colunas de negócio com IS
    const insertStmt = db.prepare(`
      INSERT INTO Abas (id, sessao_id, tipo, ordem, asset_id, titulo, criado_em)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM Abas
        WHERE sessao_id IS ?
          AND tipo IS ?
          AND ordem IS ?
          AND asset_id IS ?
          AND titulo IS ?
      )
    `);

    const info = insertStmt.run(
      id,
      data.sessao_id,
      data.tipo,
      ordem,
      assetId,
      titulo,
      now,
      data.sessao_id,
      data.tipo,
      ordem,
      assetId,
      titulo
    );

    if (info.changes === 0) {
      const existing = db.prepare(`
        SELECT id FROM Abas
        WHERE sessao_id IS ?
          AND tipo IS ?
          AND ordem IS ?
          AND asset_id IS ?
          AND titulo IS ?
        LIMIT 1
      `).get(data.sessao_id, data.tipo, ordem, assetId, titulo) as { id: string } | undefined;

      return {
        created: false,
        reason: 'DUPLICATE',
        existingId: existing ? existing.id : undefined,
      } as CreateAbaResult;
    }

    const aba: AbaRecord = {
      id,
      sessao_id: data.sessao_id,
      tipo: data.tipo,
      ordem,
      asset_id: assetId,
      titulo,
      criado_em: now,
    };

    return { created: true, id, aba } as CreateAbaResult;
  });

  return executeAtomic();
}

/**
 * Obtém uma aba por ID.
 */
export function getAbaById(id: string, dbInstance?: DatabaseType): AbaRecord | null {
  const db = dbInstance || getDb();
  const row = db.prepare('SELECT * FROM Abas WHERE id = ?').get(id) as AbaRecord | undefined;
  return row || null;
}

/**
 * Lista todas as abas de uma sessão ordenadas por ordem ASC.
 */
export function listAbasBySessao(sessaoId: string, dbInstance?: DatabaseType): AbaRecord[] {
  const db = dbInstance || getDb();
  return db
    .prepare('SELECT * FROM Abas WHERE sessao_id = ? ORDER BY ordem ASC')
    .all(sessaoId) as AbaRecord[];
}

/**
 * Renomeia o título de exibição de uma aba.
 */
export function renameAba(
  id: string,
  novoTitulo: string | null,
  dbInstance?: DatabaseType
): { success: boolean; aba?: AbaRecord } {
  const db = dbInstance || getDb();
  const current = getAbaById(id, db);
  if (!current) {
    return { success: false };
  }

  db.prepare('UPDATE Abas SET titulo = ? WHERE id = ?').run(novoTitulo, id);
  return { success: true, aba: { ...current, titulo: novoTitulo } };
}

/**
 * Reordena as abas de uma sessão garantindo contiguidade de ordem (0..N-1) sem buracos.
 */
export function reorderAbas(
  sessaoId: string,
  abaIdsEmOrdem: string[],
  dbInstance?: DatabaseType
): ReorderAbasResult {
  const db = dbInstance || getDb();

  const executeAtomic = db.transaction(() => {
    const existingAbas = listAbasBySessao(sessaoId, db);
    const existingIds = new Set(existingAbas.map((a) => a.id));

    // Todas as abas fornecidas devem pertencer à mesma sessão
    if (
      abaIdsEmOrdem.length !== existingAbas.length ||
      !abaIdsEmOrdem.every((id) => existingIds.has(id))
    ) {
      return { success: false, reason: 'INVALID_ABA_LIST' } as ReorderAbasResult;
    }

    const updateStmt = db.prepare('UPDATE Abas SET ordem = ? WHERE id = ?');
    for (let i = 0; i < abaIdsEmOrdem.length; i++) {
      updateStmt.run(i, abaIdsEmOrdem[i]);
    }

    const updated = listAbasBySessao(sessaoId, db);
    return { success: true, abas: updated } as ReorderAbasResult;
  });

  return executeAtomic();
}

/**
 * Remove uma aba da sessão, estritamente garantindo que não possui eventos associados.
 * Após a remoção, renumera as ordens das abas restantes para não deixar buracos.
 */
export function deleteAba(id: string, dbInstance?: DatabaseType): DeleteAbaResult {
  const db = dbInstance || getDb();

  const executeAtomic = db.transaction(() => {
    const current = getAbaById(id, db);
    if (!current) {
      return { deleted: false, reason: 'NOT_FOUND' } as DeleteAbaResult;
    }

    // Regra inegociável da OS: somente aba sem evento pode ser removida
    const eventosCountRow = db
      .prepare('SELECT COUNT(*) as qtd FROM Eventos WHERE aba_id = ?')
      .get(id) as { qtd: number };

    if (eventosCountRow && eventosCountRow.qtd > 0) {
      return { deleted: false, reason: 'ABA_POSSUI_EVENTOS' } as DeleteAbaResult;
    }

    db.prepare('DELETE FROM Abas WHERE id = ?').run(id);

    // Reorganiza a ordem das abas restantes da mesma sessão para ficarem contíguas (0, 1, 2...)
    const remaining = listAbasBySessao(current.sessao_id, db);
    const updateStmt = db.prepare('UPDATE Abas SET ordem = ? WHERE id = ?');
    for (let i = 0; i < remaining.length; i++) {
      updateStmt.run(i, remaining[i].id);
    }

    return { deleted: true, id } as DeleteAbaResult;
  });

  return executeAtomic();
}
