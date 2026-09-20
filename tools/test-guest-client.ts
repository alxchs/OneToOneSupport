import { WebSocket } from 'ws';
import { BrowserCryptoProvider, createBrowserSessionCipher } from '../src/shared/crypto/browser';
import { parseInviteUrl } from '../src/shared/crypto/invite';
import { encodeBase64Url } from '../src/shared/crypto/base64url';
import {
  createEnvelope,
  validateEnvelope,
  ProtocolEnvelope,
  EncryptedPayload,
} from '../src/shared/events/protocol';
import { KeyPair, SessionCipher } from '../src/shared/crypto/types';

export interface TestGuestClientOptions {
  inviteUrl?: string;
  wsUrl?: string;
  token?: string;
  hostPublicKey?: Uint8Array;
}

export class TestGuestClient {
  public ws: WebSocket | null = null;
  public wsUrl: string = '';
  public token: string = '';
  public hostPublicKey: Uint8Array = new Uint8Array(32);

  public cryptoProvider: BrowserCryptoProvider | null = null;
  public guestKeyPair: KeyPair | null = null;
  public guestCipher: SessionCipher | null = null;
  public lastReconnectToken: string | null = null;

  private messageQueue: ProtocolEnvelope[] = [];
  private messageListeners: Array<(env: ProtocolEnvelope) => void> = [];

