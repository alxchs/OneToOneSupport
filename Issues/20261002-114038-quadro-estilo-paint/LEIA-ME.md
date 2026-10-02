# Issues - Quadro com sensação de Paint: o usuário nunca vê que o desenho é um "objeto" (2026-10-02)

- Pedido do dono (2026-10-02), continuação do relato de 2026-09-24: "resolver a questão dos objetos de modo
  que não fique visível que é um objeto e que não gere uma experiência ruim. Imaginei algo como o Paint do
  Windows, que pro usuário, mesmo que seja um objeto, parece que desenho no canvas."
- O que já foi resolvido (não refazer): D12 (ferramentas de desenho não movem objetos, via
  `canvas.skipTargetFind`) e D15 (Seleção não arrasta; constante `ARRASTO_NO_MODO_SELECAO_HABILITADO`).
- Decisão de arquitetura do chefe: **os elementos continuam vetoriais por dentro** (cada traço/forma é um
  evento `DRAW_ADD` no event sourcing). Rasterizar quebraria a sincronização com o Guest, o desfazer/refazer,
  o histórico/revisões, as miniaturas do relatório PDF e a nitidez HiDPI. O que muda é só o que o usuário
  VÊ e SENTE: nenhuma moldura, alça, cursor de mover ou "pulo para a Seleção" em lugar nenhum.
- Onde o "objeto" aparece hoje (lido no código em 2026-10-02, não suposição):
  1. Botão "Selecionar e Mover Objeto" na barra do Host (`src/host/pages/QuadroBrancoPage.tsx`, ~linha 853).
     Com o D15 ele não move nada; só desenha uma moldura azul em volta do traço clicado.
  2. Depois de confirmar ou descartar um texto, a engine troca sozinha para `select`
     (`handleTextCreation` em `src/shared/canvas/engine.ts`, chamadas `this.setTool('select')`). O próximo
     clique do usuário cai na Seleção e mostra a moldura do objeto.
  3. Texto em edição nasce com `hasControls: true` e `hasRotatingPoint: true` (alças de redimensionar e
     girar); o botão se chama "Texto Rotacionável".
  4. Borracha (Objeto): `skipTargetFind = false` e objetos `selectable: true`; o clique pode ativar o objeto
     (moldura) antes de ele sumir; cursor `not-allowed` (sinal de "proibido").
  5. Com `skipTargetFind = false`, o `hoverCursor` padrão do Fabric é `move` ao passar sobre um objeto.
- Ordem: `ordem-correcao.md` nesta pasta. Branch: `fase/11-quadro-estilo-paint`.
