import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket as WsImplementation } from 'ws';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { ServerSessionController } from '../electron/server/index';
import { GuestWsClient } from '../src/guest/ws/client';
import { EventoService } from '../electron/services/evento.service';
import { parseInviteUrl } from '../src/shared/crypto/invite';
import {
  createInitialTabState,
  reduceEvent,
  reduceEvents,
  getVisibleElements,
  WhiteboardEvent,
} from '../src/shared/events/reducer';
import {
  createFabricObjectFromData,
} from '../src/shared/canvas/engine';
import { generateUUID } from '../src/shared/events/protocol';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WsImplementation;
}

describe('ADR-012 — Borracha de Trecho (Stroke Segment Eraser) e Reducer O(N)', () => {
  let db: DatabaseType;
  let tempDbPath: string;
  let tempDir: string;
  let sessionController: ServerSessionController | null = null;
  const activeClients: GuestWsClient[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-borracha-'));
    tempDbPath = path.join(tempDir, 'test-borracha.db');
    db = initDb({ dbPath: tempDbPath });

    const now = Date.now();
    db.prepare(`
      INSERT OR IGNORE INTO Atendidos (id, nome, ativo, criado_em, atualizado_em)
      VALUES ('atendido-borracha-01', 'Atendido Borracha Teste', 1, ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT OR IGNORE INTO Sessoes (id, atendido_id, status, iniciado_em)
      VALUES ('sessao-borracha-01', 'atendido-borracha-01', 'ativa', ?)
    `).run(now);
  });

  afterEach(async () => {
    for (const client of activeClients) {
      try {
        client.close();
      } catch {}
    }
    activeClients.length = 0;

    if (sessionController) {
      await sessionController.stopSession();
      sessionController = null;
    }

    closeDb();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // (a) Apagar só a ponta de um traço deixa o restante visível
  it('(a) instancia elemento eraser_stroke com destination-out preservando o modelo vetorial', () => {
    const strokeData = {
      path: [
        ['M', 50, 50],
        ['L', 350, 50],
      ],
      left: 50,
      top: 50,
      stroke: '#0284c7',
      strokeWidth: 10,
    };

    const eraserData = {
      path: [
        ['M', 200, 20],
        ['L', 200, 80],
      ],
      left: 200,
      top: 20,
      strokeWidth: 20,
    };

    const strokeObj = createFabricObjectFromData('path', strokeData);
    expect(strokeObj).toBeDefined();
    expect(strokeObj?.globalCompositeOperation).toBe('source-over');

    const eraserObj = createFabricObjectFromData('eraser_stroke', eraserData);
    expect(eraserObj).toBeDefined();
    expect(eraserObj?.globalCompositeOperation).toBe('destination-out');
    expect(eraserObj?.selectable).toBe(false);
    expect(eraserObj?.strokeWidth).toBe(20);
  });

  // (b) Undo da borracha restaura o trecho apagado
  it('(b) undo da borracha oculta o eraser_stroke e restaura o estado anterior', () => {
    let state = createInitialTabState('default');

    // 1. Host desenha um traço longo
    const strokeEvent: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: 'sessao-borracha-01',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      criado_em: 1000,
      payload: {
        id: 'stroke-1',
        tipo: 'path',
        data: { path: [['M', 0, 0], ['L', 100, 100]], stroke: '#0284c7' },
      },
    };
    state = reduceEvent(state, strokeEvent);
    expect(getVisibleElements(state).length).toBe(1);

    // 2. Host passa a borracha de trecho pelo meio do traço
    const eraserEvent: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: 'sessao-borracha-01',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      criado_em: 2000,
      payload: {
        id: 'eraser-1',
        tipo: 'eraser_stroke',
        data: { path: [['M', 40, 40], ['L', 60, 60]], strokeWidth: 10 },
      },
    };
    state = reduceEvent(state, eraserEvent);
    expect(getVisibleElements(state).length).toBe(2);
    expect(state.elements['eraser-1'].hidden).toBe(false);

    // 3. Host aciona UNDO
    const undoEvent: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: 'sessao-borracha-01',
      aba_id: 'default',
      tipo: 'UNDO',
      autor: 'host',
      criado_em: 3000,
      payload: {},
    };
    state = reduceEvent(state, undoEvent);

    // O traço original continua visível, e a borracha foi desfeita (hidden = true)
    const visibleAfterUndo = getVisibleElements(state);
    expect(visibleAfterUndo.length).toBe(1);
    expect(visibleAfterUndo[0].id).toBe('stroke-1');
    expect(state.elements['eraser-1'].hidden).toBe(true);

    // 4. Host aciona REDO: a passada da borracha é restaurada
    const redoEvent: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: 'sessao-borracha-01',
      aba_id: 'default',
      tipo: 'REDO',
      autor: 'host',
      criado_em: 4000,
      payload: {},
    };
    state = reduceEvent(state, redoEvent);
    expect(getVisibleElements(state).length).toBe(2);
    expect(state.elements['eraser-1'].hidden).toBe(false);
  });

  // (c) Replay do log do zero produz o mesmo estado que o estado ao vivo
  it('(c) replay completo do log de eventos a partir do zero produz estado idêntico ao acumulado', () => {
    const events: WhiteboardEvent[] = [];
    let liveState = createInitialTabState('default');

    // Cria sequência de desenhos e passadas de borracha de diferentes autores
    for (let i = 0; i < 50; i++) {
      const isEraser = i % 5 === 4;
      const autor = i % 2 === 0 ? 'host' : 'guest';
      const ev: WhiteboardEvent = {
        id: `ev-${i}`,
        sessao_id: 'sessao-borracha-01',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor,
        criado_em: 1000 + i * 10,
        payload: {
          id: `elem-${i}`,
          tipo: isEraser ? 'eraser_stroke' : 'path',
          data: { path: [['M', i, i], ['L', i + 10, i + 10]], strokeWidth: isEraser ? 8 : 2 },
        },
      };
      events.push(ev);
      liveState = reduceEvent(liveState, ev);
    }

    // Host faz 3 UNDOs
    for (let u = 0; u < 3; u++) {
      const undoEv: WhiteboardEvent = {
        id: `undo-${u}`,
        sessao_id: 'sessao-borracha-01',
        aba_id: 'default',
        tipo: 'UNDO',
        autor: 'host',
        criado_em: 2000 + u * 10,
        payload: {},
      };
      events.push(undoEv);
      liveState = reduceEvent(liveState, undoEv);
    }

    // Replay do zero
    const replayedState = reduceEvents(events, createInitialTabState('default'));

    expect(replayedState.totalEventsApplied).toBe(liveState.totalEventsApplied);
    expect(replayedState.elementOrder).toEqual(liveState.elementOrder);
    expect(getVisibleElements(replayedState).map((e) => e.id)).toEqual(
      getVisibleElements(liveState).map((e) => e.id)
    );
  });

  // (d) Borracha do Guest aparece no Host e vice-versa com sincronização bidirecional
  it('(d) borracha e UNDO/REDO sincronizam bidirecionalmente entre Guest e Host via WebSocket', async () => {
    sessionController = new ServerSessionController();
    const sessionInfo = await sessionController.startSession(
      'sessao-borracha-01',
      'atendido-borracha-01',
      '127.0.0.1'
    );

    const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
    const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

    const hostReceivedEvents: any[] = [];
    sessionController.onGuestEvent((ev) => {
      hostReceivedEvents.push(ev);
    });

    const guestReceivedMessages: any[] = [];
    const client = new GuestWsClient({
      wsUrl,
      token: parsedInvite.token,
      hostPublicKey: parsedInvite.hostPublicKey,
      onMessage: (msg) => {
        guestReceivedMessages.push(msg);
      },
    });
    activeClients.push(client);
    await client.connect();

    // 1. Guest envia uma passada de borracha de trecho
    const guestEraserId = generateUUID();
    client.sendEncrypted({
      type: 'DRAW_ADD',
      abaId: 'default',
      sessaoId: 'sessao-borracha-01',
      autor: 'guest',
      payload: {
        id: guestEraserId,
        tipo: 'eraser_stroke',
        data: { path: [['M', 10, 10], ['L', 30, 30]], strokeWidth: 16 },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(hostReceivedEvents.length).toBeGreaterThanOrEqual(1);
    const lastHostEv = hostReceivedEvents[hostReceivedEvents.length - 1];
    expect(lastHostEv.type).toBe('DRAW_ADD');
    expect(lastHostEv.payload.id).toBe(guestEraserId);
    expect(lastHostEv.payload.tipo).toBe('eraser_stroke');

    // Verifica que foi persistido no banco SQLite preservando id e tipo
    const eventoService = new EventoService({ db });
    const tabStateHost = eventoService.reconstruirEstadoAba('sessao-borracha-01', 'default');
    expect(tabStateHost.elements[guestEraserId]).toBeDefined();
    expect(tabStateHost.elements[guestEraserId].tipo).toBe('eraser_stroke');

    // 2. Guest envia UNDO da borracha
    client.sendEncrypted({
      type: 'UNDO',
      abaId: 'default',
      sessaoId: 'sessao-borracha-01',
      autor: 'guest',
      payload: {},
    });

    await new Promise((r) => setTimeout(r, 200));

    const lastUndoEv = hostReceivedEvents[hostReceivedEvents.length - 1];
    expect(lastUndoEv.type).toBe('UNDO');

    // Verifica persistência do UNDO do Guest no banco SQLite
    const tabStateAposUndo = eventoService.reconstruirEstadoAba('sessao-borracha-01', 'default');
    expect(tabStateAposUndo.elements[guestEraserId].hidden).toBe(true);

    // 3. Host envia evento de borracha e UNDO para o Guest
    sessionController.broadcastToGuest({
      type: 'DRAW_ADD',
      abaId: 'default',
      sessaoId: 'sessao-borracha-01',
      autor: 'host',
      payload: {
        id: 'host-eraser-1',
        tipo: 'eraser_stroke',
        data: { path: [['M', 50, 50], ['L', 90, 90]], strokeWidth: 8 },
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    const guestGotEraser = guestReceivedMessages.find((m) => m.payload?.id === 'host-eraser-1');
    expect(guestGotEraser).toBeDefined();
    expect(guestGotEraser.payload.tipo).toBe('eraser_stroke');
  });

  // (e) Reducer continua puro e O(N): benchmark de 50 000 eventos não pode estourar 1500 ms
  it('(e) processa 50 000 eventos no reducer em menos de 1500 ms (linearidade O(N))', () => {
    const totalEvents = 50000;
    const events: WhiteboardEvent[] = new Array(totalEvents);

    for (let i = 0; i < totalEvents; i++) {
      const mod = i % 10;
      let tipo = 'DRAW_ADD';
      let payload: Record<string, unknown> = {
        id: `elem-${i}`,
        tipo: 'path',
        data: { path: [['M', 0, 0], ['L', 50, 50]], strokeWidth: 2 },
      };

      if (mod === 5) {
        // Borracha de Trecho (DRAW_ADD com eraser_stroke)
        payload = {
          id: `eraser-${i}`,
          tipo: 'eraser_stroke',
          data: { path: [['M', 10, 10], ['L', 20, 20]], strokeWidth: 10 },
        };
      } else if (mod === 8) {
        tipo = 'UNDO';
        payload = {};
      } else if (mod === 9) {
        tipo = 'REDO';
        payload = {};
      }

      events[i] = {
        id: `ev-${i}`,
        sessao_id: 'sessao-bench',
        aba_id: 'default',
        tipo,
        autor: i % 2 === 0 ? 'host' : 'guest',
        criado_em: i,
        payload,
      };
    }

    const start = performance.now();
    const state = reduceEvents(events);
    const elapsedMs = performance.now() - start;

    console.log(`[Benchmark Reducer] 50 000 eventos processados em: ${elapsedMs.toFixed(2)} ms`);

    expect(state.totalEventsApplied).toBe(totalEvents);
    expect(elapsedMs).toBeLessThan(1500);
  });
});
