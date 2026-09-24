import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, IPCResult } from '../../src/shared/ipc-contract';
import { isExperimentActive, executeWindowNudge } from '../experiments';

/**
 * D7.1: Handler para forçar repaint da janela do Host via webContents.invalidate().
 * D10: Quando experimento 'nudge' estiver ativo, efetua também o nudge de 1px na largura da janela.
 * Throttle obrigatório (~300ms) implementado em executeWindowNudge.
 * Correção experimental: não comprovável por automação.
 */
export async function handleCanvasForceRepaint(
  event?: Electron.IpcMainInvokeEvent
): Promise<IPCResult<{ repainted: boolean; nudged?: boolean }>> {
  try {
    let repainted = false;
    let nudged = false;

    if (event?.sender) {
      if (!event.sender.isDestroyed()) {
        event.sender.invalidate();
        repainted = true;
      }
    } else if (typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.invalidate();
          repainted = true;
        }
      }
    }

    if (isExperimentActive('nudge')) {
      let targetWin: BrowserWindow | null = null;
      if (event?.sender) {
        targetWin = BrowserWindow.fromWebContents(event.sender);
      }
      if (!targetWin && typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
        targetWin = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
      }
      if (targetWin) {
        const nudgeRes = executeWindowNudge(targetWin);
        nudged = nudgeRes.nudged;
      }
    }

    return { success: true, data: { repainted, nudged } };
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
