// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { WhiteboardEngine } from '../src/shared/canvas/engine';
import {
  TabState,
  createInitialTabState,
  reduceEvent,
  getVisibleElements,
  WhiteboardEvent,
} from '../src/shared/events/reducer';
import { useHostStore } from '../src/host/store/useHostStore';
import type { SessaoDTO } from '../src/shared/ipc-contract';

// Mock do contexto 2D para ambiente JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (this: any, contextType: string) {
    if (contextType === '2d') {
      return {
        canvas: this,
        save: () => {},
        restore: () => {},
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        measureText: (text: string) => ({
          width: text.length * 10,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }),
        font: '10px sans-serif',
        textAlign: 'left',
        textBaseline: 'top',
        direction: 'ltr',
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        fillText: () => {},
        strokeText: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(400) }),
        putImageData: () => {},
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as any;

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  };
}

describe('D16 — Rever, em modo leitura, o quadro de uma sessão encerrada (Engine e Store)', () => {
  let canvasEl: HTMLCanvasElement;
  let emittedEvents: WhiteboardEvent[];

  beforeEach(() => {
    canvasEl = document.createElement('canvas');
    canvasEl.width = 1200;
    canvasEl.height = 800;
    document.body.appendChild(canvasEl);
    emittedEvents = [];
  });

  describe('D16.2 — Motor WhiteboardEngine em Modo Somente Leitura', () => {
    it('inicializa engine com readOnly = true e bloqueia modo de desenho interativo', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
        onEmitEvent: (ev) => emittedEvents.push(ev),
      });

      expect(engine.readOnly).toBe(true);
      expect(engine.activeTool).toBe('select');
      expect(engine.canvas.isDrawingMode).toBe(false);
      expect(engine.canvas.selection).toBe(false);
      expect(engine.canvas.skipTargetFind).toBe(true);

      engine.dispose();
    });

    it('rejeita troca para ferramentas de desenho e preserva ferramenta select', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
        onEmitEvent: (ev) => emittedEvents.push(ev),
      });

      const ferramentas = [
        'pencil',
        'brush',
        'rectangle',
        'ellipse',
        'line',
        'arrow',
        'text',
        'eraser',
        'object_eraser',
      ] as const;

      for (const f of ferramentas) {
        engine.setTool(f);
        expect(engine.activeTool).toBe('select');
        expect(engine.canvas.isDrawingMode).toBe(false);
        expect(engine.canvas.selection).toBe(false);
        expect(engine.canvas.skipTargetFind).toBe(true);
      }

      engine.dispose();
    });

    it('bloqueia emissão de eventos em clearTab, undo e redo', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
        onEmitEvent: (ev) => emittedEvents.push(ev),
      });

      engine.clearTab();
      engine.undo();
      engine.redo();

      expect(emittedEvents.length).toBe(0);

      engine.dispose();
    });

    it('ignora cliques e arrastos do mouse sem emitir nenhum evento', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
        onEmitEvent: (ev) => emittedEvents.push(ev),
      });

      // Simula mousedown, mousemove e mouseup
      engine.canvas.fire('mouse:down', {
        e: { clientX: 200, clientY: 200, buttons: 1 },
      } as any);
      engine.canvas.fire('mouse:move', {
        e: { clientX: 300, clientY: 300, buttons: 1 },
      } as any);
      engine.canvas.fire('mouse:up', {
        e: { clientX: 300, clientY: 300 },
      } as any);

      expect(emittedEvents.length).toBe(0);

      engine.dispose();
    });

    it('renderState projeta elementos existentes como estritamente não-selecionáveis e não-editáveis', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
        onEmitEvent: (ev) => emittedEvents.push(ev),
      });

      let state: TabState = createInitialTabState('default');
      state = reduceEvent(state, {
        id: 'ev-rect-01',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: Date.now(),
        payload: {
          id: 'rect-01',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 60, stroke: '#0284c7' },
        },
      });
      state = reduceEvent(state, {
        id: 'ev-text-01',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: Date.now(),
        payload: {
          id: 'text-01',
          tipo: 'text',
          data: { left: 250, top: 200, text: 'Quadro Final', fill: '#0284c7', fontSize: 24 },
        },
      });

      engine.renderState(state);

      const objects = engine.canvas.getObjects();
      expect(objects.length).toBe(2);

      for (const obj of objects) {
        expect(obj.selectable).toBe(false);
        expect(obj.evented).toBe(false);
        expect(obj.lockMovementX).toBe(true);
        expect(obj.lockMovementY).toBe(true);
        expect(obj.hasControls).toBe(false);
      }

      engine.dispose();
    });

    it('Exportar PNG (toDataURL) funciona normalmente no modo somente leitura', () => {
      const engine = new WhiteboardEngine(canvasEl, {
        somenteLeitura: true,
      });

      const dataUrl = engine.toDataURL({ multiplier: 1.5 });
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png')).toBe(true);

      engine.dispose();
    });
  });

  describe('D16.2 & D16.3 — useHostStore em Modo Somente Leitura', () => {
    it('abrirQuadroSessao ativa quadroSomenteLeitura quando a sessão estiver encerrada', async () => {
      const sessaoEncerrada: SessaoDTO = {
        id: 'sessao-encerrada-123',
        atendido_id: 'atendido-01',
        titulo: 'Consulta Encerrada',
        status: 'encerrada',
        iniciado_em: Date.now() - 3600000,
        encerrado_em: Date.now() - 1800000,
        notas_host: 'Atendimento finalizado com sucesso',
      };

      useHostStore.setState({
        sessoes: [sessaoEncerrada],
        quadroSomenteLeitura: false,
        activeSessaoId: null,
      });

      await useHostStore.getState().abrirQuadroSessao('sessao-encerrada-123');

      const state = useHostStore.getState();
      expect(state.activeSessaoId).toBe('sessao-encerrada-123');
      expect(state.quadroSomenteLeitura).toBe(true);
      expect(state.view).toBe('quadro');
    });

    it('abrirQuadroSessao com opção explícita somenteLeitura ativa quadroSomenteLeitura', async () => {
      const sessaoAtiva: SessaoDTO = {
        id: 'sessao-ativa-456',
        atendido_id: 'atendido-01',
        titulo: 'Consulta Aberta',
        status: 'ativa',
        iniciado_em: Date.now(),
        encerrado_em: null,
        notas_host: null,
      };

      useHostStore.setState({
        sessoes: [sessaoAtiva],
        quadroSomenteLeitura: false,
      });

      await useHostStore.getState().abrirQuadroSessao('sessao-ativa-456', { somenteLeitura: true });

      const state = useHostStore.getState();
      expect(state.quadroSomenteLeitura).toBe(true);
    });

    it('abrirQuadroSessao com sessão ativa sem opção somenteLeitura mantém quadroSomenteLeitura = false', async () => {
      const sessaoAtiva: SessaoDTO = {
        id: 'sessao-ativa-789',
        atendido_id: 'atendido-01',
        titulo: 'Consulta Ativa',
        status: 'ativa',
        iniciado_em: Date.now(),
        encerrado_em: null,
        notas_host: null,
      };

      useHostStore.setState({
        sessoes: [sessaoAtiva],
        quadroSomenteLeitura: true, // anterior
      });

      await useHostStore.getState().abrirQuadroSessao('sessao-ativa-789');

      const state = useHostStore.getState();
      expect(state.quadroSomenteLeitura).toBe(false);
    });

    it('no modo somente leitura, ações que geram eventos (aplicar, desfazer, refazer, limpar) são ignoradas', async () => {
      let chamouGravarIPC = false;
      (window as any).desktopAPI = {
        eventos: {
          gravar: async () => {
            chamouGravarIPC = true;
            return { success: true };
          },
        },
      };

      useHostStore.setState({
        quadroSomenteLeitura: true,
        activeSessaoId: 'sessao-fechada-999',
        activeAbaId: 'default',
        tabState: createInitialTabState('default'),
      });

      // 1. Tenta aplicar evento novo
      await useHostStore.getState().aplicarEventoQuadro({
        id: 'ev-proibido-01',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: Date.now(),
        payload: { id: 'x', tipo: 'pencil', data: {} },
      });

      // 2. Tenta desfazer
      await useHostStore.getState().desfazerQuadro();

      // 3. Tenta refazer
      await useHostStore.getState().refazerQuadro();

      // 4. Tenta limpar
      await useHostStore.getState().limparQuadro();

      expect(chamouGravarIPC).toBe(false);
      expect(getVisibleElements(useHostStore.getState().tabState).length).toBe(0);
    });
  });
});
