/**
 * Módulo Central de Autoridade e Matriz de Permissões (Host x Guest)
 * Fonte única de verdade para autoridade, permissões e validação de tipos de mensagens.
 * Registrado no ADR-011 (docs/ADR/011-fonte-unica-autoridade.md).
 *
 * Princípios inegociáveis:
 * 1. Allowlist estrita: Guest só emite o que for explicitamente autorizado.
 * 2. Defesa contra poluição de protótipo (__proto__, constructor, etc.).
 * 3. Identidade estrita de autor ('host' | 'guest').
 * 4. Ações exclusivas do Host jamais permitidas ao Guest.
 * 5. Bloqueio de tela (screenLocked === true) veta todas as ações interativas e de mídia do Guest.
 * 6. GUEST_MUTED é preservado sob tela bloqueada por ser controle de privacidade local.
 */

export type Autor = 'host' | 'guest';

// Ações exclusivas do Host (Guest NUNCA pode emitir)
export const ACOES_EXCLUSIVAS_HOST = [
  'CLEAR_TAB',
  'LOCK_SCREEN',
  'UNLOCK_MEDIA',
  'TAB_SWITCH',
  'SCREEN_LOCKED',
] as const;

// Ações interativas no quadro branco que o Guest pode emitir (bloqueadas quando screenLocked === true)
export const ACOES_INTERATIVAS_GUEST = [
  'DRAW_ADD',
  'DRAW_HIDE',
  'UNDO',
  'REDO',
] as const;

// Ações de controle de mídia que o Guest pode emitir (bloqueadas quando screenLocked === true OU mediaUnlocked === false)
export const ACOES_MIDIA_GUEST = [
  'PLAY',
  'PAUSE',
  'SEEK',
  'MEDIA_CONTROL',
] as const;

// Ações de estado local do Guest (permitidas mesmo quando screenLocked === true)
export const ACOES_LOCAIS_GUEST = [
  'GUEST_MUTED',
] as const;

// Allowlist estrita de todas as ações que o Guest tem autorização para emitir
export const ACOES_PERMITIDAS_GUEST = [
  ...ACOES_INTERATIVAS_GUEST,
  ...ACOES_MIDIA_GUEST,
  ...ACOES_LOCAIS_GUEST,
] as const;

// Mensagens de infraestrutura / transporte (trocadas na conexão/handshake, não como comandos da aplicação)
export const ACOES_TRANSPORTE = [
  'AUTH',
  'HANDSHAKE_INIT',
  'ENCRYPTED',
  'RECONNECT',
  'ERROR',
] as const;

// Todos os tipos conhecidos e suportados pelo sistema
export const TODOS_TIPOS_CONHECIDOS = [
  ...ACOES_EXCLUSIVAS_HOST,
  ...ACOES_PERMITIDAS_GUEST,
  ...ACOES_TRANSPORTE,
] as const;

export type TipoConhecido = (typeof TODOS_TIPOS_CONHECIDOS)[number];

// Conjuntos imutáveis para consulta em tempo constante O(1)
const ACOES_EXCLUSIVAS_HOST_SET = new Set<string>(ACOES_EXCLUSIVAS_HOST);
const ACOES_INTERATIVAS_GUEST_SET = new Set<string>(ACOES_INTERATIVAS_GUEST);
const ACOES_MIDIA_GUEST_SET = new Set<string>(ACOES_MIDIA_GUEST);
const ACOES_LOCAIS_GUEST_SET = new Set<string>(ACOES_LOCAIS_GUEST);
const ACOES_PERMITIDAS_GUEST_SET = new Set<string>(ACOES_PERMITIDAS_GUEST);
const TODOS_TIPOS_CONHECIDOS_SET = new Set<string>(TODOS_TIPOS_CONHECIDOS);

export interface GuestActionResult {
  allowed: boolean;
  reason?: 'SCREEN_LOCKED' | 'MEDIA_LOCKED' | 'FORBIDDEN_ACTION';
}

export interface AutoridadeContexto {
  screenLocked: boolean;
  mediaUnlocked: boolean;
}

/**
 * Avalia se o Guest tem permissão para executar uma determinada ação.
 * Aplica allowlist estrita e defesa contra prototype pollution.
 */
