/**
 * Handshake Criptográfico e Troca de Chaves no Host (Node.js / Electron)
 * Implementado com sodium-native (ADR-002, Documento Mestre §6).
 */
import sn from 'sodium-native';
import {
  CryptoError,
  KeyPair,
  SessionKeys,
  PUBLIC_KEY_BYTES,
  SECRET_KEY_BYTES,
} from '../../src/shared/crypto/types';

/**
 * Gera um par de chaves efêmero X25519 para o Host
 */
export function generateHostKeyPair(): KeyPair {
  const publicKey = Buffer.alloc(sn.crypto_kx_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sn.crypto_kx_SECRETKEYBYTES);

  sn.crypto_kx_keypair(publicKey, secretKey);

  return {
    publicKey: new Uint8Array(publicKey),
    secretKey: new Uint8Array(secretKey),
  };
}

/**
 * Deriva as chaves de sessão rx e tx para o Host a partir da chave pública do Guest
 * Utiliza crypto_kx (X25519 + BLAKE2b KDF).
 * O segredo ECDH cru NUNCA é exposto nem usado diretamente.
 */
export function deriveHostSessionKeys(
  hostKeyPair: KeyPair,
  guestPublicKey: Uint8Array
): SessionKeys {
  if (
    hostKeyPair.publicKey.length !== PUBLIC_KEY_BYTES ||
    hostKeyPair.secretKey.length !== SECRET_KEY_BYTES
  ) {
    throw new CryptoError(
      'INVALID_KEY_LENGTH',
      `Chaves do Host possuem tamanho inválido: esperado ${PUBLIC_KEY_BYTES}/${SECRET_KEY_BYTES} bytes`
    );
  }

  if (guestPublicKey.length !== PUBLIC_KEY_BYTES) {
    throw new CryptoError(
      'INVALID_KEY_LENGTH',
      `Chave pública do Guest possui tamanho inválido: esperado ${PUBLIC_KEY_BYTES} bytes`
    );
  }

  const rx = Buffer.alloc(sn.crypto_kx_SESSIONKEYBYTES);
  const tx = Buffer.alloc(sn.crypto_kx_SESSIONKEYBYTES);

  const hostPkBuf = Buffer.from(hostKeyPair.publicKey.buffer, hostKeyPair.publicKey.byteOffset, hostKeyPair.publicKey.byteLength);
  const hostSkBuf = Buffer.from(hostKeyPair.secretKey.buffer, hostKeyPair.secretKey.byteOffset, hostKeyPair.secretKey.byteLength);
  const guestPkBuf = Buffer.from(guestPublicKey.buffer, guestPublicKey.byteOffset, guestPublicKey.byteLength);

  try {
    sn.crypto_kx_server_session_keys(rx, tx, hostPkBuf, hostSkBuf, guestPkBuf);
  } catch {
    throw new CryptoError('KX_FAILED', 'Falha ao derivar chaves de sessão no Host com crypto_kx');
  }

  return {
    rx: new Uint8Array(rx),
    tx: new Uint8Array(tx),
  };
}

/**
 * Sobrescreve buffers na memória com zeros via sodium_memzero
 */
export function memzero(buffer: Uint8Array): void {
  if (buffer && buffer.length > 0) {
    try {
      const buf = Buffer.isBuffer(buffer)
        ? buffer
        : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      sn.sodium_memzero(buf);
    } catch {
      buffer.fill(0);
    }
  }
}

/**
 * Higieniza completamente o par de chaves efêmero
 */
export function destroyKeyPair(keyPair: KeyPair): void {
  if (keyPair.publicKey) memzero(keyPair.publicKey);
  if (keyPair.secretKey) memzero(keyPair.secretKey);
}

/**
 * Higieniza completamente as chaves de sessão
 */
export function destroySessionKeys(sessionKeys: SessionKeys): void {
  if (sessionKeys.rx) memzero(sessionKeys.rx);
  if (sessionKeys.tx) memzero(sessionKeys.tx);
}
