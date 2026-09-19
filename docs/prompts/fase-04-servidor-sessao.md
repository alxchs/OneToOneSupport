# ORDEM DE SERVIÇO — FASE 04: Servidor HTTP/WS e Session Manager
Branch: `fase/04-servidor-sessao` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §7, §11, §14, §16, `docs/FASES.md` (ADR-001, ADR-005), `docs/HANDOFF.md`. Pré-requisitos: fases 02 e 03 mergeadas.

## Entregas
1. `electron/server/http.ts`: Express 4 em porta dinâmica (0 → porta atribuída), serve o build do Guest, headers de segurança e CSP do ADR-005, sem CORS aberto, limite de payload.
2. `electron/server/ws.ts`: `ws` puro. Fluxo: `AUTH` (token, claro) → `HANDSHAKE_INIT` (pk_g, claro) → tudo o mais `ENCRYPTED`. Qualquer mensagem fora de ordem ou em claro após o handshake derruba a conexão. Rate limit por conexão, `maxPayload`, ping/pong e timeout de handshake.
3. `electron/server/session-manager.ts`: `guest_token` de 32 bytes aleatórios (CSPRNG), **one-shot** (invalidado no join, teste de reuso), expiração; `reconnect_token` TTL 5 min, ligado à sessão, rotacionado a cada uso; **um único Guest por sessão** (segundo join rejeitado); autoridade do Host (matriz: Guest só desenha/desfaz o próprio/controla mídia com `UNLOCK_MEDIA`; `LOCK_SCREEN` bloqueia). Servidor é o relógio mestre para mídia (só o esqueleto: timestamp do servidor nos eventos).
4. Convite: URL `http://<ip-lan>:<porta>/join/<token>#<pk_h_base64url>` (ADR-001) + QR Code (biblioteca leve, ADR se nova). Escolha do IP LAN correto (ignorar adaptadores virtuais/loopback; permitir seleção manual).
5. Ligação IPC: iniciar/encerrar sessão a partir do Host; estado da conexão exposto à UI (esperando Guest / conectado / reconectando).
6. UI mínima no Host: botão "Iniciar sessão", mostra URL + QR, estado da conexão.
7. Um cliente de teste (script Node em `tools/`, usando o provider de cripto da fase 03) que faz o fluxo completo.
8. Testes de integração: fluxo feliz, token reusado, token expirado, reconexão dentro/fora de 5 min, segundo Guest, mensagem em claro pós-handshake, payload gigante, mensagem adulterada. Medir e registrar a latência de eco cifrado em localhost.

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`; `npm run dev`, iniciar sessão de verdade, ver QR, rodar o cliente de teste contra o app aberto e colar a saída; tentar abrir a URL num navegador comum e descrever o que aparece (o Guest real só vem na fase 07).

## Aceite
Todos os testes negativos verdes; `pk_h` nunca em log nem em path/query; latência de eco reportada. Nada de push. HANDOFF e parar.