export function canGuestExecuteAction(
  actionType: unknown,
  context: {
    screenLocked: boolean;
    mediaUnlocked: boolean;
  }
): GuestActionResult {
  // 1. Sanitização de tipo: deve ser string não vazia
  if (typeof actionType !== 'string' || !actionType) {
    return { allowed: false, reason: 'FORBIDDEN_ACTION' };
  }

  // 2. Proteção contra injeção e poluição de protótipo
  if (
    actionType === '__proto__' ||
    actionType === 'constructor' ||
    actionType === 'prototype' ||
    Object.prototype.hasOwnProperty(actionType)
  ) {
    return { allowed: false, reason: 'FORBIDDEN_ACTION' };
  }

  // 3. Ações exclusivas do Host são sumariamente proibidas ao Guest
  if (ACOES_EXCLUSIVAS_HOST_SET.has(actionType)) {
    return { allowed: false, reason: 'FORBIDDEN_ACTION' };
  }

  // 4. Se não estiver na allowlist estrita do Guest, rejeita (denylist aberta banida)
  if (!ACOES_PERMITIDAS_GUEST_SET.has(actionType)) {
    return { allowed: false, reason: 'FORBIDDEN_ACTION' };
  }

  // 5. Ações locais (ex.: GUEST_MUTED): permitidas mesmo com tela bloqueada (privacidade)
  if (ACOES_LOCAIS_GUEST_SET.has(actionType)) {
    return { allowed: true };
  }

  // 6. Com tela bloqueada (screenLocked === true), TODA ação interativa e de mídia é barrada
  if (context.screenLocked) {
    return { allowed: false, reason: 'SCREEN_LOCKED' };
  }

  // 7. Ações de mídia requerem permissão explícita do Host (mediaUnlocked === true)
  if (ACOES_MIDIA_GUEST_SET.has(actionType)) {
    if (!context.mediaUnlocked) {
      return { allowed: false, reason: 'MEDIA_LOCKED' };
    }
    return { allowed: true };
  }

  // 8. Ação interativa do Guest autorizada
  if (ACOES_INTERATIVAS_GUEST_SET.has(actionType)) {
    return { allowed: true };
  }

  // Salvaguarda final contra falha aberta
  return { allowed: false, reason: 'FORBIDDEN_ACTION' };
}

export interface ValidacaoAutorPermissaoResult {
  permitido: boolean;
  motivo?: 'AUTOR_INVALIDO' | 'TIPO_INVALIDO' | 'SCREEN_LOCKED' | 'MEDIA_LOCKED' | 'FORBIDDEN_ACTION_GUEST';
}

/**
 * Validação centralizada de autor e permissão de evento (consumida pelo EventoService).
 * Garante que EventoService e SessionManager operam sobre a mesma fonte da verdade.
 */
export function validarAutorEPermissaoCompartilhada(
  tipo: unknown,
  autor: unknown,
  options: {
    screenLocked?: boolean;
    mediaUnlocked?: boolean;
  } = {}
): ValidacaoAutorPermissaoResult {
  const screenLocked = !!options.screenLocked;
  const mediaUnlocked = !!options.mediaUnlocked;

  // 1. Identidade rigorosa do autor: apenas 'host' ou 'guest'
  if (autor !== 'host' && autor !== 'guest') {
    return { permitido: false, motivo: 'AUTOR_INVALIDO' };
  }

  // 2. Validação rigorosa do tipo contra tipos conhecidos e prototype pollution
  if (
    typeof tipo !== 'string' ||
    !tipo ||
    tipo === '__proto__' ||
    tipo === 'constructor' ||
    tipo === 'prototype' ||
    Object.prototype.hasOwnProperty(tipo) ||
    !TODOS_TIPOS_CONHECIDOS_SET.has(tipo)
  ) {
    return { permitido: false, motivo: 'TIPO_INVALIDO' };
  }

  // 3. Host tem autoridade total para emitir qualquer tipo conhecido
  if (autor === 'host') {
    return { permitido: true };
  }

  // 4. Guest: avaliado de forma idêntica à matriz canGuestExecuteAction
  const guestVerdict = canGuestExecuteAction(tipo, { screenLocked, mediaUnlocked });
  if (guestVerdict.allowed) {
    return { permitido: true };
  }

  // Converte a razão para o padrão de erro do EventoService
  if (guestVerdict.reason === 'SCREEN_LOCKED') {
    return { permitido: false, motivo: 'SCREEN_LOCKED' };
  }
  if (guestVerdict.reason === 'MEDIA_LOCKED') {
    return { permitido: false, motivo: 'MEDIA_LOCKED' };
  }

  return { permitido: false, motivo: 'FORBIDDEN_ACTION_GUEST' };
}
