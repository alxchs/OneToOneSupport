/**
 * Fonte única de verdade da Content Security Policy (CSP) do Guest conforme ADR-005.
 * Compartilhada entre o servidor Express (cabeçalho HTTP) e o build do Vite (meta tag HTML).
 */
export const GUEST_CSP =
  "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'self';";
