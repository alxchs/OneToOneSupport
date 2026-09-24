Contexto: LEIA AGENTS.md inteiro (em especial as duas últimas lições: automação/CDP dá falso PASS e a de
2026-09-24 sobre captura de TELA real) e `Issues/20260924-150000-ferramentas-nao-movem-objetos/LEIA-ME.md`.
Trabalhe numa branch nova a partir da `main`: `git switch -c fase/08-ferramentas-sem-mover`. Não faça push
nem merge. Não altere `docs/reviews/postmortem-desenho-some.md` nem os relatórios de diagnóstico antigos.
Escopo: SOMENTE o Host. O motor (`WhiteboardEngine`) é compartilhado com o Guest, então não regrida o Guest
(a sonda cobre), mas não dedique trabalho novo ao Guest.

## D12 (único objetivo) — Ferramentas de desenho nunca movem objetos existentes

### D12.1 — Correção
Nas ferramentas `pencil`, `brush`, `rectangle`, `ellipse`, `line`, `arrow`, `text` e `eraser` (borracha de
trecho), um mousedown/touchstart sobre um objeto existente NÃO pode selecioná-lo, arrastá-lo, redimensioná-lo
nem girá-lo: só desenha. Sugestão validada pela leitura do Fabric 6 (confirme lendo
`node_modules/fabric/dist/src/canvas/Canvas.mjs`/`SelectableCanvas.mjs`, não copie cegamente): em
`setTool`, `this.canvas.skipTargetFind = !(tool === 'select' || tool === 'object_eraser')`. A ferramenta
`object_eraser` PRECISA continuar achando o alvo sob o cursor (usa `opt.target` em `handleEraserAction`), e
`select` continua selecionando. Garanta também que `discardActiveObject()` e a saída do modo de edição de
texto continuem corretos ao trocar de ferramenta, e que objetos criados enquanto uma ferramenta de desenho
está ativa nasçam sem controles ativos (`hasControls`, `hoverCursor` coerentes). Se houver caminho melhor,
justifique por escrito.

### D12.2 — Prova (tela real, entrada real)
Sonda nova (`tools/probe-runtime.cjs`, checagem `V3c`) ou teste Puppeteer dedicado, com `page.screenshot`
do clip do quadro E entrada real do Windows (`tools/drag-sendinput.ps1`; o fallback para `page.mouse` só é
aceitável se você registrar que o SendInput foi bloqueado):
1. Para cada tipo de objeto existente (path de mão livre, retângulo, elipse, linha, seta, texto) e cada
   ferramenta de desenho (as 8 acima), desenhe o objeto A, guarde a captura da região de A, e então inicie
   um novo traço com o mousedown DENTRO/SOBRE A e arraste alguns pixels.
2. Afirme: (a) `left`/`top`/`angle`/`scaleX`/`scaleY` de A em `engine.canvas.getObjects()` inalterados;
   (b) na captura de tela, os pixels da região de A que não foram cobertos pelo traço novo permanecem no
   mesmo lugar (compare com a captura anterior, tolerância de antisserrilhado); (c) o número de elementos
   visíveis subiu em exatamente 1.
3. Prove que a sonda FALHA sem a correção (reverta só a linha do D12.1, cole a saída falhando, restaure e cole
   passando), como já feito no D11.
4. Regressão obrigatória: `select` ainda seleciona e arrasta; `object_eraser` ainda apaga o alvo;
   `eraser` (trecho) ainda apaga; V3 e V3b continuam passando; `npm run verify` completo verde.

### D12.3 — Decisão de produto (NÃO implemente; relate)
No modo `select`, mover um objeto é mutação só local: não existe evento de mover, não persiste, não
sincroniza com o Guest, e some na próxima reconstrução. Verifique isso com um teste/observação real (mova um
objeto com `select`, feche e reabra a sessão, ou force `renderState`) e descreva o resultado em
`docs/reviews/autoauditoria-ferramentas-sem-mover.md`, com 2 ou 3 opções para o dono decidir (ex.: remover
o arrasto do `select`; ou criar evento `DRAW_MOVE` com reducer/undo/sync, o que exige ADR). Não decida por ele.

## Proibido
Não transforme formas em imagens rasterizadas nem mude o modelo de eventos. Não desligue `select` nem
`object_eraser`. Não invente nomes de arquivo, função ou evento.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-ferramentas-sem-mover.md` (critério → comando → saída
real → PASS/FAIL, e o que NÃO foi verificado); `docs/HANDOFF.md` com parágrafo curto em português simples
para o dono; commit local único na branch `fase/08-ferramentas-sem-mover`, sem push.
