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

## Pontos herdados da revisão do lote 1 (obrigatórios nesta fase)
1. **Comparação de token em tempo constante:** em `electron/server/session-manager.ts` (guest_token e reconnect_token) troque `===`/`!==` por `crypto.timingSafeEqual` (tratando tamanhos diferentes). O sinal `SEGREDO_COMPARADO` do auditor deve zerar nesses arquivos.
2. **Token queimado antes do handshake acabar:** hoje `guestTokenUsed = true` é gravado em `authenticateInitialJoin`, mas o reconnect_token só existe depois de `completeHandshake`. Se o Guest cair entre AUTH e o fim do handshake, a sessão fica sem entrada. Corrija (ex.: só consumir o token ao concluir o handshake, ou liberar o uso se o handshake não concluir) e **escreva o teste que prova**: queda no meio do handshake -> um segundo Guest legítimo com o mesmo convite consegue entrar.
3. **Testes que faltam:** rate limit de 100 msg/s por conexão e heartbeat (2 pings sem resposta derrubam). Cada regra de limite precisa de teste que tente estourá-la.
4. **ADR-009:** registre que o servidor escuta em `0.0.0.0` por escolha do ADR-001 (LAN) e que firewall/seleção de interface ficam para a fase 10.
5. **Sem invenção:** o HANDOFF e a autoauditoria só podem citar nomes (eventos, arquivos, scripts, branches) que existem. `tools/verificar-afirmacoes.cjs` reprova o contrário. Não prometa em documento nada que o plano (docs/FASES.md) não preveja.

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`, saída do benchmark, e a tentativa de UPDATE/DELETE em `Eventos` abortando (saída real).
## Aceite
Sem caminho de código que apague ou altere evento; equivalência snapshot×replay provada; revisão antiga intacta após nova. Sem UI nesta fase. Nada de push. HANDOFF e parar.
