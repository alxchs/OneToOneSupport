import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, IPCResult } from '../../src/shared/ipc-contract';

/**
 * D7.1: Handler para forçar repaint da janela do Host via webContents.invalidate().
 * Correção experimental: não comprovável por automação.
 */
export async function handleCanvasForceRepaint(
  event?: Electron.IpcMainInvokeEvent
): Promise<IPCResult<{ repainted: boolean }>> {
  try {
    if (event?.sender) {
      if (!event.sender.isDestroyed()) {
        event.sender.invalidate();
        return { success: true, data: { repainted: true } };
      }
      return { success: true, data: { repainted: false } };
    }

    let repainted = false;
    if (typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.invalidate();
          repainted = true;
        }
      }
    }
    return { success: true, data: { repainted } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message };
  }
}

export function registerCanvasIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CANVAS_FORCE_REPAINT, (event) =>
    handleCanvasForceRepaint(event)
  );
}
