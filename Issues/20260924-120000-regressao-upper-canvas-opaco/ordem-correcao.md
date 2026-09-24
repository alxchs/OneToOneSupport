Contexto: LEIA AGENTS.md inteiro, em especial a regra "Prova prometida = prova entregue, não uma mais fraca" e
a lição da Fase 07 sobre automação que dá falso PASS. Leia `Issues/20260924-120000-regressao-upper-canvas-opaco/LEIA-ME.md`.
A causa raiz do "desenho some ao soltar o mouse" foi CONFIRMADA e a correção mínima JÁ ESTÁ APLICADA em
`src/shared/canvas/engine.ts` (construtor, logo após `new Canvas(...)`: fundo branco só no `lowerCanvasEl`,
`upperCanvasEl` transparente). NÃO refaça nem reverta essa correção. Não faça push nem merge. Não altere
`docs/reviews/*` de diagnóstico existentes nem `tests/adversarial/redteam-fase07.test.ts`.

O buraco a fechar é de PROVA: todas as verificações de pixel do projeto liam `lowerCanvasEl.getImageData`
(o canvas de baixo), que sempre estava correto, e nunca a imagem que a TELA mostra. Por isso a sonda deu
27/27 PASS durante 9 rodadas com o bug ativo. Só uma captura de tela real (`page.screenshot`) pega isso.

## D11 (único objetivo) — Regressão e sonda com evidência de TELA real

### D11.1 — Teste de regressão que FALHA sem a correção
1. Teste (Vitest com jsdom/happy-dom se já usado em `tests/ondprchange.test.ts`, ou sonda Puppeteer) que
   cria o `WhiteboardEngine` e afirma: `getComputedStyle(upperCanvasEl).backgroundColor` é transparente
   (`rgba(0, 0, 0, 0)` ou `transparent`) e `lowerCanvasEl` tem fundo `rgb(255, 255, 255)`. Também no Guest
   (mesmo engine; confirme que `GuestRoom.tsx` não reaplica fundo branco em outro lugar — grep `backgroundColor`).
2. Prove que o teste falha SEM a correção: reverta temporariamente só as 2 linhas novas do construtor
   (mova `canvasElement.style.backgroundColor = '#ffffff'` para antes de `new Canvas`), cole a saída real
   FALHANDO, restaure a correção, cole a saída PASSANDO. Não deixe o revert no commit.

### D11.2 — Sonda com captura de tela real (o que faltava)
Em `tools/probe-runtime.cjs`, na seção V3 (7 ferramentas x 4 direções, Host e Guest), ADICIONE (não substitua
a checagem atual) uma checagem por `page.screenshot({ clip })` da área do canvas: decodifique o PNG
(`pngjs` se já for dependência; senão use `sharp`/`pixelmatch` só se já existirem; se nenhum existir,
decodifique com o próprio Chromium via `page.evaluate` + `createImageBitmap`/canvas 2D sobre o screenshot em
data URL) e conte pixels coloridos (não-brancos, não-cinza de UI) dentro do clip, ANTES e DEPOIS do traço e
também 1 segundo depois de soltar o mouse. Regra: depois de soltar, o número de pixels do traço na
captura NÃO pode cair. Aplique nas 7 ferramentas no Host e no Guest (Guest via `guestPage.screenshot`).
Nome da checagem: `V3b: traço permanece visível NA TELA (captura real) após soltar o mouse`.
Prove que a nova sonda falha com o bug: mesmo procedimento do D11.1.2 (reverta a correção só para provar,
cole saída falhando e passando, restaure).

### D11.3 — Varredura de erros da mesma classe
Procure no projeto qualquer outro ponto onde a verificação lê o canvas em vez da tela, ou onde estilo é
aplicado ao `<canvas>` antes de `new Canvas`/`new StaticCanvas` (grep). Liste o que achar em
`docs/reviews/autoauditoria-upper-canvas.md`, mesmo que seja "nada".

## Ao final
`npm run verify` verde (incluindo a nova checagem V3b); `docs/reviews/autoauditoria-upper-canvas.md`
(critério → comando → saída real → PASS/FAIL, o que NÃO foi verificado); atualize `docs/HANDOFF.md` com um
parágrafo curto e literal, em português simples, dizendo que a causa foi um fundo branco opaco na camada
superior do quadro, já corrigido, e que a sonda agora confere a TELA. Commit local único, sem push.
Não invente nomes de arquivo, função ou dependência que não existam: confira `package.json` antes de usar
qualquer biblioteca de imagem.
