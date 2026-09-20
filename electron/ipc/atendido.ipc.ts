import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPCResult, AtendidoDTO } from '../../src/shared/ipc-contract';
import { atendidoService } from '../services/atendido.service';

export async function handleAtendidoList(payload?: unknown): Promise<IPCResult<AtendidoDTO[]>> {
  let filter: { busca?: string; apenasAtivos?: boolean } | undefined;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.busca !== undefined && typeof p.busca !== 'string') {
      return { success: false, error: 'VALIDATION', message: 'Filtro busca deve ser uma string.' };
    }
    if (p.apenasAtivos !== undefined && typeof p.apenasAtivos !== 'boolean') {
      return { success: false, error: 'VALIDATION', message: 'Filtro apenasAtivos deve ser um boolean.' };
    }
    filter = {
      busca: p.busca as string | undefined,
      apenasAtivos: p.apenasAtivos as boolean | undefined,
    };
  }
  return atendidoService.list(filter);
}

export async function handleAtendidoGet(payload: unknown): Promise<IPCResult<AtendidoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido: esperado objeto com id.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do atendido deve ser uma string não vazia.' };
  }
  return atendidoService.getById(id.trim());
}

export async function handleAtendidoCreate(payload: unknown): Promise<IPCResult<AtendidoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido: esperado objeto com os dados do atendido.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.nome !== 'string' || !p.nome.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'O campo nome é obrigatório e não pode ser vazio.',
    };
  }

  if (p.contato !== undefined && p.contato !== null && typeof p.contato !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Contato deve ser uma string ou nulo.' };
  }

  if (p.email !== undefined && p.email !== null && typeof p.email !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Email deve ser uma string ou nulo.' };
  }

  if (p.notas !== undefined && p.notas !== null && typeof p.notas !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Notas devem ser uma string ou nulo.' };
  }

  return atendidoService.create({
    nome: p.nome.trim(),
    contato: typeof p.contato === 'string' ? p.contato.trim() : null,
    email: typeof p.email === 'string' ? p.email.trim() : null,
    notas: typeof p.notas === 'string' ? p.notas.trim() : null,
  });
}

export async function handleAtendidoUpdate(payload: unknown): Promise<IPCResult<AtendidoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido: esperado objeto com id e dados.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do atendido é obrigatório.' };
  }

  if (!p.dados || typeof p.dados !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Objeto de dados é obrigatório.' };
  }

  const d = p.dados as Record<string, unknown>;

  if (d.nome !== undefined) {
    if (typeof d.nome !== 'string' || !d.nome.trim()) {
      return { success: false, error: 'VALIDATION', message: 'Nome não pode ser vazio.' };
    }
  }

  if (d.contato !== undefined && d.contato !== null && typeof d.contato !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Contato deve ser uma string ou nulo.' };
  }

  if (d.email !== undefined && d.email !== null && typeof d.email !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Email deve ser uma string ou nulo.' };
  }

  if (d.notas !== undefined && d.notas !== null && typeof d.notas !== 'string') {
    return { success: false, error: 'VALIDATION', message: 'Notas devem ser uma string ou nulo.' };
  }

  return atendidoService.update(p.id.trim(), {
    ...(d.nome !== undefined ? { nome: (d.nome as string).trim() } : {}),
    ...(d.contato !== undefined ? { contato: d.contato ? (d.contato as string).trim() : null } : {}),
    ...(d.email !== undefined ? { email: d.email ? (d.email as string).trim() : null } : {}),
    ...(d.notas !== undefined ? { notas: d.notas ? (d.notas as string).trim() : null } : {}),
  });
}

export async function handleAtendidoSoftDelete(payload: unknown): Promise<IPCResult<{ id: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do atendido é obrigatório.' };
  }
  return atendidoService.softDelete(id.trim());
}

export async function handleAtendidoReactivate(payload: unknown): Promise<IPCResult<{ id: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do atendido é obrigatório.' };
  }
  return atendidoService.reactivate(id.trim());
}

export async function handleAtendidoPurge(payload: unknown): Promise<IPCResult<{ id: string }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do atendido é obrigatório.' };
  }
  return atendidoService.purgar(id.trim());
}

export function registerAtendidoIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_LIST, (_event, payload) => handleAtendidoList(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_GET, (_event, payload) => handleAtendidoGet(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_CREATE, (_event, payload) => handleAtendidoCreate(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_UPDATE, (_event, payload) => handleAtendidoUpdate(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_SOFT_DELETE, (_event, payload) => handleAtendidoSoftDelete(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_REACTIVATE, (_event, payload) => handleAtendidoReactivate(payload));
  ipcMain.handle(IPC_CHANNELS.ATENDIDO_PURGE, (_event, payload) => handleAtendidoPurge(payload));
}
