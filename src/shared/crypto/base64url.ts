/**
 * Utilitários de codificação Base64 e Base64url (RFC 4648)
 * Compatível nativamente com Node.js e Browsers (WASM/Mobile).
 */
import { CryptoError } from './types';

/**
 * Converte Uint8Array para string Base64 padrão
 */
export function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converte string Base64 ou Base64url para Uint8Array
 */
export function decodeBase64(str: string): Uint8Array {
  if (typeof str !== 'string') {
    throw new CryptoError('INVALID_BASE64', 'Entrada de decodificação deve ser uma string');
  }

  // Normaliza Base64url para Base64 padrão e adiciona padding se necessário
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new CryptoError('INVALID_BASE64', 'Falha ao decodificar Base64: caracteres inválidos');
  }
}

/**
 * Converte Uint8Array para string Base64url (sem padding =, seguro para URLs e fragmentos)
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  const base64 = encodeBase64(bytes);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converte string Base64url (ou Base64) para Uint8Array
 */
export function decodeBase64Url(str: string): Uint8Array {
  return decodeBase64(str);
}
