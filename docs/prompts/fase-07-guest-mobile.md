# ORDEM DE SERVIÇO — FASE 07: Guest mobile
Branch: `fase/07-guest-mobile` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §3, §11, §14 e Regra #3, `docs/FASES.md` (ADR-002/003/005), `docs/HANDOFF.md`. Pré-requisitos: fases 04 e 06 mergeadas.

## Entregas
1. `src/guest/`: `JoinFlow.tsx` (lê token da URL e `pk_h` do fragmento, faz `AUTH` → `HANDSHAKE_INIT`, remove o fragmento do histórico), `GuestRoom.tsx` (quadro na engine da fase 06, abas em sincronia via `TAB_SWITCH`), pasta `ws/` com cliente + reconexão automática com `reconnect_token`. Build Vite separado servido pelo Express.
2. Tailwind mobile-first, alvo **Motorola Edge 70 Pro / Android 16 / sistema em inglês**: viewport, `dvh`, safe areas, alvos de toque ≥ 48 px, `touch-action` correto, `overscroll-behavior`, sem hover-only. Textos da UI do Guest vêm do dicionário dinâmico; textos fixos em inglês/português coerentes com o idioma escolhido (padrão pt-BR, verificar que não quebra com o teclado do sistema em inglês).
3. Permissões: Guest desenha só se o Host permitir; botões de mídia desabilitados até `UNLOCK_MEDIA`; `LOCK_SCREEN` bloqueia interação com overlay claro; mute local emite `GUEST_MUTED`.
4. Estados: conectando, aguardando Host, reconectando, sessão encerrada, token inválido/expirado (mensagens claras, sem vazar detalhes).
5. CSP do ADR-005 no Guest, sem scripts inline; nenhum recurso externo.
6. Testes: fluxo Join com o servidor real da fase 04 em teste de integração; Playwright/Chromium emulando 412x915 com touch (Pixel/Android; registrar que é emulação, não o aparelho real).

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`; app do Host aberto + Guest aberto num navegador emulando Android: desenhar do Guest aparecendo no Host e vice-versa, bloquear/liberar, derrubar a rede e reconectar. Anexar capturas/descrição. Pedir ao Alexandre a homologação no aparelho real (não declare homologado sem isso).
## Aceite
Fluxo ponta a ponta cifrado funcionando; CSP sem violações no console; nada de push. HANDOFF e parar.
