import { Database as DatabaseType } from 'better-sqlite3';
import {
  createAtendido as repoCreateAtendido,
  updateAtendido as repoUpdateAtendido,
  getAtendidoById as repoGetAtendidoById,
  listAtendidos as repoListAtendidos,
  softDeleteAtendido as repoSoftDeleteAtendido,
  reactivateAtendido as repoReactivateAtendido,
  purgeAtendido as repoPurgeAtendido,
  AtendidoInput,
  AtendidoRecord,
} from '../db/repositories/atendido.repo';
import { listSessoesByAtendido } from '../db/repositories/sessao.repo';
import { IPCResult } from '../../src/shared/ipc-contract';

export const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export class AtendidoService {
  constructor(
    private clock: () => number = Date.now,
    private db?: DatabaseType
  ) {}

  public list(
    filter?: { busca?: string; apenasAtivos?: boolean }
  ): IPCResult<AtendidoRecord[]> {
    try {
      const records = repoListAtendidos(filter, this.db);
      return { success: true, data: records };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public getById(id: string): IPCResult<AtendidoRecord> {
    try {
      const record = repoGetAtendidoById(id, this.db);
      if (!record) {
        return { success: false, error: 'NOT_FOUND', message: 'Atendido não encontrado' };
      }
      return { success: true, data: record };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public create(data: AtendidoInput): IPCResult<AtendidoRecord> {
    try {
      const res = repoCreateAtendido(data, this.db);
      if (!res.created) {
        return {
          success: false,
          error: 'DUPLICATE',
          message: 'Já existe um cadastro idêntico registrado no sistema.',
          existingId: res.existingId,
        };
      }
      const record = repoGetAtendidoById(res.id, this.db);
      if (!record) {
        return { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao recuperar registro criado.' };
      }
      return { success: true, data: record };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public update(id: string, data: Partial<AtendidoInput>): IPCResult<AtendidoRecord> {
    try {
      const res = repoUpdateAtendido(id, data, this.db);
      if (!res.updated) {
        if (res.reason === 'NOT_FOUND') {
          return { success: false, error: 'NOT_FOUND', message: 'Atendido não encontrado para atualização.' };
        }
        return {
          success: false,
          error: 'DUPLICATE',
          message: 'Os novos dados conflitam com outro cadastro existente.',
          existingId: res.existingId,
        };
      }
      const record = repoGetAtendidoById(id, this.db);
      if (!record) {
        return { success: false, error: 'INTERNAL_ERROR', message: 'Erro ao recuperar registro atualizado.' };
      }
      return { success: true, data: record };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public softDelete(id: string): IPCResult<{ id: string }> {
    try {
      const current = repoGetAtendidoById(id, this.db);
      if (!current) {
        return { success: false, error: 'NOT_FOUND', message: 'Atendido não encontrado.' };
      }
      const now = this.clock();
      repoSoftDeleteAtendido(id, now, this.db);
      return { success: true, data: { id } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public reactivate(id: string): IPCResult<{ id: string }> {
    try {
      const current = repoGetAtendidoById(id, this.db);
      if (!current) {
        return { success: false, error: 'NOT_FOUND', message: 'Atendido não encontrado.' };
      }
      const now = this.clock();
      repoReactivateAtendido(id, now, this.db);
      return { success: true, data: { id } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public purgar(id: string): IPCResult<{ id: string }> {
    try {
      const current = repoGetAtendidoById(id, this.db);
      if (!current) {
        return { success: false, error: 'NOT_FOUND', message: 'Atendido não encontrado.' };
      }

      if (current.ativo === 1) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Atendido deve estar desativado (soft delete) antes de ser purgado.',
        };
      }

      const sessions = listSessoesByAtendido(id, this.db);
      const hasActiveSession = sessions.some((s) => s.status === 'ativa');
      if (hasActiveSession) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Atendido possui sessões ativas e não pode ser purgado.',
        };
      }

      const now = this.clock();

      if (sessions.length > 0) {
        for (const s of sessions) {
          if (!s.encerrado_em || now - s.encerrado_em < TEN_YEARS_MS) {
            return {
              success: false,
              error: 'VALIDATION',
              message:
                'Purga física só é permitida se todas as sessões foram encerradas há mais de 10 anos.',
            };
          }
        }
      } else {
        const referenceTime = current.deletado_em || current.atualizado_em || current.criado_em;
        if (now - referenceTime < TEN_YEARS_MS) {
          return {
            success: false,
            error: 'VALIDATION',
            message:
              'Purga física só é permitida após 10 anos de arquivamento para registros sem sessões.',
          };
        }
      }

      const purged = repoPurgeAtendido(id, this.db);
      if (!purged) {
        return {
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Falha ao executar purga física no banco.',
        };
      }

      return { success: true, data: { id } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }
}

// Instância padrão para o Main process
export const atendidoService = new AtendidoService();
