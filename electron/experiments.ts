import { app, BrowserWindow } from 'electron';
import { isDiagEnabled } from '../src/shared/diag';

export type RenderExperiment = 'occlusion' | 'nothrottle' | 'nudge';

export const KNOWN_EXPERIMENTS: readonly RenderExperiment[] = ['occlusion', 'nothrottle', 'nudge'] as const;

export interface ParsedExperiments {
  active: RenderExperiment[];
  unknown: string[];
}

const warnedTokens = new Set<string>();

export function clearWarnedTokens(): void {
  warnedTokens.clear();
}

/**
 * Faz o parse da variável ONETOONE_RENDER_EXPERIMENT.
 * Aceita lista separada por vírgula (ex.: "occlusion,nothrottle") ou "all".
 * Sem a variável ou com valor vazio, nenhum experimento é ativado.
 */
export function parseRenderExperiments(rawEnv?: string): ParsedExperiments {
  if (!rawEnv || typeof rawEnv !== 'string') {
    return { active: [], unknown: [] };
  }

  const trimmed = rawEnv.trim();
  if (!trimmed) {
    return { active: [], unknown: [] };
  }

  if (trimmed.toLowerCase() === 'all') {
    return {
      active: [...KNOWN_EXPERIMENTS],
      unknown: [],
    };
  }

  const items = trimmed.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const activeSet = new Set<RenderExperiment>();
  const unknownList: string[] = [];

  for (const item of items) {
    if (item === 'all') {
      for (const exp of KNOWN_EXPERIMENTS) {
        activeSet.add(exp);
      }
    } else if ((KNOWN_EXPERIMENTS as readonly string[]).includes(item)) {
      activeSet.add(item as RenderExperiment);
    } else {
      unknownList.push(item);
    }
  }

  return {
    active: Array.from(activeSet),
    unknown: unknownList,
  };
}

export function warnUnknownExperiments(unknownList: string[]): void {
  for (const unk of unknownList) {
    if (!warnedTokens.has(unk)) {
      warnedTokens.add(unk);
      console.warn(`[Main] ONETOONE_RENDER_EXPERIMENT: experimento desconhecido ignorado: '${unk}'`);
    }
  }
}

/**
 * Retorna a lista de experimentos ativos com base em process.env.ONETOONE_RENDER_EXPERIMENT.
 */
export function getActiveExperiments(): RenderExperiment[] {
  const envVal = typeof process !== 'undefined' && process.env ? process.env.ONETOONE_RENDER_EXPERIMENT : undefined;
  const parsed = parseRenderExperiments(envVal);
  if (parsed.unknown.length > 0) {
    warnUnknownExperiments(parsed.unknown);
  }
  return parsed.active;
}

export function isExperimentActive(name: RenderExperiment): boolean {
  return getActiveExperiments().includes(name);
}

/**
 * Aplica switch de linha de comando para o experimento 'occlusion'.
 * app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion') (só process.platform === 'win32').
 * Se já houver disable-features, concatena com vírgula sem sobrescrever.
 */
export function applyOcclusionSwitch(
  commandLine: { getSwitchValue(s: string): string; appendSwitch(s: string, val?: string): void },
  platform: string = process.platform
): boolean {
  if (platform !== 'win32') {
    return false;
  }
  const feature = 'CalculateNativeWinOcclusion';
  const existing = commandLine.getSwitchValue('disable-features');
  if (existing) {
    const list = existing.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes(feature)) {
      list.push(feature);
      commandLine.appendSwitch('disable-features', list.join(','));
    }
  } else {
    commandLine.appendSwitch('disable-features', feature);
  }
  return true;
}

/**
 * Aplica experimentos pré-ready (switches de linha de comando antes de app.whenReady()).
 */
export function applyPreReadyExperiments(
  appCommandLine?: { getSwitchValue(s: string): string; appendSwitch(s: string, val?: string): void },
  platform: string = process.platform
): void {
  const active = getActiveExperiments();
  const cmd = appCommandLine || (typeof app !== 'undefined' && app ? app.commandLine : undefined);
  if (active.includes('occlusion') && cmd) {
    applyOcclusionSwitch(cmd, platform);
  }
}

/**
 * Imprime UMA linha clara no terminal do Host na inicialização caso haja experimentos ativos.
 * Exemplo: [Main] ONETOONE_RENDER_EXPERIMENT ativo: occlusion, nothrottle, nudge
 */
export function printActiveExperiments(): void {
  const active = getActiveExperiments();
  if (active.length > 0) {
    console.log(`[Main] ONETOONE_RENDER_EXPERIMENT ativo: ${active.join(', ')}`);
  }
}

let lastNudgeTimestamp = 0;
export const NUDGE_THROTTLE_MS = 300;

export function resetNudgeThrottle(): void {
  lastNudgeTimestamp = 0;
}

/**
 * D10: Executa empurrãozinho (nudge) de 1px na largura da janela e restaura no frame seguinte.
 * Aplica throttle obrigatório de ~300ms.
 * Se a janela estiver maximizada ou em fullscreen, NÃO redimensiona e pula registrando no diagnóstico.
 */
export function executeWindowNudge(
  win?: BrowserWindow | null
): { nudged: boolean; motivo?: string } {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
    return { nudged: false, motivo: 'janela_inexistente' };
  }

  const now = Date.now();
  if (now - lastNudgeTimestamp < NUDGE_THROTTLE_MS) {
    return { nudged: false, motivo: 'throttled' };
  }

  const isMaximized = typeof win.isMaximized === 'function' && win.isMaximized();
  const isFullScreen = typeof win.isFullScreen === 'function' && win.isFullScreen();

  if (isMaximized || isFullScreen) {
    const motivo = isMaximized ? 'maximizada' : 'fullscreen';
    if (isDiagEnabled()) {
      const ts = new Date().toISOString();
      console.log(`[DIAG-HOST] [${ts}] [nudge_pular]`, JSON.stringify({ motivo }));
    }
    return { nudged: false, motivo };
  }

  lastNudgeTimestamp = now;

  try {
    const bounds = win.getBounds();
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width + 1,
      height: bounds.height,
    });

    if (isDiagEnabled()) {
      const ts = new Date().toISOString();
      console.log(
        `[DIAG-HOST] [${ts}] [nudge_executado]`,
        JSON.stringify({
          larguraOriginal: bounds.width,
          larguraNudge: bounds.width + 1,
        })
      );
    }

    setTimeout(() => {
      if (typeof win.isDestroyed === 'function' && !win.isDestroyed()) {
        win.setBounds(bounds);
      }
    }, 16);

    return { nudged: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { nudged: false, motivo: `erro: ${msg}` };
  }
}
