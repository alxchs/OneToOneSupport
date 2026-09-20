import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPCResult,
  GravarEventoPayload,
  ObterEstadoAbaPayload,
} from '../../src/shared/ipc-contract';
import {
  EventoService,
  isValidId,
  TIPOS_EVENTO_CONHECIDOS,
} from '../services/evento.service';
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

  if (typeof p.sessao_id !== 'string' || !isValidId(p.sessao_id)) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessao_id é obrigatório e deve ser um identificador válido.',
    };
  }

  if (p.aba_id !== undefined && p.aba_id !== null && (typeof p.aba_id !== 'string' || !isValidId(p.aba_id))) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'aba_id inválido.',
    };
  }

  if (typeof p.tipo !== 'string' || !TIPOS_EVENTO_CONHECIDOS.has(p.tipo)) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'tipo é obrigatório e deve ser um tipo de evento reconhecido.',
    };
  }

  // Lista de permissão rigorosa de autor: exatamente 'host' ou 'guest'
  if (p.autor !== 'host' && p.autor !== 'guest') {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'autor é obrigatório e deve ser exatamente "host" ou "guest".',
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
      sessao_id: p.sessao_id,
      aba_id: p.aba_id ? p.aba_id : null,
      tipo: p.tipo,
      payload: payloadStr,
      autor: p.autor,
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

  if (typeof sessao_id !== 'string' || !isValidId(sessao_id)) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessao_id é obrigatório e deve ser um identificador válido.',
    };
  }

  if (aba_id !== undefined && aba_id !== null && (typeof aba_id !== 'string' || !isValidId(aba_id))) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'aba_id inválido.',
    };
  }

  try {
    const state = service.reconstruirEstadoAba(sessao_id, aba_id ? aba_id : 'default');
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
