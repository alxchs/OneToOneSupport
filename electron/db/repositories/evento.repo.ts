import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export interface EventoInput {
  id?: string;
  sessao_id: string;
  aba_id?: string | null;
  tipo: string;
  payload: string;
  autor: string;
  criado_em?: number;
}

export interface EventoRecord {
  rowid: number;
  id: string;
  sessao_id: string;
  aba_id: string | null;
  tipo: string;
  payload: string;
  autor: string;
  criado_em: number;
}

export interface GetEventosOptions {
  abaId?: string;
  fromCriadoEm?: number;
  limit?: number;
  offset?: number;
}

/**
 * Repositório Append-Only da tabela Eventos (Mestre §4, §8, §9).
 *
 * Princípios Inegociáveis:
 * 1. SOMENTE APPEND: Nunca expõe funções de UPDATE ou DELETE.
 *    Qualquer mutação física é impedida a nível de banco de dados pela trigger
 *    `trg_eventos_prevent_update` e `trg_eventos_prevent_delete` (Migration 002).
 * 2. ORDEM TOTAL ESTÁVEL: Ordenação estrita por `criado_em ASC, rowid ASC`.
 *    O `rowid` nativo do SQLite resolve desempates no mesmo milissegundo de forma
 *    estritamente monotônica e determinística.
 */

/**
 * Insere um único evento no log imutável de eventos da sessão.
 */
export function appendEvento(
  data: EventoInput,
  dbInstance?: DatabaseType
): EventoRecord {
  const db = dbInstance || getDb();

  // Garante integridade referencial da sessão
  const sessaoExiste = db
    .prepare('SELECT id FROM Sessoes WHERE id = ?')
    .get(data.sessao_id);

  if (!sessaoExiste) {
    throw new Error(`Sessão '${data.sessao_id}' não encontrada para inserção de evento.`);
  }

  const id = data.id || crypto.randomUUID();
  const abaId = data.aba_id !== undefined ? data.aba_id : null;
  const criadoEm = data.criado_em !== undefined ? data.criado_em : Date.now();

  const insertStmt = db.prepare(`
    INSERT INTO Eventos (id, sessao_id, aba_id, tipo, payload, autor, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = insertStmt.run(
    id,
    data.sessao_id,
    abaId,
    data.tipo,
    data.payload,
    data.autor,
    criadoEm
  );

  return {
    rowid: Number(info.lastInsertRowid),
    id,
    sessao_id: data.sessao_id,
    aba_id: abaId,
    tipo: data.tipo,
    payload: data.payload,
    autor: data.autor,
    criado_em: criadoEm,
  };
}

/**
 * Insere múltiplos eventos em lote dentro de uma única transação atômica.
 */
export function appendEventos(
  eventos: EventoInput[],
  dbInstance?: DatabaseType
): EventoRecord[] {
  const db = dbInstance || getDb();
  const insertMany = db.transaction((items: EventoInput[]) => {
    return items.map((item) => appendEvento(item, db));
  });
  return insertMany(eventos);
}

/**
 * Obtém todos os eventos de uma sessão em ordem total estável (`criado_em ASC, rowid ASC`).
 */
export function getEventosBySessao(
  sessaoId: string,
  options?: GetEventosOptions,
  dbInstance?: DatabaseType
): EventoRecord[] {
  const db = dbInstance || getDb();

  if (options?.abaId && options?.fromCriadoEm !== undefined) {
    return db
      .prepare(`
        SELECT rowid, id, sessao_id, aba_id, tipo, payload, autor, criado_em
        FROM Eventos
        WHERE sessao_id = ? AND aba_id = ? AND criado_em >= ?
        ORDER BY criado_em ASC, rowid ASC
      `)
      .all(sessaoId, options.abaId, options.fromCriadoEm) as EventoRecord[];
  }

  if (options?.abaId) {
    return db
      .prepare(`
        SELECT rowid, id, sessao_id, aba_id, tipo, payload, autor, criado_em
        FROM Eventos
        WHERE sessao_id = ? AND aba_id = ?
        ORDER BY criado_em ASC, rowid ASC
      `)
      .all(sessaoId, options.abaId) as EventoRecord[];
  }

  if (options?.fromCriadoEm !== undefined) {
    return db
      .prepare(`
        SELECT rowid, id, sessao_id, aba_id, tipo, payload, autor, criado_em
        FROM Eventos
        WHERE sessao_id = ? AND criado_em >= ?
        ORDER BY criado_em ASC, rowid ASC
      `)
      .all(sessaoId, options.fromCriadoEm) as EventoRecord[];
  }

  return db
    .prepare(`
      SELECT rowid, id, sessao_id, aba_id, tipo, payload, autor, criado_em
      FROM Eventos
      WHERE sessao_id = ?
      ORDER BY criado_em ASC, rowid ASC
    `)
    .all(sessaoId) as EventoRecord[];
}

/**
 * Retorna a contagem total de eventos já registrados para a sessão.
 */
export function countEventosBySessao(
  sessaoId: string,
  dbInstance?: DatabaseType
): number {
  const db = dbInstance || getDb();
  const row = db
    .prepare('SELECT COUNT(*) as total FROM Eventos WHERE sessao_id = ?')
    .get(sessaoId) as { total: number } | undefined;
  return row ? row.total : 0;
}

/**
 * Obtém uma fatia sequencial de eventos por offset e limite em ordem estável.
 */
export function getEventosSlice(
  sessaoId: string,
  offset: number,
  limit: number,
  dbInstance?: DatabaseType
): EventoRecord[] {
  const db = dbInstance || getDb();
  return db
    .prepare(`
      SELECT rowid, id, sessao_id, aba_id, tipo, payload, autor, criado_em
      FROM Eventos
      WHERE sessao_id = ?
      ORDER BY criado_em ASC, rowid ASC
      LIMIT ? OFFSET ?
    `)
    .all(sessaoId, limit, offset) as EventoRecord[];
}
