import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPCResult,
  GravarEventoPayload,
  ObterEstadoAbaPayload,
} from '../../src/shared/ipc-contract';
import { EventoService } from '../services/evento.service';
import { TabState } from '../../src/shared/events/reducer';

import { serverSessionController } from '../server/index';

const defaultEventoService = new EventoService();

export async function handleEventoGravar(
  payload: unknown,
  service: EventoService = defaultEventoService
): Promise<IPCResult<any>> {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'Payload inválido para gravação de evento.',
    };
  }

  const p = payload as Partial<GravarEventoPayload>;

  if (typeof p.sessao_id !== 'string' || !p.sessao_id.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessao_id é obrigatório para gravar evento.',
    };
  }

  if (typeof p.tipo !== 'string' || !p.tipo.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'tipo é obrigatório para gravar evento.',
    };
  }

  if (typeof p.autor !== 'string' || !p.autor.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'autor é obrigatório para gravar evento.',
    };
  }

  if (p.payload === undefined || p.payload === null) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'payload do evento é obrigatório.',
    };
  }

  try {
    const payloadStr = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload);
    const res = service.gravarEvento({
      sessao_id: p.sessao_id.trim(),
      aba_id: p.aba_id ? p.aba_id.trim() : null,
      tipo: p.tipo.trim(),
      payload: payloadStr,
      autor: p.autor.trim(),
    });

    if (!res.sucesso) {
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: res.motivo || 'Erro ao gravar evento.',
      };
    }

    // Se o evento foi gravado com sucesso pelo Host, transmite cifrado para o Guest conectado
    if (p.autor === 'host') {
      try {
        serverSessionController.broadcastToGuest({
          type: p.tipo.trim(),
          payload: typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload,
          abaId: p.aba_id ? p.aba_id.trim() : 'default',
          sessaoId: p.sessao_id.trim(),
          autor: 'host',
          ts: Date.now(),
        });
      } catch {
        // Fallback silencioso se falhar envio cifrado
      }
    }

    return { success: true, data: res.evento };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleEventoObterEstado(
  payload: unknown,
  service: EventoService = defaultEventoService
): Promise<IPCResult<TabState>> {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'Payload inválido.',
    };
  }

  const { sessao_id, aba_id } = payload as Partial<ObterEstadoAbaPayload>;

  if (typeof sessao_id !== 'string' || !sessao_id.trim()) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessao_id é obrigatório.',
    };
  }

  try {
    const state = service.reconstruirEstadoAba(sessao_id.trim(), aba_id ? aba_id.trim() : 'default');
    return { success: true, data: state };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export function registerEventoIpc(service: EventoService = defaultEventoService): void {
  ipcMain.handle(IPC_CHANNELS.EVENTO_GRAVAR, (_event, payload) =>
    handleEventoGravar(payload, service)
  );
  ipcMain.handle(IPC_CHANNELS.EVENTO_OBTER_ESTADO, (_event, payload) =>
    handleEventoObterEstado(payload, service)
  );
}
