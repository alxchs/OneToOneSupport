# Auditoria do chefe — Fase 13: modo ausência da AGY

## Rodada 1 (2026-10-03, `5075f2f`): REJEITADA

Passa: 9 testes do parser/FILA, nenhuma ocorrência de `git push/merge/branch -D/--force/reset --hard` no script,
5 ordens de backlog sem termo proibido, `-DryRun` não cria branch. O chefe rodou o `-DryRun -Itens B1,B2` e leu o
laço principal. Defeitos (todos reproduzidos por leitura de `tools/modo-ausencia.ps1` + a execução do dry-run):

1. **`-DryRun` altera e apaga estado.** Ele reescreveu `docs/FILA.md` (tracked), somou rodadas e **perdeu a linha do B2**
   (o `Salvar-Fila` grava só o subconjunto filtrado por `-Itens`). Dry-run não escreve em disco; filtro nunca remove linha da fila.
2. **A `FILA.md` inicial tem 2 itens, não 5** (faltam B3, B4, B5) e começa com `Rodadas = 1` em vez de 0 (só 2 rodadas úteis).
3. **A correção nunca chega ao executor.** Na rodada N+1 o `delegar.ps1` recebe a mesma ordem, sem os defeitos do
   veredito rejeitado (falta `-Extra`/texto da rejeição). O ciclo "rejeitou → corrige" não existe.
4. **O auditor não sabe qual arquivo escrever nem o que auditar.** `auditor-modelo.md` não recebe o ID do item, a
   branch, nem o caminho `docs/reviews/veredito-<ID>-rN.md` que o script espera; o parser vai achar "arquivo ausente".
5. **`git checkout -b` quebra na 2ª execução** (branch já existe) e com árvore suja; `npm run verify` roda na branch
   atual, não em `main`, antes de criar a branch do item. Retomar um item `PENDENTE` com branch existente = `git checkout` dela.
6. **Parada 1 incompleta:** no primeiro 429 o script sai; a regra do `CLAUDE.md` global (e a spec) manda tentar um modelo
   de **outro grupo** antes de parar, e só então registrar a menor renovação (lida da linha "Resets in" do log) em `Cota`.
7. **Sem reserva de checkout:** o script não chama `ia claim agy "<item>"` / `ia release` (ferramenta global em
   `C:\Users\alxch\bin\ia.ps1`, regras em `ia-paralelo.md`); sem isso outra janela não vê que a AGY está ali.
8. **Executor sem `-ExigirCommit`:** uma rodada que não commitou passa direto para a auditoria.
9. **"Auditor sem prova" é heurística frágil** (`Motivo -match '```'`): precisa exigir, por defeito listado, um bloco
   de saída/comando; defina o formato no `auditor-modelo.md` ("### D<n> ... ```saída```") e teste-o.
10. **Teste ausente para o laço**: os 9 testes cobrem só o parser e a geração da FILA. Testar as paradas 3, 5 e 6 e o
    "dry-run não escreve" com `-TestExport`/funções puras (extraia a decisão de parada do laço).

## Ordem da rodada 2
Autorizada a alterar `tools/modo-ausencia.ps1`, `tests/modo-ausencia.test.ts`, `docs/FILA.md` e `docs/prompts/backlog/`.
Responda na autoauditoria, seção "Rodada 2", **uma linha por defeito (1-10): o que mudou, comando, saída real** (L-26).
Prove o 1 com `git status --porcelain` e `git diff --stat` vazios depois de `-DryRun -Itens B1,B2`; o 5 com
`ia status` sem claim residual depois de uma execução simulada. Não rode o backlog de verdade.

## Rodada 2 (2026-10-03, `cd1032c`): APROVADA, com 2 acertos do chefe
`-Itens B1,B2 -DryRun` agora só imprime o plano (claim/release, ExigirCommit, auditor por rodada); fila com 5 itens e
Rodadas 0; 10 testes passam; sem termo proibido no script; fallback de modelo na cota presente (o limite real só se prova
com 429 de verdade — não verificado).
Acertos do chefe: (1) a AGY deixou 10 PNGs rastreados modificados (a sonda do `auditar.cjs` regenera capturas) — restaurados
com `git checkout`; sinal de que o auditor automático suja a árvore e o orquestrador precisa restaurar as capturas
antes de cada branch (anotado como risco no backlog de processo). (2) Os slugs de branch de B3-B5 na `FILA.md` não
correspondiam aos itens (`queda-sqlite`, `fabric-4k`…): corrigidos para `icones-botoes`, `npm-audit`, `tamanho-instalador`.
**Bloqueio para liberar o backlog:** o orquestrador cria as branches dos itens a partir de `main`, e `main` ainda não
tem `tools/modo-ausencia.ps1`/`delegar.ps1`/`ia`-claim. É preciso o merge da Fase 13 em `main` (ordem do dono).
