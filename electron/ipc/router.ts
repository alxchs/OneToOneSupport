import { registerAtendidoIpc } from './atendido.ipc';
import { registerSessaoIpc } from './sessao.ipc';
import { registerConfigIpc } from './config.ipc';

/**
 * Registra todos os canais e rotas de IPC do Main Process.
 */
export function registerIpcHandlers(): void {
  registerAtendidoIpc();
  registerSessaoIpc();
  registerConfigIpc();
}
