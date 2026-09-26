/**
 * Protocolo WebSocket v1 e Envelope Padronizado (E2EE e Event Sourcing)
 * Fonte de verdade: DOCUMENTO_MESTRE.md §6 e §16, ADR-002, Fase 03.
 */

// Limite de segurança para mensagens em trânsito no WebSocket (1 MB)
export const MAX_MESSAGE_SIZE_BYTES = 1024 * 1024;

// Regex para validação de UUID v4 (ou variantes RFC 4122)
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lista canônica de tipos de mensagem permitidos
export const PROTOCOL_MESSAGE_TYPES = [
  'AUTH',
  'HANDSHAKE_INIT',
  'ENCRYPTED',
  'DRAW_ADD',
  'DRAW_HIDE',
  'CLEAR_TAB',
  'LOCK_SCREEN',
  'UNLOCK_MEDIA',
  'TAB_SWITCH',
  'GUEST_MUTED',
  'PLAY',
  'PAUSE',
  'SEEK',
  'MEDIA_CONTROL',
  'PDF_PAGE',
  'CLOCK_SYNC',
  'RECONNECT',
  'ERROR',
] as const;

export type ProtocolMessageType = typeof PROTOCOL_MESSAGE_TYPES[number];

/**
 * Payloads tipados para cada tipo de mensagem
 */

// AUTH (Guest -> Host em texto claro)
export interface AuthPayload {
  token: string;
}

// HANDSHAKE_INIT (Guest -> Host em texto claro com chave pública efêmera X25519)
export interface HandshakeInitPayload {
  clientPublicKey: string; // Base64 ou Base64url de 32 bytes
}

// ENCRYPTED (Ambos com ChaCha20-Poly1305 IETF)
export interface EncryptedPayload {
  nonce: string; // Base64 ou Base64url de 12 bytes
  ciphertext: string; // Base64 ou Base64url do texto cifrado + tag MAC (16 bytes)
}

// DRAW_ADD (Cifrado - adiciona objeto/traço ao canvas)
export interface DrawAddPayload {
  tabId: string;
  elementId: string;
  data: Record<string, unknown>;
}

// DRAW_HIDE (Cifrado - oculta elemento / borracha lógica)
export interface DrawHidePayload {
  tabId: string;
  elementId: string;
}

// CLEAR_TAB (Cifrado - limpa tela/aba)
export interface ClearTabPayload {
  tabId: string;
}

// LOCK_SCREEN (Cifrado - Host bloqueia UI do Guest)
export interface LockScreenPayload {
  locked: boolean;
  reason?: string;
}

// UNLOCK_MEDIA (Cifrado - Host libera botões de mídia)
export interface UnlockMediaPayload {
  enabled: boolean;
  mediaTypes?: ('video' | 'audio' | 'image' | 'pdf')[];
}

// TAB_SWITCH (Cifrado - Host altera aba ativa em sincronia)
export interface TabSwitchPayload {
  tabId: string;
}

// GUEST_MUTED (Cifrado - Notificação de status de mute do áudio)
export interface GuestMutedPayload {
  muted: boolean;
}

// PLAY (Cifrado - Reprodução sincronizada de mídia)
export interface PlayPayload {
  tabId: string;
  currentTime: number;
  serverTs?: number;
  playing?: boolean;
}

// PAUSE (Cifrado - Pausa sincronizada de mídia)
export interface PausePayload {
  tabId: string;
  currentTime: number;
  serverTs?: number;
  playing?: boolean;
}

// SEEK (Cifrado - Deslocamento temporal sincronizado de mídia)
export interface SeekPayload {
  tabId: string;
  currentTime: number;
  serverTs?: number;
  playing?: boolean;
}

// MEDIA_CONTROL (Cifrado - Controle agregado PLAY/PAUSE/SEEK)
export interface MediaControlPayload {
  action: 'PLAY' | 'PAUSE' | 'SEEK';
  tabId: string;
  currentTime: number;
  serverTs?: number;
  playing?: boolean;
}

// PDF_PAGE (Cifrado - Navegação de página em PDF pelo Host)
export interface PdfPagePayload {
  tabId: string;
  pagina: number;
}

// CLOCK_SYNC (Transporte cifrado - Estimativa de deslocamento do relógio)
export interface ClockSyncPayload {
  t0: number;
  t1?: number;
}

// RECONNECT (Guest solicita reconexão com sessão prévia)
export interface ReconnectPayload {
  token: string;
  lastSeenSeq?: number;
}

