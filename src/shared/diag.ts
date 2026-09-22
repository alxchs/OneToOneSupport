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

export function diagLog(checkpoint: string, data?: Record<string, unknown>): void {
  if (!isDiagEnabled()) return;

  const ts = new Date().toISOString();
  if (data) {
    // Sanitização de segurança: remove chaves sensíveis caso existam
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
    console.log(`[DIAG ${ts}] [${checkpoint}]`, JSON.stringify(safeData));
  } else {
    console.log(`[DIAG ${ts}] [${checkpoint}]`);
  }
}
