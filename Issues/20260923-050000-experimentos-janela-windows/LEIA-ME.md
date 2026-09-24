# Issues - experimentos de janela do Electron no Windows (2026-09-23)

- `ordem-correcao.md`: D10 — bateria de experimentos LIGÁVEIS por variável de ambiente (nada muda no
  comportamento padrão) para o dono testar na máquina real e isolar qual, se algum, resolve o "desenho some".
- Estado da investigação (9 rodadas): camada de dados, buffer de pixel do canvas, CSS/DOM, exceções JS, GPU
  ligada/desligada, StrictMode e repaint forçado dentro do processo (D7) estão TODOS descartados como causa
  (ver `docs/reviews/diagnostico-sync-5-repaint.md`, `docs/reviews/investigacao-render-pipeline.md` e os
  commits D4-D9). O que sobra: algo na ENTREGA do quadro pronto à tela pelo Windows (oclusão nativa,
  throttling de fundo do Chromium, swapchain preso após reset de driver) — não observável de dentro da página.
- Por isso os experimentos são no PROCESSO PRINCIPAL (`electron/main.ts`), não no renderer.