// ERROR (Notificação de erro no protocolo)
export interface ErrorPayload {
  code: string;
  message: string;
  fatal?: boolean;
}

/**
 * Mapa de tipos de mensagem para seus respectivos payloads
 */
export interface ProtocolPayloadMap {
  AUTH: AuthPayload;
  HANDSHAKE_INIT: HandshakeInitPayload;
  ENCRYPTED: EncryptedPayload;
  DRAW_ADD: DrawAddPayload;
  DRAW_HIDE: DrawHidePayload;
  CLEAR_TAB: ClearTabPayload;
  LOCK_SCREEN: LockScreenPayload;
  UNLOCK_MEDIA: UnlockMediaPayload;
  TAB_SWITCH: TabSwitchPayload;
  GUEST_MUTED: GuestMutedPayload;
  PLAY: PlayPayload;
  PAUSE: PausePayload;
  SEEK: SeekPayload;
  MEDIA_CONTROL: MediaControlPayload;
  PDF_PAGE: PdfPagePayload;
  CLOCK_SYNC: ClockSyncPayload;
  RECONNECT: ReconnectPayload;
  ERROR: ErrorPayload;
}

/**
 * Envelope V1 base
 */
export interface ProtocolEnvelope<T extends ProtocolMessageType = ProtocolMessageType> {
  v: 1;
  id: string; // UUID v4
  ts: number; // Timestamp Unix ms
  type: T;
  payload: ProtocolPayloadMap[T];
}

/**
 * União discriminada completa de todas as mensagens do protocolo
 */
export type ProtocolMessage =
  | ProtocolEnvelope<'AUTH'>
  | ProtocolEnvelope<'HANDSHAKE_INIT'>
  | ProtocolEnvelope<'ENCRYPTED'>
  | ProtocolEnvelope<'DRAW_ADD'>
  | ProtocolEnvelope<'DRAW_HIDE'>
  | ProtocolEnvelope<'CLEAR_TAB'>
  | ProtocolEnvelope<'LOCK_SCREEN'>
  | ProtocolEnvelope<'UNLOCK_MEDIA'>
  | ProtocolEnvelope<'TAB_SWITCH'>
  | ProtocolEnvelope<'GUEST_MUTED'>
  | ProtocolEnvelope<'PLAY'>
  | ProtocolEnvelope<'PAUSE'>
  | ProtocolEnvelope<'SEEK'>
  | ProtocolEnvelope<'MEDIA_CONTROL'>
  | ProtocolEnvelope<'PDF_PAGE'>
  | ProtocolEnvelope<'CLOCK_SYNC'>
  | ProtocolEnvelope<'RECONNECT'>
  | ProtocolEnvelope<'ERROR'>;

/**
 * Resultado da validação em runtime
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: string };

/**
 * Fábrica utilitária para envelopes v1 com geração de ID e timestamp
 */
export function createProtocolEnvelope<T extends ProtocolMessageType>(
  type: T,
  payload: ProtocolPayloadMap[T],
  id?: string,
  ts?: number
): ProtocolEnvelope<T> {
  return {
    v: 1,
    id: id || generateUUID(),
    ts: ts ?? Date.now(),
    type,
    payload,
  };
}

/**
 * Gera um UUID v4 compatível com Node e Browser sem dependências externas
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // RFC 4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Verificação de campos perigosos que poderiam causar prototype pollution
 */
function hasDangerousPrototypeFields(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;

  const forbidden = ['__proto__', 'constructor', 'prototype'];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return true;
    }
  }

  // Verifica recursivamente objetos filhos
  for (const val of Object.values(obj)) {
    if (typeof val === 'object' && val !== null) {
      if (hasDangerousPrototypeFields(val)) return true;
    }
  }
  return false;
}

/**
 * Validação rigorosa em runtime de cada mensagem do protocolo
 */
