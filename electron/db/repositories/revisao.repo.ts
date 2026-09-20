import { Database as DatabaseType } from 'better-sqlite3';
import * as crypto from 'crypto';
import { getDb } from '../connection';

export interface RevisaoInput {
  sessao_id: string;
  snapshot_evento_idx: number;
  titulo?: string | null;
  autor: string;
  criado_em?: number;
}

export interface RevisaoRecord {
  id: string;
  sessao_id: string;
  numero_versao: number;
  snapshot_evento_idx: number;
  titulo: string | null;
  criado_em: number;
  autor: string;
}

/**
 * Repositório de Revisões Imutáveis (Mestre §4, §8, §9).
 *
 * Cada revisão representa um ponto de restauração imutável da sessão.
 * Reabrir uma sessão e salvar cria `numero_versao + 1`, nunca sobrescrevendo
 * nem alterando uma revisão anterior.
 */

/**
 * Cria uma nova revisão imutável com versionamento estritamente incremental (`numero_versao + 1`).
 */
export function createRevisao(
  data: RevisaoInput,
  dbInstance?: DatabaseType
): RevisaoRecord {
  const db = dbInstance || getDb();

  // Verifica existência da sessão
  const sessao = db.prepare('SELECT id FROM Sessoes WHERE id = ?').get(data.sessao_id);
  if (!sessao) {
    throw new Error(`Sessão '${data.sessao_id}' não encontrada para criação de revisão.`);
  }

  // Obtém o maior numero_versao atual para esta sessão
  const row = db
    .prepare('SELECT COALESCE(MAX(numero_versao), 0) as max_v FROM Sessoes_Revisoes WHERE sessao_id = ?')
    .get(data.sessao_id) as { max_v: number } | undefined;

  const proximaVersao = (row ? row.max_v : 0) + 1;
  const id = crypto.randomUUID();
  const titulo = data.titulo !== undefined ? data.titulo : null;
  const criadoEm = data.criado_em !== undefined ? data.criado_em : Date.now();

  db.prepare(`
    INSERT INTO Sessoes_Revisoes (id, sessao_id, numero_versao, snapshot_evento_idx, titulo, criado_em, autor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.sessao_id,
    proximaVersao,
    data.snapshot_evento_idx,
    titulo,
    criadoEm,
    data.autor
  );

  return {
    id,
    sessao_id: data.sessao_id,
    numero_versao: proximaVersao,
    snapshot_evento_idx: data.snapshot_evento_idx,
    titulo,
    criado_em: criadoEm,
    autor: data.autor,
  };
}

/**
 * Lista todas as revisões de uma sessão em ordem crescente de versão.
 */
export function listRevisoesBySessao(
  sessaoId: string,
  dbInstance?: DatabaseType
): RevisaoRecord[] {
  const db = dbInstance || getDb();
  return db
    .prepare('SELECT * FROM Sessoes_Revisoes WHERE sessao_id = ? ORDER BY numero_versao ASC')
    .all(sessaoId) as RevisaoRecord[];
}

/**
 * Obtém uma revisão específica pelo seu número de versão imutável.
 */
export function getRevisaoByVersao(
  sessaoId: string,
  numeroVersao: number,
  dbInstance?: DatabaseType
): RevisaoRecord | null {
  const db = dbInstance || getDb();
  const row = db
    .prepare('SELECT * FROM Sessoes_Revisoes WHERE sessao_id = ? AND numero_versao = ?')
    .get(sessaoId, numeroVersao) as RevisaoRecord | undefined;
  return row || null;
}
