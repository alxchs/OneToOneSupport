import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateAtendidoPayload,
  UpdateAtendidoPayload,
  ListAtendidosPayload,
  CreateSessaoPayload,
  DisplayMetrics,
  DesktopAPI,
} from '../src/shared/ipc-contract';

// Canais constantes inlined para evitar require() relativo no sandbox estrito do Electron
const IPC_CHANNELS = {
  ATENDIDO_LIST: 'atendido:list',
  ATENDIDO_GET: 'atendido:get',
  ATENDIDO_CREATE: 'atendido:create',
  ATENDIDO_UPDATE: 'atendido:update',
  ATENDIDO_SOFT_DELETE: 'atendido:soft-delete',
  ATENDIDO_REACTIVATE: 'atendido:reactivate',
  ATENDIDO_PURGE: 'atendido:purge',

  SESSAO_CREATE: 'sessao:create',
  SESSAO_ENCERRAR: 'sessao:encerrar',
  SESSAO_GET: 'sessao:get',
  SESSAO_LIST_BY_ATENDIDO: 'sessao:list-by-atendido',

  CONFIG_GET_DICTIONARY: 'config:get-dictionary',
  CONFIG_SET_LABEL: 'config:set-label',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  DESKTOP_GET_SCALE_FACTOR: 'desktop:get-scale-factor',
  DESKTOP_GET_DISPLAY_METRICS: 'desktop:get-display-metrics',
  DESKTOP_GET_APP_VERSION: 'desktop:get-app-version',
} as const;

export type { DisplayMetrics, DesktopAPI };

const desktopAPI: DesktopAPI = {
  getScaleFactor: () => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_GET_SCALE_FACTOR),
  getDisplayMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_GET_DISPLAY_METRICS),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_GET_APP_VERSION),

  atendidos: {
    list: (filter?: ListAtendidosPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_LIST, filter),
    get: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_GET, { id }),
    create: (data: CreateAtendidoPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_CREATE, data),
    update: (id: string, dados: UpdateAtendidoPayload['dados']) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_UPDATE, { id, dados }),
    softDelete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_SOFT_DELETE, { id }),
    reactivate: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_REACTIVATE, { id }),
    purge: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ATENDIDO_PURGE, { id }),
  },

  sessoes: {
    create: (data: CreateSessaoPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSAO_CREATE, data),
    encerrar: (id: string, notas_host?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSAO_ENCERRAR, { id, notas_host }),
    get: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSAO_GET, { id }),
    listByAtendido: (atendido_id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSAO_LIST_BY_ATENDIDO, { atendido_id }),
  },

  config: {
    getDictionary: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_DICTIONARY),
    setLabel: (chave: string, valor: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_LABEL, { chave, valor }),
    get: (chave: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, { chave }),
    set: (chave: string, valor: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, { chave, valor }),
  },
};

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI);
