// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  WhiteboardEngine,

} from '../../src/shared/canvas/engine';
import {
  createInitialTabState,
  reduceEvent,
  WhiteboardEvent,
} from '../../src/shared/events/reducer';

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

// Ataque do chefe (Fase 11): a borracha de traço inteiro só pode apagar o que está sob o ponteiro,
// em qualquer escala do quadro (Host 4K @150% e celular), não um elemento que está em outro lugar.
describe('Borracha (Traço inteiro) em escala diferente de 1 — clique em área vazia não apaga nada', () => {
  for (const [nome, largura, altura] of [
    ['Host escala 1,5', 1800, 1200],
    ['celular escala ~0,34', 412, 275],
  ] as const) {
    it(nome, () => {
      const canvasEl = document.createElement('canvas');
      document.body.appendChild(canvasEl);
      const emitidos: WhiteboardEvent[] = [];
      const engine = new WhiteboardEngine(canvasEl, {
        autor: 'host',
        sessaoId: 's-atk',
        abaId: 'a-atk',
        onEmitEvent: (ev) => emitidos.push(ev),
      });
      engine.setDimensions(largura, altura);
      const escala = largura / 1200;
      let state = createInitialTabState('a-atk');
      // Retângulo em cena (600..700, 100..200)
      state = reduceEvent(state, {
        id: 'ev-1', tipo: 'DRAW_ADD', autor: 'host', criado_em: 1,
        payload: { id: 'alvo', tipo: 'rect', data: { left: 600, top: 100, width: 100, height: 100, stroke: '#0284c7' } },
      } as any);
      engine.renderState(state);
      engine.setTool('object_eraser');
      const r = engine.canvas.upperCanvasEl.getBoundingClientRect();
      // Ponteiro em cena (300, 500): longe do retângulo. Em pixels de tela: 300*escala, 500*escala.
      const e = { clientX: r.left + 300 * escala, clientY: r.top + 500 * escala, buttons: 1 };
      (engine.canvas as any).fire('mouse:down', { e });
      // Ponto de TELA que, lido como cena, cai dentro do retângulo: (650, 150) em pixels de tela.
      const e2 = { clientX: r.left + 650, clientY: r.top + 150, buttons: 1 };
      const cena2 = { x: 650 / escala, y: 150 / escala };
      const dentro = cena2.x >= 600 && cena2.x <= 700 && cena2.y >= 100 && cena2.y <= 200;
      (engine.canvas as any).fire('mouse:down', { e: e2 });
      const hides = emitidos.filter((ev) => ev.tipo === 'DRAW_HIDE');
      engine.dispose();
      canvasEl.remove();
      expect({ cena2, dentro, hides: hides.length }).toEqual({ cena2, dentro, hides: dentro ? 1 : 0 });
    });
  }
});
