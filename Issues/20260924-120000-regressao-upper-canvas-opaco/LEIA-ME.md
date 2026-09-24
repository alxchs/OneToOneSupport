# Issues - regressão do upper-canvas opaco (2026-09-24)

- CAUSA RAIZ CONFIRMADA de "o desenho some ao soltar o mouse" (9 rodadas): `engine.ts` aplicava
  `backgroundColor = '#ffffff'` no `<canvas>` ANTES de `new Canvas(...)`. O Fabric cria o `.upper-canvas`
  copiando `style.cssText` do original (`CanvasDOMManager.createUpperCanvas`), então o upper ficava branco e
  opaco e cobria o `.lower-canvas` (onde ficam os traços). Ao soltar o mouse o traço ao vivo (upper) é limpo e
  a tela vira branco total. Os dados e o buffer de baixo sempre estiveram corretos (PNG, logs, sondas).
- Prova: captura de tela real (`page.screenshot`) do app, antes = quadro branco com 4904 px no canvas de
  baixo; depois da correção = traço visível. Correção já aplicada por mim (chefe) em `engine.ts`.
- Por que nunca foi pego: TODAS as provas de pixel do projeto (sonda V3, repros, D6.1) liam
  `lowerCanvasEl.getImageData`, nunca o que a TELA mostra. Ver ordem-correcao.md.
