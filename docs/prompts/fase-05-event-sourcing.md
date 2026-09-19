# ORDEM DE SERVIÇO — FASE 05: Event Sourcing, snapshots e revisões
Branch: `fase/05-event-sourcing` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §4, §8, §9, `docs/HANDOFF.md`. Pré-requisito: fase 02 mergeada.

## Entregas
1. `electron/db/repositories/evento.repo.ts`: **somente append** (nenhum UPDATE/DELETE em `Eventos`; provar com teste e com trigger SQL `BEFORE UPDATE/DELETE ... RAISE(ABORT)` numa migração `002`, sem alterar as colunas da §9). Índice por `(sessao_id, criado_em)` e ordem total estável (definir e documentar o desempate de eventos no mesmo ms — ex.: `rowid`).
2. `src/shared/events/reducer.ts` (puro, sem I/O, roda no Host e no Guest): estado da aba = função de eventos. `DRAW_ADD`, `DRAW_HIDE` (esconde por id, não remove), `CLEAR_TAB` (esconde tudo o que veio antes, sem apagar), `UNDO`/`REDO` como eventos que varrem a árvore por autor.
3. Undo/redo: Host desfaz ações do Host; Guest só desfaz as próprias; redo invalidado por novo `DRAW_ADD`. Testes de propriedade (fast-check ou tabela ampla) de que reduzir os mesmos eventos sempre dá o mesmo estado.
4. `electron/services/evento.service.ts`: grava, valida autor e permissão, reconstrói estado = último snapshot + delta. Snapshot a cada N eventos (N configurável em `ConfiguracaoGlobal`, default 200) e ao encerrar; `Sessoes_Revisoes.snapshot_evento_idx` aponta o corte. Snapshot é otimização: apagar todos os snapshots e reconstruir do zero deve dar estado idêntico (teste).
5. Revisões imutáveis: reabrir sessão e salvar cria `numero_versao+1`, nunca altera a anterior; carregar revisão N mostra exatamente o estado dela (teste).
6. Benchmark: 50 000 eventos reconstroem em tempo razoável (registrar o número no HANDOFF).

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`, saída do benchmark, e a tentativa de UPDATE/DELETE em `Eventos` abortando (saída real).
## Aceite
Sem caminho de código que apague ou altere evento; equivalência snapshot×replay provada; revisão antiga intacta após nova. Sem UI nesta fase. Nada de push. HANDOFF e parar.
