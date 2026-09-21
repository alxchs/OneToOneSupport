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

export async function handleServerLockScreen(payload: unknown): Promise<IPCResult<ServerSessionInfoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { locked } = payload as { locked?: unknown };
  if (typeof locked !== 'boolean') {
    return { success: false, error: 'VALIDATION', message: 'locked deve ser um booleano.' };
  }

  try {
    const info = serverSessionController.lockScreen(locked);
    return { success: true, data: info };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerUnlockMedia(payload: unknown): Promise<IPCResult<ServerSessionInfoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { unlocked } = payload as { unlocked?: unknown };
  if (typeof unlocked !== 'boolean') {
    return { success: false, error: 'VALIDATION', message: 'unlocked deve ser um booleano.' };
  }

  try {
    const info = serverSessionController.unlockMedia(unlocked);
    return { success: true, data: info };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export async function handleServerSwitchTab(payload: unknown): Promise<IPCResult<{ switched: boolean }>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { abaId } = payload as { abaId?: unknown };
  if (typeof abaId !== 'string' || !abaId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'abaId é obrigatório.' };
  }

  try {
    const sent = serverSessionController.switchTab(abaId.trim());
    return { success: true, data: { switched: sent } };
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
  ipcMain.handle(IPC_CHANNELS.SERVER_LOCK_SCREEN, (_event, payload) => handleServerLockScreen(payload));
  ipcMain.handle(IPC_CHANNELS.SERVER_UNLOCK_MEDIA, (_event, payload) => handleServerUnlockMedia(payload));
  ipcMain.handle(IPC_CHANNELS.SERVER_SWITCH_TAB, (_event, payload) => handleServerSwitchTab(payload));

  // Notifica o Renderer quando o status da conexão da sessão mudar
  serverSessionController.onStatusChange((info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SERVER_STATUS_CHANGED, info);
      }
    }
  });

  // Notifica o Renderer quando o Guest emitir um evento
  serverSessionController.onGuestEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SERVER_GUEST_EVENT_RECEIVED, event);
      }
    }
  });
}
