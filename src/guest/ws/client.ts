/**
 * Cliente WebSocket do Guest com E2EE (ChaCha20-Poly1305 + X25519)
 * e Reconexão Automática com Token Rotacionado (Mestre §6, §11, §16 e ADR-002).
 */

import { BrowserCryptoProvider, createBrowserSessionCipher } from '../../shared/crypto/browser';
import { encodeBase64Url } from '../../shared/crypto/base64url';
import {
  createEnvelope,
  validateEnvelope,
  ProtocolEnvelope,
  EncryptedPayload,
} from '../../shared/events/protocol';
import { KeyPair, SessionCipher } from '../../shared/crypto/types';

export type GuestConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'handshaking'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface GuestWsClientOptions {
  wsUrl: string;
  token: string;
  hostPublicKey: Uint8Array;
  reconnectToken?: string | null;
  webSocketClass?: any;
  onStateChange?: (state: GuestConnectionState) => void;
  onMessage?: (message: any) => void;
  onError?: (err: Error) => void;
}

export class GuestWsClient {
  public ws: WebSocket | null = null;
  public wsUrl: string;
  public token: string;
  public hostPublicKey: Uint8Array;
  public reconnectToken: string | null = null;
  public mediaToken: string | null = null;
  private webSocketClass?: any;

  private cryptoProvider: BrowserCryptoProvider | null = null;
  private guestKeyPair: KeyPair | null = null;
  private guestCipher: SessionCipher | null = null;

  private state: GuestConnectionState = 'idle';
  private intentionalClose: boolean = false;
  private reconnectTimer: any = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 30; // ~1-2 min com backoff

  public onStateChange?: (state: GuestConnectionState) => void;
  public onMessage?: (message: any) => void;
  public onError?: (err: Error) => void;

  constructor(options: GuestWsClientOptions) {
    this.wsUrl = options.wsUrl;
    this.token = options.token;
    this.hostPublicKey = options.hostPublicKey;
    this.reconnectToken = options.reconnectToken ?? null;
    this.webSocketClass = options.webSocketClass;
    this.onStateChange = options.onStateChange;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
  }

  public getState(): GuestConnectionState {
    return this.state;
  }

  public getReconnectToken(): string | null {
    return this.reconnectToken;
  }

  public getMediaToken(): string | null {
    return this.mediaToken;
  }

  public on(type: string, handler: (payload: any) => void): () => void {
    const prev = this.onMessage;
    this.onMessage = (msg: any) => {
      if (prev) prev(msg);
      if (msg && msg.type === type) {
        handler(msg.payload !== undefined ? msg.payload : msg);
      }
    };
    return () => {};
  }

  public isConnected(): boolean {
    return this.state === 'connected' && Boolean(this.ws && this.ws.readyState === 1);
  }

  public sendRawEncrypted(innerMessage: Record<string, unknown>): void {
    this.sendEncrypted(innerMessage);
  }

  private setState(nextState: GuestConnectionState): void {
    this.state = nextState;
    if (this.onStateChange) {
      this.onStateChange(nextState);
    }
  }

  /**
   * Garante a inicialização do módulo criptográfico WebAssembly
   */
  public async initCrypto(): Promise<void> {
    if (!this.cryptoProvider) {
      this.cryptoProvider = await BrowserCryptoProvider.init();
    }
  }

