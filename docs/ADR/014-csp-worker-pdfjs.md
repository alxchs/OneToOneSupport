# ADR-014: Atualização da Content Security Policy (CSP) para Web Worker do PDF.js

## Contexto
A renderização de documentos PDF via `pdfjs-dist` (ADR-013) delega a análise sintática binária de arquivos e decodificação de fontes/streams a um Web Worker em segundo plano (`pdf.worker.mjs`), prevenindo congelamentos na thread principal de renderização da interface.
A Content Security Policy estrita definida no ADR-005 para o Convidado (`GUEST_CSP` em `src/shared/csp.ts`) não incluía a diretiva `worker-src`. Na ausência explícita de `worker-src`, o navegador recorre ao `default-src 'self'`, bloqueando a instanciação de Web Workers criados a partir de `blob:` URLs ou scripts dinâmicos empacotados.

## Decisão
1. **Inclusão da Diretiva `worker-src`:** A constante `GUEST_CSP` é atualizada para incluir `worker-src 'self' blob:;`.
2. **Preservação das Restrições Globais:** Mantêm-se inalteradas todas as demais diretivas de segurança:
   - `object-src 'none'` (bloqueia plugins e Flash)
   - `base-uri 'self'` (previne ataques de base-tag hijacking)
   - `style-src 'self' 'unsafe-inline'`
   - `script-src 'self' 'wasm-unsafe-eval'`
   - `img-src 'self' blob: data:`
   - `media-src 'self' blob:`
   - `connect-src 'self' ws: wss:`
3. **Validação no Artefato Final:** A conformidade da CSP deve ser garantida tanto no desenvolvimento quanto no bundle de produção gerado pelo build do Vite (`npm run build:guest` e `npm run build:host`).

## Consequências
- Permite que o PDF.js inicialize seus workers com segurança sem degradar o isolamento do navegador.
- Zero aberturas para origens de terceiros ou fontes não confiáveis de scripts.
