# Revisão da Fase 04 — Servidor HTTP/WS e sessão
Revisor: Claude Code (chefe). Regime: QA desconfiado. Veredito: **APROVADA COM RESSALVAS** (nenhuma bloqueante).
Evidência (auditor automático, clone limpo): verify (121 testes), sonda 14/14 (inclui painel de sessão e QR), autoauditoria-04 (28 PASS / 0 FAIL), 20 commits.
Conferido pelo chefe (leitura de `session-manager.ts`, `ws.ts`, `http.ts`, testes): token de 32 bytes por `crypto.randomBytes`; one-shot (`guestTokenUsed`) com rejeição de reuso, expiração e 2º Guest (`SESSION_BUSY`); reconnect_token rotacionado com TTL de 5 min; `maxPayload` de 1 MB e timeout de handshake de 10 s; sem `console.*` com token/chave; 16 testes de ataque com nomes coerentes (reuso, expirado, reconexão dentro/fora, 2º guest, claro pós-handshake, fora de ordem, >1 MB, MAC adulterado, LOCK_SCREEN, mídia sem UNLOCK, `pk_h` só no fragmento, latência de eco).
## Ressalvas (viram pendências obrigatórias na ordem da Fase 05)
1. **Comparação de token não é de tempo constante** (`token !== this.guestToken`, `!==` do reconnect). Usar `crypto.timingSafeEqual`.
2. **Token queimado antes do handshake acabar:** `guestTokenUsed = true` é gravado em `authenticateInitialJoin`, mas o reconnect_token só nasce em `completeHandshake`. Um Guest que cai entre AUTH e o fim do handshake deixa a sessão sem entrada (o Host precisa reiniciar). Reverter o estado se o handshake não concluir.
3. **Rate limit (100 msg/s) e heartbeat não têm teste.** Regra sem teste que tente violá-la.
4. **Servidor escuta em `0.0.0.0`** (LAN por design, ADR-001). Firewall e escolha da interface ficam para a fase 10; registrar no ADR.
5. O resumo do executor cita eventos `AUDIO_CHUNK`/`VIDEO_FRAME` que não existem no código (mesmo padrão do defeito 1 da Fase 03).
Não verificado pelo chefe: latência medida por mim; navegador real como Guest (Fase 07); leitura completa do diff.
