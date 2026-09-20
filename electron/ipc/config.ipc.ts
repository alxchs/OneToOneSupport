import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPCResult } from '../../src/shared/ipc-contract';
import { configService } from '../services/config.service';

export async function handleConfigGetDictionary(): Promise<IPCResult<Record<string, string>>> {
  return configService.getDictionary();
}

export async function handleConfigSetLabel(payload: unknown): Promise<IPCResult<{ chave: string; valor: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.chave !== 'string' || !p.chave.startsWith('rotulo.')) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'A chave deve ser uma string iniciada por "rotulo."',
    };
  }

  if (typeof p.valor !== 'string' || !p.valor.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'O valor do rótulo não pode ser vazio.',
    };
  }

  return configService.setLabel(p.chave.trim(), p.valor.trim());
}

export async function handleConfigGet(payload: unknown): Promise<IPCResult<string | null>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { chave } = payload as { chave?: unknown };
  if (typeof chave !== 'string' || !chave.trim()) {
    return { success: false, error: 'VALIDATION', message: 'Chave é obrigatória.' };
  }
  return configService.get(chave.trim());
}

export async function handleConfigSet(payload: unknown): Promise<IPCResult<{ chave: string; valor: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.chave !== 'string' || !p.chave.trim()) {
    return { success: false, error: 'VALIDATION', message: 'Chave é obrigatória.' };
  }
  if (typeof p.valor !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Valor deve ser uma string.' };
  }
  return configService.set(p.chave.trim(), p.valor);
}

export function registerConfigIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_DICTIONARY, () => handleConfigGetDictionary());
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET_LABEL, (_event, payload) => handleConfigSetLabel(payload));
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (_event, payload) => handleConfigGet(payload));
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_event, payload) => handleConfigSet(payload));
}
