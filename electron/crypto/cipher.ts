/**
 * Cifragem e Decifragem E2EE no Host (Node.js / Electron)
 * ChaCha20-Poly1305 IETF implementado com sodium-native (ADR-002, Documento Mestre §6).
 */
import sn from 'sodium-native';
import { decodeBase64, encodeBase64 } from '../../src/shared/crypto/base64url';
import { buildNonce, validateNonce } from '../../src/shared/crypto/nonce';
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
  TAG_BYTES,
} from '../../src/shared/crypto/types';
import { memzero } from './handshake';

export class NodeCryptoProvider implements CryptoProvider {
  readonly name = 'NodeCryptoProvider (sodium-native)';

  generateKeyPair(): KeyPair {
    const pk = Buffer.alloc(sn.crypto_kx_PUBLICKEYBYTES);
    const sk = Buffer.alloc(sn.crypto_kx_SECRETKEYBYTES);
    sn.crypto_kx_keypair(pk, sk);
    return {
      publicKey: new Uint8Array(pk),
      secretKey: new Uint8Array(sk),
    };
  }

  deriveSessionKeys(role: Role, myKeyPair: KeyPair, peerPublicKey: Uint8Array): SessionKeys {
    if (
      myKeyPair.publicKey.length !== PUBLIC_KEY_BYTES ||
      myKeyPair.secretKey.length !== SECRET_KEY_BYTES
    ) {
      throw new CryptoError('INVALID_KEY_LENGTH', 'Chaves locais possuem comprimento inválido');
    }
    if (peerPublicKey.length !== PUBLIC_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', 'Chave pública remota possui comprimento inválido');
    }

    const rx = Buffer.alloc(sn.crypto_kx_SESSIONKEYBYTES);
    const tx = Buffer.alloc(sn.crypto_kx_SESSIONKEYBYTES);

    const pkBuf = Buffer.from(myKeyPair.publicKey.buffer, myKeyPair.publicKey.byteOffset, myKeyPair.publicKey.byteLength);
    const skBuf = Buffer.from(myKeyPair.secretKey.buffer, myKeyPair.secretKey.byteOffset, myKeyPair.secretKey.byteLength);
    const peerPkBuf = Buffer.from(peerPublicKey.buffer, peerPublicKey.byteOffset, peerPublicKey.byteLength);

    try {
      if (role === 'host') {
        sn.crypto_kx_server_session_keys(rx, tx, pkBuf, skBuf, peerPkBuf);
      } else {
        sn.crypto_kx_client_session_keys(rx, tx, pkBuf, skBuf, peerPkBuf);
      }
    } catch {
      throw new CryptoError('KX_FAILED', 'Falha ao derivar chaves de sessão com crypto_kx');
    }

    return {
      rx: new Uint8Array(rx),
      tx: new Uint8Array(tx),
    };
  }

  encrypt(
    plaintext: Uint8Array | string,
    txKey: Uint8Array,
    direction: Direction,
    counter: bigint
  ): EncryptedRaw {
    if (txKey.length !== SESSION_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', `Chave tx deve ter ${SESSION_KEY_BYTES} bytes`);
    }

    const msgBuf = typeof plaintext === 'string'
      ? Buffer.from(plaintext, 'utf8')
      : Buffer.from(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength);

    const nonce = buildNonce(direction, counter);
    const nonceBuf = Buffer.from(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    const keyBuf = Buffer.from(txKey.buffer, txKey.byteOffset, txKey.byteLength);

    const ciphertext = Buffer.alloc(msgBuf.length + sn.crypto_aead_chacha20poly1305_ietf_ABYTES);

    sn.crypto_aead_chacha20poly1305_ietf_encrypt(
      ciphertext,
      msgBuf,
      null,
      null,
      nonceBuf,
      keyBuf
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
    if (rxKey.length !== SESSION_KEY_BYTES) {
      throw new CryptoError('INVALID_KEY_LENGTH', `Chave rx deve ter ${SESSION_KEY_BYTES} bytes`);
    }

    if (ciphertext.length < TAG_BYTES) {
      throw new CryptoError('INVALID_CIPHERTEXT', 'Texto cifrado menor que o tamanho da tag de autenticação');
    }

    // 1. Valida integridade, direção e monotonicidade do nonce
    const counter = validateNonce(nonce, expectedDirection, lastSeenCounter);

    const cipherBuf = Buffer.from(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
    const nonceBuf = Buffer.from(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    const keyBuf = Buffer.from(rxKey.buffer, rxKey.byteOffset, rxKey.byteLength);

    const plainBuf = Buffer.alloc(cipherBuf.length - sn.crypto_aead_chacha20poly1305_ietf_ABYTES);

    try {
      sn.crypto_aead_chacha20poly1305_ietf_decrypt(
        plainBuf,
        null,
        cipherBuf,
        null,
        nonceBuf,
        keyBuf
      );

      return {
        plaintext: new Uint8Array(plainBuf),
        counter,
      };
    } catch {
      memzero(plainBuf);
      // Falha limpa: sem vazar segredos nem detalhes sensíveis
      throw new CryptoError(
        'DECRYPTION_FAILED',
        'Falha ao decifrar mensagem: autenticação falhou ou pacote corrompido'
      );
    }
  }

  memzero(buffer: Uint8Array): void {
    memzero(buffer);
  }
}

/**
 * Cria uma sessão cifrada de alto nível para Node/Electron
 */
export function createNodeSessionCipher(
  provider: NodeCryptoProvider,
  role: Role,
  sessionKeys: SessionKeys
): SessionCipher {
  let txCounter = 0n;
  let lastRxCounter = 0n;
  let destroyed = false;

  const txDirection: Direction = role === 'host' ? 'H2G' : 'G2H';
  const expectedRxDirection: Direction = role === 'host' ? 'G2H' : 'H2G';

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

/**
 * Atalho conveniente para o Host criar sua sessão cifrada
 */
export function createHostSessionCipher(sessionKeys: SessionKeys): SessionCipher {
  const provider = new NodeCryptoProvider();
  return createNodeSessionCipher(provider, 'host', sessionKeys);
}
