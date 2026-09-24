/**
 * Diagnóstico sob flag ONETOONE_DIAG=1 (V2)
 * Só ativo em desenvolvimento; estritamente ignorado em NODE_ENV=production.
 * Registra no console com timestamp e SEM segredos, tokens, chaves ou plaintext de mensagens.
 */

export function isDiagEnabled(): boolean {
  // Ignorar estritamente em ambiente de produção
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.ONETOONE_DIAG === '1') return true;
  }

  if (typeof window !== 'undefined') {
    const w = window as any;
    if (w.__NODE_ENV__ === 'production') return false;
    if (w.__ONETOONE_DIAG__) return true;
  }

  return false;
}

export function sanitizeDiagData(data: Record<string, unknown>): Record<string, unknown> {
  const safeData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const lower = k.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('key') ||
      lower.includes('nonce') ||
      lower.includes('hash') ||
      lower.includes('segredo') ||
      lower.includes('plaintext') ||
      lower.includes('pass')
    ) {
      safeData[k] = '[REDACTED]';
    } else {
      safeData[k] = v;
    }
  }
  return safeData;
}

export function diagLog(checkpoint: string, data?: Record<string, unknown>): void {
  if (!isDiagEnabled()) return;

  const ts = new Date().toISOString();
  const safeData = data ? sanitizeDiagData(data) : undefined;

  if (safeData) {
    console.log(`[DIAG ${ts}] [${checkpoint}]`, JSON.stringify(safeData));
  } else {
    console.log(`[DIAG ${ts}] [${checkpoint}]`);
  }

  // Encaminha diagnóstico do Host (renderer) para o processo principal via IPC (D1)
  if (typeof window !== 'undefined') {
    const w = window as any;
    if (typeof w.__ONETOONE_DIAG_FORWARD__ === 'function') {
      try {
        w.__ONETOONE_DIAG_FORWARD__(checkpoint, safeData);
      } catch {
        // noop
      }
    } else if (w.desktopAPI && typeof w.desktopAPI.diagForward === 'function') {
      try {
        w.desktopAPI.diagForward(checkpoint, safeData);
      } catch {
        // noop
      }
    }
  }
}

/**
 * Instala captura global de exceções não tratadas e promises rejeitadas sem catch, encaminhando
 * para o mesmo canal de diagnóstico (D1) que já chega ao terminal onde tools\homologar.ps1 roda.
 * Sem isso, uma exceção só aparece no console do DevTools (que o dono nunca abre) e pode
 * silenciosamente interromper um fluxo assíncrono (ex.: o listener de path:created no meio do
 * ciclo remove -> emitEvent -> renderState), fazendo um traço desenhado nunca ser readicionado
 * ao canvas sem deixar rastro nenhum no terminal.
 */
export function installGlobalErrorForwarding(origem: 'host' | 'guest'): void {
  if (typeof window === 'undefined') return;
  if (!isDiagEnabled()) return;

  window.addEventListener('error', (event: ErrorEvent) => {
    diagLog('erro_nao_capturado', {
      origem,
      mensagem: event.message,
      arquivo: event.filename,
      linha: event.lineno,
      coluna: event.colno,
      stack: event.error && event.error.stack ? String(event.error.stack) : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    diagLog('promise_rejeitada_sem_catch', {
      origem,
      mensagem: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error && reason.stack ? String(reason.stack) : undefined,
    });
  });
}

/**
 * Diagnóstico do Servidor (electron/server side) com prefixo [DIAG-SERVER] (D1)
 */
export function diagServerLog(checkpoint: string, data?: Record<string, unknown>): void {
  if (!isDiagEnabled()) return;

  const ts = new Date().toISOString();
  const safeData = data ? sanitizeDiagData(data) : undefined;

  if (safeData) {
    console.log(`[DIAG-SERVER] [${ts}] [${checkpoint}]`, JSON.stringify(safeData));
  } else {
    console.log(`[DIAG-SERVER] [${ts}] [${checkpoint}]`);
  }
}

