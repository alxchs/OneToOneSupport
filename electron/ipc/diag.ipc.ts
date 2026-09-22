import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/shared/ipc-contract';
import { isDiagEnabled, sanitizeDiagData } from '../../src/shared/diag';

/**
 * Registra o handler do canal IPC diag:forward (D1).
 * Recebe checkpoints de diagnóstico do Host (renderer) e imprime no stdout com prefixo [DIAG-HOST].
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
  });
}
