// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WhiteboardEngine,
  WhiteboardTool,
  ERASER_CURSOR,
  setArrastoNoModoSelecaoHabilitado,
} from '../src/shared/canvas/engine';
import {
  createInitialTabState,
  reduceEvent,
  WhiteboardEvent,
} from '../src/shared/events/reducer';

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
        setLineDash: () => {},
        getLineDash: () => [],
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as any;
}

describe('Fase 11 — Quadro com sensação de Paint (P1..P7)', () => {
  let canvasEl: HTMLCanvasElement;
  let engine: WhiteboardEngine;
  let emittedEvents: WhiteboardEvent[];
  let lastToolChanged: WhiteboardTool | null = null;

  beforeEach(() => {
    setArrastoNoModoSelecaoHabilitado(false);
    canvasEl = document.createElement('canvas');
    canvasEl.width = 1200;
    canvasEl.height = 800;
    document.body.appendChild(canvasEl);

    emittedEvents = [];
    lastToolChanged = null;
    engine = new WhiteboardEngine(canvasEl, {
      autor: 'host',
      sessaoId: 'sess-paint-test',
      abaId: 'aba-paint',
      onEmitEvent: (ev) => {
        emittedEvents.push(ev);
      },
      onToolChange: (tool) => {
        lastToolChanged = tool;
      },
    });
    engine.setDimensions(1200, 800);
  });

  afterEach(() => {
    setArrastoNoModoSelecaoHabilitado(false);
    engine.dispose();
    if (canvasEl.parentNode) {
      canvasEl.parentNode.removeChild(canvasEl);
    }
  });

  describe('P2 — Texto permanece em text após confirmar ou descartar', () => {
    it('após confirmar texto digitado, a ferramenta ativa continua text e notifica onToolChange', () => {
      engine.setTool('text');
      expect(engine.activeTool).toBe('text');

      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 200, clientY: 200 },
        clientX: 200,
        clientY: 200,
      });

      const activeText = engine.canvas.getActiveObject() as any;
      expect(activeText).toBeTruthy();
      activeText.text = 'Texto Paint';
      activeText.exitEditing();

      expect(engine.activeTool).toBe('text');
      expect(lastToolChanged).toBe('text');
      const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
      expect(drawAdds.length).toBe(1);
      expect((drawAdds[0].payload as any).data.angle).toBe(0);
    });

    it('após descartar texto vazio, a ferramenta ativa continua text', () => {
      engine.setTool('text');
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 250, clientY: 250 },
        clientX: 250,
        clientY: 250,
      });

      const activeText = engine.canvas.getActiveObject() as any;
      expect(activeText).toBeTruthy();
      activeText.exitEditing();

      expect(engine.activeTool).toBe('text');
      expect(lastToolChanged).toBe('text');
      expect(emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD').length).toBe(0);
    });

    it('clicar fora de texto em edição confirma o texto atual e NÃO cria outro no mesmo clique', () => {
      engine.setTool('text');
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 100, clientY: 100 },
        clientX: 100,
        clientY: 100,
      });

      const activeText = engine.canvas.getActiveObject() as any;
      activeText.text = 'Texto Unico';

      // Clique fora longe do texto
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 700, clientY: 700 },
        clientX: 700,
        clientY: 700,
      });

      // Confirmou o texto
      expect(emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD').length).toBe(1);
      // Nenhum segundo objeto em edição foi criado
      expect(engine.canvas.getActiveObject()).toBeFalsy();
      expect(engine.activeTool).toBe('text');
    });
  });

  describe('P3 — Texto sem alças de objeto e sem rotação', () => {
    it('texto em edição não possui alças de controle (hasControls = false) nem rotação (hasRotatingPoint = false)', () => {
      engine.setTool('text');
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 150, clientY: 150 },
        clientX: 150,
        clientY: 150,
      });

      const activeText = engine.canvas.getActiveObject() as any;
      expect(activeText).toBeTruthy();
      expect(activeText.hasControls).toBe(false);
      expect(activeText.hasRotatingPoint).toBe(false);
      expect(activeText.hasBorders).toBe(true);
      expect(activeText.borderColor).toBe('#0284c7');
    });

    it('texto já gravado e renderizado via renderState nasce sem alças e sem bordas', () => {
      let state = createInitialTabState('aba-paint');
      state = reduceEvent(state, {
        id: 'ev-text-old',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'text-old-1',
          tipo: 'text',
          data: { text: 'Texto Salvo Antigo', left: 200, top: 200, fontSize: 24, hasControls: true },
        },
      });
      engine.renderState(state);

      const obj = engine.canvas.getObjects().find((o) => (o as any).elementId === 'text-old-1') as any;
      expect(obj).toBeTruthy();
      expect(obj.hasControls).toBe(false);
      expect(obj.hasRotatingPoint).toBe(false);
      expect(obj.hasBorders).toBe(false);
      expect(obj.selectable).toBe(false);
    });
  });

  describe('P4 — Borracha (Objeto/Traço inteiro) e cursores', () => {
    it('cursor de borracha (ERASER_CURSOR) está configurado em eraser e object_eraser', () => {
      engine.setTool('eraser');
      expect(engine.canvas.defaultCursor).toBe(ERASER_CURSOR);
      expect(engine.canvas.hoverCursor).toBe(ERASER_CURSOR);
      expect(engine.canvas.freeDrawingCursor).toBe(ERASER_CURSOR);

      engine.setTool('object_eraser');
      expect(engine.canvas.defaultCursor).toBe(ERASER_CURSOR);
      expect(engine.canvas.hoverCursor).toBe(ERASER_CURSOR);
      expect(engine.canvas.moveCursor).toBe(ERASER_CURSOR);
    });

    it('hoverCursor e moveCursor nunca são "move" nem "not-allowed" em nenhuma ferramenta', () => {
      const allTools: WhiteboardTool[] = [
        'pencil',
        'brush',
        'rectangle',
        'ellipse',
        'line',
        'arrow',
        'text',
        'eraser',
        'object_eraser',
      ];

      for (const tool of allTools) {
        engine.setTool(tool);
        expect(engine.canvas.hoverCursor).not.toBe('move');
        expect(engine.canvas.hoverCursor).not.toBe('not-allowed');
        expect(engine.canvas.moveCursor).not.toBe('move');
        expect(engine.canvas.moveCursor).not.toBe('not-allowed');
      }
    });

    it('clicar com Borracha (Traço inteiro) apaga o elemento mantendo getActiveObject() estritamente null', () => {
      let state = createInitialTabState('aba-paint');
      state = reduceEvent(state, {
        id: 'ev-rect-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-target-1',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 60, stroke: '#0284c7' },
        },
      });
      engine.renderState(state);

      const rectObj = engine.canvas.getObjects().find((o) => (o as any).elementId === 'rect-target-1')!;
      expect(rectObj).toBeTruthy();

      engine.setTool('object_eraser');
      expect(engine.canvas.getActiveObject()).toBeFalsy();

      // Clica sobre o objeto com object_eraser
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 120, clientY: 120, buttons: 1 },
        target: rectObj,
      });

      expect(engine.canvas.getActiveObject()).toBeFalsy();
      const hideEvents = emittedEvents.filter((ev) => ev.tipo === 'DRAW_HIDE');
      expect(hideEvents.length).toBe(1);
      expect((hideEvents[0].payload as any).elementId).toBe('rect-target-1');
    });
  });

  describe('P5 — Nenhuma moldura e nenhum movimento de elemento pré-existente (9 ferramentas)', () => {
    const ferramentas: WhiteboardTool[] = [
      'pencil',
      'brush',
      'rectangle',
      'ellipse',
      'line',
      'arrow',
      'text',
      'eraser',
      'object_eraser',
    ];

    for (const tool of ferramentas) {
      it(`ferramenta "${tool}" iniciando gesto sobre elemento existente não move o objeto e não exibe moldura`, () => {
        let state = createInitialTabState('aba-paint');
        state = reduceEvent(state, {
          id: `ev-rect-${tool}`,
          tipo: 'DRAW_ADD',
          autor: 'host',
          criado_em: 1000,
          payload: {
            id: `rect-base-${tool}`,
            tipo: 'rect',
            data: { left: 100, top: 100, width: 100, height: 80, stroke: '#0284c7' },
          },
        });
        engine.renderState(state);

        const baseRect = engine.canvas.getObjects().find((o) => (o as any).elementId === `rect-base-${tool}`)!;
        expect(baseRect.left).toBe(100);
        expect(baseRect.top).toBe(100);
        expect(baseRect.selectable).toBe(false);
        expect(baseRect.hasControls).toBe(false);

        engine.setTool(tool);

        // Gesto sobre o elemento existente (120, 120)
        (engine.canvas as any).fire('mouse:down', {
          e: { clientX: 120, clientY: 120, buttons: 1 },
          clientX: 120,
          clientY: 120,
          target: baseRect,
        });

        // O elemento base NÃO se tornou ativo (se for text, o ativo é o novo IText em edição, nunca baseRect)
        if (tool === 'text') {
          const active = engine.canvas.getActiveObject();
          expect(active).not.toBe(baseRect);
        } else {
          expect(engine.canvas.getActiveObject()).toBeFalsy();
        }

        // Posição do elemento original intacta
        expect(baseRect.left).toBe(100);
        expect(baseRect.top).toBe(100);
      });
    }
  });

  describe('P7.5 — Ataque à própria entrega (Testes Adversariais Mandatórios)', () => {
    it('[ATAQUE-1] Duplo clique sobre texto antigo com ferramenta Texto NÃO abre edição nem mostra controles', () => {
      let state = createInitialTabState('aba-paint');
      state = reduceEvent(state, {
        id: 'ev-text-old-2',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'text-old-2',
          tipo: 'text',
          data: { text: 'Texto Imutável', left: 150, top: 150, fontSize: 24 },
        },
      });
      engine.renderState(state);

      const oldText = engine.canvas.getObjects().find((o) => (o as any).elementId === 'text-old-2') as any;
      expect(oldText).toBeTruthy();

      engine.setTool('text');

      // Simula duplo clique no objeto antigo
      if (typeof oldText.doubleClick === 'function') {
        oldText.doubleClick({ e: {} });
      }
      (engine.canvas as any).fire('mouse:dblclick', { target: oldText });

      expect(oldText.isEditing).toBeFalsy();
      expect(oldText.hasControls).toBe(false);
      expect(oldText.selectable).toBe(false);
    });

    it('[ATAQUE-2] Arrastar Borracha (Traço inteiro) atravessando 3 elementos apaga todos com getActiveObject() estritamente null', () => {
      let state = createInitialTabState('aba-paint');
      for (let i = 1; i <= 3; i++) {
        state = reduceEvent(state, {
          id: `ev-elem-${i}`,
          tipo: 'DRAW_ADD',
          autor: 'host',
          criado_em: 1000 + i,
          payload: {
            id: `elem-${i}`,
            tipo: 'rect',
            data: { left: i * 80, top: 100, width: 50, height: 50 },
          },
        });
      }
      engine.renderState(state);
      expect(engine.canvas.getObjects().length).toBe(3);

      engine.setTool('object_eraser');

      // Simula arraste atravessando os 3 elementos
      const objs = engine.canvas.getObjects().slice();
      for (const obj of objs) {
        (engine.canvas as any).fire('mouse:move', {
          e: { buttons: 1, clientX: (obj as any).left + 10, clientY: 110 },
          target: obj,
        });
        expect(engine.canvas.getActiveObject()).toBeFalsy();
      }

      const hideEvents = emittedEvents.filter((ev) => ev.tipo === 'DRAW_HIDE');
      expect(hideEvents.length).toBe(3);
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });

    it('[ATAQUE-3] Trocar de ferramenta no meio de um texto em edição comita o texto e adota a nova ferramenta', () => {
      engine.setTool('text');
      (engine.canvas as any).fire('mouse:down', {
        e: { clientX: 200, clientY: 200 },
        clientX: 200,
        clientY: 200,
      });

      const activeText = engine.canvas.getActiveObject() as any;
      activeText.text = 'Texto Interrompido';

      // Usuário comuta repentinamente para 'rectangle'
      engine.setTool('rectangle');

      const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
      expect(drawAdds.length).toBe(1);
      expect((drawAdds[0].payload as any).data.text).toBe('Texto Interrompido');
      expect(engine.activeTool).toBe('rectangle');
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });

    it('[ATAQUE-4] Trocar de aba com ferramenta Texto ativa mantém estado consistente e sem seleção espúria', () => {
      engine.setTool('text');
      expect(engine.activeTool).toBe('text');

      // Troca de aba renderizando novo estado
      const stateAba2 = createInitialTabState('aba-2');
      engine.renderState(stateAba2);

      expect(engine.activeTool).toBe('text');
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });

    it('[ATAQUE-5] Tentativa de ativação de seleção fora do modo select é imediatamente descartada', () => {
      let state = createInitialTabState('aba-paint');
      state = reduceEvent(state, {
        id: 'ev-rect-trap',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-trap',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 60 },
        },
      });
      engine.renderState(state);

      engine.setTool('pencil');
      const obj = engine.canvas.getObjects()[0];

      // Dispara seleção forçada
      engine.canvas.setActiveObject(obj);
      engine.canvas.fire('selection:created', { selected: [obj], target: obj } as any);

      // Deve ter descartado imediatamente
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });

    it('[ATAQUE-6] Regressão D15: com ARRASTO_NO_MODO_SELECAO_HABILITADO = true, arrastar no modo select volta a mover', () => {
      setArrastoNoModoSelecaoHabilitado(true);

      let state = createInitialTabState('aba-paint');
      state = reduceEvent(state, {
        id: 'ev-rect-d15',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-d15',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 60 },
        },
      });
      engine.renderState(state);

      engine.setTool('select');
      const obj = engine.canvas.getObjects()[0];
      engine.canvas.setActiveObject(obj);
      engine.canvas.fire('selection:created', { selected: [obj], target: obj } as any);

      expect(obj.selectable).toBe(true);
      expect(obj.hasControls).toBe(true);
      expect(obj.lockMovementX).toBe(false);
      expect(obj.lockMovementY).toBe(false);
    });
  });
});
