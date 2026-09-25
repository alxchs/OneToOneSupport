/**
 * Contrato IPC compartilhado entre Main Process (Electron) e Renderer (Host).
 * Define nomes de canais, payloads, DTOs e códigos de erro padronizados.
 */

export const DEFAULT_DICTIONARY: Record<string, string> = {
  'rotulo.host': 'Profissional',
  'rotulo.guest': 'Atendido',
  'rotulo.sessao': 'Sessão',
};

export const IPC_CHANNELS = {
  // Atendidos
  ATENDIDO_LIST: 'atendido:list',
  ATENDIDO_GET: 'atendido:get',
  ATENDIDO_CREATE: 'atendido:create',
  ATENDIDO_UPDATE: 'atendido:update',
  ATENDIDO_SOFT_DELETE: 'atendido:soft-delete',
  ATENDIDO_REACTIVATE: 'atendido:reactivate',
  ATENDIDO_PURGE: 'atendido:purge',

  // Sessões
  SESSAO_CREATE: 'sessao:create',
  SESSAO_ENCERRAR: 'sessao:encerrar',
  SESSAO_GET: 'sessao:get',
  SESSAO_LIST_BY_ATENDIDO: 'sessao:list-by-atendido',

  // Configuração e Dicionário
  CONFIG_GET_DICTIONARY: 'config:get-dictionary',
  CONFIG_SET_LABEL: 'config:set-label',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Desktop Metrics
  DESKTOP_GET_SCALE_FACTOR: 'desktop:get-scale-factor',
  DESKTOP_GET_DISPLAY_METRICS: 'desktop:get-display-metrics',
  DESKTOP_GET_APP_VERSION: 'desktop:get-app-version',
  DESKTOP_GET_VERSION_INFO: 'desktop:get-version-info',

  // Servidor e Sessão Remota (Fase 04 e 07)
  SERVER_START_SESSION: 'server:start-session',
  SERVER_STOP_SESSION: 'server:stop-session',
  SERVER_GET_STATUS: 'server:get-status',
  SERVER_LIST_IPS: 'server:list-ips',
  SERVER_SET_IP: 'server:set-ip',
  SERVER_STATUS_CHANGED: 'server:status-changed',
  SERVER_LOCK_SCREEN: 'server:lock-screen',
  SERVER_UNLOCK_MEDIA: 'server:unlock-media',
  SERVER_SWITCH_TAB: 'server:switch-tab',
  SERVER_GUEST_EVENT_RECEIVED: 'server:guest-event-received',

  // Eventos de Quadro Branco e Event Sourcing (Fases 05 e 06)
  EVENTO_GRAVAR: 'evento:gravar',
  EVENTO_OBTER_ESTADO: 'evento:obter-estado',

  // Diagnóstico Forward (D1)
  DIAG_FORWARD: 'diag:forward',
} as const;

export type IPCChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export type IPCErrorCode = 'DUPLICATE' | 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL_ERROR';

export type IPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: IPCErrorCode; message: string; details?: unknown; existingId?: string };

export interface AtendidoDTO {
  id: string;
  nome: string;
  contato: string | null;
  email: string | null;
  notas: string | null;
  ativo: number;
  deletado_em: number | null;
  criado_em: number;
  atualizado_em: number;
}

export interface SessaoDTO {
  id: string;
  atendido_id: string;
  titulo: string | null;
  status: 'ativa' | 'encerrada';
  iniciado_em: number;
  encerrado_em: number | null;
  notas_host: string | null;
}

export interface CreateAtendidoPayload {
  nome: string;
  contato?: string | null;
  email?: string | null;
  notas?: string | null;
}

export interface UpdateAtendidoPayload {
  id: string;
  dados: {
    nome?: string;
    contato?: string | null;
    email?: string | null;
    notas?: string | null;
  };
}

export interface ListAtendidosPayload {
  busca?: string;
  apenasAtivos?: boolean;
}

export interface CreateSessaoPayload {
  atendido_id: string;
  titulo?: string | null;
  notas_host?: string | null;
}

export interface EncerrarSessaoPayload {
  id: string;
  notas_host?: string | null;
}

export interface SetLabelPayload {
  chave: string;
  valor: string;
}

export interface SetConfigPayload {
  chave: string;
  valor: string;
}

