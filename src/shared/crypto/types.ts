/**
 * Tipos, Interfaces e Constantes Criptográficas E2EE
 * Fonte de verdade: DOCUMENTO_MESTRE.md §6 e §16, ADR-002, Fase 03.
 */

export type Role = 'host' | 'guest';
export type Direction = 'H2G' | 'G2H';

// Constantes de tamanho da libsodium / ChaCha20-Poly1305 IETF / X25519
export const PUBLIC_KEY_BYTES = 32;
export const SECRET_KEY_BYTES = 32;
export const SESSION_KEY_BYTES = 32;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const DIRECTION_BYTES = 4;
export const COUNTER_BYTES = 8;

// Prefixos discriminadores de direção (ADR-002: 4 bytes discriminadores)
// 'H2G\0' (0x48, 0x32, 0x47, 0x00) e 'G2H\0' (0x47, 0x32, 0x48, 0x00)
export const DIRECTION_H2G = new Uint8Array([0x48, 0x32, 0x47, 0x00]);
export const DIRECTION_G2H = new Uint8Array([0x47, 0x32, 0x48, 0x00]);

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SessionKeys {
  rx: Uint8Array; // Chave de recepção (32 bytes)
  tx: Uint8Array; // Chave de transmissão (32 bytes)
}

export interface EncryptedRaw {
  nonce: Uint8Array; // 12 bytes
  ciphertext: Uint8Array; // Mensagem cifrada + tag de 16 bytes Poly1305
}

export interface EncryptedBase64 {
  nonce: string; // Base64 ou Base64url (12 bytes)
  ciphertext: string; // Base64 ou Base64url
}

export interface DecryptedMessage {
  plaintext: Uint8Array;
  counter: bigint;
}

/**
 * Erro controlado para operações criptográficas que nunca vaza chaves nem texto claro
 */
export class CryptoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
    Object.setPrototypeOf(this, CryptoError.prototype);
  }
}

/**
 * Interface padronizada de provedor criptográfico interoperável byte a byte
 */
export interface CryptoProvider {
  readonly name: string;

  /**
   * Gera par efêmero de chaves X25519 (32B pk, 32B sk)
   */
  generateKeyPair(): KeyPair | Promise<KeyPair>;

  /**
   * Deriva chaves simétricas de sessão (rx/tx de 32B cada) via crypto_kx
   * Nunca utiliza o segredo cru ECDH diretamente como chave.
   */
  deriveSessionKeys(
    role: Role,
    myKeyPair: KeyPair,
    peerPublicKey: Uint8Array
  ): SessionKeys | Promise<SessionKeys>;

  /**
   * Cifra payload com ChaCha20-Poly1305 IETF usando chave tx e nonce estruturado
   */
  encrypt(
    plaintext: Uint8Array | string,
    txKey: Uint8Array,
    direction: Direction,
    counter: bigint
  ): EncryptedRaw;

  /**
   * Decifra payload, validando direção e contador estritamente monotônico
   */
  decrypt(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    rxKey: Uint8Array,
    expectedDirection: Direction,
    lastSeenCounter: bigint
  ): DecryptedMessage;

  /**
   * Sobrescreve buffers de memória com zeros para higienização de chaves e segredos
   */
  memzero(buffer: Uint8Array): void;
}

/**
 * Gerenciador de estado cifrado com controle monotônico de nonce e anti-replay
 */
export interface SessionCipher {
  readonly role: Role;

  /**
   * Cifra dados com nonce monotônico auto-incrementado
   */
  encrypt(plaintext: Uint8Array | string): EncryptedBase64;

  /**
   * Decifra dados e rejeita replay, reordenação ou adulteração
   */
  decrypt(payload: EncryptedBase64 | EncryptedRaw): Uint8Array;

  /**
   * Retorna o contador tx atual
   */
  getTxCounter(): bigint;

  /**
   * Retorna o último contador rx aceito
   */
  getLastRxCounter(): bigint;

  /**
   * Zera chaves e encerra a sessão com segurança
   */
  destroy(): void;

  /**
   * Retorna se a sessão já foi destruída
   */
  isDestroyed(): boolean;
}
