import { Database as DatabaseType } from 'better-sqlite3';
import {
  createSessao as repoCreateSessao,
  encerrarSessao as repoEncerrarSessao,
  getSessaoById as repoGetSessaoById,
  listSessoesByAtendido as repoListSessoesByAtendido,
  SessaoInput,
  SessaoRecord,
} from '../db/repositories/sessao.repo';
import { getAtendidoById } from '../db/repositories/atendido.repo';
import { assetService } from './asset.service';
import { IPCResult } from '../../src/shared/ipc-contract';

export class SessaoService {
  constructor(
    private clock: () => number = Date.now,
    private db?: DatabaseType
  ) {}

  public create(data: SessaoInput): IPCResult<SessaoRecord> {
    try {
      const atendido = getAtendidoById(data.atendido_id, this.db);
      if (!atendido) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Atendido vinculado não foi encontrado.',
        };
      }

      if (atendido.ativo === 0) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Não é possível iniciar uma nova sessão para um atendido inativo.',
        };
      }

      const now = this.clock();
      const res = repoCreateSessao(data, now, this.db);
      if (!res.created) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Falha ao vincular sessão ao atendido.',
        };
      }

      return { success: true, data: res.sessao };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public encerrar(id: string, notasHost?: string | null): IPCResult<SessaoRecord> {
    try {
      const now = this.clock();
      const res = repoEncerrarSessao(id, notasHost, now, this.db);
      if (!res.encerrada) {
        if (res.reason === 'NOT_FOUND') {
          return { success: false, error: 'NOT_FOUND', message: 'Sessão não encontrada.' };
        }
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Esta sessão já foi encerrada anteriormente.',
        };
      }

      // Arquivamento dos assets vinculados à sessão (M8)
      try {
        const atendido = getAtendidoById(res.sessao.atendido_id, this.db);
        assetService.arquivarAssetsSessao(
          res.sessao.id,
          atendido?.nome || '',
          res.sessao.iniciado_em,
          res.sessao.atendido_id
        );
      } catch (archiveErr) {
        console.error('[SessaoService] Aviso ao arquivar assets no encerramento:', archiveErr);
      }

      return { success: true, data: res.sessao };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public getById(id: string): IPCResult<SessaoRecord> {
    try {
      const sessao = repoGetSessaoById(id, this.db);
      if (!sessao) {
        return { success: false, error: 'NOT_FOUND', message: 'Sessão não encontrada.' };
      }
      return { success: true, data: sessao };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public listByAtendido(atendidoId: string): IPCResult<SessaoRecord[]> {
    try {
      const list = repoListSessoesByAtendido(atendidoId, this.db);
      return { success: true, data: list };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }
}

export const sessaoService = new SessaoService();
