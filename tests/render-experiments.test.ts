import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseRenderExperiments,
  applyOcclusionSwitch,
  executeWindowNudge,
  resetNudgeThrottle,
  clearWarnedTokens,
  getActiveExperiments,
  isExperimentActive,
  applyPreReadyExperiments,
  KNOWN_EXPERIMENTS,
} from '../electron/experiments';
import { handleCanvasForceRepaint } from '../electron/ipc/canvas.ipc';

describe('D10 — Experimentos de Renderização (ONETOONE_RENDER_EXPERIMENT)', () => {
  const originalEnv = process.env.ONETOONE_RENDER_EXPERIMENT;
  const originalDiag = process.env.ONETOONE_DIAG;

  beforeEach(() => {
    delete process.env.ONETOONE_RENDER_EXPERIMENT;
    delete process.env.ONETOONE_DIAG;
    resetNudgeThrottle();
    clearWarnedTokens();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ONETOONE_RENDER_EXPERIMENT = originalEnv;
    } else {
      delete process.env.ONETOONE_RENDER_EXPERIMENT;
    }
    if (originalDiag !== undefined) {
      process.env.ONETOONE_DIAG = originalDiag;
    } else {
      delete process.env.ONETOONE_DIAG;
    }
    resetNudgeThrottle();
    clearWarnedTokens();
    vi.restoreAllMocks();
  });

  describe('1. Comportamento Padrão (Sem a variável)', () => {
    it('sem ONETOONE_RENDER_EXPERIMENT: nenhum experimento é ativado', () => {
      expect(getActiveExperiments()).toEqual([]);
      expect(isExperimentActive('occlusion')).toBe(false);
      expect(isExperimentActive('nothrottle')).toBe(false);
      expect(isExperimentActive('nudge')).toBe(false);
    });

    it('string vazia ou espaços em branco não ativam nenhum experimento', () => {
      process.env.ONETOONE_RENDER_EXPERIMENT = '   ';
      expect(getActiveExperiments()).toEqual([]);
      expect(isExperimentActive('occlusion')).toBe(false);
      expect(isExperimentActive('nothrottle')).toBe(false);
      expect(isExperimentActive('nudge')).toBe(false);
    });

    it('sem ONETOONE_RENDER_EXPERIMENT: applyPreReadyExperiments não altera commandLine', () => {
      const appendSwitchMock = vi.fn();
      const mockCommandLine = {
        getSwitchValue: vi.fn().mockReturnValue(''),
        appendSwitch: appendSwitchMock,
      };

      applyPreReadyExperiments(mockCommandLine, 'win32');
      expect(appendSwitchMock).not.toHaveBeenCalled();
    });

    it('sem ONETOONE_RENDER_EXPERIMENT: handleCanvasForceRepaint não efetua nudge', async () => {
      const mockSender = {
        isDestroyed: vi.fn().mockReturnValue(false),
        invalidate: vi.fn(),
      };
      const mockEvent = { sender: mockSender } as any;

      const res = await handleCanvasForceRepaint(mockEvent);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.repainted).toBe(true);
        expect(res.data.nudged).toBe(false);
      }
      expect(mockSender.invalidate).toHaveBeenCalled();
    });
  });

  describe('2. Parser de Experimentos (parseRenderExperiments)', () => {
    it('faz parse de experimentos individuais', () => {
      expect(parseRenderExperiments('occlusion')).toEqual({
        active: ['occlusion'],
        unknown: [],
      });
      expect(parseRenderExperiments('nothrottle')).toEqual({
        active: ['nothrottle'],
        unknown: [],
      });
      expect(parseRenderExperiments('nudge')).toEqual({
        active: ['nudge'],
        unknown: [],
      });
    });

    it('faz parse de lista separada por vírgula com espaços', () => {
      const parsed = parseRenderExperiments(' occlusion , nothrottle ');
      expect(parsed.active).toContain('occlusion');
      expect(parsed.active).toContain('nothrottle');
      expect(parsed.active.length).toBe(2);
      expect(parsed.unknown).toEqual([]);
    });

    it('faz parse de "all" ativando todos os experimentos conhecidos', () => {
      const parsed = parseRenderExperiments('all');
      expect(parsed.active).toEqual([...KNOWN_EXPERIMENTS]);
      expect(parsed.unknown).toEqual([]);
    });

    it('ignora nomes desconhecidos sem derrubar o parser', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.ONETOONE_RENDER_EXPERIMENT = 'occlusion,experimento_fantasma_123,nudge';

      const active = getActiveExperiments();
      expect(active).toContain('occlusion');
      expect(active).toContain('nudge');
      expect(active).not.toContain('experimento_fantasma_123');
      expect(active.length).toBe(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("experimento desconhecido ignorado: 'experimento_fantasma_123'")
      );
    });
  });

  describe('3. Experimento "occlusion" (CalculateNativeWinOcclusion)', () => {
    it('no Windows (win32): adiciona switch disable-features com CalculateNativeWinOcclusion', () => {
      const appendSwitchMock = vi.fn();
      const mockCommandLine = {
        getSwitchValue: vi.fn().mockReturnValue(''),
        appendSwitch: appendSwitchMock,
      };

      const applied = applyOcclusionSwitch(mockCommandLine, 'win32');
      expect(applied).toBe(true);
      expect(appendSwitchMock).toHaveBeenCalledWith('disable-features', 'CalculateNativeWinOcclusion');
    });

    it('no Windows (win32): se já houver disable-features, concatena com vírgula sem sobrescrever', () => {
      const appendSwitchMock = vi.fn();
      const mockCommandLine = {
        getSwitchValue: vi.fn().mockReturnValue('ExistingFeature1,ExistingFeature2'),
        appendSwitch: appendSwitchMock,
      };

      const applied = applyOcclusionSwitch(mockCommandLine, 'win32');
      expect(applied).toBe(true);
      expect(appendSwitchMock).toHaveBeenCalledWith(
        'disable-features',
        'ExistingFeature1,ExistingFeature2,CalculateNativeWinOcclusion'
      );
    });

    it('no Windows (win32): não duplica se CalculateNativeWinOcclusion já estiver presente', () => {
      const appendSwitchMock = vi.fn();
      const mockCommandLine = {
        getSwitchValue: vi.fn().mockReturnValue('CalculateNativeWinOcclusion,OtherFeature'),
        appendSwitch: appendSwitchMock,
      };

      const applied = applyOcclusionSwitch(mockCommandLine, 'win32');
      expect(applied).toBe(true);
      expect(appendSwitchMock).not.toHaveBeenCalled();
    });

    it('fora do Windows (darwin / linux): não aplica o switch', () => {
      const appendSwitchMock = vi.fn();
      const mockCommandLine = {
        getSwitchValue: vi.fn().mockReturnValue(''),
        appendSwitch: appendSwitchMock,
      };

      const applied = applyOcclusionSwitch(mockCommandLine, 'darwin');
      expect(applied).toBe(false);
      expect(appendSwitchMock).not.toHaveBeenCalled();
    });
  });

  describe('4. Experimento "nothrottle"', () => {
    it('ativa nothrottle quando especificado na variável', () => {
      process.env.ONETOONE_RENDER_EXPERIMENT = 'nothrottle';
      expect(isExperimentActive('nothrottle')).toBe(true);
      expect(isExperimentActive('occlusion')).toBe(false);
      expect(isExperimentActive('nudge')).toBe(false);
    });
  });

  describe('5. Experimento "nudge" (Recomposição forçada de 1px com throttle)', () => {
    it('executa o empurrãozinho de 1px na largura e restaura os bounds', async () => {
      vi.useFakeTimers();

      const initialBounds = { x: 100, y: 100, width: 800, height: 600 };
      const setBoundsMock = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        isMaximized: vi.fn().mockReturnValue(false),
        isFullScreen: vi.fn().mockReturnValue(false),
        getBounds: vi.fn().mockReturnValue({ ...initialBounds }),
        setBounds: setBoundsMock,
      } as any;

      const result = executeWindowNudge(mockWin);
      expect(result.nudged).toBe(true);
      expect(setBoundsMock).toHaveBeenCalledWith({
        x: 100,
        y: 100,
        width: 801,
        height: 600,
      });

      // Avança o frame
      vi.advanceTimersByTime(20);
      expect(setBoundsMock).toHaveBeenLastCalledWith(initialBounds);

      vi.useRealTimers();
    });

    it('aplica throttle obrigatório de ~300ms entre nudges', () => {
      const initialBounds = { x: 100, y: 100, width: 800, height: 600 };
      const setBoundsMock = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        isMaximized: vi.fn().mockReturnValue(false),
        isFullScreen: vi.fn().mockReturnValue(false),
        getBounds: vi.fn().mockReturnValue({ ...initialBounds }),
        setBounds: setBoundsMock,
      } as any;

      const r1 = executeWindowNudge(mockWin);
      expect(r1.nudged).toBe(true);

      // Segunda chamada imediata é retida pelo throttle
      const r2 = executeWindowNudge(mockWin);
      expect(r2.nudged).toBe(false);
      expect(r2.motivo).toBe('throttled');
    });

    it('se a janela estiver maximizada, NÃO redimensiona e pula registrando motivo', () => {
      const setBoundsMock = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        isMaximized: vi.fn().mockReturnValue(true),
        isFullScreen: vi.fn().mockReturnValue(false),
        getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080 }),
        setBounds: setBoundsMock,
      } as any;

      const result = executeWindowNudge(mockWin);
      expect(result.nudged).toBe(false);
      expect(result.motivo).toBe('maximizada');
      expect(setBoundsMock).not.toHaveBeenCalled();
    });

    it('se a janela estiver fullscreen, NÃO redimensiona e pula registrando motivo', () => {
      const setBoundsMock = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        isMaximized: vi.fn().mockReturnValue(false),
        isFullScreen: vi.fn().mockReturnValue(true),
        getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080 }),
        setBounds: setBoundsMock,
      } as any;

      const result = executeWindowNudge(mockWin);
      expect(result.nudged).toBe(false);
      expect(result.motivo).toBe('fullscreen');
      expect(setBoundsMock).not.toHaveBeenCalled();
    });

    it('se a janela já foi destruída, não lança exceção', () => {
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(true),
      } as any;

      const result = executeWindowNudge(mockWin);
      expect(result.nudged).toBe(false);
      expect(result.motivo).toBe('janela_inexistente');
    });
  });

  describe('6. Modo "all"', () => {
    it('all ativa occlusion, nothrottle e nudge simultaneamente', () => {
      process.env.ONETOONE_RENDER_EXPERIMENT = 'all';
      expect(isExperimentActive('occlusion')).toBe(true);
      expect(isExperimentActive('nothrottle')).toBe(true);
      expect(isExperimentActive('nudge')).toBe(true);
    });
  });
});
