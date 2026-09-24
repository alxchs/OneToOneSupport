Contexto: LEIA AGENTS.md inteiro antes de começar. LEIA também `docs/reviews/investigacao-mouseup.md`
(investigação completa, causa raiz confirmada com trace linha a linha) e `docs/reviews/diagnostico-sync-3.md`
(por que os testes anteriores nunca pegaram este bug). Esta é a 6ª rodada sobre o sintoma "o desenho
apaga/pisca ao soltar o mouse" — mas a primeira com causa raiz confirmada por investigação, não adivinhação.
Não faça push nem merge. Não altere `docs/reviews/investigacao-mouseup.md`, `docs/reviews/diagnostico-sync-3.md`,
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`.

## Causa raiz confirmada (resumo — leia o relatório completo antes de mexer em código)
Em `src/shared/canvas/engine.ts:465-508` (listener de `path:created`), a linha 475 executa
`this.canvas.remove(pathObj)` **imediatamente e de forma síncrona**, removendo o traço que o Fabric.js
acabou de desenhar. O traço só volta ao canvas quando o evento `DRAW_ADD` percorre
`onEmitEvent` → `aplicarEventoQuadro` (`useHostStore.ts:402`) → `set({ tabState })` → `useEffect` do React
(`QuadroBrancoPage.tsx:117-121`, assíncrono, roda depois do commit) → `engine.renderState(tabState)`
(`engine.ts:1007-1047`) → `createFabricObjectFromData` recria um `Path` **novo** e o readiciona
(`canvas.add`, linha 1032). Entre a remoção e a readição existe uma janela real (medida em
`docs/reviews/investigacao-mouseup.md`, seção 4.1) onde o canvas fica com 0 objetos correspondentes a esse
traço; se um frame do navegador for pintado nessa janela, o traço "pisca" (desaparece por 1 frame) — e isso
se repete/agrava em escrita rápida (vários traços em sequência) e no Guest (tela 120Hz + cifra WASM na
thread de UI).

## D3 (único objetivo obrigatório) — Eliminar a janela de canvas vazio

### D3.1 — Reaproveitar o objeto Fabric já desenhado em vez de destruir e recriar
Hipótese de correção mínima que o chefe já validou como plausível pela arquitetura (mas que você DEVE
confirmar/ajustar com testes, não copiar cegamente): em vez de `this.canvas.remove(pathObj)` seguido de uma
reconstrução posterior via `createFabricObjectFromData`, o listener de `path:created` (`engine.ts:465-508`,
e o equivalente análogo se houver, confirme se `eraser_stroke` deve continuar removendo — ele PRECISA, pois
o objeto reconstruído leva `globalCompositeOperation: destination-out` que é diferente do objeto cru do
Fabric) pode:
1. Marcar `(pathObj as any).elementId = elementId` no próprio objeto que o Fabric já colocou no canvas.
2. Registrar esse objeto imediatamente em `this.objectsMap.set(elementId, pathObj)` **antes** de chamar
   `this.emitEvent(event)`.
3. **Não remover** `pathObj` do canvas nesse caminho (para o tipo `'path'`, não-borracha).
4. Quando `renderState` rodar depois (via reducer, local ou remoto), a checagem existente em
   `engine.ts:1026-1027` (`let fabricObj = this.objectsMap.get(el.id); if (!fabricObj) { ...cria... }`) vai
   encontrar o objeto já registrado e **não vai recriar nem re-adicionar nada** — o traço nunca desaparece
   da tela entre o `mouse:up` e a confirmação do reducer.
5. Isso preserva a garantia de "o Reducer é a fonte única de verdade": o traço só fica de fato "confirmado"
   quando o evento é aplicado por `aplicarEventoQuadro`/`renderState`, só que agora sem precisar
   desmontar visualmente o que já está correto na tela para montar de novo.

Se essa abordagem quebrar alguma invariante (ex.: propriedades do objeto cru do Fabric diferem do que
`createFabricObjectFromData` produziria — confira `fill`, `stroke`, `strokeWidth`, `selectable` um a um;
ou o UNDO/REDO depende de sempre reconstruir do zero; ou a borracha de OBJETO (`object_eraser`) depende de
`elementId` estar setado de um jeito específico), ajuste a abordagem, mas **documente a razão da mudança**
e mantenha o objetivo: nenhuma janela onde o canvas tem 0 objetos para um traço que o usuário já viu na
tela.

### D3.2 — Prova de que a janela deixou de existir (não é "o teste de sempre passou")
`npm run verify` continuar verde **não prova nada sobre este bug** — nenhum teste hoje observa o canvas
quadro a quadro. Escreva um teste automatizado NOVO que:
1. Reaproveite `tools/probe-fast-strokes.cjs` se já existir (de `Issues/20260923-004106`, D2.1) ou crie um
   equivalente mínimo: abra o quadro branco do Host (build de produção), instale um hook em
   `window.__whiteboardEngine.canvas` no evento `'after:render'` (ou equivalente do Fabric 6) que registre,
   a cada frame renderizado, a contagem de objetos visíveis e se o `elementId` do último traço desenhado
   está presente em `this._objects`.
2. Desenhe 1 traço de lápis via `page.mouse` e depois via SendInput real (reaproveite
   `tools/drag-sendinput.ps1`), e confirme que **em NENHUM frame renderizado após o `path:created` desse
   traço a contagem de objetos cai para um valor menor do que tinha imediatamente antes** (ou seja: o
   traço nunca fica ausente de um frame pintado).
3. Repita com 3+ traços rápidos em sequência (sem pausa artificial, como em D2.1) e confirme a mesma
   garantia para cada um deles.
4. Se a garantia falhar, o teste deve reportar exatamente em qual frame/traço a contagem caiu, e você NÃO
   pode marcar D3 como concluído — volte a D3.1.
5. Cole a saída REAL do teste (passando) na autoauditoria.

### D3.3 — Não regredir o que já funciona
Rode `npm run verify` completo (inclui V1/V3) antes e depois — nada pode piorar. Além disso, rode
especificamente e cole a saída real de:
- Teste de borracha de trecho (`eraser_stroke`) — confirme que continua removendo/recriando com
  `destination-out` corretamente (não deve ser afetado por D3.1, mas prove).
- Teste de UNDO/REDO bidirecional — um traço desenhado, desfeito e refeito precisa continuar consistente
  (objeto pode precisar ser removido do `objectsMap` no UNDO e recriado no REDO; confirme que isso ainda
  acontece do jeito certo com a mudança).
- Sincronização bidirecional por IDs de elementos (Host↔Guest) — o `elementId` gerado localmente no Host
  antes de emitir o evento precisa continuar sendo o MESMO `id` que chega ao Guest e é usado lá.

## Proibido
Não proponha uma abordagem completamente diferente da investigada sem justificar por escrito por que D3.1
não serve. Não marque D3 concluído só porque `npm run verify` passou — a prova exigida é a de D3.2 (frame a
frame), porque é exatamente isso que faltou nas rodadas anteriores. Não invente nomes de arquivo/função/
linha de log que não existem no código.

## Ao final
`npm run verify` verde; saída real de D3.2 (a nova prova frame-a-frame) colada, passando; saída real de
D3.3 (borracha, undo/redo, sync Host↔Guest) colada, passando; `docs/reviews/autoauditoria-flicker-traco.md`
com critério → comando → saída real → PASS/FAIL, e o que NÃO foi verificado; `docs/HANDOFF.md` atualizado
com um parágrafo curto e literal para o dono explicando que a causa do "apaga ao soltar"/"cola em cima" foi
corrigida e por quê, em português simples (sem jargão de código).
