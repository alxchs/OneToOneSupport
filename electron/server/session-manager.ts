import * as crypto from 'crypto';
import { generateHostKeyPair, deriveHostSessionKeys, destroyKeyPair } from '../crypto/handshake';
import { createHostSessionCipher } from '../crypto/cipher';
import type { SessionCipher } from '../../src/shared/crypto/types';
import { encodeBase64Url, decodeBase64Url } from '../../src/shared/crypto/base64url';
import { ProtocolMessageType } from '../../src/shared/events/protocol';

export type ServerSessionState =
  | 'idle'
  | 'aguardando_guest'
  | 'conectado'
  | 'reconectando'
  | 'encerrada';

export interface SessionManagerConfig {
  sessaoId: string;
  atendidoId: string;
  guestTokenTtlMs?: number; // Padrão: 15 minutos (900_000 ms)
  reconnectTokenTtlMs?: number; // Padrão: 5 minutos (300_000 ms) - DOCUMENTO_MESTRE §11
  clock?: () => number;
}

export interface ValidationResult {
  valid: boolean;
  code?: 'INVALID_TOKEN' | 'TOKEN_REUSED' | 'TOKEN_EXPIRED' | 'SESSION_BUSY' | 'INVALID_STATE';
  message?: string;
}

export interface GuestActionResult {
  allowed: boolean;
  reason?: 'SCREEN_LOCKED' | 'MEDIA_LOCKED' | 'FORBIDDEN_ACTION';
}

/**
 * Gerenciador de Sessão 1:1 no Servidor (Host)
 * Responsável por tokens de acesso (guest_token one-shot e reconnect_token com rotação),
 * autoridade do Host, chave efêmera X25519, relógio mestre para mídia e estado da conexão.
 */
export class SessionManager {
  public readonly sessaoId: string;
  public readonly atendidoId: string;

  private readonly guestTokenTtlMs: number;
  private readonly reconnectTokenTtlMs: number;
  private readonly clock: () => number;

  private state: ServerSessionState = 'aguardando_guest';

  // Par de chaves efêmero X25519 do Host
  private hostKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  private hostPublicKeyBase64Url: string = '';

  // Token one-shot de primeiro acesso do Guest (32 bytes CSPRNG)
  private guestToken: string = '';
  private guestTokenUsed: boolean = false;
  private guestTokenExpiresAt: number = 0;

  // Token de reconexão (TTL 5 min, rotacionado a cada uso)
  private reconnectToken: string | null = null;
  private reconnectExpiresAt: number = 0;

  // Cifrador de sessão E2EE
  private sessionCipher: SessionCipher | null = null;

  // Controle de conexão única do Guest
  private guestConnected: boolean = false;
  private activeGuestConnectionId: string | null = null;

  // Matriz de autoridade do Host
  private screenLocked: boolean = false;
  private mediaUnlocked: boolean = false;

  // Listeners de mudança de estado
  private stateChangeListeners: Array<(state: ServerSessionState) => void> = [];

  constructor(config: SessionManagerConfig) {
    this.sessaoId = config.sessaoId;
    this.atendidoId = config.atendidoId;
    this.guestTokenTtlMs = config.guestTokenTtlMs ?? 15 * 60 * 1000;
    this.reconnectTokenTtlMs = config.reconnectTokenTtlMs ?? 5 * 60 * 1000;
    this.clock = config.clock ?? Date.now;

    this.initSessionSecurity();
  }

  /**
   * Inicializa o par de chaves efêmero e o guest_token one-shot de 32 bytes (CSPRNG)
   */
  private initSessionSecurity(): void {
    const keyPair = generateHostKeyPair();
    this.hostKeyPair = keyPair;
    this.hostPublicKeyBase64Url = encodeBase64Url(keyPair.publicKey);

    // 32 bytes CSPRNG em formato hexadecimal
    this.guestToken = crypto.randomBytes(32).toString('hex');
    this.guestTokenUsed = false;
    this.guestTokenExpiresAt = this.clock() + this.guestTokenTtlMs;
  }

  public getState(): ServerSessionState {
    return this.state;
  }

  public getHostPublicKeyBase64Url(): string {
    return this.hostPublicKeyBase64Url;
  }

  public getGuestToken(): string {
    return this.guestToken;
  }

  public getReconnectToken(): string | null {
    return this.reconnectToken;
  }

  public isGuestConnected(): boolean {
    return this.guestConnected;
  }

