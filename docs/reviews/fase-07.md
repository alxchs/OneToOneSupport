# Revisão da Fase 07 — Guest mobile e E2EE no navegador
Revisor: Claude Code (chefe). Veredito: **APROVADA COM RESSALVAS**.
Evidência: auditor 172 testes, sonda 21/21, 11 commits. Eu rodei `npm run probe`: guestMobile todos true (bundle sem hash, CSP sem violações, desenho por toque sincronizado, LOCK_SCREEN, GUEST_MUTED); sem `pageErrors`. Captura `docs/guest-mobile-emulation.png` (412x915): "Conectado", alvos grandes, mute em marrom.
Conferido: CSP do Guest (header e `<meta>` do build) com `script-src 'self' 'wasm-unsafe-eval'`, `eval` bloqueado (sonda). `vite.config.guest.ts` tem constante `GUEST_CSP` sem `wasm-unsafe-eval`, mas só entra se o `guest.html` não tiver meta; o de origem tem. Inconsistência latente, sem efeito hoje. `ws.ts:382` aplica `canGuestExecute` antes de aceitar ação; `index.ts` força `autor:'guest'`.
## Ressalvas
1. **Path traversal por `abaId` do Guest** chega ao snapshot (defeito 2 da fase 05): `index.ts` usa `envelope.payload?.abaId` sem validar.
2. `index.ts` ignora o retorno de `gravarEvento` e ainda repassa o evento ao Host (`notifyGuestEvent`).
3. Barra de ferramentas do Guest passa da largura de 412px (botão de desfazer cortado na captura).
4. A 1ª execução da sonda falhou por partida a frio (ECONNREFUSED), a 2ª passou: espera de prontidão frágil; observar se repete.
5. `npm ci` reporta 24 vulnerabilidades (2 críticas) em todas as fases; o auditor as trata como PASS.
Não verificado: aparelho Android real (Motorola Edge 70 Pro); red team; diff completo.
