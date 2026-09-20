declare module 'sodium-native' {
  export const crypto_kx_PUBLICKEYBYTES: number;
  export const crypto_kx_SECRETKEYBYTES: number;
  export const crypto_kx_SESSIONKEYBYTES: number;
  export const crypto_aead_chacha20poly1305_ietf_KEYBYTES: number;
  export const crypto_aead_chacha20poly1305_ietf_NPUBBYTES: number;
  export const crypto_aead_chacha20poly1305_ietf_ABYTES: number;

  export function crypto_kx_keypair(publicKey: Buffer, secretKey: Buffer): void;
  export function crypto_kx_server_session_keys(
    rx: Buffer,
    tx: Buffer,
    serverPublicKey: Buffer,
    serverSecretKey: Buffer,
    clientPublicKey: Buffer
  ): void;
  export function crypto_kx_client_session_keys(
    rx: Buffer,
    tx: Buffer,
    clientPublicKey: Buffer,
    clientSecretKey: Buffer,
    serverPublicKey: Buffer
  ): void;

  export function crypto_aead_chacha20poly1305_ietf_encrypt(
    ciphertext: Buffer,
    message: Buffer,
    additionalData: Buffer | null,
    nsec: Buffer | null,
    npub: Buffer,
    key: Buffer
  ): void;

  export function crypto_aead_chacha20poly1305_ietf_decrypt(
    message: Buffer,
    nsec: Buffer | null,
    ciphertext: Buffer,
    additionalData: Buffer | null,
    npub: Buffer,
    key: Buffer
  ): void;

  export function sodium_memzero(buffer: Buffer): void;
}

declare module 'libsodium-wrappers-sumo' {
  interface KeyPairKX {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    keyType: string;
  }

  interface CryptoKXSessionKeys {
    sharedRx: Uint8Array;
    sharedTx: Uint8Array;
  }

  interface SodiumWrappers {
    ready: Promise<void>;
    crypto_kx_keypair(): KeyPairKX;
    crypto_kx_server_session_keys(
      serverPublicKey: Uint8Array,
      serverSecretKey: Uint8Array,
      clientPublicKey: Uint8Array
    ): CryptoKXSessionKeys;
    crypto_kx_client_session_keys(
      clientPublicKey: Uint8Array,
      clientSecretKey: Uint8Array,
      serverPublicKey: Uint8Array
    ): CryptoKXSessionKeys;

    crypto_aead_chacha20poly1305_ietf_encrypt(
      message: Uint8Array | string,
      additionalData: Uint8Array | null,
      secretNonce: Uint8Array | null,
      publicNonce: Uint8Array,
      key: Uint8Array
    ): Uint8Array;

    crypto_aead_chacha20poly1305_ietf_decrypt(
      secretNonce: Uint8Array | null,
      ciphertext: Uint8Array,
      additionalData: Uint8Array | null,
      publicNonce: Uint8Array,
      key: Uint8Array,
      outputFormat?: 'uint8array' | 'text'
    ): Uint8Array;

    memzero(buffer: Uint8Array): void;
  }

  const sodium: SodiumWrappers;
  export default sodium;
}
