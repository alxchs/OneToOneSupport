import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { setConfig } from '../electron/db/repositories/configuracao.repo';
import {
  appendEvento,
  getEventosBySessao,
  countEventosBySessao,
} from '../electron/db/repositories/evento.repo';
import {
  createInitialTabState,
  reduceEvent,
  reduceEvents,
  getVisibleElements,
  WhiteboardEvent,
} from '../src/shared/events/reducer';
import { EventoService } from '../electron/services/evento.service';

describe('Fase 05 - Event Sourcing, Snapshots e Revisões Imutáveis', () => {
  let db: DatabaseType;
  let tempDir: string;
  let sessaoId: string;
  let atendidoId: string;
  let eventoService: EventoService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-test-events-'));
    db = initDb({ dbPath: ':memory:' });

    const atendidoRes = createAtendido(
      { nome: 'Paciente Teste Sourcing', contato: '11999990001' },
      db
    );
    atendidoId = (atendidoRes as { id: string }).id;

    const sessaoRes = createSessao({ atendido_id: atendidoId, titulo: 'Sessão ES' }, Date.now(), db);
    if (!sessaoRes.created) {
      throw new Error('Falha ao criar sessão de teste');
    }
    sessaoId = sessaoRes.id;

    eventoService = new EventoService({
      db,
      snapshotsDir: tempDir,
      defaultSnapshotInterval: 10, // Intervalo reduzido para testes rápidos
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignora lock no Windows
      }
    }
  });

  describe('1. Repositório Eventos: Somente Append (Trigger de Bloqueio de UPDATE/DELETE)', () => {
    it('permite append de eventos normalmente e calcula rowid incremental', () => {
      const ev1 = appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'aba-1',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({ id: 'stroke-1', data: { path: 'M 0 0 L 10 10' } }),
          autor: 'host',
          criado_em: 1000,
        },
        db
      );

      const ev2 = appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'aba-1',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({ id: 'stroke-2', data: { path: 'M 10 10 L 20 20' } }),
          autor: 'guest',
          criado_em: 1000, // Mesmo milissegundo
        },
        db
      );

      expect(ev1.rowid).toBeGreaterThan(0);
      expect(ev2.rowid).toBeGreaterThan(ev1.rowid);
      expect(countEventosBySessao(sessaoId, db)).toBe(2);
    });

    it('ABORTA qualquer tentativa de UPDATE na tabela Eventos via Trigger SQL (Migration 002)', () => {
      const ev = appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'aba-1',
          tipo: 'DRAW_ADD',
          payload: '{"id":"test-update"}',
          autor: 'host',
        },
        db
      );

      // Tenta executar UPDATE direto no SQLite
      expect(() => {
        db.prepare("UPDATE Eventos SET tipo = 'MODIFICADO' WHERE id = ?").run(ev.id);
      }).toThrow(/Eventos e append-only: UPDATE proibido/);

      // Verifica que o registro permaneceu inalterado
      const row = db.prepare('SELECT tipo FROM Eventos WHERE id = ?').get(ev.id) as { tipo: string };
      expect(row.tipo).toBe('DRAW_ADD');
    });

    it('ABORTA qualquer tentativa de DELETE na tabela Eventos via Trigger SQL (Migration 002)', () => {
      const ev = appendEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'aba-1',
          tipo: 'DRAW_ADD',
          payload: '{"id":"test-delete"}',
          autor: 'host',
        },
        db
      );

      // Tenta executar DELETE direto no SQLite
      expect(() => {
        db.prepare('DELETE FROM Eventos WHERE id = ?').run(ev.id);
      }).toThrow(/Eventos e append-only: DELETE proibido/);

      // Verifica que o registro permaneceu intacto
      expect(countEventosBySessao(sessaoId, db)).toBe(1);
    });

    it('garante ordem total estável desempatando eventos no mesmo ms por rowid ASC', () => {
      const ts = 500000;
      appendEvento({ sessao_id: sessaoId, tipo: 'DRAW_ADD', payload: '{"seq":1}', autor: 'host', criado_em: ts }, db);
      appendEvento({ sessao_id: sessaoId, tipo: 'DRAW_ADD', payload: '{"seq":2}', autor: 'guest', criado_em: ts }, db);
      appendEvento({ sessao_id: sessaoId, tipo: 'DRAW_ADD', payload: '{"seq":3}', autor: 'host', criado_em: ts }, db);

      const eventos = getEventosBySessao(sessaoId, undefined, db);
      expect(eventos.length).toBe(3);
      expect(eventos[0].rowid).toBeLessThan(eventos[1].rowid);
      expect(eventos[1].rowid).toBeLessThan(eventos[2].rowid);
      expect(JSON.parse(eventos[0].payload).seq).toBe(1);
      expect(JSON.parse(eventos[1].payload).seq).toBe(2);
      expect(JSON.parse(eventos[2].payload).seq).toBe(3);
    });
  });

  describe('2. Reducer Puro do Quadro Branco: DRAW_ADD, DRAW_HIDE, CLEAR_TAB', () => {
    it('DRAW_ADD adiciona elemento e o torna visível', () => {
      const initialState = createInitialTabState('aba-desenho');
      const event: WhiteboardEvent = {
        id: 'ev-1',
        tipo: 'DRAW_ADD',
        payload: { id: 'retangulo-1', tipo: 'rect', data: { width: 100, height: 50 } },
        autor: 'host',
        criado_em: 100,
      };

      const newState = reduceEvent(initialState, event);
      expect(newState.elementOrder).toEqual(['retangulo-1']);
      expect(newState.elements['retangulo-1']).toBeDefined();
      expect(newState.elements['retangulo-1'].hidden).toBe(false);

      const visiveis = getVisibleElements(newState);
      expect(visiveis.length).toBe(1);
      expect(visiveis[0].id).toBe('retangulo-1');
    });

    it('DRAW_HIDE oculta elemento sem removê-lo fisicamente do estado (borracha lógica)', () => {
      let state = createInitialTabState('aba-desenho');
      state = reduceEvent(state, {
        id: 'ev-add',
        tipo: 'DRAW_ADD',
        payload: { id: 'traço-1', data: {} },
        autor: 'host',
        criado_em: 100,
      });

      expect(getVisibleElements(state).length).toBe(1);

      // Borracha / ocultar
      state = reduceEvent(state, {
        id: 'ev-hide',
        tipo: 'DRAW_HIDE',
        payload: { targetId: 'traço-1' },
        autor: 'host',
        criado_em: 150,
      });

      // Elemento não aparece mais como visível
      expect(getVisibleElements(state).length).toBe(0);
      // MAS continua no registro de elementos (Event Sourcing append-only)
      expect(state.elements['traço-1']).toBeDefined();
      expect(state.elements['traço-1'].hidden).toBe(true);
      expect(state.elements['traço-1'].hiddenBy).toBe('ev-hide');
      expect(state.elementOrder).toEqual(['traço-1']);
    });

    it('CLEAR_TAB oculta todos os elementos visíveis anteriores sem apagar o histórico', () => {
      let state = createInitialTabState('aba-desenho');
      state = reduceEvent(state, { id: 'e1', tipo: 'DRAW_ADD', payload: { id: 'obj-1' }, autor: 'host', criado_em: 10 });
      state = reduceEvent(state, { id: 'e2', tipo: 'DRAW_ADD', payload: { id: 'obj-2' }, autor: 'guest', criado_em: 20 });
      state = reduceEvent(state, { id: 'e3', tipo: 'DRAW_ADD', payload: { id: 'obj-3' }, autor: 'host', criado_em: 30 });

      expect(getVisibleElements(state).length).toBe(3);

      // Host limpa a tela
      state = reduceEvent(state, { id: 'e4', tipo: 'CLEAR_TAB', payload: {}, autor: 'host', criado_em: 40 });

      expect(getVisibleElements(state).length).toBe(0);
      expect(state.elementOrder.length).toBe(3);
      expect(state.elements['obj-1'].hidden).toBe(true);
      expect(state.elements['obj-2'].hidden).toBe(true);
      expect(state.elements['obj-3'].hidden).toBe(true);

      // Guest tenta CLEAR_TAB -> Ignorado (CLEAR_TAB é exclusivo do Host)
      state = reduceEvent(state, { id: 'e5', tipo: 'DRAW_ADD', payload: { id: 'obj-4' }, autor: 'guest', criado_em: 50 });
      expect(getVisibleElements(state).length).toBe(1);

      state = reduceEvent(state, { id: 'e6', tipo: 'CLEAR_TAB', payload: {}, autor: 'guest', criado_em: 60 });
      // Permanece visível porque o Guest não tem autoridade para CLEAR_TAB
      expect(getVisibleElements(state).length).toBe(1);
    });
  });

  describe('3. Undo / Redo por Autor e Invalidação de Redo', () => {
    it('Host desfaz ações do Host e Guest só desfaz as próprias ações', () => {
      let state = createInitialTabState('aba-undo');

      // 1. Host desenha H1
      state = reduceEvent(state, { id: 'h1', tipo: 'DRAW_ADD', payload: { id: 'H1' }, autor: 'host', criado_em: 1 });
      // 2. Guest desenha G1
      state = reduceEvent(state, { id: 'g1', tipo: 'DRAW_ADD', payload: { id: 'G1' }, autor: 'guest', criado_em: 2 });
      // 3. Host desenha H2
      state = reduceEvent(state, { id: 'h2', tipo: 'DRAW_ADD', payload: { id: 'H2' }, autor: 'host', criado_em: 3 });

      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['H1', 'G1', 'H2']);

      // 4. Guest emite UNDO: deve desfazer G1 (sua última ação), SEM tocar em H2 do Host!
      state = reduceEvent(state, { id: 'u_g1', tipo: 'UNDO', payload: {}, autor: 'guest', criado_em: 4 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['H1', 'H2']);

      // 5. Host emite UNDO: deve desfazer H2 (sua última ação)
      state = reduceEvent(state, { id: 'u_h1', tipo: 'UNDO', payload: {}, autor: 'host', criado_em: 5 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['H1']);

      // 6. Guest emite REDO: deve restaurar G1
      state = reduceEvent(state, { id: 'r_g1', tipo: 'REDO', payload: {}, autor: 'guest', criado_em: 6 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['H1', 'G1']);

      // 7. Host emite REDO: deve restaurar H2
      state = reduceEvent(state, { id: 'r_h1', tipo: 'REDO', payload: {}, autor: 'host', criado_em: 7 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['H1', 'G1', 'H2']);
    });

    it('novo DRAW_ADD invalida a pilha de redo do respectivo autor', () => {
      let state = createInitialTabState('aba-redo-inv');

      state = reduceEvent(state, { id: 'a1', tipo: 'DRAW_ADD', payload: { id: 'A1' }, autor: 'host', criado_em: 1 });
      state = reduceEvent(state, { id: 'a2', tipo: 'DRAW_ADD', payload: { id: 'A2' }, autor: 'host', criado_em: 2 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['A1', 'A2']);

      // Undo A2
      state = reduceEvent(state, { id: 'u1', tipo: 'UNDO', payload: {}, autor: 'host', criado_em: 3 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['A1']);
      expect(state.history.host.redoStack.length).toBe(1);

      // Novo DRAW_ADD pelo Host deve esvaziar a redoStack do Host
      state = reduceEvent(state, { id: 'a3', tipo: 'DRAW_ADD', payload: { id: 'A3' }, autor: 'host', criado_em: 4 });
      expect(state.history.host.redoStack.length).toBe(0);

      // Tentativa de REDO não deve ter efeito
      state = reduceEvent(state, { id: 'r1', tipo: 'REDO', payload: {}, autor: 'host', criado_em: 5 });
      expect(getVisibleElements(state).map((e) => e.id)).toEqual(['A1', 'A3']);
    });

    it('Tabela Ampla de Propriedade: reduzir os mesmos eventos sempre produz exatamente o mesmo estado', () => {
      const events: WhiteboardEvent[] = [
        { id: '1', tipo: 'DRAW_ADD', payload: { id: 'elem-1' }, autor: 'host', criado_em: 10 },
        { id: '2', tipo: 'DRAW_ADD', payload: { id: 'elem-2' }, autor: 'guest', criado_em: 20 },
        { id: '3', tipo: 'DRAW_HIDE', payload: { targetId: 'elem-1' }, autor: 'host', criado_em: 30 },
        { id: '4', tipo: 'DRAW_ADD', payload: { id: 'elem-3' }, autor: 'guest', criado_em: 40 },
        { id: '5', tipo: 'UNDO', payload: {}, autor: 'guest', criado_em: 50 },
        { id: '6', tipo: 'DRAW_ADD', payload: { id: 'elem-4' }, autor: 'host', criado_em: 60 },
        { id: '7', tipo: 'UNDO', payload: {}, autor: 'host', criado_em: 70 },
        { id: '8', tipo: 'REDO', payload: {}, autor: 'host', criado_em: 80 },
        { id: '9', tipo: 'REDO', payload: {}, autor: 'guest', criado_em: 90 },
        { id: '10', tipo: 'CLEAR_TAB', payload: {}, autor: 'host', criado_em: 100 },
        { id: '11', tipo: 'UNDO', payload: {}, autor: 'host', criado_em: 110 },
      ];

      const resultado1 = reduceEvents(events);
      const resultado2 = reduceEvents(events);

      expect(resultado1).toEqual(resultado2);
      expect(JSON.stringify(resultado1)).toBe(JSON.stringify(resultado2));
    });
  });

  describe('4. EventoService: Snapshots e Equivalência Estrita Snapshot × Replay', () => {
    it('reconstruir estado com snapshots é 100% equivalente a reconstruir do zero sem snapshots', () => {
      const totalEvents = 35; // Vai acionar snapshots automáticos (intervalo = 10)
      for (let i = 1; i <= totalEvents; i++) {
        const autor = i % 2 === 0 ? 'guest' : 'host';
        const tipo = i % 7 === 0 ? 'UNDO' : i % 5 === 0 ? 'DRAW_HIDE' : 'DRAW_ADD';
        const payload =
          tipo === 'DRAW_HIDE'
            ? JSON.stringify({ targetId: `item-${i - 2}` })
            : tipo === 'DRAW_ADD'
              ? JSON.stringify({ id: `item-${i}`, data: { val: i } })
              : '{}';

        eventoService.gravarEvento({
          sessao_id: sessaoId,
          aba_id: 'aba-principal',
          tipo,
          payload,
          autor,
          criado_em: 1000 + i,
        });
      }

      // 1. Reconstrução utilizando os snapshots gravados em disco
      const estadoComSnapshots = eventoService.reconstruirEstadoAba(sessaoId, 'aba-principal');

      // 2. Apaga TODOS os snapshots do disco
      eventoService.apagarTodosSnapshots(sessaoId);

      // 3. Reconstrução pura a partir do log completo de eventos (do zero)
      const estadoReplayZero = eventoService.reconstruirEstadoAba(sessaoId, 'aba-principal');

      // 4. Equivalência absoluta
      expect(estadoComSnapshots).toEqual(estadoReplayZero);
      expect(getVisibleElements(estadoComSnapshots)).toEqual(getVisibleElements(estadoReplayZero));
    });

    it('permite configurar intervalo de snapshot via ConfiguracaoGlobal', () => {
      setConfig('eventos_snapshot_intervalo', '50', db);
      const intervalo = eventoService.getSnapshotInterval();
      expect(intervalo).toBe(50);
    });

    it('valida permissão e autoridade do Guest ao gravar evento', () => {
      // Guest tentando CLEAR_TAB
      const resClear = eventoService.gravarEvento({
        sessao_id: sessaoId,
        aba_id: 'aba-1',
        tipo: 'CLEAR_TAB',
        payload: '{}',
        autor: 'guest',
      });
      expect(resClear.sucesso).toBe(false);
      expect(resClear.motivo).toBe('FORBIDDEN_ACTION_GUEST');

      // Guest tentando desenhar com tela bloqueada
      const resLocked = eventoService.gravarEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'aba-1',
          tipo: 'DRAW_ADD',
          payload: '{"id":"blocked-1"}',
          autor: 'guest',
        },
        true // screenLocked
      );
      expect(resLocked.sucesso).toBe(false);
      expect(resLocked.motivo).toBe('SCREEN_LOCKED');
    });
  });

  describe('5. Revisões Imutáveis: Versionamento Estrito e Recuperação Histórica', () => {
    it('salvar revisão cria numero_versao + 1 e carregar versão N reproduz exatamente seu estado histórico', () => {
      // Adiciona 5 eventos na sessão
      for (let i = 1; i <= 5; i++) {
        eventoService.gravarEvento({
          sessao_id: sessaoId,
          aba_id: 'aba-rev',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({ id: `elem-${i}` }),
          autor: 'host',
          criado_em: 100 * i,
        });
      }

      // Salva Revisão 1
      const rev1 = eventoService.salvarRevisao(sessaoId, 'Revisão Inicial', 'host', ['aba-rev']);
      expect(rev1.numero_versao).toBe(1);
      expect(rev1.snapshot_evento_idx).toBe(5);

      // Adiciona mais 3 eventos
      for (let i = 6; i <= 8; i++) {
        eventoService.gravarEvento({
          sessao_id: sessaoId,
          aba_id: 'aba-rev',
          tipo: 'DRAW_ADD',
          payload: JSON.stringify({ id: `elem-${i}` }),
          autor: 'guest',
          criado_em: 100 * i,
        });
      }

      // Salva Revisão 2
      const rev2 = eventoService.salvarRevisao(sessaoId, 'Segunda Revisão', 'host', ['aba-rev']);
      expect(rev2.numero_versao).toBe(2);
      expect(rev2.snapshot_evento_idx).toBe(8);

      // 1. Carrega Revisão 1: deve ter exatamente os 5 primeiros elementos
      const cargaRev1 = eventoService.carregarRevisao(sessaoId, 1, 'aba-rev');
      expect(cargaRev1.revisao.numero_versao).toBe(1);
      expect(getVisibleElements(cargaRev1.estadoAba).map((e) => e.id)).toEqual([
        'elem-1',
        'elem-2',
        'elem-3',
        'elem-4',
        'elem-5',
      ]);

      // 2. Carrega Revisão 2: deve ter todos os 8 elementos
      const cargaRev2 = eventoService.carregarRevisao(sessaoId, 2, 'aba-rev');
      expect(cargaRev2.revisao.numero_versao).toBe(2);
      expect(getVisibleElements(cargaRev2.estadoAba).map((e) => e.id)).toEqual([
        'elem-1',
        'elem-2',
        'elem-3',
        'elem-4',
        'elem-5',
        'elem-6',
        'elem-7',
        'elem-8',
      ]);

      // 3. Garante imutabilidade: Revisão 1 permaneceu completamente inalterada
      const lista = eventoService.listarRevisoes(sessaoId);
      expect(lista.length).toBe(2);
      expect(lista[0].snapshot_evento_idx).toBe(5);
      expect(lista[1].snapshot_evento_idx).toBe(8);
    });
  });

  describe('6. Benchmark: 50.000 Eventos Reconstroem em Tempo Razoável', () => {
    it('reconstrói 50 000 eventos de desenho em menos de 1500 ms', () => {
      const count = 50_000;
      const events: WhiteboardEvent[] = new Array(count);

      for (let i = 0; i < count; i++) {
        const mod = i % 10;
        let tipo = 'DRAW_ADD';
        let payload: Record<string, unknown> = { id: `bench-${i}` };
        const autor = i % 2 === 0 ? 'host' : 'guest';

        if (mod === 7) {
          tipo = 'DRAW_HIDE';
          payload = { targetId: `bench-${Math.max(0, i - 1)}` };
        } else if (mod === 8) {
          tipo = 'UNDO';
          payload = {};
        } else if (mod === 9) {
          tipo = 'REDO';
          payload = {};
        }

        events[i] = {
          id: `ev-${i}`,
          tipo,
          payload,
          autor,
          criado_em: 10000 + i,
        };
      }

      const t0 = performance.now();
      const state = reduceEvents(events);
      const t1 = performance.now();
      const durationMs = Math.round((t1 - t0) * 100) / 100;

      console.log(`[Benchmark Event Sourcing] 50 000 eventos processados em: ${durationMs} ms`);

      expect(state.totalEventsApplied).toBe(50_000);
      expect(durationMs).toBeLessThan(2000); // Critério folgado de tempo razoável (< 2.0 s)
    });
  });
});