export function validateProtocolEnvelope(input: unknown): ValidationResult<ProtocolMessage> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      code: 'INVALID_FORMAT',
      error: 'Mensagem deve ser um objeto JSON válido',
    };
  }

  if (hasDangerousPrototypeFields(input)) {
    return {
      ok: false,
      code: 'SECURITY_VIOLATION',
      error: 'Mensagem contém campos proibidos que violam segurança de protótipo',
    };
  }

  const record = input as Record<string, unknown>;

  // Checagem de versão
  if (record.v !== 1) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      error: `Versão do protocolo inválida: esperada 1, recebida ${String(record.v)}`,
    };
  }

  // Checagem de ID (UUID)
  if (typeof record.id !== 'string' || !UUID_REGEX.test(record.id)) {
    return {
      ok: false,
      code: 'INVALID_ID',
      error: 'ID da mensagem deve ser um UUID v4 válido',
    };
  }

  // Checagem de timestamp
  if (
    typeof record.ts !== 'number' ||
    !Number.isFinite(record.ts) ||
    record.ts <= 0
  ) {
    return {
      ok: false,
      code: 'INVALID_TIMESTAMP',
      error: 'Timestamp da mensagem deve ser um número inteiro positivo em milissegundos',
    };
  }

  // Checagem de tipo
  const type = record.type;
  if (typeof type !== 'string' || !PROTOCOL_MESSAGE_TYPES.includes(type as ProtocolMessageType)) {
    return {
      ok: false,
      code: 'UNKNOWN_TYPE',
      error: `Tipo de mensagem desconhecido: ${String(type)}`,
    };
  }

  // Checagem de existência do payload
  const payload = record.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      error: `Payload da mensagem ${type} deve ser um objeto não nulo`,
    };
  }

  // Validação específica por tipo
  const payloadValidation = validatePayload(type as ProtocolMessageType, payload as Record<string, unknown>);
  if (!payloadValidation.ok) {
    return payloadValidation;
  }

  return {
    ok: true,
    value: record as unknown as ProtocolMessage,
  };
}

function validatePayload(
  type: ProtocolMessageType,
  payload: Record<string, unknown>
): ValidationResult<true> {
  switch (type) {
    case 'AUTH': {
      if (typeof payload.token !== 'string' || payload.token.trim().length === 0 || payload.token.length > 512) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'AUTH payload requer token em string (1-512 caracteres)' };
      }
      return { ok: true, value: true };
    }

    case 'HANDSHAKE_INIT': {
      if (typeof payload.clientPublicKey !== 'string' || payload.clientPublicKey.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'HANDSHAKE_INIT requer clientPublicKey em string base64/base64url' };
      }
      return { ok: true, value: true };
    }

    case 'ENCRYPTED': {
      if (typeof payload.nonce !== 'string' || typeof payload.ciphertext !== 'string') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'ENCRYPTED payload requer nonce e ciphertext em string' };
      }
      if (payload.nonce.length === 0 || payload.ciphertext.length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'ENCRYPTED payload requer nonce e ciphertext não vazios' };
      }
      return { ok: true, value: true };
    }

    case 'DRAW_ADD': {
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'DRAW_ADD requer tabId não vazio' };
      }
      if (typeof payload.elementId !== 'string' || payload.elementId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'DRAW_ADD requer elementId não vazio' };
      }
      if (typeof payload.data !== 'object' || payload.data === null || Array.isArray(payload.data)) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'DRAW_ADD requer data como objeto' };
      }
      return { ok: true, value: true };
    }

    case 'DRAW_HIDE': {
      if (typeof payload.tabId !== 'string' || typeof payload.elementId !== 'string') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'DRAW_HIDE requer tabId e elementId em string' };
      }
      return { ok: true, value: true };
    }

    case 'CLEAR_TAB': {
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'CLEAR_TAB requer tabId não vazio' };
      }
      return { ok: true, value: true };
    }

    case 'LOCK_SCREEN': {
      if (typeof payload.locked !== 'boolean') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'LOCK_SCREEN requer locked em boolean' };
      }
      if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'LOCK_SCREEN reason deve ser string se fornecido' };
      }
      return { ok: true, value: true };
    }

    case 'UNLOCK_MEDIA': {
      if (typeof payload.enabled !== 'boolean') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'UNLOCK_MEDIA requer enabled em boolean' };
      }
      if (payload.mediaTypes !== undefined && !Array.isArray(payload.mediaTypes)) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'UNLOCK_MEDIA mediaTypes deve ser array se fornecido' };
      }
      return { ok: true, value: true };
    }

    case 'TAB_SWITCH': {
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'TAB_SWITCH requer tabId não vazio' };
      }
      return { ok: true, value: true };
    }

    case 'GUEST_MUTED': {
      if (typeof payload.muted !== 'boolean') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'GUEST_MUTED requer muted em boolean' };
      }
      return { ok: true, value: true };
    }

    case 'PLAY':
    case 'PAUSE':
    case 'SEEK': {
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: `${type} requer tabId não vazio` };
      }
      if (typeof payload.currentTime !== 'number' || !Number.isFinite(payload.currentTime) || payload.currentTime < 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: `${type} requer currentTime como número >= 0` };
      }
      return { ok: true, value: true };
    }

    case 'MEDIA_CONTROL': {
      const validActions = ['PLAY', 'PAUSE', 'SEEK'];
      if (typeof payload.action !== 'string' || !validActions.includes(payload.action)) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'MEDIA_CONTROL requer action PLAY, PAUSE ou SEEK' };
      }
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'MEDIA_CONTROL requer tabId não vazio' };
      }
      if (typeof payload.currentTime !== 'number' || !Number.isFinite(payload.currentTime) || payload.currentTime < 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'MEDIA_CONTROL requer currentTime como número >= 0' };
      }
      return { ok: true, value: true };
    }

    case 'RECONNECT': {
      if (typeof payload.token !== 'string' || payload.token.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'RECONNECT requer token não vazio' };
      }
      if (payload.lastSeenSeq !== undefined && (typeof payload.lastSeenSeq !== 'number' || !Number.isInteger(payload.lastSeenSeq) || payload.lastSeenSeq < 0)) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'RECONNECT lastSeenSeq deve ser inteiro >= 0' };
      }
      return { ok: true, value: true };
    }

    case 'PDF_PAGE': {
      if (typeof payload.tabId !== 'string' || payload.tabId.trim().length === 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'PDF_PAGE requer tabId não vazio' };
      }
      if (typeof payload.pagina !== 'number' || !Number.isInteger(payload.pagina) || payload.pagina < 1) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'PDF_PAGE requer pagina como inteiro >= 1' };
      }
      return { ok: true, value: true };
    }

    case 'CLOCK_SYNC': {
      if (typeof payload.t0 !== 'number' || !Number.isFinite(payload.t0) || payload.t0 <= 0) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'CLOCK_SYNC requer t0 como número positivo' };
      }
      if (payload.t1 !== undefined && (typeof payload.t1 !== 'number' || !Number.isFinite(payload.t1) || payload.t1 <= 0)) {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'CLOCK_SYNC t1 deve ser número positivo se fornecido' };
      }
      return { ok: true, value: true };
    }

    case 'ERROR': {
      if (typeof payload.code !== 'string' || typeof payload.message !== 'string') {
        return { ok: false, code: 'INVALID_PAYLOAD', error: 'ERROR requer code e message em string' };
      }
      return { ok: true, value: true };
    }

    default:
      return { ok: false, code: 'UNKNOWN_TYPE', error: `Tipo não suportado na validação: ${type}` };
  }
}

