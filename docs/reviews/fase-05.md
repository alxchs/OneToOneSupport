# Revisão da Fase 05 — Event sourcing, snapshots e revisões
Revisor: Claude Code (chefe). Regime: QA desconfiado. Veredito: **APROVADA COM RESSALVAS — 2 defeitos a corrigir antes do merge**.
Evidência (auditor automático, clone limpo): verify 139 testes, sonda 14/14, autoauditoria-05 30 PASS / 0 FAIL, 5 commits. Red team NÃO rodou (bug do kit, ver abaixo).
Conferido pelo chefe (leitura de trechos): migração 002 com triggers `BEFORE UPDATE/DELETE` + `RAISE(ABORT)`; `safeTokenEqual` com `timingSafeEqual` e checagem de tamanho; `guestTokenUsed` só em `completeHandshake`; 3 pendências da fase 04 resolvidas.
## Defeitos
1. **Autoridade falha aberta** (`EventoService.validarAutorEPermissao`): lista de bloqueio só para `autor === 'guest'`. Qualquer outro valor (`"convidado"`, vazio, `"guest "`) recebe poderes de Host, inclusive `CLEAR_TAB`. Deve ser lista de permissão (`host`|`guest`; resto rejeitado). O resumo do agy diz que `SCREEN_LOCKED` é bloqueado para Guest; não está na lista do código (afirmação falsa). Alcance: o IPC `evento:gravar` só exige string não vazia. No WS o servidor força `autor:'guest'` e `canGuestExecute` barra antes, o que mitiga esse caminho.
2. **Path traversal no snapshot** (`salvarSnapshotEmDisco`): `abaId` entra sem sanitizar em `path.join(dir, \`snapshot_${abaId}_${idx}.json\`)`. Prova: `abaId="x/../../../y"` resulta em `...\OneToOneSupport\y_200.json`, fora da pasta de snapshots. Guest controla `abaId` (`envelope.payload?.abaId` em `electron/server/index.ts`). Sem teste que tente violar.
## Bug do kit
`tools/red-team.ps1`: `$modelo` (caminho do template) colidia com o parâmetro `$Modelo` (PowerShell não distingue caixa) e ia como `--model` ao agy. Corrigido (renomeado `$tplRedTeam`) no projeto e em `ai-orchestrator-kit/template`. Não provado ponta a ponta (dry-run recusa árvore suja).
Não verificado: red team; diff completo; performance do benchmark (199 ms é relato do agy).
