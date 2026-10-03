# ORDEM DE SERVIÇO — FASE 13: o modo ausência da AGY
Branch: `fase/13-modo-ausencia` (confirme com `git branch --show-current`). Você é executor; o chefe é o Claude Code.
Leia: `AGENTS.md`, `docs/LICOES.md`, `docs/AUSENCIA.md` (a spec: é a fonte de verdade desta fase),
`docs/PROTOCOLO.md`, e as skills `.agents/skills/escrever-ordem-de-servico` e `registrar-licao`.
Esta fase não muda o produto (`src/`, `electron/`). Não rode `npm run verify` salvo para testar o que mudar em `tools/`.

## Entregas
1. **`docs/prompts/backlog/B1.md` … `B5.md`**: uma ordem por item da tabela de `docs/AUSENCIA.md`, no formato de
   `docs/prompts/_modelo-fase.md` e seguindo a skill `escrever-ordem-de-servico`: requisitos com ID, método de prova
   nomeado (pixel → `page.screenshot`), "o que já foi resolvido, não refazer", regras que viram teste que tenta
   violá-las, e a lista de lições `L-NN` aplicáveis (leia `docs/LICOES.md`). Confira a origem de cada item abrindo o
   arquivo citado; se uma origem não sustentar o item, diga no HANDOFF em vez de inventar.
   Crie também `docs/prompts/backlog/auditor-modelo.md`, o modelo da ordem de **auditor**, que exige o veredito legível
   por máquina: a primeira linha do arquivo de veredito é `Veredito: APROVADA` ou `Veredito: REJEITADA`.
2. **`tools/modo-ausencia.ps1`**, usando `tools/_comum.ps1` e `tools/delegar.ps1` (leia-os; não duplique o que existe):
   parâmetros `-Itens`, `-MaxRodadas` (padrão 3), `-Autonomo`, `-DryRun`. Implementa o ciclo e **todas as 6 paradas
   obrigatórias** de `docs/AUSENCIA.md`. A detecção de 429 e o papel somente-leitura já existem em
   `_comum.ps1`/`delegar.ps1`; reutilize. Branch sempre de `main`; nunca push/merge; nunca grave nos arquivos da coluna "Nunca".
   Escreve `docs/FILA.md` (uma linha por item: ID, branch, status `PRONTA-PARA-REVISAO|ESCALADO|BLOQUEADA|PENDENTE`,
   rodadas, caminho do veredito, o que o dono precisa decidir, menor renovação de cota quando parar por cota).
   O parser do veredito vira função separada e testável.
3. **`tests/modo-ausencia.test.ts`** (vitest): parser do veredito (primeira linha; maiúsculas/minúsculas; lixo;
   arquivo ausente = REJEITADA, nunca aprovada por omissão); regra de parada "mesmo defeito 2×"; geração da `FILA.md`.
   Cada regra com um teste que tenta violá-la **e** um controle positivo. O `-DryRun` do script não pode criar branch
   nem gastar cota: prove com `git branch` antes/depois.
4. **`docs/FILA.md`** inicial com os 5 itens `PENDENTE`.
5. Autoauditoria `docs/reviews/autoauditoria-13.md` (critério → comando → saída real → PASS/FAIL, e o que NÃO foi
   verificado), HANDOFF curto no topo, commit e pare.

## Regras desta fase (o chefe tentará violar cada uma)
- `modo-ausencia.ps1` jamais executa `git push`, `git merge`, `git branch -D`, `--force`, `reset --hard` (o chefe fará `Select-String` por esses termos).
- Um veredito ausente, ilegível ou com `Veredito:` fora da primeira linha **não** aprova.
- O ciclo para sozinho nas 6 condições; cada uma tem teste ou simulação com `-DryRun`.
- Nenhuma ordem de backlog manda tocar nos arquivos da coluna "Nunca".

## Aceite (o chefe reexecuta)
`npx vitest run tests/modo-ausencia.test.ts`; `node tools/auditar.cjs` verde; `pwsh tools\modo-ausencia.ps1 -DryRun -Itens B1,B2`
imprime o plano completo sem criar branch.

## Não fazer
Executar o backlog de verdade (é o passo seguinte, quando o chefe liberar), mexer no produto, push, merge.
