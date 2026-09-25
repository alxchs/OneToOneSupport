// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhiteboardEngine } from '../src/shared/canvas/engine';
import { createInitialTabState, reduceEvent, WhiteboardEvent } from '../src/shared/events/reducer';

describe('D6.1 & D6.2 — Diagnóstico de Divergência Estado-vs-Pixel e Ciclo de Vida do WhiteboardEngine', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origDiag = process.env.ONETOONE_DIAG;

  const BUFFER_WIDTH = 1000;
  const BUFFER_HEIGHT = 800;
  let pixelBuffer = new Uint8ClampedArray(BUFFER_WIDTH * BUFFER_HEIGHT * 4);
  let forceEmptyImageData = false;

  let currentTransform = [1, 0, 0, 1, 0, 0];
  const transformStack: number[][] = [];

  let capturedForwardEvents: Array<{ checkpoint: string; data?: Record<string, unknown> }> = [];

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
          clearRect: () => {},
          drawImage: function () {},
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
            if (forceEmptyImageData) {
              return { data, width: rw, height: rh };
            }
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

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.ONETOONE_DIAG = '1';
    capturedForwardEvents = [];
    pixelBuffer.fill(0);
    forceEmptyImageData = false;

    (window as any).__whiteboardEngine = undefined;
    (window as any).__ONETOONE_DIAG_FORWARD__ = (checkpoint: string, data?: Record<string, unknown>) => {
      capturedForwardEvents.push({ checkpoint, data });
    };
  });

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    if (origDiag !== undefined) {
      process.env.ONETOONE_DIAG = origDiag;
    } else {
      delete process.env.ONETOONE_DIAG;
    }
    delete (window as any).__ONETOONE_DIAG_FORWARD__;
    delete (window as any).__whiteboardEngine;
    vi.restoreAllMocks();
  });

  it('D6.2: instrumenta ciclo de vida do WhiteboardEngine com evento criado e descartado', () => {
    const canvasEl = document.createElement('canvas');
    document.body.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    const id = engine.instanciaId;
    expect(id).toBeGreaterThan(0);

    const criadoLog = capturedForwardEvents.find(
      (e) => e.checkpoint === 'engine_lifecycle' && e.data?.evento === 'criado'
    );
    expect(criadoLog).toBeDefined();
    expect(criadoLog?.data?.instanciaId).toBe(id);

    engine.dispose();

    const descartadoLog = capturedForwardEvents.find(
      (e) => e.checkpoint === 'engine_lifecycle' && e.data?.evento === 'descartado'
    );
    expect(descartadoLog).toBeDefined();
    expect(descartadoLog?.data?.instanciaId).toBe(id);

    canvasEl.remove();
  });

  it('D6.1: detecta divergência estado-vs-pixel quando há objetos no Fabric mas o canvas está vazio (0 pixels)', () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    // Força o retorno de getImageData como tudo transparente
    forceEmptyImageData = true;

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const drawEvent: WhiteboardEvent = {
      id: 'rect-divergence-test-1',
      sessao_id: 'sessao-ativa',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      payload: {
        tipo: 'rect',
        data: { left: 100, top: 100, width: 200, height: 100, fill: '#0284c7' },
      },
      autor: 'host',
      criado_em: Date.now(),
    };
    const tabState = reduceEvent(createInitialTabState('default'), drawEvent);
    engine.renderState(tabState);

    // Executa checagem de divergência
    engine.checkPixelDivergence();

    const divLog = capturedForwardEvents.find((e) => e.checkpoint === 'divergencia_estado_pixel');
    expect(divLog).toBeDefined();
    expect(divLog?.data?.objetosNoFabric).toBe(1);
    expect(divLog?.data?.pixelsNoCanvas).toBe(0);
    expect(divLog?.data?.larguraCanvas).toBeGreaterThan(0);
    expect(divLog?.data?.alturaCanvas).toBeGreaterThan(0);

    console.log('[TEST D6.1 OUTPUT] Disparou divergencia_estado_pixel:', JSON.stringify(divLog));

    engine.dispose();
    container.remove();
  });

  it('D6.1: NÃO emite divergência quando o canvas possui pixels não-transparentes correspondentes', () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    // Preenche buffer com pixels válidos
    for (let i = 3; i < 500 * 4; i += 4) {
      pixelBuffer[i] = 255;
    }
    forceEmptyImageData = false;

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const drawEvent: WhiteboardEvent = {
      id: 'rect-ok-test',
      sessao_id: 'sessao-ativa',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      payload: {
        tipo: 'rect',
        data: { left: 100, top: 100, width: 200, height: 100, fill: '#0284c7' },
      },
      autor: 'host',
      criado_em: Date.now(),
    };
    const tabState = reduceEvent(createInitialTabState('default'), drawEvent);
    engine.renderState(tabState);

    engine.checkPixelDivergence();

    const divLog = capturedForwardEvents.find((e) => e.checkpoint === 'divergencia_estado_pixel');
    expect(divLog).toBeUndefined();

    engine.dispose();
    container.remove();
  });

  it('D6.1: agendamento automático via requestAnimationFrame com throttle de 500ms', () => {
    let rafCallbacks: Array<FrameRequestCallback> = [];
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    forceEmptyImageData = true;

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const drawEvent: WhiteboardEvent = {
      id: 'rect-raf-test',
      sessao_id: 'sessao-ativa',
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      payload: {
        tipo: 'rect',
        data: { left: 50, top: 50, width: 100, height: 100, fill: '#0284c7' },
      },
      autor: 'host',
      criado_em: Date.now(),
    };
    const tabState = reduceEvent(createInitialTabState('default'), drawEvent);

    // renderState agenda via schedulePixelDivergenceCheck
    engine.renderState(tabState);
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    // Drena os frames de animação do Fabric e do schedulePixelDivergenceCheck
    for (let frame = 0; frame < 5 && rafCallbacks.length > 0; frame++) {
      const cbs = [...rafCallbacks];
      rafCallbacks.length = 0;
      cbs.forEach((cb) => cb(performance.now()));
    }

    // Diagnóstico de divergência disparado
    const divLog = capturedForwardEvents.find((e) => e.checkpoint === 'divergencia_estado_pixel');
    expect(divLog).toBeDefined();
    expect(divLog?.data?.objetosNoFabric).toBe(1);
    expect(divLog?.data?.pixelsNoCanvas).toBe(0);

    // Teste do throttle: nova chamada imediata NÃO deve disparar nova checagem de divergência
    const divLogsCountBefore = capturedForwardEvents.filter(
      (e) => e.checkpoint === 'divergencia_estado_pixel'
    ).length;

    engine.renderState(tabState);

    for (let frame = 0; frame < 5 && rafCallbacks.length > 0; frame++) {
      const cbs = [...rafCallbacks];
      rafCallbacks.length = 0;
      cbs.forEach((cb) => cb(performance.now()));
    }

    const divLogsCountAfter = capturedForwardEvents.filter(
      (e) => e.checkpoint === 'divergencia_estado_pixel'
    ).length;
    expect(divLogsCountAfter).toBe(divLogsCountBefore); // Throttle de 500ms bloqueou nova checagem imediata

    engine.dispose();
    container.remove();
  });

  it('D14 / D8: detecta canvas_possivelmente_escondido quando upperCanvasEl possui fundo opaco (ponto cego corrigido)', () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const lowerEl = engine.canvas.lowerCanvasEl;
    const upperEl = engine.canvas.upperCanvasEl;

    vi.spyOn(lowerEl, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 400,
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Simula o bug da Fase 07: upper-canvas com fundo branco opaco cobrindo lower-canvas
    upperEl.style.backgroundColor = '#ffffff';

    engine.checkCssVisibility();

    const diagEvent = capturedForwardEvents.find((e) => e.checkpoint === 'canvas_possivelmente_escondido');
    expect(diagEvent).toBeDefined();
    expect(diagEvent?.data?.upperOpaco).toBe(true);

    engine.dispose();
    container.remove();
  });

  it('D14 / D8: NÃO emite canvas_possivelmente_escondido quando canvas e camadas estão normais e upperCanvasEl é transparente', () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const lowerEl = engine.canvas.lowerCanvasEl;
    const upperEl = engine.canvas.upperCanvasEl;

    vi.spyOn(lowerEl, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 400,
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Assegura que upper-canvas está transparente
    upperEl.style.backgroundColor = 'transparent';

    engine.checkCssVisibility();

    const diagEvent = capturedForwardEvents.find((e) => e.checkpoint === 'canvas_possivelmente_escondido');
    expect(diagEvent).toBeUndefined();

    engine.dispose();
    container.remove();
  });

  it('D14 / D8: detecta canvas_possivelmente_escondido quando lowerCanvasEl está oculto via CSS (display: none)', () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 600;
    canvasEl.height = 400;
    container.appendChild(canvasEl);

    const engine = new WhiteboardEngine(canvasEl);
    engine.setDimensions(600, 400);

    const lowerEl = engine.canvas.lowerCanvasEl;

    vi.spyOn(lowerEl, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 400,
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    lowerEl.style.display = 'none';

    engine.checkCssVisibility();

    const diagEvent = capturedForwardEvents.find((e) => e.checkpoint === 'canvas_possivelmente_escondido');
    expect(diagEvent).toBeDefined();
    expect(diagEvent?.data?.display).toBe('none');

    engine.dispose();
    container.remove();
  });
});
