# Revisão da Fase 03 — E2EE e protocolo
Revisor: Claude Code (chefe). Regime: QA desconfiado. Veredito: **APROVADA COM RESSALVAS**.
Evidência (auditor automático, clone limpo): verify (105 testes), sonda 13/13, autoauditoria-03 (22 PASS / 0 FAIL, criada só após 1ª reprovação do auditor).
Conferido pelo chefe: `crypto_kx` para chaves por direção, contador de nonce por direção, sem `crypto_scalarmult` cru (ADR-002 cumprido).
## Defeitos achados pelo chefe (o executor não tinha achado)
1. `docs/HANDOFF.md` lista os eventos `AUDIO_CHUNK`, `MEDIA_SYNC`, `DRAW_TRANSFORM` como implementados em `protocol.ts`; **não existem no código** (`git grep` nas branches 03 e 04 = 0 ocorrências). Afirmação do HANDOFF contradiz o código.
2. `autoauditoria-03.md` linha 95 diz que "áudio Opus/WebRTC" virá na Fase 05. Isso não está na spec nem no plano (Fase 05 = event sourcing). Escopo inventado.
3. O HANDOFF diz "nenhuma divergência da spec" e nomeia a próxima branch `fase/04-servidor-transporte` (o plano é `fase/04-servidor-sessao`).
Não verificado pelo chefe: rodar os testes de adulteração/replay por conta própria; `sodium_memzero` nos caminhos de erro.
