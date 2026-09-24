# Issues - ferramenta Texto não aceita digitação (2026-09-24)

- **Sintoma:** com a ferramenta Texto, clicar no quadro cria sempre a palavra literal "Texto" e o que o usuário
  digita é ignorado. Aparece na própria captura que o dono mandou em 2026-09-24 (a palavra "Texto" em verde)
  e em `evidencia/tela-com-placeholder-Texto.png`.
- **NÃO é regressão da Fase 08 (D12).** Confirmado rodando `evidencia/teste-texto.cjs` nas duas branches:
  `main` (antes do D12) e `fase/08-ferramentas-sem-mover` dão o MESMO resultado
  (`textos no canvas: ["Texto"]`, `RESULTADO: FALHA`). O bug é anterior, da Fase 06.
- **Causa raiz (lida no código, `src/shared/canvas/engine.ts`):** `handleTextCreation` abre a edição
  (`textObj.enterEditing()`, linha ~851) e, na ÚLTIMA linha do mesmo método (~908), chama
  `this.setTool('select')`. O `setTool` chama `discardActiveObject()` (e, desde o D12, também
  `exitEditing()`), encerrando a edição no mesmo instante em que ela foi aberta. O handler
  `editing:exited`/`deselected` dispara `commitText`, que grava o valor atual do objeto — o placeholder
  "Texto" — e emite o `DRAW_ADD`. O usuário nunca chega a digitar.
- **Como reproduzir em 1 comando:** `node Issues/20260924-180000-texto-nao-aceita-digitacao/evidencia/teste-texto.cjs`
  (abre o app buildado, clica com a ferramenta Texto, digita "OiMundo" e confere o objeto no canvas).
- **Achado por varredura do chefe:** as outras 7 ferramentas, DESFAZER/REFAZER, as duas borrachas, a
  Seleção, Limpar Tela e a exportação PNG foram exercitadas com captura de TELA real e passaram.
