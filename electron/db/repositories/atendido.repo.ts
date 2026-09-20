import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export interface AtendidoInput {
  nome: string;
  contato?: string | null;
  email?: string | null;
  notas?: string | null;
}

export interface AtendidoRecord {
  id: string;
  nome: string;
  contato: string | null;
  email: string | null;
  notas: string | null;
  ativo: number;
  deletado_em: number | null;
  criado_em: number;
  atualizado_em: number;
}

export type CreateAtendidoResult =
  | { created: true; id: string }
  | { created: false; reason: 'DUPLICATE'; existingId: string };

export type UpdateAtendidoResult =
  | { updated: true; id: string }
  | { updated: false; reason: 'DUPLICATE'; existingId: string }
  | { updated: false; reason: 'NOT_FOUND' };

/**
 * Insere um novo atendido cumprindo a Regra Técnica #1 (SQLite):
 * INSERT INTO Atendidos (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM Atendidos WHERE nome IS ? AND contato IS ? AND email IS ? AND notas IS ?)
 * Checagem e INSERT executados atomicamente em única transação.
 */
export function createAtendido(
  data: AtendidoInput,
  dbInstance?: DatabaseType
): CreateAtendidoResult {
  const db = dbInstance || getDb();
  const id = crypto.randomUUID();
  const nome = data.nome;
  const contato = data.contato !== undefined ? data.contato : null;
  const email = data.email !== undefined ? data.email : null;
  const notas = data.notas !== undefined ? data.notas : null;
  const now = Date.now();

  const insertStmt = db.prepare(`
    INSERT INTO Atendidos (id, nome, contato, email, notas, ativo, deletado_em, criado_em, atualizado_em)
    SELECT ?, ?, ?, ?, ?, 1, NULL, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM Atendidos
      WHERE nome IS ? AND contato IS ? AND email IS ? AND notas IS ?
    )
  `);

  const findExistingStmt = db.prepare(`
    SELECT id FROM Atendidos
    WHERE nome IS ? AND contato IS ? AND email IS ? AND notas IS ?
    LIMIT 1
  `);

  const executeAtomic = db.transaction(() => {
    const info = insertStmt.run(
      id,
      nome,
      contato,
      email,
      notas,
      now,
      now,
      nome,
      contato,
      email,
      notas
    );

    if (info.changes > 0) {
      return { created: true, id } as CreateAtendidoResult;
    }

    const existing = findExistingStmt.get(nome, contato, email, notas) as
      | { id: string }
      | undefined;

    return {
      created: false,
      reason: 'DUPLICATE',
      existingId: existing ? existing.id : '',
    } as CreateAtendidoResult;
  });

  return executeAtomic();
}

/**
 * Atualiza um atendido existente cumprindo a Regra Técnica #1.
 * O UPDATE só efetiva se o estado resultante não duplicar outro registro (WHERE id != ?).
 * Checagem e UPDATE realizados em transação única.
 */
export function updateAtendido(
  id: string,
  data: Partial<AtendidoInput>,
  dbInstance?: DatabaseType
): UpdateAtendidoResult {
  const db = dbInstance || getDb();

  const findCurrentStmt = db.prepare(`
    SELECT id, nome, contato, email, notas, ativo, deletado_em, criado_em, atualizado_em
    FROM Atendidos
    WHERE id = ?
  `);

  const findOtherConflictStmt = db.prepare(`
    SELECT id FROM Atendidos
    WHERE id != ?
      AND nome IS ? AND contato IS ? AND email IS ? AND notas IS ?
    LIMIT 1
  `);

  const updateStmt = db.prepare(`
    UPDATE Atendidos
    SET nome = ?, contato = ?, email = ?, notas = ?, atualizado_em = ?
    WHERE id = ?
      AND NOT EXISTS (
        SELECT 1 FROM Atendidos
        WHERE id != ?
          AND nome IS ? AND contato IS ? AND email IS ? AND notas IS ?
      )
  `);

  const executeAtomic = db.transaction(() => {
    const current = findCurrentStmt.get(id) as AtendidoRecord | undefined;
    if (!current) {
      return { updated: false, reason: 'NOT_FOUND' } as UpdateAtendidoResult;
    }

    const newNome = data.nome !== undefined ? data.nome : current.nome;
    const newContato = data.contato !== undefined ? data.contato : current.contato;
    const newEmail = data.email !== undefined ? data.email : current.email;
    const newNotas = data.notas !== undefined ? data.notas : current.notas;
    const now = Date.now();

    // Checar se outro registro (id != ?) colide com os novos valores de negócio
    const conflict = findOtherConflictStmt.get(
      id,
      newNome,
      newContato,
      newEmail,
      newNotas
    ) as { id: string } | undefined;

    if (conflict) {
      return {
        updated: false,
        reason: 'DUPLICATE',
        existingId: conflict.id,
      } as UpdateAtendidoResult;
    }

    const info = updateStmt.run(
      newNome,
      newContato,
      newEmail,
      newNotas,
      now,
      id,
      id,
      newNome,
      newContato,
      newEmail,
      newNotas
    );

    if (info.changes === 0) {
      return { updated: false, reason: 'NOT_FOUND' } as UpdateAtendidoResult;
    }
    return { updated: true, id } as UpdateAtendidoResult;
  });

  return executeAtomic();
}

