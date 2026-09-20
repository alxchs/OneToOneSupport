import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export interface SessaoInput {
  atendido_id: string;
  titulo?: string | null;
  notas_host?: string | null;
}

export interface SessaoRecord {
  id: string;
  atendido_id: string;
  titulo: string | null;
  status: 'ativa' | 'encerrada';
  iniciado_em: number;
  encerrado_em: number | null;
  notas_host: string | null;
}

export type CreateSessaoResult =
  | { created: true; id: string; sessao: SessaoRecord }
  | { created: false; reason: 'ATENDIDO_NOT_FOUND' };

export type EncerrarSessaoResult =
  | { encerrada: true; id: string; sessao: SessaoRecord }
  | { encerrada: false; reason: 'NOT_FOUND' | 'ALREADY_CLOSED' };

/**
 * Cria uma nova sessão vinculada a um atendido.
 * Garante que nunca cria sessão órfã (FK ligada e verificação explícita).
 */
export function createSessao(
  data: SessaoInput,
  now = Date.now(),
  dbInstance?: DatabaseType
): CreateSessaoResult {
  const db = dbInstance || getDb();

  // Verificar existência prévia do atendido para evitar sessão órfã
  const atendidoExiste = db
    .prepare('SELECT id FROM Atendidos WHERE id = ?')
    .get(data.atendido_id);

  if (!atendidoExiste) {
    return { created: false, reason: 'ATENDIDO_NOT_FOUND' };
  }

  const id = crypto.randomUUID();
  const titulo = data.titulo !== undefined ? data.titulo : null;
  const notasHost = data.notas_host !== undefined ? data.notas_host : null;
  const status = 'ativa';

  const insertStmt = db.prepare(`
    INSERT INTO Sessoes (id, atendido_id, titulo, status, iniciado_em, encerrado_em, notas_host)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `);

  insertStmt.run(id, data.atendido_id, titulo, status, now, notasHost);

  const sessao: SessaoRecord = {
    id,
    atendido_id: data.atendido_id,
    titulo,
    status,
    iniciado_em: now,
    encerrado_em: null,
    notas_host: notasHost,
  };

  return { created: true, id, sessao };
}

/**
 * Encerra uma sessão ativa.
 */
export function encerrarSessao(
  id: string,
  notasHost?: string | null,
  now = Date.now(),
  dbInstance?: DatabaseType
): EncerrarSessaoResult {
  const db = dbInstance || getDb();

  const current = db
    .prepare('SELECT * FROM Sessoes WHERE id = ?')
    .get(id) as SessaoRecord | undefined;

  if (!current) {
    return { encerrada: false, reason: 'NOT_FOUND' };
  }

  if (current.status === 'encerrada') {
    return { encerrada: false, reason: 'ALREADY_CLOSED' };
  }

  const finalNotas =
    notasHost !== undefined && notasHost !== null
      ? notasHost
      : current.notas_host;

  db.prepare(`
    UPDATE Sessoes
    SET status = 'encerrada', encerrado_em = ?, notas_host = ?
    WHERE id = ?
  `).run(now, finalNotas, id);

  const updated: SessaoRecord = {
    ...current,
    status: 'encerrada',
    encerrado_em: now,
    notas_host: finalNotas,
  };

  return { encerrada: true, id, sessao: updated };
}

/**
 * Obtém uma sessão por ID.
 */
export function getSessaoById(
  id: string,
  dbInstance?: DatabaseType
): SessaoRecord | null {
  const db = dbInstance || getDb();
  const row = db.prepare('SELECT * FROM Sessoes WHERE id = ?').get(id) as
    | SessaoRecord
    | undefined;
  return row || null;
}

/**
 * Lista todas as sessões de um atendido específico, ordenadas cronologicamente inversa.
 */
export function listSessoesByAtendido(
  atendidoId: string,
  dbInstance?: DatabaseType
): SessaoRecord[] {
  const db = dbInstance || getDb();
  return db
    .prepare('SELECT * FROM Sessoes WHERE atendido_id = ? ORDER BY iniciado_em DESC')
    .all(atendidoId) as SessaoRecord[];
}

/**
 * Lista todas as sessões registradas no sistema.
 */
export function listSessoes(
  filter?: { status?: string },
  dbInstance?: DatabaseType
): SessaoRecord[] {
  const db = dbInstance || getDb();
  if (filter?.status) {
    return db
      .prepare('SELECT * FROM Sessoes WHERE status = ? ORDER BY iniciado_em DESC')
      .all(filter.status) as SessaoRecord[];
  }
  return db
    .prepare('SELECT * FROM Sessoes ORDER BY iniciado_em DESC')
    .all() as SessaoRecord[];
}