/**
 * Converte string JSON bruta para ProtocolMessage com validação de tamanho e schema
 */
export function parseProtocolMessage(raw: string | unknown): ValidationResult<ProtocolMessage> {
  if (typeof raw === 'string') {
    // Checagem de tamanho antes de tentar JSON.parse para evitar exaustão de memória
    if (raw.length > MAX_MESSAGE_SIZE_BYTES) {
      return {
        ok: false,
        code: 'MESSAGE_TOO_LARGE',
        error: `Mensagem excede o limite máximo permitido de ${MAX_MESSAGE_SIZE_BYTES} bytes`,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      return validateProtocolEnvelope(parsed);
    } catch (err) {
      return {
        ok: false,
        code: 'JSON_PARSE_ERROR',
        error: `Falha ao interpretar JSON: ${err instanceof Error ? err.message : 'formato inválido'}`,
      };
    }
  }

  return validateProtocolEnvelope(raw);
}

/**
 * Type guards para TypeScript
 */
export function isProtocolEnvelope(val: unknown): val is ProtocolMessage {
  return validateProtocolEnvelope(val).ok;
}

export function isEncryptedEnvelope(msg: ProtocolMessage): msg is ProtocolEnvelope<'ENCRYPTED'> {
  return msg.type === 'ENCRYPTED';
}

export function isAuthEnvelope(msg: ProtocolMessage): msg is ProtocolEnvelope<'AUTH'> {
  return msg.type === 'AUTH';
}

export function isHandshakeInitEnvelope(msg: ProtocolMessage): msg is ProtocolEnvelope<'HANDSHAKE_INIT'> {
  return msg.type === 'HANDSHAKE_INIT';
}

/**
 * Aliases convenientes para envelopes do protocolo
 */
export const createEnvelope = createProtocolEnvelope;

export function validateEnvelope(input: unknown): ProtocolMessage {
  const result = parseProtocolMessage(input);
  if (!result.ok) {
    throw new Error(`[ProtocolValidationError] ${result.code}: ${result.error}`);
  }
  return result.value;
}

