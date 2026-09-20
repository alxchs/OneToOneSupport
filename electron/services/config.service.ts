import { Database as DatabaseType } from 'better-sqlite3';
import {
  setConfig as repoSetConfig,
  getConfig as repoGetConfig,
  getAllConfigs as repoGetAllConfigs,
} from '../db/repositories/configuracao.repo';
import { IPCResult, DEFAULT_DICTIONARY } from '../../src/shared/ipc-contract';

export class ConfigService {
  constructor(private db?: DatabaseType) {}

  public getDictionary(): IPCResult<Record<string, string>> {
    try {
      const all = repoGetAllConfigs(this.db);
      const dict: Record<string, string> = { ...DEFAULT_DICTIONARY };
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith('rotulo.')) {
          dict[k] = v;
        }
      }
      return { success: true, data: dict };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public setLabel(chave: string, valor: string): IPCResult<{ chave: string; valor: string }> {
    try {
      if (!chave.startsWith('rotulo.')) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Chaves de dicionário devem iniciar com o prefixo "rotulo."',
        };
      }
      const trimmedVal = valor.trim();
      if (!trimmedVal) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'O valor do rótulo não pode ser vazio.',
        };
      }

      const res = repoSetConfig(chave, trimmedVal, this.db);
      if (!res.success) {
        return {
          success: false,
          error: 'DUPLICATE',
          message: 'Este rótulo já está configurado com exatamente este valor.',
        };
      }

      return { success: true, data: { chave, valor: trimmedVal } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public get(chave: string): IPCResult<string | null> {
    try {
      const val = repoGetConfig(chave, this.db);
      return { success: true, data: val };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }

  public set(chave: string, valor: string): IPCResult<{ chave: string; valor: string }> {
    try {
      const trimmedKey = chave.trim();
      if (!trimmedKey) {
        return {
          success: false,
          error: 'VALIDATION',
          message: 'Chave de configuração não pode ser vazia.',
        };
      }

      const res = repoSetConfig(trimmedKey, valor, this.db);
      if (!res.success) {
        return {
          success: false,
          error: 'DUPLICATE',
          message: 'Esta configuração já possui exatamente este valor.',
        };
      }

      return { success: true, data: { chave: trimmedKey, valor } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: 'INTERNAL_ERROR', message };
    }
  }
}

export const configService = new ConfigService();
