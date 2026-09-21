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

## Fechamento (2026-09-21): correções C1-C5 e red team
- **Erro do chefe na 1ª revisão:** afirmei que `canGuestExecute` estava correto; ele era denylist que terminava em `allowed:true` e omitia `SCREEN_LOCKED` e `UNDO`. O red team achou 5 falhas reais (FALHA-3/4, PERMISSAO-2/3/4).
- **Correção do red team (commit 19e3968):** `src/shared/autoridade.ts` como fonte única (ADR-011); `SessionManager.canGuestExecute` e `EventoService.validarAutorEPermissao` consomem a mesma tabela; `handleGuestDisconnect` só age na conexão ativa; TTL de reconexão só é carimbado em `completeHandshake`.
- **Verificado pelo chefe:** auditor verde (236 testes, sonda 22/22); testes do red team comparados com `eab3a6c`: só 1 linha mudou (`import * as http` sem uso removido; o teste usa `http` local via `await import`), nenhuma asserção alterada, 40 testes mantidos, sem skip/only/todo. Ataque próprio: 33 tipos hostis (caixa, espaço, byte nulo, chaves de protótipo, tipos não-string, objeto com toString, 100 000 caracteres) × 4 combinações de trava — nenhum vazamento; matriz das 9 ações permitidas correta; 150 desconexões espúrias sem alterar estado, TTL nem listeners; as duas camadas não divergem.
- **Desvio do executor:** removeu o import sem uso apesar da ordem proibir mexer no arquivo de testes (benigno, mas a regra foi descumprida).
- **Falha do chefe:** commitei durante a execução do red team (21:27), o que fez o script descartar a entrega; recuperada pelo reflog com `merge --ff-only`. Regra: nada de commit do chefe enquanto o executor roda.
- **Veredito da fase 07 (e da cadeia 05-07): APROVADA para merge**, pendente da decisão do dono.
- **Não verificado:** aparelho Android real (Motorola Edge 70 Pro); a queda legítima do guest ativo preservar o TTL (só pelo teste FALHA-4 do red team); diff completo; 2ª rodada de red team após as correções.
