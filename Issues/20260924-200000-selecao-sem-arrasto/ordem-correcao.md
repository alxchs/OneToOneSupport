Contexto: LEIA AGENTS.md e `Issues/20260924-200000-selecao-sem-arrasto/LEIA-ME.md`. Continue na branch
`fase/08-ferramentas-sem-mover`. Não faça push nem merge. Escopo: Host.

## D15 — Seleção seleciona, mas não arrasta (código preservado para voltar depois)

### D15.1 — Comportamento
Com a ferramenta Seleção, o usuário PODE selecionar um objeto (feedback visual de seleção continua), mas
NÃO pode movê-lo, redimensioná-lo nem girá-lo. As demais ferramentas não mudam (o `skipTargetFind` do D12
continua valendo). A Borracha (Objeto) continua apagando normalmente.

### D15.2 — Exigência do dono: NÃO apague o código
O arrasto volta numa versão futura. Portanto:
1. Controle a mudança por UMA constante exportada, de nome explícito, em `src/shared/canvas/engine.ts`,
   por exemplo `export const ARRASTO_NO_MODO_SELECAO_HABILITADO = false;`, com comentário curto dizendo:
   por que está desligado (mover é só local: não gera evento, não persiste, não sincroniza, e some na
   reconstrução) e o que precisa existir para religar (evento de movimentação + redutor + persistência +
   replicação ao Guest + desfazer/refazer; opção B do D12.3, exige ADR).
2. O caminho que aplica o arrasto deve continuar existindo e funcional quando a constante for `true` —
   nada de remover a lógica ou deixá-la quebrada. Trocar a constante para `true` tem que devolver o
   comportamento antigo por inteiro.
3. Não invente um sistema de configuração novo nem exponha isso na interface: é uma constante de código.

### D15.3 — Prova
1. Teste com a constante `false` (padrão): selecionar um objeto funciona; arrastar NÃO altera
   `left`/`top`/`angle`/`scaleX`/`scaleY`; conferido também por captura de TELA (`page.screenshot`), não só
   pelas propriedades.
2. Teste com a constante `true` (forçada no teste): arrastar volta a mover. Isto prova que o código
   preservado continua íntegro — é o requisito do dono, e sem esse teste a ordem não está cumprida.
3. Regressão: D12 (`tests/ferramentas-sem-mover.test.ts`) e a sonda (V3, V3b, V3c) continuam verdes.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-selecao-sem-arrasto.md` (critério → comando → saída real
→ PASS/FAIL e o que NÃO foi verificado); `docs/HANDOFF.md` com um parágrafo curto em português simples
dizendo ao dono que a Seleção agora só seleciona, e que o arrasto está desligado por uma constante e volta
quando o evento de movimentação existir; commit local único, sem push.