  /**
   * Inicia o processo de conexão e autenticação segura
   */
  public async connect(): Promise<void> {
    this.intentionalClose = false;
    await this.initCrypto();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const isReconnecting = Boolean(this.reconnectToken);
    this.setState(isReconnecting ? 'reconnecting' : 'connecting');

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      try {
        const WsConstructor =
          this.webSocketClass ||
          (typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket);
        if (!WsConstructor) {
          throw new Error('WebSocket não disponível no ambiente.');
        }
        this.ws = new WsConstructor(this.wsUrl);
      } catch (err) {
        this.setState('error');
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (this.onError) this.onError(errorObj);
        reject(errorObj);
        return;
      }

      const ws = this.ws;
      if (!ws) {
        reject(new Error('WebSocket não instanciado'));
        return;
      }

      ws.onopen = async () => {
        try {
          // 1. Envio de AUTH (ou RECONNECT)
          if (this.reconnectToken) {
            this.setState('authenticating');
            const reconnectEnv = createEnvelope('RECONNECT', { token: this.reconnectToken });
            this.ws?.send(JSON.stringify(reconnectEnv));
          } else {
            this.setState('authenticating');
            const authEnv = createEnvelope('AUTH', { token: this.token });
            this.ws?.send(JSON.stringify(authEnv));
          }

          // 2. Executa Handshake criptográfico ECDH (X25519)
          this.setState('handshaking');
          if (this.guestCipher) {
            this.guestCipher.destroy();
            this.guestCipher = null;
          }

          this.guestKeyPair = this.cryptoProvider!.generateKeyPair();
          const sessionKeys = this.cryptoProvider!.deriveSessionKeys(
            'guest',
            this.guestKeyPair,
            this.hostPublicKey
          );
          this.guestCipher = createBrowserSessionCipher(this.cryptoProvider!, 'guest', sessionKeys);

          const pk_g = encodeBase64Url(this.guestKeyPair.publicKey);
          const hsEnv = createEnvelope('HANDSHAKE_INIT', { clientPublicKey: pk_g });
          this.ws?.send(JSON.stringify(hsEnv));
        } catch (err) {
          settled = true;
          this.setState('error');
          const errorObj = err instanceof Error ? err : new Error(String(err));
          if (this.onError) this.onError(errorObj);
          reject(errorObj);
        }
      };

      ws.onmessage = (event) => {
        try {
          const rawStr = typeof event.data === 'string' ? event.data : '';
          const envelope: ProtocolEnvelope = validateEnvelope(JSON.parse(rawStr));

          if (envelope.type === 'ERROR') {
            const errPayload = envelope.payload as { code?: string; message?: string; fatal?: boolean };
            const errorObj = new Error(errPayload.message || 'Erro do servidor de sessão');
            if (this.onError) this.onError(errorObj);
            if (errPayload.fatal) {
              this.setState('error');
              this.ws?.close();
            }
            if (!settled) {
              settled = true;
              reject(errorObj);
            }
            return;
          }

          if (envelope.type === 'ENCRYPTED') {
            if (!this.guestCipher) {
              throw new Error('Mensagem cifrada recebida antes da inicialização do cipher.');
            }

            const decryptedBytes = this.guestCipher.decrypt(envelope.payload as EncryptedPayload);
            const innerStr = new TextDecoder('utf-8').decode(decryptedBytes);
            const innerMsg = JSON.parse(innerStr);

            // Se for resposta de confirmação de sessão (SESSION_READY)
            if (innerMsg.type === 'SESSION_READY') {
              if (innerMsg.reconnectToken && typeof innerMsg.reconnectToken === 'string') {
                this.reconnectToken = innerMsg.reconnectToken;
              }
              if (innerMsg.mediaToken && typeof innerMsg.mediaToken === 'string') {
                this.mediaToken = innerMsg.mediaToken;
              }
              this.reconnectAttempts = 0;
              this.setState('connected');

              if (!settled) {
                settled = true;
                resolve();
              }
            }

            // Despacha o evento decifrado para a aplicação
            if (this.onMessage) {
              this.onMessage(innerMsg);
            }
          }
        } catch (err) {
          console.error('[GuestWsClient] Erro ao processar mensagem do servidor:', err);
        }
      };

      ws.onclose = () => {
        if (this.intentionalClose) {
          this.setState('closed');
          return;
        }

        // Queda inesperada da rede: tenta reconectar automaticamente
        this.handleDisconnect();
        if (!settled) {
          settled = true;
          reject(new Error('Conexão fechada durante o handshake.'));
        }
      };

      ws.onerror = (_evt) => {
        const errorObj = new Error('Erro de transporte no WebSocket');
        if (this.onError) this.onError(errorObj);
        if (!settled) {
          settled = true;
          reject(errorObj);
        }
      };
    });
  }

  /**
   * Envia evento cifrado de ponta a ponta (E2EE) para o Host
   */
  public sendEncrypted(innerMessage: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não está aberto para envio.');
    }
    if (!this.guestCipher) {
      throw new Error('Cifra E2EE não está ativa.');
    }

    const encrypted = this.guestCipher.encrypt(JSON.stringify(innerMessage));
    const envelope = createEnvelope('ENCRYPTED', {
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
    });
    this.ws.send(JSON.stringify(envelope));
  }

  /**
   * Trata a desconexão automática e inicia rotina de reconexão
   */
  private handleDisconnect(): void {
    if (this.intentionalClose) return;

    if (!this.reconnectToken) {
      // Se não temos token de reconexão, o convite expirou ou falhou antes do handshake
      this.setState('error');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('error');
      if (this.onError) {
        this.onError(new Error('Limite de tentativas de reconexão excedido.'));
      }
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts += 1;

    // Backoff linear suave (1.5s a 5s)
    const delay = Math.min(5000, 1500 + this.reconnectAttempts * 300);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.warn('[GuestWsClient] Tentativa de reconexão falhou:', err.message);
      });
    }, delay);
  }

  /**
   * Encerra a conexão de forma explícita e destrói as chaves em memória
   */
  public close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignora erro de fechamento
      }
      this.ws = null;
    }

    if (this.guestCipher) {
      this.guestCipher.destroy();
      this.guestCipher = null;
    }

    this.setState('closed');
  }
}
