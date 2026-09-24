// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { WhiteboardEngine } from '../src/shared/canvas/engine';

describe('D11.1 — Regressão: Transparência Obrigatória do upper-canvas (Evita Oclusão do lower-canvas)', () => {
  // Mock mínimo do canvas 2d para jsdom
  if (typeof HTMLCanvasElement !== 'undefined') {
    (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, contextType: string) {
      if (contextType === '2d') {
        const el = this;
        return {
          canvas: el,
          save: () => {},
          restore: () => {},
          scale: () => {},
          rotate: () => {},
          translate: () => {},
          transform: () => {},
          setTransform: () => {},
          resetTransform: () => {},
          clearRect: () => {},
          fillRect: () => {},
          strokeRect: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arc: () => {},
          fill: () => {},
          stroke: () => {},
          drawImage: () => {},
          measureText: (text: string) => ({ width: text.length * 10 }),
          getImageData: () => ({
            data: new Uint8ClampedArray(400),
            width: 10,
            height: 10,
          }),
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    };
  }

  it('Host WhiteboardEngine: getComputedStyle(upperCanvasEl).backgroundColor é transparente e lowerCanvasEl tem fundo rgb(255, 255, 255)', () => {
    const container = document.createElement('div');
    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);
    document.body.appendChild(container);

    const engine = new WhiteboardEngine(canvasEl, { autor: 'host' });

    const upperEl = engine.canvas.upperCanvasEl;
    const lowerEl = engine.canvas.lowerCanvasEl;

    expect(upperEl).toBeDefined();
    expect(lowerEl).toBeDefined();

    const upperBg = window.getComputedStyle(upperEl).backgroundColor;
    const lowerBg = window.getComputedStyle(lowerEl).backgroundColor;

    // Regra D11.1: upperCanvasEl DEVE ser transparente ('transparent' ou 'rgba(0, 0, 0, 0)')
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(upperBg);

    // Regra D11.1: lowerCanvasEl DEVE ter fundo 'rgb(255, 255, 255)'
    expect(['rgb(255, 255, 255)', '#ffffff']).toContain(lowerBg);

    engine.dispose();
    container.remove();
  });

  it('Guest WhiteboardEngine: getComputedStyle(upperCanvasEl).backgroundColor é transparente e lowerCanvasEl tem fundo rgb(255, 255, 255)', () => {
    const container = document.createElement('div');
    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);
    document.body.appendChild(container);

    const engine = new WhiteboardEngine(canvasEl, { autor: 'guest' });

    const upperEl = engine.canvas.upperCanvasEl;
    const lowerEl = engine.canvas.lowerCanvasEl;

    expect(upperEl).toBeDefined();
    expect(lowerEl).toBeDefined();

    const upperBg = window.getComputedStyle(upperEl).backgroundColor;
    const lowerBg = window.getComputedStyle(lowerEl).backgroundColor;

    // Regra D11.1: upperCanvasEl DEVE ser transparente no Guest também
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(upperBg);

    // Regra D11.1: lowerCanvasEl DEVE ter fundo branco no Guest
    expect(['rgb(255, 255, 255)', '#ffffff']).toContain(lowerBg);

    engine.dispose();
    container.remove();
  });
});
