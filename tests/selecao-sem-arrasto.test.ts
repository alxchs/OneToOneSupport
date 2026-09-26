// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WhiteboardEngine,
  ARRASTO_NO_MODO_SELECAO_HABILITADO,
  setArrastoNoModoSelecaoHabilitado,
} from '../src/shared/canvas/engine';
import {
  createInitialTabState,
  reduceEvent,
  WhiteboardEvent,
} from '../src/shared/events/reducer';
import { ActiveSelection } from 'fabric';

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
}

describe('D15 — Seleção seleciona, mas não arrasta (código preservado para voltar depois)', () => {
  let canvasEl: HTMLCanvasElement;
  let engine: WhiteboardEngine;
  let emittedEvents: WhiteboardEvent[];

  beforeEach(() => {
    // Garante valor padrão da constante desligado
    setArrastoNoModoSelecaoHabilitado(false);

    canvasEl = document.createElement('canvas');
    canvasEl.width = 1200;
    canvasEl.height = 800;
    document.body.appendChild(canvasEl);
    emittedEvents = [];
    engine = new WhiteboardEngine(canvasEl, {
      autor: 'host',
      sessaoId: 'sessao-test',
      abaId: 'aba-test',
      onEmitEvent: (ev) => emittedEvents.push(ev),
    });
  });

  afterEach(() => {
    // Restabelece valor padrão da constante
    setArrastoNoModoSelecaoHabilitado(false);
    engine.dispose();
    if (canvasEl.parentElement) {
      canvasEl.parentElement.removeChild(canvasEl);
    }
  });

  describe('D15.1 — Comportamento com constante false (padrão): Seleciona com feedback visual, mas NÃO arrasta, gira ou redimensiona', () => {
    it('a constante exportada ARRASTO_NO_MODO_SELECAO_HABILITADO nasce estritamente como false', () => {
      expect(ARRASTO_NO_MODO_SELECAO_HABILITADO).toBe(false);
      expect(engine.arrastoHabilitado).toBe(false);
    });

    it('ao selecionar um objeto (rect), ele é selecionado com feedback visual, mas travas de movimento, escala e rotação são ativadas e controles ocultados', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-1',
          tipo: 'rect',
          data: { left: 150, top: 200, width: 100, height: 80, stroke: '#0284c7' },
        },
      });
      engine.renderState(state);

      const obj = engine.canvas.getObjects()[0];
      expect(obj).toBeDefined();

      engine.setTool('select');
      expect(engine.canvas.skipTargetFind).toBe(false);
      expect(engine.canvas.selection).toBe(true);

      // Clica para selecionar o objeto
      engine.canvas.setActiveObject(obj);
      engine.canvas.fire('selection:created', { selected: [obj], target: obj } as any);

      // Feedback visual de seleção continua
      expect(obj.selectable).toBe(true);
      expect(obj.hasBorders).toBe(true);

      // Travas de arraste e manipulação estritamente aplicadas (D15.1)
      expect(obj.lockMovementX).toBe(true);
      expect(obj.lockMovementY).toBe(true);
      expect(obj.lockRotation).toBe(true);
      expect(obj.lockScalingX).toBe(true);
      expect(obj.lockScalingY).toBe(true);
      expect(obj.hasControls).toBe(false);
    });

    it('matriz de 5 tipos de objetos: todos recebem travas completas ao entrar no modo de seleção', () => {
      const tipos = [
        {
          id: 'obj-rect',
          tipo: 'rect',
          data: { left: 50, top: 50, width: 60, height: 40 },
        },
        {
          id: 'obj-ellipse',
          tipo: 'ellipse',
          data: { left: 150, top: 50, rx: 30, ry: 20 },
        },
        {
          id: 'obj-line',
          tipo: 'line',
          data: { points: [250, 50, 320, 90], stroke: '#0284c7' },
        },
        {
          id: 'obj-text',
          tipo: 'text',
          data: { left: 350, top: 50, text: 'Anotação', fontSize: 20 },
        },
        {
          id: 'obj-path',
          tipo: 'path',
          data: {
            path: [
              ['M', 450, 50],
              ['L', 500, 90],
            ],
            left: 450,
            top: 50,
          },
        },
      ];

      let state = createInitialTabState('aba-test');
      for (const t of tipos) {
        state = reduceEvent(state, {
          id: `ev-${t.id}`,
          tipo: 'DRAW_ADD',
          autor: 'host',
          criado_em: 1000,
          payload: { id: t.id, tipo: t.tipo, data: t.data },
        });
      }
      engine.renderState(state);
      engine.setTool('select');

      const objects = engine.canvas.getObjects();
      expect(objects.length).toBe(5);

      for (const obj of objects) {
        engine.canvas.setActiveObject(obj);
        engine.canvas.fire('selection:updated', { selected: [obj], deselected: [], target: obj } as any);

        expect(obj.selectable).toBe(true);
        expect(obj.hasBorders).toBe(true);
        expect(obj.lockMovementX).toBe(true);
        expect(obj.lockMovementY).toBe(true);
        expect(obj.lockRotation).toBe(true);
        expect(obj.lockScalingX).toBe(true);
        expect(obj.lockScalingY).toBe(true);
        expect(obj.hasControls).toBe(false);
      }
    });

    it('tentativa de arraste com constante false preserva estritamente left, top, angle, scaleX e scaleY', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-freeze',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-freeze',
          tipo: 'rect',
          data: { left: 200, top: 180, width: 120, height: 90, stroke: '#0284c7' },
        },
      });
      engine.renderState(state);

      const obj = engine.canvas.getObjects()[0];
      const initialGeom = {
        left: obj.left,
        top: obj.top,
        angle: obj.angle,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
      };

      engine.setTool('select');
      engine.canvas.setActiveObject(obj);
      engine.canvas.fire('selection:created', { selected: [obj], target: obj } as any);

      // Simula tentativa de arraste de mouse via eventos Fabric
      const mockDown = { clientX: 220, clientY: 200, preventDefault: () => {}, stopPropagation: () => {} };
      engine.canvas.fire('mouse:down', { e: mockDown as any, target: obj } as any);

      const mockMove = { clientX: 300, clientY: 280, buttons: 1, preventDefault: () => {}, stopPropagation: () => {} };
      engine.canvas.fire('mouse:move', { e: mockMove as any, target: obj } as any);

      const mockUp = { clientX: 300, clientY: 280, preventDefault: () => {}, stopPropagation: () => {} };
      engine.canvas.fire('mouse:up', { e: mockUp as any, target: obj } as any);

      // Comprova que nenhuma coordenada mudou
      expect(obj.left).toBe(initialGeom.left);
      expect(obj.top).toBe(initialGeom.top);
      expect(obj.angle).toBe(initialGeom.angle);
      expect(obj.scaleX).toBe(initialGeom.scaleX);
      expect(obj.scaleY).toBe(initialGeom.scaleY);

      // Comprova que nenhum evento foi emitido (não gera eventos falsos)
      expect(emittedEvents.length).toBe(0);
    });

    it('em seleção múltipla (ActiveSelection), as travas são aplicadas ao grupo selecionado', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-obj-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'obj-1',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 50, height: 50 },
        },
      });
      state = reduceEvent(state, {
        id: 'ev-obj-2',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1001,
        payload: {
          id: 'obj-2',
          tipo: 'rect',
          data: { left: 200, top: 100, width: 50, height: 50 },
        },
      });
      engine.renderState(state);

      const [o1, o2] = engine.canvas.getObjects();
      engine.setTool('select');

      const activeSelection = new ActiveSelection([o1, o2], { canvas: engine.canvas });
      engine.canvas.setActiveObject(activeSelection);
      engine.canvas.fire('selection:created', { selected: [o1, o2], target: activeSelection } as any);

      expect(activeSelection.lockMovementX).toBe(true);
      expect(activeSelection.lockMovementY).toBe(true);
      expect(activeSelection.lockRotation).toBe(true);
      expect(activeSelection.lockScalingX).toBe(true);
      expect(activeSelection.lockScalingY).toBe(true);
      expect(activeSelection.hasControls).toBe(false);
    });
  });

  describe('D15.2 — Exigência do dono: O código de arrasto é 100% preservado e funciona com a constante true', () => {
    it('ao ativar a constante com true, travas são destravadas e o objeto volta a ser manipulável com controles', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-religar',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-religar',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 80 },
        },
      });
      engine.renderState(state);
      const obj = engine.canvas.getObjects()[0];

      engine.setTool('select');
      engine.canvas.setActiveObject(obj);

      // Com padrão false: travado
      expect(obj.lockMovementX).toBe(true);
      expect(obj.hasControls).toBe(false);

      // Liga a constante via engine.setArrastoHabilitado(true)
      engine.setArrastoHabilitado(true);
      expect(ARRASTO_NO_MODO_SELECAO_HABILITADO).toBe(true);
      expect(engine.arrastoHabilitado).toBe(true);

      // Com true: totalmente destravado, alças visíveis
      expect(obj.lockMovementX).toBe(false);
      expect(obj.lockMovementY).toBe(false);
      expect(obj.lockRotation).toBe(false);
      expect(obj.lockScalingX).toBe(false);
      expect(obj.lockScalingY).toBe(false);
      expect(obj.hasControls).toBe(true);

      // Simula movimento com arrasto ligado
      obj.set({ left: 180, top: 160 });
      obj.fire('modified');
      engine.canvas.fire('object:modified', { target: obj });

      expect(obj.left).toBe(180);
      expect(obj.top).toBe(160);

      // Ao desligar novamente (false), volta a travar
      engine.setArrastoHabilitado(false);
      expect(ARRASTO_NO_MODO_SELECAO_HABILITADO).toBe(false);
      expect(obj.lockMovementX).toBe(true);
      expect(obj.hasControls).toBe(false);
    });

    it('setArrastoNoModoSelecaoHabilitado atualiza a constante exportada globalmente', () => {
      setArrastoNoModoSelecaoHabilitado(true);
      expect(ARRASTO_NO_MODO_SELECAO_HABILITADO).toBe(true);
      setArrastoNoModoSelecaoHabilitado(false);
      expect(ARRASTO_NO_MODO_SELECAO_HABILITADO).toBe(false);
    });
  });

  describe('D15.3 — Regressão e Não-Interferência com outras ferramentas', () => {
    it('todas as 8 ferramentas de desenho mantêm skipTargetFind = true (regra D12)', () => {
      const tools = ['pencil', 'brush', 'rectangle', 'ellipse', 'line', 'arrow', 'text', 'eraser'] as const;
      for (const t of tools) {
        engine.setTool(t);
        expect(engine.canvas.skipTargetFind).toBe(true);
      }
    });

    it('object_eraser mantém skipTargetFind = false e apaga objeto ao clicar', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-del',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-del',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 80 },
        },
      });
      engine.renderState(state);
      const obj = engine.canvas.getObjects()[0];

      engine.setTool('object_eraser');
      expect(engine.canvas.skipTargetFind).toBe(false);

      engine.canvas.fire('mouse:down', {
        e: { clientX: 120, clientY: 120 } as any,
        target: obj,
      } as any);

      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].tipo).toBe('DRAW_HIDE');
      expect((emittedEvents[0].payload as any).elementId).toBe('rect-del');
    });

    it('em modo somente leitura (readOnly: true), seleção e arrasto permanecem estritamente inativos', () => {
      const readOnlyCanvasEl = document.createElement('canvas');
      readOnlyCanvasEl.width = 1200;
      readOnlyCanvasEl.height = 800;
      document.body.appendChild(readOnlyCanvasEl);

      const readOnlyEngine = new WhiteboardEngine(readOnlyCanvasEl, {
        autor: 'host',
        sessaoId: 'sessao-ro',
        abaId: 'aba-ro',
        readOnly: true,
      });

      let state = createInitialTabState('aba-ro');
      state = reduceEvent(state, {
        id: 'ev-ro-rect',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'ro-rect',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 80 },
        },
      });
      readOnlyEngine.renderState(state);

      const obj = readOnlyEngine.canvas.getObjects()[0];
      expect(obj.selectable).toBe(false);
      expect(obj.evented).toBe(false);
      expect(obj.lockMovementX).toBe(true);
      expect(obj.hasControls).toBe(false);

      readOnlyEngine.dispose();
      if (readOnlyCanvasEl.parentElement) {
        readOnlyCanvasEl.parentElement.removeChild(readOnlyCanvasEl);
      }
    });

    it('applySelectionDragLocks é resiliente a argumentos nulos, indefinidos e eraser_stroke', () => {
      expect(() => engine.applySelectionDragLocks(null)).not.toThrow();
      expect(() => engine.applySelectionDragLocks(undefined)).not.toThrow();

      const eraserStroke = { tipo: 'eraser_stroke', selectable: true } as any;
      engine.applySelectionDragLocks(eraserStroke);
      // Não deve aplicar travas em eraser_stroke
      expect(eraserStroke.lockMovementX).toBeUndefined();

      const nonSelectable = { selectable: false } as any;
      engine.applySelectionDragLocks(nonSelectable);
      expect(nonSelectable.lockMovementX).toBeUndefined();
    });
  });
});
