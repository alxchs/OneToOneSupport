import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPCResult,
  AbaDTO,
  AbaTipo,
} from '../../src/shared/ipc-contract';
import { abaService } from '../services/aba.service';

export async function handleAbaCreate(payload: unknown): Promise<IPCResult<AbaDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido para criação de aba.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.sessao_id !== 'string' || !p.sessao_id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessao_id é obrigatório.' };
  }

  const validTipos: AbaTipo[] = ['blank', 'image', 'pdf', 'video', 'audio'];
  if (typeof p.tipo !== 'string' || !validTipos.includes(p.tipo as AbaTipo)) {
    return { success: false, error: 'VALIDATION', message: 'tipo de aba inválido.' };
  }

  const ordem = typeof p.ordem === 'number' && Number.isInteger(p.ordem) ? p.ordem : undefined;
  const assetId = typeof p.asset_id === 'string' && p.asset_id.trim() ? p.asset_id.trim() : null;
  const titulo = typeof p.titulo === 'string' ? p.titulo.trim() : null;

  return abaService.create({
    sessao_id: p.sessao_id.trim(),
    tipo: p.tipo as AbaTipo,
    ordem,
    asset_id: assetId,
    titulo,
  });
}

export async function handleAbaGet(payload: unknown): Promise<IPCResult<AbaDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID da aba é obrigatório.' };
  }
  return abaService.getById(id.trim());
}

export async function handleAbaList(payload: unknown): Promise<IPCResult<AbaDTO[]>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { sessaoId } = payload as { sessaoId?: unknown };
  if (typeof sessaoId !== 'string' || !sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }
  return abaService.listBySessao(sessaoId.trim());
}

export async function handleAbaRename(payload: unknown): Promise<IPCResult<AbaDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as { id?: unknown; novoTitulo?: unknown };
  if (typeof p.id !== 'string' || !p.id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID da aba é obrigatório.' };
  }
  const novoTitulo = typeof p.novoTitulo === 'string' ? p.novoTitulo.trim() : null;
  return abaService.rename(p.id.trim(), novoTitulo);
}

export async function handleAbaReorder(payload: unknown): Promise<IPCResult<AbaDTO[]>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as { sessaoId?: unknown; abaIdsEmOrdem?: unknown };
  if (typeof p.sessaoId !== 'string' || !p.sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }
  if (!Array.isArray(p.abaIdsEmOrdem) || !p.abaIdsEmOrdem.every((id) => typeof id === 'string')) {
    return { success: false, error: 'VALIDATION', message: 'abaIdsEmOrdem deve ser um array de strings.' };
  }
  return abaService.reorder(p.sessaoId.trim(), p.abaIdsEmOrdem as string[]);
}

export async function handleAbaDelete(payload: unknown): Promise<IPCResult<{ id: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID da aba é obrigatório.' };
  }
  return abaService.delete(id.trim());
}

export function registerAbaIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ABA_CREATE, (_event, payload) => handleAbaCreate(payload));
  ipcMain.handle(IPC_CHANNELS.ABA_GET, (_event, payload) => handleAbaGet(payload));
  ipcMain.handle(IPC_CHANNELS.ABA_LIST, (_event, payload) => handleAbaList(payload));
  ipcMain.handle(IPC_CHANNELS.ABA_RENAME, (_event, payload) => handleAbaRename(payload));
  ipcMain.handle(IPC_CHANNELS.ABA_REORDER, (_event, payload) => handleAbaReorder(payload));
  ipcMain.handle(IPC_CHANNELS.ABA_DELETE, (_event, payload) => handleAbaDelete(payload));
}