/**
 * Consulta um atendido pelo ID.
 */
export function getAtendidoById(
  id: string,
  dbInstance?: DatabaseType
): AtendidoRecord | null {
  const db = dbInstance || getDb();
  const row = db.prepare('SELECT * FROM Atendidos WHERE id = ?').get(id) as
    | AtendidoRecord
    | undefined;
  return row || null;
}

/**
 * Lista atendidos com suporte a busca textual e filtro de ativos/inativos.
 */
export function listAtendidos(
  filter?: { busca?: string; apenasAtivos?: boolean },
  dbInstance?: DatabaseType
): AtendidoRecord[] {
  const db = dbInstance || getDb();
  let sql = 'SELECT * FROM Atendidos WHERE 1=1';
  const params: unknown[] = [];

  if (filter?.apenasAtivos !== false) {
    sql += ' AND ativo = 1';
  }

  if (filter?.busca && filter.busca.trim().length > 0) {
    const term = `%${filter.busca.trim()}%`;
    sql += ' AND (nome LIKE ? OR contato LIKE ? OR email LIKE ?)';
    params.push(term, term, term);
  }

  sql += ' ORDER BY nome COLLATE NOCASE ASC';
  return db.prepare(sql).all(...params) as AtendidoRecord[];
}

/**
 * Marca um atendido como desativado (soft delete).
 */
export function softDeleteAtendido(
  id: string,
  now = Date.now(),
  dbInstance?: DatabaseType
): boolean {
  const db = dbInstance || getDb();
  const info = db
    .prepare(
      `UPDATE Atendidos
       SET ativo = 0, deletado_em = ?, atualizado_em = ?
       WHERE id = ? AND ativo = 1`
    )
    .run(now, now, id);
  return info.changes > 0;
}

/**
 * Reativa um atendido previamente desativado.
 */
export function reactivateAtendido(
  id: string,
  now = Date.now(),
  dbInstance?: DatabaseType
): boolean {
  const db = dbInstance || getDb();
  const info = db
    .prepare(
      `UPDATE Atendidos
       SET ativo = 1, deletado_em = NULL, atualizado_em = ?
       WHERE id = ? AND ativo = 0`
    )
    .run(now, id);
  return info.changes > 0;
}

/**
 * Exclusão física definitiva de um atendido e seus vínculos.
 */
export function purgeAtendido(
  id: string,
  dbInstance?: DatabaseType
): boolean {
  const db = dbInstance || getDb();
  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM Eventos WHERE sessao_id IN (SELECT id FROM Sessoes WHERE atendido_id = ?)').run(id);
    db.prepare('DELETE FROM Abas WHERE sessao_id IN (SELECT id FROM Sessoes WHERE atendido_id = ?)').run(id);
    db.prepare('DELETE FROM Sessoes_Revisoes WHERE sessao_id IN (SELECT id FROM Sessoes WHERE atendido_id = ?)').run(id);
    db.prepare('DELETE FROM Assets WHERE sessao_id IN (SELECT id FROM Sessoes WHERE atendido_id = ?)').run(id);
    db.prepare('DELETE FROM Sessoes WHERE atendido_id = ?').run(id);
    const info = db.prepare('DELETE FROM Atendidos WHERE id = ?').run(id);
    return info.changes > 0;
  });
  return deleteTx();
}