  public isScreenLocked(): boolean {
    return this.screenLocked;
  }

  public isMediaUnlocked(): boolean {
    return this.mediaUnlocked;
  }

  public onStateChange(listener: (state: ServerSessionState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
    };
  }

  private notifyStateChange(newState: ServerSessionState): void {
    this.state = newState;
    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error('[SessionManager] Erro no listener de mudança de estado:', err);
      }
    }
  }

  /**
   * Valida se um token é elegível para renderizar a página do Guest (HTTP)
   */
  public isTokenValidForHttpJoin(token: string): boolean {
    if (this.state === 'encerrada') return false;
    const now = this.clock();

    // Permite guest_token se ainda não foi usado ou se for recente
    if (token === this.guestToken && now <= this.guestTokenExpiresAt) {
      return true;
    }

    // Permite reconnect_token se ativo e dentro do TTL
    if (token === this.reconnectToken && now <= this.reconnectExpiresAt) {
      return true;
    }

    return false;
  }

  /**
   * Valida o token de autenticação WebSocket inicial (AUTH).
   * Garante a propriedade ONE-SHOT: invalidado imediatamente no primeiro join.
   * Garante a propriedade de UM ÚNICO GUEST: segundo join rejeitado.
   */
  public authenticateInitialJoin(token: string, connectionId: string): ValidationResult {
    if (this.state === 'encerrada') {
      return { valid: false, code: 'INVALID_STATE', message: 'Sessão encerrada.' };
    }

    if (this.guestConnected) {
      return {
        valid: false,
        code: 'SESSION_BUSY',
        message: 'Um convidado já está conectado a esta sessão.',
      };
    }

    if (token !== this.guestToken) {
      return { valid: false, code: 'INVALID_TOKEN', message: 'Token de acesso inválido.' };
    }

    if (this.guestTokenUsed) {
      return {
        valid: false,
        code: 'TOKEN_REUSED',
        message: 'Token de convite já foi utilizado (one-shot).',
      };
    }

    const now = this.clock();
    if (now > this.guestTokenExpiresAt) {
      return { valid: false, code: 'TOKEN_EXPIRED', message: 'Token de convite expirado.' };
    }

    // Invalidação imediata do one-shot token
    this.guestTokenUsed = true;
    this.activeGuestConnectionId = connectionId;

    return { valid: true };
  }

  /**
   * Valida o token de reconexão (RECONNECT).
   * Garante TTL de 5 minutos e rotação a cada uso.
   */
  public authenticateReconnect(token: string, connectionId: string): ValidationResult {
    if (this.state === 'encerrada') {
      return { valid: false, code: 'INVALID_STATE', message: 'Sessão encerrada.' };
    }

    if (this.guestConnected) {
      return {
        valid: false,
        code: 'SESSION_BUSY',
        message: 'Um convidado já está conectado a esta sessão.',
      };
    }

    if (!this.reconnectToken || token !== this.reconnectToken) {
      return { valid: false, code: 'INVALID_TOKEN', message: 'Token de reconexão inválido.' };
    }

    const now = this.clock();
    if (now > this.reconnectExpiresAt) {
      return {
        valid: false,
        code: 'TOKEN_EXPIRED',
        message: 'Janela de reconexão expirada (limite de 5 minutos).',
      };
    }

    this.activeGuestConnectionId = connectionId;
    return { valid: true };
  }

  /**
   * Conclui o handshake criptográfico derivando as chaves de sessão com a chave pública do Guest.
   * Gera e rotaciona o reconnect_token (TTL de 5 min) e transiciona para o estado 'conectado'.
   */
  public completeHandshake(clientPublicKeyStr: string): { reconnectToken: string } {
    if (!this.hostKeyPair) {
      throw new Error('Chave do host não disponível para handshake.');
    }

    const guestPublicKey = decodeBase64Url(clientPublicKeyStr);
    if (guestPublicKey.length !== 32) {
      throw new Error(`Chave pública do convidado inválida (${guestPublicKey.length} bytes; esperado 32).`);
    }

    // Destrói cifra anterior se existir (em reconexão)
    if (this.sessionCipher) {
      this.sessionCipher.destroy();
      this.sessionCipher = null;
    }

    // Derivação de chaves direcionais (rx/tx) com crypto_kx
    const sessionKeys = deriveHostSessionKeys(this.hostKeyPair, guestPublicKey);
    this.sessionCipher = createHostSessionCipher(sessionKeys);

    // Gera / Rotaciona o reconnect_token com TTL de 5 minutos
    const now = this.clock();
    this.reconnectToken = crypto.randomBytes(32).toString('hex');
    this.reconnectExpiresAt = now + this.reconnectTokenTtlMs;

    this.guestConnected = true;
    this.notifyStateChange('conectado');

    return { reconnectToken: this.reconnectToken };
  }

  /**
   * Notifica que a conexão do Guest foi perdida/fechada.
   * Transiciona para 'reconectando' e abre a janela de 5 minutos.
   */
  public handleGuestDisconnect(connectionId?: string): void {
    if (this.activeGuestConnectionId && connectionId && this.activeGuestConnectionId !== connectionId) {
      return; // Desconexão de conexão não-ativa
    }

    this.guestConnected = false;
    this.activeGuestConnectionId = null;

    if (this.state !== 'encerrada') {
      const now = this.clock();
      // Garante que o TTL de reconexão de 5 minutos está ativo
      if (this.reconnectExpiresAt < now + this.reconnectTokenTtlMs) {
        this.reconnectExpiresAt = now + this.reconnectTokenTtlMs;
      }
      this.notifyStateChange('reconectando');
    }
  }

  public getCipher(): SessionCipher | null {
    return this.sessionCipher;
  }

  /**
   * Matriz de Autoridade do Host (Mestre §11 e §16):
   * - Host emite LOCK_SCREEN -> Guest bloqueado para interações no canvas e mídia
   * - Host emite UNLOCK_MEDIA -> Libera controle de mídia para o Guest
   * - Guest só desenha (DRAW_ADD), desfaz própria ação (DRAW_HIDE)
   */
  public setScreenLocked(locked: boolean): void {
    this.screenLocked = locked;
  }

  public setMediaUnlocked(unlocked: boolean): void {
    this.mediaUnlocked = unlocked;
  }

  public canGuestExecute(actionType: ProtocolMessageType): GuestActionResult {
    // 1. Se a tela estiver bloqueada pelo Host (LOCK_SCREEN), bloqueia qualquer ação interativa
    if (this.screenLocked) {
      if (
        actionType === 'DRAW_ADD' ||
        actionType === 'DRAW_HIDE' ||
        actionType === 'CLEAR_TAB' ||
        actionType === 'PLAY' ||
        actionType === 'PAUSE' ||
        actionType === 'SEEK' ||
        actionType === 'MEDIA_CONTROL'
      ) {
        return { allowed: false, reason: 'SCREEN_LOCKED' };
      }
    }

    // 2. Ações exclusivas do Host (Guest NUNCA pode emitir)
    if (
      actionType === 'LOCK_SCREEN' ||
      actionType === 'UNLOCK_MEDIA' ||
      actionType === 'TAB_SWITCH' ||
      actionType === 'CLEAR_TAB'
    ) {
      return { allowed: false, reason: 'FORBIDDEN_ACTION' };
    }

    // 3. Controle de mídia: Guest só pode emitir se UNLOCK_MEDIA estiver ativo
    if (
      actionType === 'PLAY' ||
      actionType === 'PAUSE' ||
      actionType === 'SEEK' ||
      actionType === 'MEDIA_CONTROL'
    ) {
      if (!this.mediaUnlocked) {
        return { allowed: false, reason: 'MEDIA_LOCKED' };
      }
    }

    // 4. DRAW_ADD, DRAW_HIDE e GUEST_MUTED são permitidos no fluxo normal
    return { allowed: true };
  }

  /**
   * Relógio Mestre do Servidor para Mídia (Mestre §11):
   * O servidor carimba o timestamp oficial em eventos de mídia sincronizada.
   */
  public stampMediaEvent<T extends Record<string, unknown>>(payload: T): T & { serverTs: number } {
    return {
      ...payload,
      serverTs: this.clock(),
    };
  }

  /**
   * Encerramento formal da sessão:
   * Limpa memória sensível via sodium_memzero nos buffers de chave e notifica estado 'encerrada'.
   */
  public encerrar(): void {
    this.guestConnected = false;
    this.activeGuestConnectionId = null;

    if (this.sessionCipher) {
      this.sessionCipher.destroy();
      this.sessionCipher = null;
    }

    if (this.hostKeyPair) {
      destroyKeyPair(this.hostKeyPair);
      this.hostKeyPair = null;
    }

    this.notifyStateChange('encerrada');
  }
}
