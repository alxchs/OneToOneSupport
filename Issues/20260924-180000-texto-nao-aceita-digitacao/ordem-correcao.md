Contexto: LEIA AGENTS.md inteiro (em especial a lição de 2026-09-24: prova de bug visual é captura de TELA
real) e `Issues/20260924-180000-texto-nao-aceita-digitacao/LEIA-ME.md`, que já traz causa raiz confirmada e
um reprodutor pronto. Continue NA BRANCH `fase/08-ferramentas-sem-mover` (a mesma do D12, ainda não
mergeada). Não faça push nem merge. Escopo: Host. Não altere `docs/reviews/postmortem-desenho-some.md` nem
os diagnósticos antigos.

## Causa raiz (já confirmada pelo chefe — confirme lendo, não reinvestigue)
`src/shared/canvas/engine.ts`, `handleTextCreation`: abre `textObj.enterEditing()` e, no fim do MESMO método,
chama `this.setTool('select')`. O `setTool` faz `discardActiveObject()` e, desde o D12, `exitEditing()`.
A edição morre no mesmo instante; `commitText` grava o placeholder `'Texto'`. Confirmado igual em `main` e
em `fase/08`, então é bug antigo, não regressão do D12.

## D13 (objetivo obrigatório) — Ferramenta Texto utilizável

### D13.1 — Correção
Ao clicar com a ferramenta Texto, o usuário precisa poder digitar imediatamente; o texto só é confirmado
quando ele clica fora, aperta Escape ou troca de ferramenta. Requisitos:
1. Não encerrar a edição recém-aberta. A troca para `select` (se for mantida) só pode acontecer DEPOIS do
   commit, não antes. Avalie: mover o `this.setTool('select')` para dentro de `commitText`, ou não trocar de
   ferramenta e deixar o Texto ativo para o próximo clique. Escolha uma e justifique em uma linha.
2. Não nascer com o placeholder `'Texto'` gravado: se o usuário não digitar nada e clicar fora, NENHUM
   elemento deve ser criado (hoje `commitText` descarta só string vazia, e o placeholder não é vazio).
   Comece com texto vazio e um cursor piscando, ou mantenha o placeholder apenas visual e trate-o como vazio
   no commit. Não deixe o usuário com a palavra "Texto" no quadro sem ter pedido.
3. O `skipTargetFind` do D12 deve continuar valendo: a ferramenta Texto não pode selecionar/arrastar objetos
   existentes ao clicar sobre eles (a suíte `tests/ferramentas-sem-mover.test.ts` cobre; não a quebre).
4. Enquanto o texto estiver em edição, a digitação não pode disparar atalhos do quadro (se existirem).
   Verifique se há listener de teclado global no Host que conflite; se houver, registre.

### D13.2 — Prova
1. Teste automatizado que digita caracteres de verdade (`page.keyboard.type`) e afirma que o objeto no canvas
   contém exatamente o texto digitado, MAIS captura de TELA (`page.screenshot`) provando que o texto digitado
   aparece para o usuário. Reaproveite/estenda
   `Issues/20260924-180000-texto-nao-aceita-digitacao/evidencia/teste-texto.cjs`, que já faz o fluxo completo.
2. Teste do caso "clicou e não digitou nada": nenhum elemento novo deve ser criado.
3. Teste de edição multilinha ou com acentos (ex.: `ação`), para pegar problema de IME/composição.
4. Prove que os testes FALHAM sem a correção (reverta, cole a saída falhando, restaure, cole passando), como
   no D11 e D12.
5. Acrescente a checagem à sonda (`tools/probe-runtime.cjs`) para não regredir: hoje a sonda de texto só
   clica e confere pixel, nunca digitou nada — por isso o bug passou despercebido desde a Fase 06. Nome
   sugerido: `V3d: texto digitado aparece na tela e vira elemento`.

### D13.3 — Varredura da mesma classe de erro
Procure outros pontos onde um estado de interação é aberto e fechado no mesmo fluxo síncrono (ex.: chamadas a
`setTool`, `discardActiveObject` ou `exitEditing` logo após iniciar uma interação). Liste o que achar na
autoauditoria, mesmo que seja "nada".

## Proibido
Não mude o modelo de eventos nem o formato do payload de texto (`tipo: 'text'` com `text/left/top/fontSize/fill/angle`).
Não desative o `skipTargetFind`. Não invente nomes de arquivo, função ou evento.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-texto.md` (critério → comando → saída real → PASS/FAIL e o
que NÃO foi verificado); `docs/HANDOFF.md` com um parágrafo curto em português simples para o dono; commit
local único na branch `fase/08-ferramentas-sem-mover`, sem push.