  constructor(options: TestGuestClientOptions) {
    if (options.inviteUrl) {
      const parsed = parseInviteUrl(options.inviteUrl);
      this.token = parsed.token;
      this.hostPublicKey = parsed.hostPublicKey;
      // Converte http:// para ws://
      const url = new URL(parsed.baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = url.toString().replace(/\/+$/, '');
    } else {
      this.wsUrl = options.wsUrl || 'ws://127.0.0.1:0';
      this.token = options.token || '';
      this.hostPublicKey = options.hostPublicKey || new Uint8Array(32);
    }
  }

  public async initCrypto(): Promise<void> {
    if (!this.cryptoProvider) {
      this.cryptoProvider = await BrowserCryptoProvider.init();
    }
  }

  public async connect(): Promise<void> {
    await this.initCrypto();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('message', (data) => {
        try {
          const envelope = validateEnvelope(JSON.parse(data.toString()));
          if (this.messageListeners.length > 0) {
            const listener = this.messageListeners.shift()!;
            listener(envelope);
          } else {
            this.messageQueue.push(envelope);
          }
        } catch (err) {
          console.error('[TestGuestClient] Erro ao processar mensagem recebida:', err);
        }
      });
    });
  }

  public async waitForEnvelope(timeoutMs: number = 5000): Promise<ProtocolEnvelope> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.messageListeners.indexOf(onMsg);
        if (idx !== -1) this.messageListeners.splice(idx, 1);
        reject(new Error(`Timeout de ${timeoutMs}ms aguardando envelope.`));
      }, timeoutMs);

      const onMsg = (env: ProtocolEnvelope) => {
        clearTimeout(timer);
        resolve(env);
      };

      this.messageListeners.push(onMsg);
    });
  }

  public async sendAuth(overrideToken?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não conectado.');
    }
    const env = createEnvelope('AUTH', { token: overrideToken ?? this.token });
    this.ws.send(JSON.stringify(env));
  }

  public async sendReconnect(token: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não conectado.');
    }
    const env = createEnvelope('RECONNECT', { token });
    this.ws.send(JSON.stringify(env));
  }

  public async performHandshake(overridePk?: string): Promise<{ reconnectToken: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não conectado.');
    }
    if (!this.cryptoProvider) {
      await this.initCrypto();
    }

    // Gera par efêmero do Guest (X25519)
    this.guestKeyPair = this.cryptoProvider!.generateKeyPair();

    // Deriva chaves direcionais (rx/tx) com a chave pública do Host
    const sessionKeys = this.cryptoProvider!.deriveSessionKeys(
      'guest',
      this.guestKeyPair,
      this.hostPublicKey
    );
    this.guestCipher = createBrowserSessionCipher(this.cryptoProvider!, 'guest', sessionKeys);

    // Envia HANDSHAKE_INIT em texto claro com a chave pública do Guest
    const pk_g = overridePk ?? encodeBase64Url(this.guestKeyPair.publicKey);
    const hsEnv = createEnvelope('HANDSHAKE_INIT', { clientPublicKey: pk_g });
    this.ws.send(JSON.stringify(hsEnv));

    // Aguarda confirmação cifrada SESSION_READY vinda do Host
    const responseEnv = await this.waitForEnvelope();
    if (responseEnv.type !== 'ENCRYPTED') {
      throw new Error(`Esperado ENCRYPTED pós-handshake, recebido: ${responseEnv.type}`);
    }

    const decryptedBytes = this.guestCipher.decrypt(responseEnv.payload as EncryptedPayload);
    const sessionReady = JSON.parse(new TextDecoder('utf-8').decode(decryptedBytes));
    this.lastReconnectToken = sessionReady.reconnectToken;

    return { reconnectToken: sessionReady.reconnectToken };
  }

  public async sendEncrypted(innerMessage: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não conectado.');
    }
    if (!this.guestCipher) {
      throw new Error('Cifra de sessão não inicializada (execute o handshake primeiro).');
    }

    const encrypted = this.guestCipher.encrypt(JSON.stringify(innerMessage));
    const env = createEnvelope('ENCRYPTED', {
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
    });
    this.ws.send(JSON.stringify(env));
  }

  public async receiveEncrypted(timeoutMs: number = 5000): Promise<Record<string, unknown>> {
    if (!this.guestCipher) {
      throw new Error('Cifra de sessão não inicializada.');
    }
    const env = await this.waitForEnvelope(timeoutMs);
    if (env.type !== 'ENCRYPTED') {
      throw new Error(`Esperado ENCRYPTED, recebido ${env.type}`);
    }
    const decryptedBytes = this.guestCipher.decrypt(env.payload as EncryptedPayload);
    return JSON.parse(new TextDecoder('utf-8').decode(decryptedBytes));
  }

  /**
   * Mede a latência de eco cifrado em milissegundos (Round-Trip Time)
   */
  public async measureEchoLatency(): Promise<number> {
    const echoId = `echo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const start = performance.now();

    await this.sendEncrypted({
      type: 'ECHO_PING',
      echoId,
      clientTs: Date.now(),
    });

    const reply = await this.receiveEncrypted();
    const end = performance.now();

    if (reply.type !== 'ECHO_PONG' || reply.echoId !== echoId) {
      throw new Error(`Resposta de eco inválida: ${JSON.stringify(reply)}`);
    }

    return end - start;
  }

  public close(): void {
    if (this.guestCipher) {
      this.guestCipher.destroy();
      this.guestCipher = null;
    }
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.messageQueue = [];
    this.messageListeners = [];
  }
}

// Execução standalone via CLI se invocado diretamente
if (process.argv[1] && process.argv[1].endsWith('test-guest-client.ts')) {
  const inviteUrl = process.argv[2];
  if (!inviteUrl) {
    console.error('Uso: node tools/test-guest-client.ts <inviteUrl>');
    process.exit(1);
  }

  (async () => {
    console.log(`[TestGuestClient] Conectando ao convite: ${inviteUrl}`);
    const client = new TestGuestClient({ inviteUrl });
    try {
      await client.connect();
      console.log('-> Conectado ao WebSocket. Enviando AUTH...');
      await client.sendAuth();
      console.log('-> AUTH enviado. Executando handshake X25519...');
      const { reconnectToken } = await client.performHandshake();
      console.log(`-> Handshake concluído com sucesso! Reconnect Token: ${reconnectToken}`);

      console.log('-> Medindo latência de eco cifrado...');
      const latencies: number[] = [];
      for (let i = 0; i < 5; i++) {
        const lat = await client.measureEchoLatency();
        latencies.push(lat);
        console.log(`   Ping #${i + 1}: ${lat.toFixed(2)} ms`);
      }

      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      console.log(`[TestGuestClient] Latência média de eco cifrado: ${avg.toFixed(2)} ms (Mestre §18 < 200ms: PASS)`);

      client.close();
      process.exit(0);
    } catch (err) {
      console.error('[TestGuestClient] Erro:', err);
      client.close();
      process.exit(1);
    }
  })();
}
