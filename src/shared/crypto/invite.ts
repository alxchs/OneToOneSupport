/**
 * Codificação e Decodificação do Convite com Fragmento Seguro (#pk_h)
 * DOCUMENTO_MESTRE.md §6: "Host embute pk_h no convite: https://.../join/<token>#<pk_h_base64>. O fragmento # nunca vai ao servidor."
 * ADR-001 e ADR-002: Base64url sem padding, chave pública X25519 de 32 bytes.
 */
import { decodeBase64Url, encodeBase64Url } from './base64url';
import { CryptoError, PUBLIC_KEY_BYTES } from './types';

export interface InviteParams {
  baseUrl: string;
  token: string;
  hostPublicKey: Uint8Array;
}

/**
 * Monta a URL de convite garantindo que a chave pública do Host fique estritamente no fragmento (#)
 */
export function buildInviteUrl(params: {
  baseUrl: string;
  token: string;
  hostPublicKey: Uint8Array | string;
}): string {
  if (!params.token || typeof params.token !== 'string') {
    throw new CryptoError('INVALID_TOKEN', 'Token do convite é obrigatório');
  }

  let pkBase64Url: string;
  if (typeof params.hostPublicKey === 'string') {
    const decoded = decodeBase64Url(params.hostPublicKey);
    if (decoded.length !== PUBLIC_KEY_BYTES) {
      throw new CryptoError(
        'INVALID_PUBLIC_KEY',
        `Chave pública deve ter ${PUBLIC_KEY_BYTES} bytes, recebido ${decoded.length}`
      );
    }
    pkBase64Url = params.hostPublicKey.replace(/=+$/, '');
  } else if (params.hostPublicKey instanceof Uint8Array) {
    if (params.hostPublicKey.length !== PUBLIC_KEY_BYTES) {
      throw new CryptoError(
        'INVALID_PUBLIC_KEY',
        `Chave pública deve ter ${PUBLIC_KEY_BYTES} bytes, recebido ${params.hostPublicKey.length}`
      );
    }
    pkBase64Url = encodeBase64Url(params.hostPublicKey);
  } else {
    throw new CryptoError('INVALID_PUBLIC_KEY', 'Chave pública inválida fornecida para o convite');
  }

  // Remove barras no final da base URL
  const cleanBaseUrl = params.baseUrl.replace(/\/+$/, '');
  const cleanToken = encodeURIComponent(params.token.trim());

  // URL padronizada: ${baseUrl}/join/${token}#${pkBase64Url}
  return `${cleanBaseUrl}/join/${cleanToken}#${pkBase64Url}`;
}

/**
 * Extrai a chave pública do fragmento de hash (ex: `#q6urq...` ou `q6urq...`)
 */
export function extractHostPublicKeyFromFragment(fragment: string): Uint8Array {
  if (!fragment || typeof fragment !== 'string') {
    throw new CryptoError('INVALID_FRAGMENT', 'Fragmento de hash inválido ou ausente');
  }

  const cleanFragment = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const decoded = decodeBase64Url(cleanFragment);

  if (decoded.length !== PUBLIC_KEY_BYTES) {
    throw new CryptoError(
      'INVALID_PUBLIC_KEY_LENGTH',
      `Chave pública decodificada possui ${decoded.length} bytes; esperados ${PUBLIC_KEY_BYTES}`
    );
  }

  return decoded;
}

/**
 * Interpreta uma URL completa de convite e extrai os parâmetros estruturados
 */
export function parseInviteUrl(urlStr: string): InviteParams {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);

    // Esperado: ['join', '<token>']
    const joinIndex = parts.indexOf('join');
    if (joinIndex === -1 || joinIndex === parts.length - 1) {
      throw new CryptoError('INVALID_INVITE_URL', 'Formato de caminho inválido: esperado /join/<token>');
    }

    const token = decodeURIComponent(parts[joinIndex + 1]);
    const fragment = url.hash;

    if (!fragment) {
      throw new CryptoError('MISSING_KEY_FRAGMENT', 'URL de convite não possui fragmento de chave pública (#)');
    }

    const hostPublicKey = extractHostPublicKeyFromFragment(fragment);
    const baseUrl = `${url.protocol}//${url.host}`;

    return { baseUrl, token, hostPublicKey };
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    throw new CryptoError('INVALID_INVITE_URL', `Falha ao interpretar URL de convite: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Verifica formalmente a propriedade de segurança: a chave pública NUNCA deve trafegar em path ou query
 */
export function verifyInviteUrlSecurity(urlStr: string): {
  isSecure: boolean;
  hasFragment: boolean;
  pkInPathOrQuery: boolean;
} {
  const url = new URL(urlStr);
  const hash = url.hash.replace(/^#/, '');

  if (!hash) {
    return { isSecure: false, hasFragment: false, pkInPathOrQuery: false };
  }

  const pathAndQuery = `${url.pathname}${url.search}`;
  const pkInPathOrQuery = pathAndQuery.includes(hash);

  return {
    isSecure: !pkInPathOrQuery && hash.length > 0,
    hasFragment: hash.length > 0,
    pkInPathOrQuery,
  };
}
