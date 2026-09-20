import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPCResult, SessaoDTO } from '../../src/shared/ipc-contract';
import { sessaoService } from '../services/sessao.service';

export async function handleSessaoCreate(payload: unknown): Promise<IPCResult<SessaoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido para criação de sessão.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.atendido_id !== 'string' || !p.atendido_id.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'atendido_id é obrigatório para iniciar uma sessão.',
    };
  }

  if (p.titulo !== undefined && p.titulo !== null && typeof p.titulo !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Título da sessão deve ser uma string ou nulo.' };
  }

  if (p.notas_host !== undefined && p.notas_host !== null && typeof p.notas_host !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Notas do host devem ser uma string ou nulo.' };
  }

  return sessaoService.create({
    atendido_id: p.atendido_id.trim(),
    titulo: typeof p.titulo === 'string' ? p.titulo.trim() : null,
    notas_host: typeof p.notas_host === 'string' ? p.notas_host.trim() : null,
  });
}

export async function handleSessaoEncerrar(payload: unknown): Promise<IPCResult<SessaoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido para encerramento de sessão.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID da sessão é obrigatório.' };
  }

  if (p.notas_host !== undefined && p.notas_host !== null && typeof p.notas_host !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Notas do host devem ser uma string ou nulo.' };
  }

  return sessaoService.encerrar(
    p.id.trim(),
    typeof p.notas_host === 'string' ? p.notas_host.trim() : null
  );
}

export async function handleSessaoGet(payload: unknown): Promise<IPCResult<SessaoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID da sessão é obrigatório.' };
  }
  return sessaoService.getById(id.trim());
}

export async function handleSessaoListByAtendido(payload: unknown): Promise<IPCResult<SessaoDTO[]>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { atendido_id } = payload as { atendido_id?: unknown };
  if (typeof atendido_id !== 'string' || !atendido_id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'atendido_id é obrigatório.' };
  }
  return sessaoService.listByAtendido(atendido_id.trim());
}

export function registerSessaoIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SESSAO_CREATE, (_event, payload) => handleSessaoCreate(payload));
  ipcMain.handle(IPC_CHANNELS.SESSAO_ENCERRAR, (_event, payload) => handleSessaoEncerrar(payload));
  ipcMain.handle(IPC_CHANNELS.SESSAO_GET, (_event, payload) => handleSessaoGet(payload));
  ipcMain.handle(IPC_CHANNELS.SESSAO_LIST_BY_ATENDIDO, (_event, payload) => handleSessaoListByAtendido(payload));
}
