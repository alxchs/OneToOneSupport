Contexto: LEIA AGENTS.md inteiro antes de começar, em especial "Lições específicas do projeto" (Fase 07,
sumiço do desenho) e leia `docs/reviews/diagnostico-sync-3.md` (rodada 5, log real + repro que o chefe rodou
e NÃO reproduziu com traços separados/pausados). Esta ordem é **só investigação e documentação, NÃO
correção de código**. Não altere `src/`, `electron/`, `tests/` nem nada executável — só leia, rastreie, rode
o app manualmente se precisar observar, e escreva o relatório pedido abaixo. Não faça push nem merge.

## Pedido literal do dono
> "peça para a agy investigar tudo que é feito quando eu solto o pressionamento do botão do mouse depois
> que eu acabo o traço. Pode ser que mostre alguma coisa. Veja também se estão colando objetos com o que eu
> desenho ou se está escrevendo no canvas ou algo semelhante"

## O que investigar (obrigatório)

### I1 — Trace completo de `mouse:up` até o pixel na tela, para a ferramenta lápis (`pencil`)
Comece em `src/shared/canvas/engine.ts`. O fluxo hoje, pelo que o chefe já leu, é:
1. `setTool('pencil')` (por volta da linha 867) cria um `PencilBrush` do Fabric.js e liga
   `canvas.isDrawingMode = true`. A partir daí, o Fabric (não o código deste projeto) trata
   `mouse:down`/`mouse:move`/`mouse:up` internamente via `node_modules/fabric/dist/src/brushes/PencilBrush.mjs`
   (`_finalizeAndAddPath`, por volta da linha 259) e dispara o evento `path:created` no fim.
2. O listener registrado em `setupEngineEventListeners` (por volta da linha 465) recebe `path:created`,
   pega `opt.path` (o objeto `Path` que o Fabric acabou de criar e JÁ ADICIONOU ao canvas dentro do próprio
   Fabric), chama `pathObj.toObject()` para extrair os dados, **remove esse objeto do canvas imediatamente**
   (`this.canvas.remove(pathObj)`, linha ~475) e emite um evento `DRAW_ADD` (`onEmitEvent`) com esses dados.
3. Esse evento sobe até `aplicarEventoQuadro` (`src/host/store/useHostStore.ts`, linha ~402), que roda
   `reduceEvent` (`src/shared/events/reducer.ts`) sobre o estado da aba e chama `set({ tabState: ... })`.
4. A mudança de `tabState` dispara o `useEffect` em `src/host/pages/QuadroBrancoPage.tsx` (linha ~117-121)
   que chama `engine.renderState(tabState)` de novo.
5. `renderState` (`engine.ts`, linha ~1007) reconstrói o objeto Fabric a partir do dado salvo, usando
   `createFabricObjectFromData(el.tipo, el.data)` (linha ~81), e o adiciona de volta ao canvas
   (`this.canvas.add(fabricObj)`).

Confirme (lendo o código, e se precisar rodando o app com `tools\homologar.ps1` e olhando o DevTools do Host
com `console.trace`/breakpoint) se é EXATAMENTE isso que acontece, passo a passo, para UM traço de lápis.
Escreva a confirmação linha por linha (arquivo:linha real) em `docs/reviews/investigacao-mouseup.md`.

### I2 — "Colar por cima" vs "escrever": o objeto reconstruído é vetorial ou um carimbo raster?
Responda com evidência concreta (não opinião):
1. `createFabricObjectFromData` reconstrói o traço como `new Path(data.path, {...})` (`engine.ts`, caso
   `'path'`, linha ~103-120) — ou seja, é um objeto **vetorial** (mesmos comandos SVG do traço original),
   não uma imagem rasterizada colada por cima. Confirme isso é realmente o que roda (não o caminho
   `'eraser_stroke'`, que usa `globalCompositeOperation: 'destination-out'` e é isso sim um "carimbo" que
   apaga o que está embaixo — mas só quando a ferramenta ativa é `eraser`, não `pencil`).