export type ServerConnectionStatus =
  | 'idle'
  | 'aguardando_guest'
  | 'conectado'
  | 'reconectando'
  | 'encerrada';

export interface ServerLanInterfaceDTO {
  name: string;
  ip: string;
  isDefault: boolean;
}

export interface ServerSessionInfoDTO {
  sessaoId: string;
  atendidoId: string;
  status: ServerConnectionStatus;
  port: number;
  selectedIp: string;
  availableIps: ServerLanInterfaceDTO[];
  inviteUrl: string;
  qrDataUrl: string;
  guestConnected: boolean;
  screenLocked: boolean;
  mediaUnlocked: boolean;
}

export interface StartServerSessionPayload {
  sessaoId: string;
  atendidoId: string;
  preferredIp?: string;
}

export interface SetServerIpPayload {
  ip: string;
}

export interface DisplayMetrics {
  width: number;
  height: number;
  scaleFactor: number;
}

export interface GravarEventoPayload {
  sessao_id: string;
  aba_id?: string | null;
  tipo: string;
  payload: string | Record<string, unknown>;
  autor: string;
}

export interface ObterEstadoAbaPayload {
  sessao_id: string;
  aba_id?: string;
}

export interface VersionInfoDTO {
  hostStamp: string;
  guestStamp?: string;
  guestOutdated: boolean;
}

export interface DesktopAPI {
  getScaleFactor: () => Promise<number>;
  getDisplayMetrics: () => Promise<DisplayMetrics>;
  getAppVersion: () => Promise<string>;
  getVersionInfo: () => Promise<VersionInfoDTO>;

  atendidos: {
    list: (filter?: ListAtendidosPayload) => Promise<IPCResult<AtendidoDTO[]>>;
    get: (id: string) => Promise<IPCResult<AtendidoDTO>>;
    create: (data: CreateAtendidoPayload) => Promise<IPCResult<AtendidoDTO>>;
    update: (id: string, dados: UpdateAtendidoPayload['dados']) => Promise<IPCResult<AtendidoDTO>>;
    softDelete: (id: string) => Promise<IPCResult<{ id: string }>>;
    reactivate: (id: string) => Promise<IPCResult<{ id: string }>>;
    purge: (id: string) => Promise<IPCResult<{ id: string }>>;
  };

  sessoes: {
    create: (data: CreateSessaoPayload) => Promise<IPCResult<SessaoDTO>>;
    encerrar: (id: string, notas_host?: string | null) => Promise<IPCResult<SessaoDTO>>;
    get: (id: string) => Promise<IPCResult<SessaoDTO>>;
    listByAtendido: (atendido_id: string) => Promise<IPCResult<SessaoDTO[]>>;
  };

  config: {
    getDictionary: () => Promise<IPCResult<Record<string, string>>>;
    setLabel: (chave: string, valor: string) => Promise<IPCResult<{ chave: string; valor: string }>>;
    get: (chave: string) => Promise<IPCResult<string | null>>;
    set: (chave: string, valor: string) => Promise<IPCResult<{ chave: string; valor: string }>>;
  };

  serverSession: {
    start: (payload: StartServerSessionPayload) => Promise<IPCResult<ServerSessionInfoDTO>>;
    stop: () => Promise<IPCResult<{ stopped: boolean }>>;
    getStatus: () => Promise<IPCResult<ServerSessionInfoDTO | null>>;
    listIps: () => Promise<IPCResult<ServerLanInterfaceDTO[]>>;
    setIp: (payload: SetServerIpPayload) => Promise<IPCResult<ServerSessionInfoDTO>>;
    lockScreen: (locked: boolean) => Promise<IPCResult<ServerSessionInfoDTO>>;
    unlockMedia: (unlocked: boolean) => Promise<IPCResult<ServerSessionInfoDTO>>;
    switchTab: (abaId: string) => Promise<IPCResult<{ switched: boolean }>>;
    onStatusChange: (callback: (status: ServerSessionInfoDTO | null) => void) => () => void;
    onGuestEvent: (callback: (event: any) => void) => () => void;
  };

  eventos: {
    gravar: (payload: GravarEventoPayload) => Promise<IPCResult<any>>;
    obterEstadoAba: (sessao_id: string, aba_id?: string) => Promise<IPCResult<any>>;
  };

  diagForward?: (checkpoint: string, data?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}


