Contexto: LEIA AGENTS.md e `docs/reviews/postmortem-desenho-some.md` (causa raiz real e tabela de hipóteses
descartadas). Trabalhe na branch `fase/08-ferramentas-sem-mover` (ou na branch corrente da fase, se outra
tiver sido criada). Não faça push nem merge. Esta ordem é de LIMPEZA: o risco de errar é remover algo que
ainda serve, então cada remoção precisa de justificativa e a suíte tem que continuar verde.

## D14 — Tirar do produto o andaime da caçada, sem perder proteção

### D14.1 — Classifique antes de mexer (escreva a tabela na autoauditoria)
Para CADA item abaixo, decida REMOVER, MANTER SOB FLAG ou MANTER SEMPRE, com uma linha de motivo:
1. `electron/experiments.ts` inteiro + uso em `electron/main.ts` (`ONETOONE_RENDER_EXPERIMENT`: `occlusion`,
   `nothrottle`, `nudge`) e `tests/render-experiments.test.ts`. Hipótese morta: o dono testou com `all` e o
   bug continuou; a causa era outra.
2. `ONETOONE_DISABLE_GPU` em `scripts/dev.mjs`. Mesma hipótese morta.
3. Reforço de repaint no caminho quente do desenho: `triggerRepaintReinforcement`/`executeRepaintReinforcement`/
   `forceRepaint` em `src/shared/canvas/engine.ts`, o canal IPC `canvas:force-repaint`
   (`electron/ipc/canvas.ipc.ts`, preload, `ipc-contract.ts`) e `tests/canvas-repaint.test.ts`. ATENÇÃO:
   isto roda SEMPRE em produção (não está sob `ONETOONE_DIAG`), a cada elemento novo, e existia só para uma
   hipótese descartada. É o item mais forte para remoção.
4. Diagnósticos sob `ONETOONE_DIAG=1` em `engine.ts`: `checkPixelDivergence` (D6.1) e `checkCssVisibility`
   (D8), com seus agendadores e testes. Avalie manter: são baratos, só rodam com a flag, e o D8 hoje
   ignora o `upper-canvas` — se mantiver, CONSERTE para incluir todas as camadas do Fabric (foi justamente o
   ponto cego que escondeu a causa raiz por rodadas).
5. `engine_lifecycle` e `janela_evento` (diag de instâncias e de janela). Avalie manter sob flag.
6. Ferramentas de investigação em `tools/` que não são mais usadas (ex.: `investigar-render-pipeline.cjs`,
   `drag-cursive-sendinput.ps1`). NÃO remova `tools/drag-sendinput.ps1` nem `tools/probe-runtime.cjs`, que
   são a espinha das provas de entrada real e de tela.

### D14.2 — Execute o que classificou como REMOVER
Remova código, testes, tipos, canais IPC, entradas de preload e menções em documentação (não reescreva o
histórico: os relatórios de diagnóstico ficam como registro; só atualize o que descreve o comportamento ATUAL,
como o `docs/HANDOFF.md`). Cada canal IPC removido tem que sair também de `src/shared/ipc-contract.ts` e do
preload, senão sobra superfície exposta sem handler.

### D14.3 — Prove que nada quebrou
1. `npm run verify` verde antes e depois, com o número de testes antes/depois explicado (vai cair, e tudo
   bem, desde que a queda seja exatamente a dos testes dos itens removidos).
2. Sonda de runtime completa, incluindo V3b (tela real) e V3c (ferramentas não movem objetos), verde.
3. Confirme por leitura que nenhum caminho quente do desenho ficou com trabalho extra em produção (nenhum
   `setTimeout`/IPC por elemento desenhado que não seja necessário ao produto). Cole o trecho final do
   `renderState` na autoauditoria.
4. Rode o app de verdade uma vez e desenhe (pode ser pela sonda) para garantir que a remoção do IPC não
   derruba o Host: cole a saída.

## Proibido
Não remova a correção do upper-canvas (`lowerCanvasEl`/`upperCanvasEl` no construtor), nem o `skipTargetFind`
do D12, nem `tests/regressao-upper-canvas.test.ts`, nem `tests/ferramentas-sem-mover.test.ts`, nem as
checagens V3b/V3c da sonda. Não mude comportamento visível do produto nesta ordem: é só limpeza.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-limpeza-diagnosticos.md` com a tabela de classificação
(item → decisão → motivo), comandos e saídas reais, e o que NÃO foi verificado; `docs/HANDOFF.md` atualizado
removendo as instruções de experimento que deixarem de existir; commit local único, sem push.
