/**
 * Gestão e Validação de Nonce Criptográfico
 * ADR-002: ChaCha20-Poly1305 IETF com nonce de 12 bytes = 4B prefixo de direção + 8B contador monotônico Big-Endian.
 */
import {
  CryptoError,
  Direction,
  DIRECTION_BYTES,
  NONCE_BYTES,
  DIRECTION_H2G,
  DIRECTION_G2H,
} from './types';

/**
 * Monta o nonce de 12 bytes a partir da direção e contador monotônico
 */
export function buildNonce(direction: Direction, counter: bigint): Uint8Array {
  if (counter < 0n) {
    throw new CryptoError('INVALID_COUNTER', 'Contador do nonce deve ser não negativo');
  }

  const nonce = new Uint8Array(NONCE_BYTES);
  const prefix = direction === 'H2G' ? DIRECTION_H2G : DIRECTION_G2H;
  nonce.set(prefix, 0);

  const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  // Escreve os 8 bytes do contador em formato Big-Endian (uint64)
  view.setBigUint64(DIRECTION_BYTES, counter, false);

  return nonce;
}

/**
 * Lê e decodifica a direção e o contador de um nonce de 12 bytes
 */
export function parseNonce(nonce: Uint8Array): { direction: Direction; counter: bigint } {
  if (nonce.byteLength !== NONCE_BYTES) {
    throw new CryptoError(
      'INVALID_NONCE_LENGTH',
      `Tamanho de nonce inválido: esperado ${NONCE_BYTES} bytes, recebido ${nonce.byteLength}`
    );
  }

  let direction: Direction;
  if (
    nonce[0] === DIRECTION_H2G[0] &&
    nonce[1] === DIRECTION_H2G[1] &&
    nonce[2] === DIRECTION_H2G[2] &&
    nonce[3] === DIRECTION_H2G[3]
  ) {
    direction = 'H2G';
  } else if (
    nonce[0] === DIRECTION_G2H[0] &&
    nonce[1] === DIRECTION_G2H[1] &&
    nonce[2] === DIRECTION_G2H[2] &&
    nonce[3] === DIRECTION_G2H[3]
  ) {
    direction = 'G2H';
  } else {
    throw new CryptoError('INVALID_DIRECTION', 'Prefixo de direção do nonce é desconhecido');
  }

  const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const counter = view.getBigUint64(DIRECTION_BYTES, false);

  return { direction, counter };
}

/**
 * Valida o nonce recebido contra a direção esperada e o último contador recebido.
 * Rejeita contadores repetidos, regressivos ou com direção contrária (Anti-replay e isolamento de canal).
 */
export function validateNonce(
  nonce: Uint8Array,
  expectedDirection: Direction,
  lastSeenCounter: bigint
): bigint {
  const { direction, counter } = parseNonce(nonce);

  if (direction !== expectedDirection) {
    throw new CryptoError(
      'INVALID_DIRECTION',
      `Direção do pacote inválida: esperada ${expectedDirection}, recebida ${direction}`
    );
  }

  if (counter <= lastSeenCounter) {
    throw new CryptoError(
      'REPLAY_ATTACK',
      `Contador inválido ou reutilizado: recebido ${counter.toString()}, último visto ${lastSeenCounter.toString()}`
    );
  }

  return counter;
}