2. Verifique se em ALGUM ponto do fluxo (entre `path:created` e o `canvas.add` final em `renderState`) o
   traço passa por qualquer conversão para bitmap/imagem (`toDataURL`, `Image`, `drawImage`, `putImageData`
   fora do que é esperado) que pudesse justificar a sensação de "colar em cima" ao invés de desenhar.
   `grep` por essas chamadas em `src/shared/canvas/engine.ts` e liste cada ocorrência com o que ela faz.
3. Verifique a ORDEM Z (empilhamento) dos objetos: `canvas.add(fabricObj)` em `renderState` (linha ~1032)
   sempre empilha o elemento novo por cima dos existentes (comportamento normal de desenho). Confirme que
   NENHUM outro código deste projeto chama `canvas.moveTo`, `sendToBack`, `bringToFront` ou reordena objetos
   de um jeito que pudesse fazer um traço novo cobrir a ÁREA de um traço antigo sem motivo (ex.: um traço
   fino escrito sobre uma área que já tinha um traço largo ali do lado, se a posição estiver errada, o novo
   traço "risca por cima" do lugar errado — isso PARECE "colar em cima" mesmo sendo vetor).

### I3 — Timing entre remover e readicionar (linha 475 → renderState)
O objeto é removido do canvas em `path:created` (síncrono) e só reaparece quando `renderState` roda de
novo, que depende de: `onEmitEvent` → `aplicarEventoQuadro` (síncrono até o primeiro `await`) →
`set({ tabState })` (síncrono) → React re-renderizar `QuadroBrancoPage` e rodar o `useEffect` de
`renderState` (isso é ASSÍNCRONO — React agenda o efeito, não roda na mesma "volta" de JS).
1. Meça (com `performance.now()` temporário ou observando) quanto tempo passa, na prática, entre a remoção
   em `path:created` e a readição em `renderState`. É perceptível a olho nu (>1 frame, ~16ms)? Em máquina
   sob carga (Electron + build de produção) pode ser maior que em dev — teste nos dois modos.
2. Se o usuário soltar o botão e imediatamente começar OUTRO traço nesse intervalo (ex.: escrita cursiva
   rápida, várias letras em sequência sem pausa), o que acontece com o traço que está temporariamente
   REMOVIDO do canvas mas ainda não readicionado, se um SEGUNDO `path:created` disparar antes do primeiro
   `renderState` rodar? Existe uma janela onde dois traços ficam "invisíveis" ao mesmo tempo e um deles some
   visualmente por mais tempo que o outro? Documente com um teste manual cronometrado (grave sua própria
   tela rodando `tools\homologar.ps1`, desenhe rápido, e veja se PISCA/some algum traço por uma fração de
   segundo — anote o resultado, mesmo que seja "não percebi nada").

### I4 — Diferença de comportamento Host vs Guest
`src/guest/GuestRoom.tsx` tem sua própria cópia da lógica de ferramenta/desenho (grep `pencil`, `eraser`,
`path:created` nesse arquivo). Ela segue exatamente o mesmo padrão de I1-I3, ou existe alguma diferença
(ex.: throttle de eventos por toque, debounce, coalescing de `touchmove`) que pudesse fazer o Guest
"engolir" ou atrasar mais traços que o Host? O log real do dono (`docs/reviews/diagnostico-sync-3.md`)
mostrou 5 dos 8 traços vindos do Guest — vale conferir se o comportamento lá é idêntico.

## Proibido
Não altere código de produção nesta ordem. Não conclua "encontrei o bug e corrigi" — o objetivo é só
entender e documentar o mecanismo real, com trechos de código citados por arquivo:linha, para o chefe
decidir a próxima correção com base em fatos, não em suposição. Se ao investigar você REALMENTE encontrar um
bug óbvio e comprovável (ex.: uma chamada que claramente apaga/sobrescreve o que não devia), documente-o com
a linha exata e a reprodução, mas não aplique a correção nesta rodada — deixe para uma ordem seguinte, já
com a causa confirmada.

## Ao final
Escreva `docs/reviews/investigacao-mouseup.md` respondendo I1 a I4, cada afirmação técnica citando
arquivo:linha real (o verificador de afirmações do projeto confere isso). Não crie nem modifique nenhum
outro arquivo. Commit único com a mensagem descrevendo que é investigação, sem alteração de comportamento.
Atualize `docs/HANDOFF.md` com um parágrafo curto resumindo a conclusão principal (achou pista ou não achou).
