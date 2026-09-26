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
  SERVER_BROADCAST: 'server:broadcast',
  SERVER_GUEST_EVENT_RECEIVED: 'server:guest-event-received',

  // Eventos de Quadro Branco e Event Sourcing (Fases 05 e 06)
  EVENTO_GRAVAR: 'evento:gravar',
  EVENTO_OBTER_ESTADO: 'evento:obter-estado',

  // Abas (Fase 08 - M1)
  ABA_CREATE: 'aba:create',
  ABA_GET: 'aba:get',
  ABA_LIST: 'aba:list',
  ABA_RENAME: 'aba:rename',
  ABA_REORDER: 'aba:reorder',
  ABA_DELETE: 'aba:delete',

  // Assets (Fase 08 - M2)
  ASSET_IMPORT: 'asset:import',
  ASSET_GET: 'asset:get',
  ASSET_LIST_BY_SESSAO: 'asset:list-by-sessao',

  // Relatório PDF (Fase 09 - R5)
  RELATORIO_GERAR: 'relatorio:gerar',
  RELATORIO_LISTAR_REVISOES: 'relatorio:listar-revisoes',
  RELATORIO_ABRIR: 'relatorio:abrir',

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
  mediaToken?: string;
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

export type AbaTipo = 'blank' | 'image' | 'pdf' | 'video' | 'audio';

export interface AbaDTO {
  id: string;
  sessao_id: string;
  tipo: AbaTipo;
  ordem: number;
  asset_id: string | null;
  titulo: string | null;
  criado_em: number;
}

export interface AssetDTO {
  id: string;
  sessao_id: string | null;
  tipo: string;
  mime: string;
  tamanho: number;
  hash_sha256: string;
  path: string;
  criado_em: number;
}

export interface CreateAbaPayload {
  sessao_id: string;
  tipo: AbaTipo;
  ordem?: number;
  asset_id?: string | null;
  titulo?: string | null;
}

export interface RenameAbaPayload {
  id: string;
  novoTitulo: string | null;
}

export interface ReorderAbasPayload {
  sessaoId: string;
  abaIdsEmOrdem: string[];
}

export interface ImportAssetPayload {
  sessaoId: string;
  sourcePath?: string;
  sourceBase64?: string;
  originalName?: string;
}

export interface GuestEventDTO {
  type: string;
  payload?: unknown;
  sessaoId?: string;
  abaId?: string;
  autor?: string;
  ts?: number;
  [key: string]: unknown;
}

export interface GerarRelatorioPayload {
  sessaoId: string;
  numeroVersao?: number;
}

export interface RelatorioGeradoDTO {
  path: string;
}

export interface RevisaoDTO {
  id: string;
  sessao_id: string;
  numero_versao: number;
  snapshot_evento_idx: number;
  titulo: string | null;
  criado_em: number;
  autor: string;
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

  abas: {
    create: (data: CreateAbaPayload) => Promise<IPCResult<AbaDTO>>;
    get: (id: string) => Promise<IPCResult<AbaDTO>>;
    listBySessao: (sessaoId: string) => Promise<IPCResult<AbaDTO[]>>;
    rename: (payload: RenameAbaPayload) => Promise<IPCResult<AbaDTO>>;
    reorder: (payload: ReorderAbasPayload) => Promise<IPCResult<AbaDTO[]>>;
    delete: (id: string) => Promise<IPCResult<{ id: string }>>;
  };

  assets: {
    import: (payload: ImportAssetPayload) => Promise<IPCResult<AssetDTO>>;
    get: (id: string) => Promise<IPCResult<AssetDTO>>;
    listBySessao: (sessaoId: string) => Promise<IPCResult<AssetDTO[]>>;
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
    broadcastToGuest: (event: Record<string, unknown>) => Promise<IPCResult<{ sent: boolean }>>;
    onStatusChange: (callback: (status: ServerSessionInfoDTO | null) => void) => () => void;
    onGuestEvent: (callback: (event: GuestEventDTO) => void) => () => void;
  };

  eventos: {
    gravar: (payload: GravarEventoPayload) => Promise<IPCResult<any>>;
    obterEstadoAba: (sessao_id: string, aba_id?: string) => Promise<IPCResult<any>>;
  };

  relatorio: {
    gerar: (sessaoId: string, numeroVersao?: number) => Promise<IPCResult<RelatorioGeradoDTO>>;
    listarRevisoes: (sessaoId: string) => Promise<IPCResult<RevisaoDTO[]>>;
    abrir: (caminho: string) => Promise<IPCResult<boolean>>;
  };

  diagForward?: (checkpoint: string, data?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}


