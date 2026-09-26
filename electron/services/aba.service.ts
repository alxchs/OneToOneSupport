import { Database as DatabaseType } from 'better-sqlite3';
import {
  createAba as repoCreateAba,
  getAbaById as repoGetAbaById,
  listAbasBySessao as repoListAbasBySessao,
  renameAba as repoRenameAba,
  reorderAbas as repoReorderAbas,
  deleteAba as repoDeleteAba,
  AbaInput,
  AbaRecord,
  AbaTipo,
} from '../db/repositories/aba.repo';
import { sanitizeAssetTitle } from './asset.service';
import { IPCResult } from '../../src/shared/ipc-contract';

export class AbaService {
  private clock: () => number;
  private db?: DatabaseType;

  constructor(
    clockOrDb?: (() => number) | DatabaseType,
    db?: DatabaseType
  ) {
    if (typeof clockOrDb === 'function') {
      this.clock = clockOrDb;
      this.db = db;
    } else {
      this.clock = Date.now;
      this.db = clockOrDb as DatabaseType | undefined;
    }
  }

  /**
   * Cria uma nova aba respeitando o padrão do projeto e idempotência.
   */
  public create(data: AbaInput): IPCResult<AbaRecord> {
    try {
      const validTipos: AbaTipo[] = ['blank', 'image', 'pdf', 'video', 'audio'];
      if (!validTipos.includes(data.tipo)) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Tipo de aba inválido.',
        };
      }

      const tituloSanitizado = data.titulo ? sanitizeAssetTitle(data.titulo) : null;
      const now = this.clock();

      const res = repoCreateAba(
        {
          ...data,
          titulo: tituloSanitizado,
        },
        now,
        this.db
      );

      if (!res.created) {
        if (res.reason === 'DUPLICATE' && res.existingId) {
          const existing = repoGetAbaById(res.existingId, this.db);
          if (existing) {
            return { success: true, data: existing };
          }
        }
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Sessão vinculada não foi encontrada.',
        };
      }

      return { success: true, data: res.aba };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Obtém uma aba por ID.
   */
  public getById(id: string): IPCResult<AbaRecord> {
    try {
      const aba = repoGetAbaById(id, this.db);
      if (!aba) {
        return { success: false, error: 'NOT_FOUND', message: 'Aba não encontrada.' };
      }
      return { success: true, data: aba };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Lista todas as abas de uma sessão ordenadas por ordem.
   */
  public listBySessao(sessaoId: string): IPCResult<AbaRecord[]> {
    try {
      const list = repoListAbasBySessao(sessaoId, this.db);
      return { success: true, data: list };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Renomeia uma aba aplicando sanitização profunda no título.
   */
  public rename(
    idOrPayload: string | { id: string; novoTitulo: string | null },
    novoTitulo?: string | null
  ): IPCResult<AbaRecord> {
    try {
      const id = typeof idOrPayload === 'object' && idOrPayload ? idOrPayload.id : idOrPayload;
      const title = typeof idOrPayload === 'object' && idOrPayload ? idOrPayload.novoTitulo : novoTitulo;
      const sanitized = title !== undefined && title !== null ? sanitizeAssetTitle(title) : null;
      const res = repoRenameAba(id, sanitized, this.db);
      if (!res.success || !res.aba) {
        return { success: false, error: 'NOT_FOUND', message: 'Aba não encontrada para renomeação.' };
      }
      return { success: true, data: res.aba };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Reordena as abas de uma sessão garantindo contiguidade de ordem sem buracos.
   */
  public reorder(
    sessaoIdOrPayload: string | { sessaoId: string; abaIdsEmOrdem: string[] },
    abaIdsEmOrdem?: string[]
  ): IPCResult<AbaRecord[]> {
    try {
      const sessaoId = typeof sessaoIdOrPayload === 'object' && sessaoIdOrPayload ? sessaoIdOrPayload.sessaoId : sessaoIdOrPayload;
      const ids = typeof sessaoIdOrPayload === 'object' && sessaoIdOrPayload ? sessaoIdOrPayload.abaIdsEmOrdem : (abaIdsEmOrdem || []);
      const res = repoReorderAbas(sessaoId, ids, this.db);
      if (!res.success) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Lista de abas para reordenação inválida ou incompleta.',
        };
      }
      return { success: true, data: res.abas };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  /**
   * Remove uma aba (somente permitido caso ela não possua nenhum evento registrado).
   */
  public delete(id: string): IPCResult<{ id: string }> {
    try {
      const res = repoDeleteAba(id, this.db);
      if (!res.deleted) {
        if (res.reason === 'NOT_FOUND') {
          return { success: false, error: 'NOT_FOUND', message: 'Aba não encontrada.' };
        }
        return {
          success: false,
          error: 'HAS_EVENTS' as any,
          message: 'Não é possível remover aba que possui eventos registrados no histórico.',
        };
      }
      return { success: true, data: { id } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }
}

export const abaService = new AbaService();
