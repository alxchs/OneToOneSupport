/**
 * Provedor Criptográfico para Navegador (Guest / WebAssembly)
 * Utiliza libsodium-wrappers-sumo.
 * ADR-002: Interoperabilidade byte a byte com sodium-native.
 */
import sodium from 'libsodium-wrappers-sumo';
import { decodeBase64, encodeBase64 } from './base64url';
import { buildNonce, validateNonce } from './nonce';
import {
  CryptoError,
  CryptoProvider,
  Direction,
  EncryptedBase64,
  EncryptedRaw,
  KeyPair,
  Role,
  SessionCipher,
  SessionKeys,
  DecryptedMessage,
  PUBLIC_KEY_BYTES,
  SECRET_KEY_BYTES,
  SESSION_KEY_BYTES,
} from './types';

export class BrowserCryptoProvider implements CryptoProvider {
  readonly name = 'BrowserCryptoProvider (libsodium-wrappers-sumo)';
  private static readyPromise: Promise<void> | null = null;

  /**
   * Garante a inicialização do runtime WebAssembly da libsodium
   */
  static async init(): Promise<BrowserCryptoProvider> {
    if (!this.readyPromise) {
      this.readyPromise = sodium.ready;
    }
    await this.readyPromise;
    return new BrowserCryptoProvider();
  }

  /**
   * Garante que o WebAssembly está pronto antes de qualquer operação
   */
  private ensureReady(): void {
    // libsodium expõe crypto_kx_keypair apenas após inicializado
    if (typeof sodium.crypto_kx_keypair !== 'function') {
      throw new CryptoError('NOT_READY', 'libsodium-wrappers-sumo ainda não concluiu a inicialização (chame BrowserCryptoProvider.init())');
    }
  }

  generateKeyPair(): KeyPair {
    this.ensureReady();
    const keys = sodium.crypto_kx_keypair();
    return {
      publicKey: new Uint8Array(keys.publicKey),
      secretKey: new Uint8Array(keys.privateKey),
    };
  }

  deriveSessionKeys(role: Role, myKeyPair: KeyPair, peerPublicKey: Uint8Array): SessionKeys {
    this.ensureReady();

    if (myKeyPair.publicKey.length !== PUBLIC_KEY_BYTES || myKeyPair.secretKey.length !== SECRET_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', 'Chaves locais possuem comprimento inválido para X25519');
    }
    if (peerPublicKey.length !== PUBLIC_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', 'Chave pública remota possui comprimento inválido para X25519');
    }

    try {
      if (role === 'host') {
        // Host age como server no crypto_kx
        const derived = sodium.crypto_kx_server_session_keys(
          myKeyPair.publicKey,
          myKeyPair.secretKey,
          peerPublicKey
        );
        return {
          rx: new Uint8Array(derived.sharedRx),
          tx: new Uint8Array(derived.sharedTx),
        };
      } else {
        // Guest age como client no crypto_kx
        const derived = sodium.crypto_kx_client_session_keys(
          myKeyPair.publicKey,
          myKeyPair.secretKey,
          peerPublicKey
        );
        return {
          rx: new Uint8Array(derived.sharedRx),
          tx: new Uint8Array(derived.sharedTx),
        };
      }
    } catch {
      throw new CryptoError('KX_FAILED', 'Falha ao derivar chaves de sessão com crypto_kx');
    }
  }

  encrypt(
    plaintext: Uint8Array | string,
    txKey: Uint8Array,
    direction: Direction,
    counter: bigint
  ): EncryptedRaw {
    this.ensureReady();

    if (txKey.length !== SESSION_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', `Chave tx deve ter ${SESSION_KEY_BYTES} bytes`);
    }

    const nonce = buildNonce(direction, counter);
    const ciphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      plaintext,
      null,
      null,
      nonce,
      txKey
    );

    return {
      nonce,
      ciphertext: new Uint8Array(ciphertext),
    };
  }

  decrypt(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    rxKey: Uint8Array,
    expectedDirection: Direction,
    lastSeenCounter: bigint
  ): DecryptedMessage {
    this.ensureReady();

    if (rxKey.length !== SESSION_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', `Chave rx deve ter ${SESSION_KEY_BYTES} bytes`);
    }

    // 1. Valida integridade e monotonicidade do nonce (anti-replay e isolamento de canal)
    const counter = validateNonce(nonce, expectedDirection, lastSeenCounter);

    // 2. Decifra com ChaCha20-Poly1305 IETF
    try {
      const plaintext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        null,
        nonce,
        rxKey
      );

      return {
        plaintext: new Uint8Array(plaintext),
        counter,
      };
    } catch {
      // Falha limpa: nunca loga nem expõe segredos no erro
      throw new CryptoError(
        'DECRYPTION_FAILED',
        'Falha ao decifrar mensagem: autenticação falhou ou pacote corrompido'
      );
    }
  }

  memzero(buffer: Uint8Array): void {
    if (buffer && buffer.length > 0) {
      try {
        sodium.memzero(buffer);
      } catch {
        buffer.fill(0);
      }
    }
  }
}

/**
 * Cria uma sessão cifrada de alto nível para o navegador
 */
export function createBrowserSessionCipher(
  provider: BrowserCryptoProvider,
  role: Role,
  sessionKeys: SessionKeys
): SessionCipher {
  let txCounter = 0n;
  let lastRxCounter = 0n;
  let destroyed = false;

  const txDirection: Direction = role === 'host' ? 'H2G' : 'G2H';
  const expectedRxDirection: Direction = role === 'host' ? 'G2H' : 'H2G';

  // Faz cópia local das chaves para controle estrito de ciclo de vida
  const rx = new Uint8Array(sessionKeys.rx);
  const tx = new Uint8Array(sessionKeys.tx);

  return {
    role,

    encrypt(plaintext: Uint8Array | string): EncryptedBase64 {
      if (destroyed) {
        throw new CryptoError('SESSION_DESTROYED', 'Sessão criptográfica já foi encerrada');
      }

      txCounter += 1n;
      const raw = provider.encrypt(plaintext, tx, txDirection, txCounter);

      return {
        nonce: encodeBase64(raw.nonce),
        ciphertext: encodeBase64(raw.ciphertext),
      };
    },

    decrypt(payload: EncryptedBase64 | EncryptedRaw): Uint8Array {
      if (destroyed) {
        throw new CryptoError('SESSION_DESTROYED', 'Sessão criptográfica já foi encerrada');
      }

      const nonce = typeof payload.nonce === 'string' ? decodeBase64(payload.nonce) : payload.nonce;
      const ciphertext = typeof payload.ciphertext === 'string' ? decodeBase64(payload.ciphertext) : payload.ciphertext;

      const result = provider.decrypt(ciphertext, nonce, rx, expectedRxDirection, lastRxCounter);
      lastRxCounter = result.counter;
      return result.plaintext;
    },

    getTxCounter(): bigint {
      return txCounter;
    },

    getLastRxCounter(): bigint {
      return lastRxCounter;
    },

    destroy(): void {
      if (!destroyed) {
        destroyed = true;
        provider.memzero(rx);
        provider.memzero(tx);
      }
    },

    isDestroyed(): boolean {
      return destroyed;
    },
  };
}
