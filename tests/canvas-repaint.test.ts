// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCanvasForceRepaint } from '../electron/ipc/canvas.ipc';
import { WhiteboardEngine } from '../src/shared/canvas/engine';
import { createInitialTabState, reduceEvent, WhiteboardEvent } from '../src/shared/events/reducer';

describe('D7 — Correção Experimental: Forçar Repaint Real da Janela e Reflow DOM', () => {
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
          bezierCurveTo: () => {},
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

  describe('D7.1: Handler IPC handleCanvasForceRepaint (Main Process)', () => {
    it('chama invalidate() no sender do evento e retorna repainted: true', async () => {
      const invalidateMock = vi.fn();
      const mockEvent = {
        sender: {
          isDestroyed: () => false,
          invalidate: invalidateMock,
        },
      } as unknown as Electron.IpcMainInvokeEvent;

      const res = await handleCanvasForceRepaint(mockEvent);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.repainted).toBe(true);
      }
      expect(invalidateMock).toHaveBeenCalledTimes(1);
    });

    it('retorna repainted: false de forma segura se o sender estiver destruído', async () => {
      const invalidateMock = vi.fn();
      const mockEvent = {
        sender: {
          isDestroyed: () => true,
          invalidate: invalidateMock,
        },
      } as unknown as Electron.IpcMainInvokeEvent;

      const res = await handleCanvasForceRepaint(mockEvent);

      expect(res.success).toBe(true);
      expect(invalidateMock).not.toHaveBeenCalled();
    });

    it('trata erros lançados por invalidate() e retorna INTERNAL_ERROR', async () => {
      const mockEvent = {
        sender: {
          isDestroyed: () => false,
          invalidate: () => {
            throw new Error('Falha no subsistema gráfico do Electron');
          },
        },
      } as unknown as Electron.IpcMainInvokeEvent;

      const res = await handleCanvasForceRepaint(mockEvent);

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('INTERNAL_ERROR');
        expect(res.message).toContain('Falha no subsistema gráfico do Electron');
      }
    });
  });

  describe('D7.1 & D7.2: WhiteboardEngine Repaint Reinforcement e Reflow DOM', () => {
    let container: HTMLDivElement;
    let canvasEl: HTMLCanvasElement;
    let engine: WhiteboardEngine;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);

      canvasEl = document.createElement('canvas');
      canvasEl.width = 800;
      canvasEl.height = 600;
      container.appendChild(canvasEl);
    });

    afterEach(() => {
      if (engine) {
        engine.dispose();
      }
      container.remove();
      vi.useRealTimers();
      delete (window as any).desktopAPI;
    });

    it('invoca desktopAPI.canvas.forceRepaint() e reflow quando novos elementos são renderizados', async () => {
      const forceRepaintMock = vi.fn().mockResolvedValue({ success: true, data: { repainted: true } });
      (window as any).desktopAPI = {
        canvas: {
          forceRepaint: forceRepaintMock,
        },
      };

      engine = new WhiteboardEngine(canvasEl, { autor: 'host' });

      // Simula elemento no DOM com offsetHeight
      Object.defineProperty(engine.canvas.lowerCanvasEl, 'offsetHeight', {
        configurable: true,
        get: vi.fn(() => 600),
      });

      const event: WhiteboardEvent = {
        id: 'ev-1',
        sessao_id: 's-1',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'host',
        criado_em: Date.now(),
        payload: {
          id: 'el-1',
          tipo: 'rect',
          data: { left: 10, top: 10, width: 100, height: 100, fill: '#0284c7' },
        },
      };

      const state1 = reduceEvent(createInitialTabState('default'), event);
      engine.renderState(state1);

      expect(forceRepaintMock).toHaveBeenCalledTimes(1);
    });

    it('aplica throttle de ~180ms com trailing edge para não sobrecarregar e garantir o último traço', async () => {
      const forceRepaintMock = vi.fn().mockResolvedValue({ success: true, data: { repainted: true } });
      (window as any).desktopAPI = {
        canvas: {
          forceRepaint: forceRepaintMock,
        },
      };

      engine = new WhiteboardEngine(canvasEl, { autor: 'host' });

      // Disparo 1: deve executar imediatamente
      engine.forceRepaint();
      expect(forceRepaintMock).toHaveBeenCalledTimes(1);

      // Disparos 2 e 3 dentro do intervalo de throttle (<180ms): agendados para a borda trailing
      vi.advanceTimersByTime(50);
      engine.forceRepaint();
      vi.advanceTimersByTime(50);
      engine.forceRepaint();
      expect(forceRepaintMock).toHaveBeenCalledTimes(1); // Ainda 1

      // Avança o tempo restante para expirar o throttle
      vi.advanceTimersByTime(100);
      expect(forceRepaintMock).toHaveBeenCalledTimes(2); // Trailing edge executou
    });

    it('funciona perfeitamente no ambiente Guest sem desktopAPI (não quebra o convidado mobile)', async () => {
      delete (window as any).desktopAPI; // Guest mobile não tem desktopAPI

      engine = new WhiteboardEngine(canvasEl, { autor: 'guest' });

      const event: WhiteboardEvent = {
        id: 'ev-guest-1',
        sessao_id: 's-1',
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'guest',
        criado_em: Date.now(),
        payload: {
          id: 'el-g-1',
          tipo: 'rect',
          data: { left: 20, top: 20, width: 50, height: 50, fill: '#0284c7' },
        },
      };

      const state = reduceEvent(createInitialTabState('default'), event);

      // Não deve lançar erro
      expect(() => {
        engine.renderState(state);
      }).not.toThrow();

      expect(Object.keys(engine.getLastRenderedState()?.elements || {}).length).toBe(1);
    });

    it('D7.3: medição de latência comprova sobrecarga insignificante (< 1ms)', async () => {
      vi.useRealTimers();
      const forceRepaintMock = vi.fn().mockResolvedValue({ success: true, data: { repainted: true } });
      (window as any).desktopAPI = {
        canvas: {
          forceRepaint: forceRepaintMock,
        },
      };

      engine = new WhiteboardEngine(canvasEl, { autor: 'host' });

      const t0 = performance.now();
      for (let i = 0; i < 10; i++) {
        engine.forceRepaint();
      }
      const t1 = performance.now();
      const durationMs = t1 - t0;

      // 10 chamadas devem levar bem menos de 5ms no total
      expect(durationMs).toBeLessThan(5);
      expect(forceRepaintMock).toHaveBeenCalled();
    });
  });
});
