import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared/ipc-contract';
import { isDiagEnabled, sanitizeDiagData } from '../../src/shared/diag';

/**
 * Registra o handler do canal IPC diag:forward (D1).
 * Recebe checkpoints de diagnóstico do Host (renderer) e imprime no stdout com prefixo [DIAG-HOST].
 * D10: Sob ONETOONE_DIAG=1, afere e registra o estado de isVisible()/isMinimized() da janela
 * no momento de cada renderState que adiciona elemento.
 */
export function registerDiagIpc(): void {
  ipcMain.on(IPC_CHANNELS.DIAG_FORWARD, (_event, payload) => {
    if (!isDiagEnabled()) return;
    if (!payload || typeof payload !== 'object') return;
    const { checkpoint, data } = payload as {
      checkpoint: string;
      data?: Record<string, unknown>;
    };
    if (!checkpoint || typeof checkpoint !== 'string') return;
    const ts = new Date().toISOString();
    const safeData = data && typeof data === 'object' ? sanitizeDiagData(data) : undefined;
    if (safeData) {
      console.log(`[DIAG-HOST] [${ts}] [${checkpoint}]`, JSON.stringify(safeData));
    } else {
      console.log(`[DIAG-HOST] [${ts}] [${checkpoint}]`);
    }

    // D10: Verifica estado da janela quando renderState adiciona elementos
    if (
      checkpoint === 'renderState' &&
      data &&
      Array.isArray(data.adicionados) &&
      data.adicionados.length > 0
    ) {
      let win: BrowserWindow | null = null;
      if (_event?.sender) {
        win = BrowserWindow.fromWebContents(_event.sender);
      }
      if (!win && typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
        win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
      }
      if (win && !win.isDestroyed()) {
        const isVisible = typeof win.isVisible === 'function' ? win.isVisible() : undefined;
        const isMinimized = typeof win.isMinimized === 'function' ? win.isMinimized() : undefined;
        console.log(
          `[DIAG-HOST] [${ts}] [janela_evento]`,
          JSON.stringify({
            evento: 'renderState',
            isVisible,
            isMinimized,
            adicionadosCount: data.adicionados.length,
          })
        );
      }
    }
  });
}
