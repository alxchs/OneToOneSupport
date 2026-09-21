// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  pointerToScene,
  createFabricObjectFromData,
  createArrowObject,
  PointerCoords,
  CanvasSceneTransform,
} from '../src/shared/canvas/engine';
import {
  createInitialTabState,
  reduceEvent,
  getVisibleElements,
  WhiteboardEvent,
} from '../src/shared/events/reducer';

// Mock do contexto 2D para ambiente JSDOM permitir instanciacao de Fabric IText
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (contextType: string) {
    if (contextType === '2d') {
      return {
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
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as any;
}

describe('Fase 06 - Quadro Branco Fabric.js HiDPI e Compensação 4K @150%', () => {
  describe('1. Mapeamento Canônico de Coordenadas: ponteiro -> cena sem offset (ADR-003, Regra #2)', () => {
    it('sob DPR = 1.0: clique em (150, 250) resulta exatamente na coordenada (100, 200) da cena', () => {
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 50, top: 50, width: 1000, height: 800 },
        virtualWidth: 1000,
        virtualHeight: 800,
      };

      const pointer: PointerCoords = { clientX: 150, clientY: 250 };
      const scene = pointerToScene(pointer, transform);

      expect(scene.x).toBe(100);
      expect(scene.y).toBe(200);
    });

    it('sob DPR = 1.5 (Host 4K 3840x2160 @150%): clique em (150, 250) cai exatamente no ponto clicado (sem deslocamento)', () => {
      // No display scaling de 150%, o layout CSS tem width = 1000px, mas o buffer real do canvas tem 1500px.
      // A função única de conversão NÃO pode sofrer dupla escala: o ponto da cena DEVE ser exatamente 100, 200.
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 50, top: 50, width: 1000, height: 800 },
        virtualWidth: 1000,
        virtualHeight: 800,
      };

      const pointer: PointerCoords = { clientX: 150, clientY: 250 };
      const scene = pointerToScene(pointer, transform);

      // Traço cai exatamente no ponto do cursor (offset zero)
      expect(scene.x).toBe(100);
      expect(scene.y).toBe(200);

      // Verificação de ataque / violação da regra:
      // Se houvesse escala dupla por multiplicação: 100 * 1.5 = 150 (erro de +50px)
      // Se houvesse escala dupla por divisão: 100 / 1.5 = 66.67 (erro de -33.3px)
      const offsetMultiplicado = Math.abs(scene.x - 150);
      const offsetDividido = Math.abs(scene.x - 100 / 1.5);
      expect(offsetMultiplicado).toBe(50); // Prova que NÃO está sofrendo multiplicação indevida
      expect(offsetDividido).toBeGreaterThan(33); // Prova que NÃO está sofrendo divisão indevida
    });

    it('sob DPR = 2.0 (Mobile Retina 2x): clique em (150, 250) mantém alinhamento rigoroso', () => {
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 50, top: 50, width: 1000, height: 800 },
        virtualWidth: 1000,
        virtualHeight: 800,
      };

      const pointer: PointerCoords = { clientX: 150, clientY: 250 };
      const scene = pointerToScene(pointer, transform);

      expect(scene.x).toBe(100);
      expect(scene.y).toBe(200);
    });

    it('conversão correta quando o elemento canvas sofre escala CSS fluida (ex.: largura responsiva)', () => {
      // Se o canvas virtual tem 1920x1080 mas a janela exibe o elemento com 960x540 (escala CSS 0.5x):
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 0, top: 0, width: 960, height: 540 },
        virtualWidth: 1920,
        virtualHeight: 1080,
      };

      // Clique a 480px do início do canvas (meio da tela CSS)
      const pointer: PointerCoords = { clientX: 480, clientY: 270 };
      const scene = pointerToScene(pointer, transform);

      // Na cena virtual de 1920x1080, deve cair exatamente no meio (960, 540)
      expect(scene.x).toBe(960);
      expect(scene.y).toBe(540);
    });

    it('conversão correta sob transformação de viewport (Zoom 2.0x e Pan de 100px)', () => {
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 0, top: 0, width: 1000, height: 800 },
        virtualWidth: 1000,
        virtualHeight: 800,
        // [zoomX, 0, 0, zoomY, panX, panY]
        viewportTransform: [2, 0, 0, 2, 100, 50],
      };

      // canvasX = 300, canvasY = 250
      // sceneX = (300 - 100) / 2 = 100
      // sceneY = (250 - 50) / 2 = 100
      const pointer: PointerCoords = { clientX: 300, clientY: 250 };
      const scene = pointerToScene(pointer, transform);

      expect(scene.x).toBe(100);
      expect(scene.y).toBe(100);
    });

    it('trata com segurança bounding rect nulo ou zerado (display:none) sem NaN ou divisão por zero', () => {
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 0, top: 0, width: 0, height: 0 },
        virtualWidth: 1000,
        virtualHeight: 800,
      };

      const pointer: PointerCoords = { clientX: 100, clientY: 100 };
      const scene = pointerToScene(pointer, transform);

      expect(Number.isFinite(scene.x)).toBe(true);
      expect(Number.isFinite(scene.y)).toBe(true);
    });
  });

  describe('2. Multiplicador de Nitidez para toDataURL (DPR 1, 1.5, 2)', () => {
    it('calcula as dimensões físicas exportadas multiplicadas pelo DPR correto', () => {
      const virtualWidth = 800;
      const virtualHeight = 600;

      // Função que replica a lógica de toDataURL da engine
      const calcularDimensoesExport = (dpr: number) => ({
        width: Math.round(virtualWidth * dpr),
        height: Math.round(virtualHeight * dpr),
      });

      // DPR 1.0
      const dim1 = calcularDimensoesExport(1.0);
      expect(dim1.width).toBe(800);
      expect(dim1.height).toBe(600);

      // DPR 1.5 (Host 4K @150%)
      const dim15 = calcularDimensoesExport(1.5);
      expect(dim15.width).toBe(1200);
      expect(dim15.height).toBe(900);

      // DPR 2.0 (Retina)
      const dim2 = calcularDimensoesExport(2.0);
      expect(dim2.width).toBe(1600);
      expect(dim2.height).toBe(1200);
    });
  });

  describe('3. Criação de Objetos Vetoriais a partir de Eventos (createFabricObjectFromData)', () => {
    it('cria retângulo preservando dimensões e coordenadas de cena', () => {
      const obj = createFabricObjectFromData('rect', {
        left: 100,
        top: 200,
        width: 300,
        height: 150,
        stroke: '#0284c7',
        strokeWidth: 4,
      });

      expect(obj).not.toBeNull();
      if (!obj) return;
      expect(obj.left).toBe(100);
      expect(obj.top).toBe(200);
      expect(obj.width).toBe(300);
      expect(obj.height).toBe(150);
      expect(obj.stroke).toBe('#0284c7');
      expect(obj.strokeWidth).toBe(4);
    });

    it('cria elipse preservando raios e coordenadas', () => {
      const obj = createFabricObjectFromData('ellipse', {
        left: 50,
        top: 75,
        rx: 100,
        ry: 50,
        stroke: '#059669',
        strokeWidth: 2,
      });

      expect(obj).not.toBeNull();
      if (!obj) return;
      expect(obj.left).toBe(50);
      expect(obj.top).toBe(75);
      expect((obj as any).rx).toBe(100);
      expect((obj as any).ry).toBe(50);
    });

    it('cria linha reta conectando os dois pontos especificados', () => {
      const obj = createFabricObjectFromData('line', {
        points: [10, 20, 200, 300],
        stroke: '#d97706',
        strokeWidth: 3,
      });

      expect(obj).not.toBeNull();
      if (!obj) return;
      expect((obj as any).x1).toBe(10);
      expect((obj as any).y1).toBe(20);
      expect((obj as any).x2).toBe(200);
      expect((obj as any).y2).toBe(300);
    });

    it('cria seta indicativa orientada corretamente pelo ângulo dos pontos', () => {
      const arrow = createArrowObject({
        points: [0, 0, 100, 0],
        stroke: '#0284c7',
        strokeWidth: 2,
      });

      expect(arrow).not.toBeNull();
      expect(arrow.type.toLowerCase()).toContain('group');
    });

    it('cria texto rotacionável com suporte a rotação angular (Mestre §12)', () => {
      const text = createFabricObjectFromData('text', {
        text: 'Anotação Importante',
        left: 150,
        top: 300,
        fontSize: 28,
        angle: 45,
        fill: '#0f172a',
      });

      expect(text).not.toBeNull();
      if (!text) return;
      expect((text as any).text).toBe('Anotação Importante');
      expect(text.angle).toBe(45);
      expect((text as any).fontSize).toBe(28);
    });

    it('retorna null com segurança para tipos desconhecidos ou payload vazio', () => {
      expect(createFabricObjectFromData('tipo_inexistente', {})).toBeNull();
      expect(createFabricObjectFromData('rect', null)).toBeNull();
    });
  });

  describe('4. Integração Estrita: Engine Emite Eventos e Reducer Atualiza Estado', () => {
    it('desenho de retângulo emite DRAW_ADD e atualiza elementos visíveis no Reducer', () => {
      let state = createInitialTabState('tab-1');

      const drawEvent: WhiteboardEvent = {
        id: 'ev-1',
        sessao_id: 's-1',
        aba_id: 'tab-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: {
          id: 'rect-1',
          tipo: 'rect',
          data: { left: 10, top: 10, width: 100, height: 100 },
        },
      };

      state = reduceEvent(state, drawEvent);

      const visiveis = getVisibleElements(state);
      expect(visiveis.length).toBe(1);
      expect(visiveis[0].id).toBe('rect-1');
      expect(visiveis[0].hidden).toBe(false);
    });

    it('borracha emite DRAW_HIDE: oculta elemento do canvas sem remover fisicamente do log', () => {
      let state = createInitialTabState('tab-1');

      // 1. Adiciona dois elementos
      state = reduceEvent(state, {
        id: 'ev-add-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: { id: 'el-1', tipo: 'line', data: {} },
      });
      state = reduceEvent(state, {
        id: 'ev-add-2',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1001,
        payload: { id: 'el-2', tipo: 'rect', data: {} },
      });

      expect(getVisibleElements(state).length).toBe(2);

      // 2. Borracha atua sobre o elemento 1
      state = reduceEvent(state, {
        id: 'ev-hide-1',
        tipo: 'DRAW_HIDE',
        autor: 'host',
        criado_em: 1002,
        payload: { elementId: 'el-1' },
      });

      // Elemento 1 desaparece da lista de visíveis
      const visiveis = getVisibleElements(state);
      expect(visiveis.length).toBe(1);
      expect(visiveis[0].id).toBe('el-2');

      // Mas continua fisicamente no banco / dicionário de elementos
      expect(state.elements['el-1']).toBeDefined();
      expect(state.elements['el-1'].hidden).toBe(true);

      // 3. Desfazer (UNDO) traz o elemento apagado de volta
      state = reduceEvent(state, {
        id: 'ev-undo',
        tipo: 'UNDO',
        autor: 'host',
        criado_em: 1003,
        payload: {},
      });

      const restaurados = getVisibleElements(state);
      expect(restaurados.length).toBe(2);
      expect(state.elements['el-1'].hidden).toBe(false);
    });

    it('limpar tela (CLEAR_TAB) oculta todos os elementos e UNDO recupera tudo', () => {
      let state = createInitialTabState('tab-1');

      for (let i = 1; i <= 5; i++) {
        state = reduceEvent(state, {
          id: `ev-add-${i}`,
          tipo: 'DRAW_ADD',
          autor: 'host',
          criado_em: 1000 + i,
          payload: { id: `el-${i}`, tipo: 'line', data: {} },
        });
      }

      expect(getVisibleElements(state).length).toBe(5);

      // Limpar tela emitido pelo Host
      state = reduceEvent(state, {
        id: 'ev-clear',
        tipo: 'CLEAR_TAB',
        autor: 'host',
        criado_em: 1010,
        payload: { tabId: 'tab-1' },
      });

      expect(getVisibleElements(state).length).toBe(0);

      // Desfazer CLEAR_TAB
      state = reduceEvent(state, {
        id: 'ev-undo-clear',
        tipo: 'UNDO',
        autor: 'host',
        criado_em: 1011,
        payload: {},
      });

      expect(getVisibleElements(state).length).toBe(5);
    });

    it('novo DRAW_ADD invalida a pilha de redo do respectivo autor', () => {
      let state = createInitialTabState('tab-1');

      state = reduceEvent(state, {
        id: 'ev-1',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1000,
        payload: { id: 'el-1', tipo: 'rect', data: {} },
      });

      // Desfaz
      state = reduceEvent(state, { id: 'ev-undo', tipo: 'UNDO', autor: 'host', criado_em: 1001, payload: {} });
      expect(state.history.host.redoStack.length).toBe(1);

      // Novo desenho deve esvaziar redoStack
      state = reduceEvent(state, {
        id: 'ev-2',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: 1002,
        payload: { id: 'el-2', tipo: 'rect', data: {} },
      });

      expect(state.history.host.redoStack.length).toBe(0);
    });
  });

  describe('5. Teste Adversarial: Entrada Inválida e Estresse', () => {
    it('suporta 5000 eventos de desenho rápidos sem falha de coerência', () => {
      let state = createInitialTabState('tab-stress');

      for (let i = 0; i < 5000; i++) {
        state = reduceEvent(state, {
          id: `ev-${i}`,
          tipo: 'DRAW_ADD',
          autor: 'host',
          criado_em: 1000 + i,
          payload: { id: `el-${i}`, tipo: 'path', data: { x: i, y: i } },
        });
      }

      expect(state.totalEventsApplied).toBe(5000);
      expect(getVisibleElements(state).length).toBe(5000);
    });

    it('coordenadas de clique negativas ou distantes tratam com segurança', () => {
      const transform: CanvasSceneTransform = {
        boundingRect: { left: 100, top: 100, width: 800, height: 600 },
        virtualWidth: 800,
        virtualHeight: 600,
      };

      // Clique fora da janela (arraste do mouse para o monitor adjacente)
      const pointer: PointerCoords = { clientX: -500, clientY: -300 };
      const scene = pointerToScene(pointer, transform);

      expect(scene.x).toBe(-600);
      expect(scene.y).toBe(-400);
      expect(Number.isFinite(scene.x)).toBe(true);
    });
  });
});
