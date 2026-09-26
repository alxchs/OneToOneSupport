import { contextBridge, ipcRenderer } from 'electron';

export interface RelatorioPreloadAPI {
  onIniciar: (callback: (payload: any) => Promise<void> | void) => void;
  pronto: () => void;
  erro: (mensagem: string) => void;
}

const api: RelatorioPreloadAPI = {
  onIniciar: (callback) => {
    ipcRenderer.on('relatorio:iniciar', async (_event, payload) => {
      try {
        await callback(payload);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ipcRenderer.send('relatorio:erro', msg);
      }
    });
  },
  pronto: () => {
    ipcRenderer.send('relatorio:pronto');
  },
  erro: (mensagem: string) => {
    ipcRenderer.send('relatorio:erro', mensagem);
  },
};

contextBridge.exposeInMainWorld('__relatorio', api);
