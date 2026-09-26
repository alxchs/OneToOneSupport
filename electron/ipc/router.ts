import { registerAtendidoIpc } from './atendido.ipc';
import { registerSessaoIpc } from './sessao.ipc';
import { registerConfigIpc } from './config.ipc';
import { registerServerIpc } from './server.ipc';
import { registerEventoIpc } from './evento.ipc';
import { registerAbaIpc } from './aba.ipc';
import { registerAssetIpc } from './asset.ipc';
import { registerDiagIpc } from './diag.ipc';

/**
 * Registra todos os canais e rotas de IPC do Main Process.
 */
export function registerIpcHandlers(): void {
  registerAtendidoIpc();
  registerSessaoIpc();
  registerConfigIpc();
  registerServerIpc();
  registerEventoIpc();
  registerAbaIpc();
  registerAssetIpc();
  registerDiagIpc();
}


