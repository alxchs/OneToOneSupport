/**
 * Sincronização de mídia com relógio mestre no servidor (M6).
 *
 * Constantes exportadas para testes unitários determinísticos e uso na UI do Guest/Host.
 */

export const DERIVA_SEEK_SEGUNDOS = 0.5;
export const DERIVA_AJUSTE_SEGUNDOS = 0.08;
export const PLAYBACK_RATE_MIN = 0.97;
export const PLAYBACK_RATE_MAX = 1.03;

export type MediaSyncAction =
  | { tipo: 'seek'; targetTime: number }
  | { tipo: 'rate'; playbackRate: number }
  | { tipo: 'none'; playbackRate: 1.0 };

/**
 * Calcula o deslocamento do relógio (offset) em ms entre cliente e servidor:
 * t0: timestamp do envio do cliente (ms)
 * t1: timestamp de recepção/resposta do servidor (ms)
 * t2: timestamp de recebimento da resposta pelo cliente (ms)
 *
 * Offset a ser somado ao relógio local do cliente: agoraCorrigido = localNow + offset.
 */
export function calcularClockOffset(t0: number, t1: number, t2: number): number {
  const rtt = Math.max(0, t2 - t0);
  const oneWayDelay = rtt / 2;
  return t1 + oneWayDelay - t2;
}

/**
 * Calcula a posição esperada da mídia (em segundos) com base no estado e no relógio sincronizado.
 */
export function calcularPosicaoEsperada(
  mediaTime: number,
  serverTs: number,
  playing: boolean,
  agoraCorrigidoMs: number
): number {
  if (!playing) {
    return Math.max(0, mediaTime);
  }
  const decorridoSegundos = Math.max(0, (agoraCorrigidoMs - serverTs) / 1000);
  return Math.max(0, mediaTime + decorridoSegundos);
}

/**
 * Avalia a deriva entre a posição atual do player e a posição esperada da autoridade,
 * determinando se é necessário um seek abrupto, um ajuste suave de velocidade (playbackRate)
 * ou se a reprodução já está dentro da tolerância aceitável.
 */
export function avaliarDeriva(posicaoAtual: number, posicaoEsperada: number): MediaSyncAction {
  const deriva = posicaoEsperada - posicaoAtual; // positiva = atrasado (precisa acelerar); negativa = adiantado (precisa desacelerar)
  const absDeriva = Math.abs(deriva);

  if (absDeriva > DERIVA_SEEK_SEGUNDOS) {
    return {
      tipo: 'seek',
      targetTime: posicaoEsperada,
    };
  }

  if (absDeriva > DERIVA_AJUSTE_SEGUNDOS) {
    const rate = deriva > 0 ? PLAYBACK_RATE_MAX : PLAYBACK_RATE_MIN;
    return {
      tipo: 'rate',
      playbackRate: rate,
    };
  }

  return {
    tipo: 'none',
    playbackRate: 1.0,
  };
}

export interface MediaState {
  mediaTime: number;
  serverTs: number;
  playing: boolean;
}

/**
 * Gerenciador de sincronismo de mídia com relógio injetável para testes determinísticos.
 */
export class MediaSyncManager {
  private clockOffsetMs = 0;
  private currentMediaState: MediaState | null = null;
  private readonly getNow: () => number;

  constructor(clockFn?: () => number) {
    this.getNow = clockFn || (() => Date.now());
  }

  public setClockOffset(offsetMs: number): void {
    this.clockOffsetMs = offsetMs;
  }

  public getClockOffset(): number {
    return this.clockOffsetMs;
  }

  public processClockSync(t0: number, t1: number, t2?: number): number {
    const receiveTime = t2 !== undefined ? t2 : this.getNow();
    const offset = calcularClockOffset(t0, t1, receiveTime);
    this.clockOffsetMs = offset;
    return offset;
  }

  public getAgoraCorrigido(): number {
    return this.getNow() + this.clockOffsetMs;
  }

  public updateMediaState(state: MediaState): void {
    this.currentMediaState = { ...state };
  }

  public getMediaState(): MediaState | null {
    return this.currentMediaState ? { ...this.currentMediaState } : null;
  }

  public calcularPosicaoEsperada(): number {
    if (!this.currentMediaState) return 0;
    return calcularPosicaoEsperada(
      this.currentMediaState.mediaTime,
      this.currentMediaState.serverTs,
      this.currentMediaState.playing,
      this.getAgoraCorrigido()
    );
  }

  public sincronizarPlayer(posicaoAtual: number): MediaSyncAction {
    if (!this.currentMediaState) {
      return { tipo: 'none', playbackRate: 1.0 };
    }
    const esperada = this.calcularPosicaoEsperada();
    return avaliarDeriva(posicaoAtual, esperada);
  }

  public evaluate(posicaoAtual: number): MediaSyncAction {
    return this.sincronizarPlayer(posicaoAtual);
  }
}
