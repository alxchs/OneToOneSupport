// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  WhiteboardEngine,
  CANONICAL_VIRTUAL_WIDTH,
  CANONICAL_VIRTUAL_HEIGHT,
} from '../src/shared/canvas/engine';
import { createInitialTabState, reduceEvent, WhiteboardEvent } from '../src/shared/events/reducer';

describe('D5.2 — Regressão onDprChange no WhiteboardEngine (Prova de Falha e Correção)', () => {
  const BUFFER_WIDTH = 1400;
  const BUFFER_HEIGHT = 1000;
  let pixelBuffer = new Uint8ClampedArray(BUFFER_WIDTH * BUFFER_HEIGHT * 4);

  let currentTransform = [1, 0, 0, 1, 0, 0];
  const transformStack: number[][] = [];

  function countNonTransparentPixelsInRegion(
    imageData: { data: Uint8ClampedArray; width: number; height: number }
  ): number {
    let nonZero = 0;
    const d = imageData.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 0) nonZero++;
    }
    return nonZero;
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextType: string) {
      if (contextType === '2d') {
        const el = this;
        const ctx = {
          canvas: el,
          save: () => {
            transformStack.push([...currentTransform]);
          },
          restore: () => {
            if (transformStack.length > 0) {
              currentTransform = transformStack.pop()!;
            }
          },
          scale: (sx: number, sy: number) => {
            const [a, b, c, d, e, f] = currentTransform;
            currentTransform = [a * sx, b * sx, c * sy, d * sy, e, f];
          },
          rotate: () => {},
          translate: (tx: number, ty: number) => {
            const [a, b, c, d, e, f] = currentTransform;
            currentTransform = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f];
          },
          transform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
            const [a1, b1, c1, d1, e1, f1] = currentTransform;
            currentTransform = [
              a1 * a + c1 * b,
              b1 * a + d1 * b,
              a1 * c + c1 * d,
              b1 * c + d1 * d,
              a1 * e + c1 * f + e1,
              b1 * e + d1 * f + f1,
            ];
          },
          setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
            currentTransform = [a, b, c, d, e, f];
          },
          resetTransform: () => {
            currentTransform = [1, 0, 0, 1, 0, 0];
          },
          clearRect: (x: number, y: number, w: number, h: number) => {
            const startX = Math.max(0, Math.floor(x));
            const startY = Math.max(0, Math.floor(y));
            const endX = Math.min(BUFFER_WIDTH, Math.floor(x + w));
            const endY = Math.min(BUFFER_HEIGHT, Math.floor(y + h));
            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * BUFFER_WIDTH + px) * 4;
                pixelBuffer[idx] = 0;
                pixelBuffer[idx + 1] = 0;
                pixelBuffer[idx + 2] = 0;
                pixelBuffer[idx + 3] = 0;
              }
            }
          },
          drawImage: function(_img: any, ...args: any[]) {
            const cx = Math.round(currentTransform[4]);
            const cy = Math.round(currentTransform[5]);
            const dx = typeof args[0] === 'number' ? args[0] : -50;
            const dy = typeof args[1] === 'number' ? args[1] : -37;
            const dw = typeof args[2] === 'number' ? args[2] : 100;
            const dh = typeof args[3] === 'number' ? args[3] : 75;

            const startX = Math.max(0, cx + Math.floor(dx));
            const startY = Math.max(0, cy + Math.floor(dy));
            const endX = Math.min(BUFFER_WIDTH, cx + Math.floor(dx + dw));
            const endY = Math.min(BUFFER_HEIGHT, cy + Math.floor(dy + dh));

            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * BUFFER_WIDTH + px) * 4;
                pixelBuffer[idx] = 2;
                pixelBuffer[idx + 1] = 132;
                pixelBuffer[idx + 2] = 199;
                pixelBuffer[idx + 3] = 255;
              }
            }
          },
          fillRect: () => {},
          strokeRect: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arc: () => {},
          fill: () => {},
          stroke: () => {},
          rect: () => {},
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
          getImageData: (rx: number, ry: number, rw: number, rh: number) => {
            const data = new Uint8ClampedArray(rw * rh * 4);
            for (let y = 0; y < rh; y++) {
              for (let x = 0; x < rw; x++) {
                const srcX = rx + x;
                const srcY = ry + y;
                if (srcX >= 0 && srcX < BUFFER_WIDTH && srcY >= 0 && srcY < BUFFER_HEIGHT) {
                  const srcIdx = (srcY * BUFFER_WIDTH + srcX) * 4;
                  const dstIdx = (y * rw + x) * 4;
                  data[dstIdx] = pixelBuffer[srcIdx];
                  data[dstIdx + 1] = pixelBuffer[srcIdx + 1];
                  data[dstIdx + 2] = pixelBuffer[srcIdx + 2];
                  data[dstIdx + 3] = pixelBuffer[srcIdx + 3];
                }
              }
            }
            return { data, width: rw, height: rh };
          },
        };
        return ctx as unknown as CanvasRenderingContext2D;
      }
      return null;
    } as any;
  }

  it('D5.2: preserva dimensões de exibição do container e visibilidade de pixels após evento change de DPR', () => {
    pixelBuffer.fill(0);
    currentTransform = [1, 0, 0, 1, 0, 0];
    transformStack.length = 0;

    const matchMediaListeners: Array<() => void> = [];
    window.matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, fn: any) => {
        if (event === 'change') matchMediaListeners.push(fn);
      }),
      removeEventListener: vi.fn((_event: string, fn: any) => {
        const idx = matchMediaListeners.indexOf(fn);
        if (idx >= 0) matchMediaListeners.splice(idx, 1);
      }),
      dispatchEvent: vi.fn(() => {
        matchMediaListeners.forEach((fn) => fn());
        return true;
      }),
    })) as any;

    // 1. Cria o engine com um container de tamanho conhecido (610x420 CSS px)
    const container = document.createElement('div');
    container.style.width = '610px';
    container.style.height = '420px';
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 610,
      height: 420,
      right: 610,
      bottom: 420,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(610, 420);

    // Confirma que corresponde ao container, não a 1200x800
    expect(engine.displayWidth).toBe(610);
    expect(engine.displayHeight).toBe(407);
    expect(engine.displayWidth).not.toBe(CANONICAL_VIRTUAL_WIDTH);
    expect(engine.displayHeight).not.toBe(CANONICAL_VIRTUAL_HEIGHT);

    // 2. Desenha 1 elemento via renderState com DRAW_ADD sintético
    const drawEvent: WhiteboardEvent = {
      id: 'rect-dpr-test-1',
      sessao_id: 'sessao-ativa',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      payload: {
        tipo: 'rect',
        data: {
          left: 800,
          top: 500,
          width: 200,
          height: 150,
          fill: '#0284c7',
          stroke: '#0284c7',
          strokeWidth: 2,
        },
        left: 800,
        top: 500,
        width: 200,
        height: 150,
        fill: '#0284c7',
        stroke: '#0284c7',
        strokeWidth: 2,
      },
      autor: 'host',
      criado_em: Date.now(),
    };
    const tabState = reduceEvent(createInitialTabState('default'), drawEvent);
    engine.renderState(tabState);
    engine.canvas.renderAll();

    // Medição de pixels na região esperada do container (em torno de x=407..520, y=230..350)
    const ctx = engine.canvas.lowerCanvasEl.getContext('2d')!;
    const regionExpected = { x: 380, y: 230, width: 50, height: 40 };
    const imageDataBefore = ctx.getImageData(
      regionExpected.x,
      regionExpected.y,
      regionExpected.width,
      regionExpected.height
    );
    const pixelsBefore = countNonTransparentPixelsInRegion(imageDataBefore);

    console.log('[TEST D5.2] Pixels ANTES do evento DPR:', pixelsBefore);
    expect(pixelsBefore).toBeGreaterThan(0);

    // 3. Dispara manualmente o evento change do matchMedia que o engine escuta
    expect(matchMediaListeners.length).toBeGreaterThan(0);
    console.log('[TEST D5.2] Disparando matchMedia change listener...');
    matchMediaListeners.forEach((listener) => listener());
    engine.canvas.renderAll();

    // 4. Confirma que, DEPOIS do evento de DPR:
    // a) O canvas continua com o MESMO tamanho de exibição do container (não 1200x800)
    console.log('[TEST D5.2] engine.displayWidth APÓS DPR:', engine.displayWidth);
    console.log('[TEST D5.2] engine.displayHeight APÓS DPR:', engine.displayHeight);

    expect(engine.displayWidth).toBe(610);
    expect(engine.displayHeight).toBe(407);

    // b) O elemento desenhado antes continua com pixels visíveis na região esperada
    const imageDataAfter = ctx.getImageData(
      regionExpected.x,
      regionExpected.y,
      regionExpected.width,
      regionExpected.height
    );
    const pixelsAfter = countNonTransparentPixelsInRegion(imageDataAfter);

    console.log('[TEST D5.2] Pixels APÓS evento DPR:', pixelsAfter);
    expect(pixelsAfter).toBeGreaterThan(0);

    engine.dispose();
  });

  it('D5.3: redimensionamento da janela atualiza dimensões e DPR subsequente preserva novas dimensões', () => {
    let containerWidth = 610;
    let containerHeight = 420;

    const matchMediaListeners: Array<() => void> = [];
    window.matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, fn: any) => {
        if (event === 'change') matchMediaListeners.push(fn);
      }),
      removeEventListener: vi.fn((_event: string, fn: any) => {
        const idx = matchMediaListeners.indexOf(fn);
        if (idx >= 0) matchMediaListeners.splice(idx, 1);
      }),
      dispatchEvent: vi.fn(() => {
        matchMediaListeners.forEach((fn) => fn());
        return true;
      }),
    })) as any;

    const container = document.createElement('div');
    container.style.width = '610px';
    container.style.height = '420px';
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: containerWidth,
      height: containerHeight,
      right: containerWidth,
      bottom: containerHeight,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(containerWidth, containerHeight);

    expect(engine.displayWidth).toBe(610);
    expect(engine.displayHeight).toBe(407);

    // Simula redimensionamento da janela / container para 800x500
    containerWidth = 800;
    containerHeight = 500;
    container.style.width = '800px';
    container.style.height = '500px';

    // handleResize em QuadroBrancoPage chama setDimensions(bounds.width, bounds.height)
    engine.setDimensions(containerWidth, containerHeight);
    window.dispatchEvent(new Event('resize'));

    // min(800/1200, 500/800) = 500/800 = 0.625; 1200 * 0.625 = 750; 800 * 0.625 = 500
    expect(engine.displayWidth).toBe(750);
    expect(engine.displayHeight).toBe(500);

    // Dispara mudança de DPR após resize da janela
    matchMediaListeners.forEach((listener) => listener());

    // Confirma que após DPR change, o canvas continua com as novas dimensões (750x500), NÃO 1200x800
    expect(engine.displayWidth).toBe(750);
    expect(engine.displayHeight).toBe(500);

    engine.dispose();
  });
});
