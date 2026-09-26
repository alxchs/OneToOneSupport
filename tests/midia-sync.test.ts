import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { Database as DatabaseType } from 'better-sqlite3';
import { WebSocket as WsImplementation } from 'ws';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { ServerSessionController } from '../electron/server';
import { GuestWsClient } from '../src/guest/ws/client';
import { parseInviteUrl } from '../src/shared/crypto/invite';
import {
  DERIVA_SEEK_SEGUNDOS,
  DERIVA_AJUSTE_SEGUNDOS,
  PLAYBACK_RATE_MIN,
  PLAYBACK_RATE_MAX,
  calcularClockOffset,
  calcularPosicaoEsperada,
  avaliarDeriva,
  MediaSyncManager,
} from '../src/shared/media-sync';

// Garante disponibilidade do WebSocket no ambiente de teste Node
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WsImplementation;
}

describe('M6 — Mídia Sincronizada, Relógio Mestre e Correção Suave de Deriva', () => {
  let db: DatabaseType;
  let sessionController: ServerSessionController | null = null;
  let client: GuestWsClient | null = null;
  let sessaoId: string;
  let atendidoId: string;

  beforeEach(() => {
    db = initDb({ dbPath: ':memory:' });

    const atendidoRes = createAtendido({ nome: 'Atendido Sync' }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido');
    atendidoId = atendidoRes.id;

    const sessaoRes = createSessao({ atendido_id: atendidoId, titulo: 'Sessão Sync' }, Date.now(), db);
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão');
    sessaoId = sessaoRes.id;
  });

  afterEach(async () => {
    if (client) {
      try {
        client.close();
      } catch {}
      client = null;
    }
    if (sessionController) {
      await sessionController.stopSession();
      sessionController = null;
    }
  });

  afterAll(() => {
    closeDb();
  });

  describe('Algoritmo Determinístico de Deriva e Sincronismo (Relógio Falso Injetado)', () => {
    it('calcula o deslocamento de relógio com RTT e one-way delay', () => {
      // Cliente enviou em 1000, servidor respondeu em 1050, cliente recebeu em 1100 (RTT = 100ms, OWD = 50ms)
      // offset = 1050 + 50 - 1100 = 0
      const offset = calcularClockOffset(1000, 1050, 1100);
      expect(offset).toBe(0);

      // Servidor 200ms adiantado em relação ao cliente:
      // t0 = 1000, t1 = 1250, t2 = 1100 -> offset = 1250 + 50 - 1100 = +200ms
      const offsetAdiantado = calcularClockOffset(1000, 1250, 1100);
      expect(offsetAdiantado).toBe(200);
    });

    it('calcula a posição esperada enquanto reproduz com tempo decorrido sincronizado', () => {
      // Vídeo começou a tocar na posição 10s no servidor no timestamp 50000ms
      // Agora sincronizado é 53000ms (3 segundos depois)
      const pos = calcularPosicaoEsperada(10.0, 50000, true, 53000);
      expect(pos).toBeCloseTo(13.0, 2);

      // Se pausado (playing = false), mantém a posição original sem avançar
      const posPausado = calcularPosicaoEsperada(10.0, 50000, false, 53000);
      expect(posPausado).toBe(10.0);
    });

    it('tolerância normal (deriva <= 0.08 s): tipo "none", playbackRate = 1.0', () => {
      expect(DERIVA_AJUSTE_SEGUNDOS).toBe(0.08);

      // 50ms de diferença (abaixo de 80ms)
      const actionAtrasado50ms = avaliarDeriva(10.0, 10.05);
      expect(actionAtrasado50ms.tipo).toBe('none');
      if (actionAtrasado50ms.tipo === 'none') {
        expect(actionAtrasado50ms.playbackRate).toBe(1.0);
      }

      const actionAdiantado50ms = avaliarDeriva(10.05, 10.0);
      expect(actionAdiantado50ms.tipo).toBe('none');
    });

    it('deriva moderada (entre 0.08 s e 0.5 s): ajuste suave por playbackRate (0.97 a 1.03)', () => {
      expect(PLAYBACK_RATE_MIN).toBe(0.97);
      expect(PLAYBACK_RATE_MAX).toBe(1.03);

      // Cliente está 300 ms ATRASADO (posicaoAtual = 10.0s, esperada = 10.3s)
      // Deve acelerar suavemente para 1.03
      const actionAtrasado = avaliarDeriva(10.0, 10.3);
      expect(actionAtrasado.tipo).toBe('rate');
      if (actionAtrasado.tipo === 'rate') {
        expect(actionAtrasado.playbackRate).toBe(1.03);
      }

      // Cliente está 300 ms ADIANTADO (posicaoAtual = 10.3s, esperada = 10.0s)
      // Deve desacelerar suavemente para 0.97
      const actionAdiantado = avaliarDeriva(10.3, 10.0);
      expect(actionAdiantado.tipo).toBe('rate');
      if (actionAdiantado.tipo === 'rate') {
        expect(actionAdiantado.playbackRate).toBe(0.97);
      }
    });

    it('deriva severa (acima de 0.5 s): salto abrupto por seek', () => {
      expect(DERIVA_SEEK_SEGUNDOS).toBe(0.5);

      // Cliente está 700 ms atrasado (posicaoAtual = 10.0s, esperada = 10.7s)
      const actionSevera = avaliarDeriva(10.0, 10.7);
      expect(actionSevera.tipo).toBe('seek');
      if (actionSevera.tipo === 'seek') {
        expect(actionSevera.targetTime).toBeCloseTo(10.7, 2);
      }
    });

    it('MediaSyncManager com relógio falso injetado converge deriva e restaura 1.0 ao zerar', () => {
      let simulatedLocalTime = 10000;
      const fakeClock = () => simulatedLocalTime;

      const sync = new MediaSyncManager(fakeClock);
      // Servidor está 100ms adiantado
      sync.processClockSync(1000, 1150, 1100); // RTT 100ms, t1 1150 -> offset = 100ms
      expect(sync.getClockOffset()).toBe(100);

      sync.updateMediaState({
        mediaTime: 5.0,
        serverTs: 10100, // servidor quando tocou
        playing: true,
      });

      // 1. No mesmo instante (simulatedLocalTime = 10000 -> agoraCorrigido = 10100 -> decorrido 0 -> esperada 5.0)
      // Player está em 4.7s (300ms de atraso) -> taxa suave 1.03
      const step1 = sync.evaluate(4.7);
      expect(step1.tipo).toBe('rate');
      if (step1.tipo === 'rate') expect(step1.playbackRate).toBe(1.03);

      // 2. Simula player alcançando a sincronia (4.98s vs 5.0s -> 20ms de erro, tolerância normal)
      const step2 = sync.evaluate(4.98);
      expect(step2.tipo).toBe('none');
      if (step2.tipo === 'none') expect(step2.playbackRate).toBe(1.0);
    });
  });

  describe('CLOCK_SYNC Rate Limiting no WebSocket e Autoridade de Mídia', () => {
    it('suporta rajada de 50 CLOCK_SYNC em menos de 1s descartando o excedente sem derrubar a conexão', async () => {
      sessionController = new ServerSessionController();
      const info = await sessionController.startSession({
        sessaoId,
        atendidoId,
        preferredIp: '127.0.0.1',
      });

      const parsedInvite = parseInviteUrl(info.inviteUrl);

      client = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${info.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });

      await client.connect();

      let clockSyncResponses = 0;
      client.on('CLOCK_SYNC', () => {
        clockSyncResponses++;
      });

      // Dispara rajada de 50 mensagens CLOCK_SYNC sequenciais imediatas
      for (let i = 0; i < 50; i++) {
        client.sendRawEncrypted({
          type: 'CLOCK_SYNC',
          payload: { t0: Date.now() },
          ts: Date.now(),
        });
      }

      // Aguarda 400ms para processamento das mensagens
      await new Promise((resolve) => setTimeout(resolve, 400));

      // A conexão DEVE permanecer aberta e saudável
      expect(client.isConnected()).toBe(true);

      // Devido ao rate-limit de 1 CLOCK_SYNC por segundo por conexão, apenas 1 resposta é emitida
      expect(clockSyncResponses).toBe(1);

      // Envia mais uma mensagem normal para provar que o canal continua 100% operacional
      client.sendRawEncrypted({
        type: 'HEARTBEAT',
        payload: {},
        ts: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client.isConnected()).toBe(true);
    });
  });
});
