// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WhiteboardEngine,
  WhiteboardTool,
} from '../src/shared/canvas/engine';
import {
  createInitialTabState,
  reduceEvent,
  WhiteboardEvent,
} from '../src/shared/events/reducer';
import { IText } from 'fabric';

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

describe('D12 — Ferramentas de desenho nunca movem objetos existentes', () => {
  let canvasEl: HTMLCanvasElement;
  let engine: WhiteboardEngine;
  let emittedEvents: WhiteboardEvent[];

  beforeEach(() => {
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
    engine.dispose();
    if (canvasEl.parentElement) {
      canvasEl.parentElement.removeChild(canvasEl);
    }
  });

  describe('D12.1 — Configuração e Proteção de skipTargetFind por Ferramenta', () => {
    it('inicializa engine com skipTargetFind = true (ferramenta inicial pencil)', () => {
      expect(engine.canvas.skipTargetFind).toBe(true);
      expect(engine.activeTool).toBe('pencil');
    });

    it('as 8 ferramentas de desenho configuram estritamente skipTargetFind = true', () => {
      const drawingTools: WhiteboardTool[] = [
        'pencil',
        'brush',
        'rectangle',
        'ellipse',
        'line',
        'arrow',
        'text',
        'eraser',
      ];

      for (const tool of drawingTools) {
        engine.setTool(tool);
        expect(engine.canvas.skipTargetFind).toBe(true);
        expect(engine.canvas.selection).toBe(false);
      }
    });

    it('apenas select e object_eraser configuram skipTargetFind = false', () => {
      engine.setTool('select');
      expect(engine.canvas.skipTargetFind).toBe(false);
      expect(engine.canvas.selection).toBe(true);

      engine.setTool('object_eraser');
      expect(engine.canvas.skipTargetFind).toBe(false);
      expect(engine.canvas.selection).toBe(false);
    });

    it('ao trocar de ferramenta, encerra modo de edição de texto e descarta activeObject', () => {
      // Coloca texto na tela e ativa edição
      engine.setTool('text');
      const textObj = new IText('Texto de Teste', { left: 100, top: 100 });
      engine.canvas.add(textObj);
      engine.canvas.setActiveObject(textObj);
      textObj.enterEditing();
      expect(textObj.isEditing).toBe(true);

      // Troca para rectangle
      engine.setTool('rectangle');
      expect(textObj.isEditing).toBe(false);
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });
  });

  describe('D12.1 — Matriz de 6 Objetos Existentes x 8 Ferramentas de Desenho', () => {
    const tiposObjetos = [
      {
        tipo: 'path',
        desc: 'Path de mão livre',
        data: {
          path: [
            ['M', 100, 100],
            ['L', 150, 150],
            ['L', 200, 100],
          ],
          left: 100,
          top: 100,
          stroke: '#0284c7',
          strokeWidth: 3,
        },
      },
      {
        tipo: 'rect',
        desc: 'Retângulo',
        data: { left: 100, top: 100, width: 120, height: 80, stroke: '#0284c7', strokeWidth: 2 },
      },
      {
        tipo: 'ellipse',
        desc: 'Elipse',
        data: { left: 100, top: 100, rx: 60, ry: 40, stroke: '#0284c7', strokeWidth: 2 },
      },
      {
        tipo: 'line',
        desc: 'Linha',
        data: { points: [100, 100, 220, 180], stroke: '#0284c7', strokeWidth: 2 },
      },
      {
        tipo: 'arrow',
        desc: 'Seta',
        data: { points: [100, 100, 220, 180], stroke: '#0284c7', strokeWidth: 2 },
      },
      {
        tipo: 'text',
        desc: 'Texto',
        data: { text: 'Anotação', left: 100, top: 100, fontSize: 24, fill: '#0f172a' },
      },
    ];

    const ferramentasDesenho: WhiteboardTool[] = [
      'pencil',
      'brush',
      'rectangle',
      'ellipse',
      'line',
      'arrow',
      'text',
      'eraser',
    ];

    tiposObjetos.forEach((objDef) => {
      ferramentasDesenho.forEach((tool) => {
        it(`mousedown sobre ${objDef.desc} com ferramenta '${tool}' NÃO move nem seleciona o objeto existente`, () => {
          // 1. Renderiza o objeto existente A via renderState
          let state = createInitialTabState('aba-test');
          state = reduceEvent(state, {
            id: 'ev-obj-a',
            tipo: 'DRAW_ADD',
            autor: 'host',
            criado_em: 1000,
            payload: {
              id: 'obj-a',
              tipo: objDef.tipo,
              data: objDef.data,
            },
          });
          engine.renderState(state);

          const objects = engine.canvas.getObjects();
          expect(objects.length).toBe(1);
          const objA = objects[0];

          const initialLeft = objA.left;
          const initialTop = objA.top;
          const initialAngle = objA.angle;
          const initialScaleX = objA.scaleX;
          const initialScaleY = objA.scaleY;

          // 2. Ativa a ferramenta de desenho
          engine.setTool(tool);
          expect(engine.canvas.skipTargetFind).toBe(true);

          // 3. Simula mousedown/pointerdown DENTRO do objeto A (110, 110)
          const mockPointerEvent = {
            clientX: 110,
            clientY: 110,
            preventDefault: () => {},
            stopPropagation: () => {},
          };

          // Fabric findTarget com skipTargetFind = true retorna undefined
          const target = engine.canvas.findTarget(mockPointerEvent as any);
          expect(target).toBeUndefined();

          // Dispara mouse:down do Fabric
          engine.canvas.fire('mouse:down', {
            e: mockPointerEvent as any,
            target: undefined,
          } as any);

          // Dispara mouse:move simulando arraste de alguns pixels
          const mockMoveEvent = {
            clientX: 130,
            clientY: 130,
            buttons: 1,
            preventDefault: () => {},
            stopPropagation: () => {},
          };
          engine.canvas.fire('mouse:move', {
            e: mockMoveEvent as any,
            target: undefined,
          } as any);

          // Dispara mouse:up finalizando o traço
          const mockUpEvent = {
            clientX: 130,
            clientY: 130,
            preventDefault: () => {},
            stopPropagation: () => {},
          };
          engine.canvas.fire('mouse:up', {
            e: mockUpEvent as any,
            target: undefined,
          } as any);

          // 4. Afirmações obrigatórias:
          // (a) Objeto A não é o activeObject
          expect(engine.canvas.getActiveObject()).toBeFalsy();

          // (b) Propriedades geométricas de A permanecem estritamente inalteradas
          expect(objA.left).toBe(initialLeft);
          expect(objA.top).toBe(initialTop);
          expect(objA.angle).toBe(initialAngle);
          expect(objA.scaleX).toBe(initialScaleX);
          expect(objA.scaleY).toBe(initialScaleY);
        });
      });
    });
  });

  describe('D12.2 — Prova de Falha sem a Correção', () => {
    it('com skipTargetFind = false (sem a correção), mousedown sobre retângulo encontra o alvo e o seleciona', () => {
      // 1. Renderiza retângulo existente
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-1',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 100, height: 100, stroke: '#0284c7' },
        },
      });
      engine.renderState(state);

      const rectObj = engine.canvas.getObjects()[0];
      expect(rectObj).toBeDefined();

      // Força o comportamento anterior bugado (skipTargetFind = false em ferramentas de forma)
      engine.canvas.skipTargetFind = false;

      // Evento sobre o retângulo
      const mockEvent = { clientX: 120, clientY: 120 };
      const foundTarget = engine.canvas.findTarget(mockEvent as any);

      // SEM a correção, o Fabric detecta o retângulo sob o ponteiro
      expect(foundTarget).toBe(rectObj);

      // COM a correção (skipTargetFind = true), o alvo é ignorado
      engine.canvas.skipTargetFind = true;
      const targetComCorrecao = engine.canvas.findTarget(mockEvent as any);
      expect(targetComCorrecao).toBeUndefined();
    });
  });

  describe('D12.2 — Regressão Obrigatória: select, object_eraser e eraser', () => {
    it('select ainda localiza o objeto alvo e permite seleção', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-select',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-select',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 100, height: 100 },
        },
      });
      engine.renderState(state);
      const rectObj = engine.canvas.getObjects()[0];

      engine.setTool('select');
      expect(engine.canvas.skipTargetFind).toBe(false);

      const mockEvent = { clientX: 120, clientY: 120 };
      const target = engine.canvas.findTarget(mockEvent as any);
      expect(target).toBe(rectObj);

      engine.canvas.setActiveObject(rectObj);
      expect(engine.canvas.getActiveObject()).toBe(rectObj);
    });

    it('object_eraser ainda localiza o alvo sob o cursor e emite DRAW_HIDE', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-rect-erase',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-erase',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 100, height: 100 },
        },
      });
      engine.renderState(state);
      const rectObj = engine.canvas.getObjects()[0];

      engine.setTool('object_eraser');
      expect(engine.canvas.skipTargetFind).toBe(false);

      const mockEvent = { clientX: 120, clientY: 120 };
      const target = engine.canvas.findTarget(mockEvent as any);
      expect(target).toBe(rectObj);

      // Dispara ação da borracha
      engine.canvas.fire('mouse:down', {
        e: mockEvent as any,
        target: rectObj,
      } as any);

      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].tipo).toBe('DRAW_HIDE');
      expect((emittedEvents[0].payload as any).elementId).toBe('rect-erase');
      expect(engine.canvas.getActiveObject()).toBeFalsy();
    });

    it('eraser (borracha de trecho) não seleciona nem move objetos existentes', () => {
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-line-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'line-1',
          tipo: 'line',
          data: { points: [50, 50, 200, 200], stroke: '#0284c7', strokeWidth: 4 },
        },
      });
      engine.renderState(state);
      const lineObj = engine.canvas.getObjects()[0];

      engine.setTool('eraser');
      expect(engine.canvas.skipTargetFind).toBe(true);

      const mockEvent = { clientX: 100, clientY: 100 };
      const target = engine.canvas.findTarget(mockEvent as any);
      expect(target).toBeUndefined();
      expect(lineObj.left).toBeDefined();
    });
  });

  describe('D12.3 — Observação de Decisão de Produto: Arraste no Modo Select', () => {
    it('comprova que mover objeto em modo select é apenas mutação local em memória sem evento emitido', () => {
      // 1. Renderiza objeto A em (100, 100)
      let state = createInitialTabState('aba-test');
      state = reduceEvent(state, {
        id: 'ev-select-move',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'select-move',
          tipo: 'rect',
          data: { left: 100, top: 100, width: 80, height: 80 },
        },
      });
      engine.renderState(state);
      const rectObj = engine.canvas.getObjects()[0];

      engine.setTool('select');
      engine.canvas.setActiveObject(rectObj);

      // Simula alteração de coordenadas pelo Fabric (arraste)
      rectObj.set({ left: 250, top: 300 });
      rectObj.fire('modified');
      engine.canvas.fire('object:modified', { target: rectObj });

      // O objeto foi alterado na memória local do canvas
      expect(rectObj.left).toBe(250);
      expect(rectObj.top).toBe(300);

      // MAS NENHUM evento de mover foi emitido pelo WhiteboardEngine (não existe DRAW_MOVE / DRAW_UPDATE)
      expect(emittedEvents.length).toBe(0);

      // Ao reconstruir ou forçar renderState do estado da sessão:
      engine.renderState(state);

      // O objeto é restaurado ou o próximo reload restaurará as coordenadas do Reducer (100, 100)
      const elementNoState = state.elements['select-move'];
      expect((elementNoState.data as any).left).toBe(100);
      expect((elementNoState.data as any).top).toBe(100);
    });
  });
});
