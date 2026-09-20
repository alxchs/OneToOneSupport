import { ipcMain, BrowserWindow } from 'electron';
import {
  IPC_CHANNELS,
  IPCResult,
  ServerSessionInfoDTO,
  ServerLanInterfaceDTO,
  StartServerSessionPayload,
  SetServerIpPayload,
} from '../../src/shared/ipc-contract';
import { serverSessionController } from '../server/index';

export async function handleServerStartSession(
  payload: unknown
): Promise<IPCResult<ServerSessionInfoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'Payload inválido para inicialização do servidor.',
    };
  }

  const p = payload as Partial<StartServerSessionPayload>;
  if (typeof p.sessaoId !== 'string' || !p.sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }
  if (typeof p.atendidoId !== 'string' || !p.atendidoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'atendidoId é obrigatório.' };
  }

  try {
    const info = await serverSessionController.startSession(
      p.sessaoId.trim(),
      p.atendidoId.trim(),
      typeof p.preferredIp === 'string' ? p.preferredIp.trim() : undefined
    );
    return { success: true, data: info };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerStopSession(): Promise<IPCResult<{ stopped: boolean }>> {
  try {
    await serverSessionController.stopSession();
    return { success: true, data: { stopped: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerGetStatus(): Promise<IPCResult<ServerSessionInfoDTO | null>> {
  try {
    const status = serverSessionController.getStatus();
    return { success: true, data: status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerListIps(): Promise<IPCResult<ServerLanInterfaceDTO[]>> {
  try {
    const ips = serverSessionController.listIps();
    return { success: true, data: ips };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerSetIp(payload: unknown): Promise<IPCResult<ServerSessionInfoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { ip } = payload as Partial<SetServerIpPayload>;
  if (typeof ip !== 'string' || !ip.trim()) {
    return { success: false, error: 'VALIDATION', message: 'Endereço IP é obrigatório.' };
  }

  try {
    const info = await serverSessionController.setIp(ip.trim());
    return { success: true, data: info };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export function registerServerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SERVER_START_SESSION, (_event, payload) =>
    handleServerStartSession(payload)
  );
  ipcMain.handle(IPC_CHANNELS.SERVER_STOP_SESSION, () => handleServerStopSession());
  ipcMain.handle(IPC_CHANNELS.SERVER_GET_STATUS, () => handleServerGetStatus());
  ipcMain.handle(IPC_CHANNELS.SERVER_LIST_IPS, () => handleServerListIps());
  ipcMain.handle(IPC_CHANNELS.SERVER_SET_IP, (_event, payload) => handleServerSetIp(payload));

  // Notifica o Renderer quando o status da conexão da sessão mudar
  serverSessionController.onStatusChange((info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SERVER_STATUS_CHANGED, info);
      }
    }
  });
}
