# Revisão da Fase 08 (do plano) — Abas Multimodais, Assets e Mídia Sincronizada
Revisor: Claude Code (chefe), 2026-09-26. Veredito: **APROVADA PARA MERGE**, com uma correção do chefe já aplicada
na própria branch (ver abaixo) — não precisou voltar para a AGY.

## Contexto da execução
Duas rodadas da AGY nesta branch morreram sem commit: a primeira interrompida por reinício da máquina, a segunda
por `RESOURCE_EXHAUSTED` (cota do Antigravity esgotada). Preservei os dois estados parciais como `wip` (`3c33b35`,
`29fdb27`) antes de redespachar, sem perder trabalho, e restaurei uma captura de evidência antiga
(`Issues/20260924-210000-rever-sessao-encerrada/evidencia/quadro-somente-leitura.png`) que uma delas tinha
sobrescrito por engano. A terceira rodada (após o reset da cota) entregou tudo nos commits `29fdb27..74c2f28`.

## Auditor automático (`node tools/auditar.cjs`, clone limpo)
Tudo verde: `npm ci`, `npm run verify` com 391 testes, sonda 41/41 (incluindo a nova seção V6), sem variável não
usada, regras de camada (renderer sem fs/electron/SQL) respeitadas, sem vermelho na UI, 0 falha de sinal de risco
(29 avisos, todos com `risco-aceito` ou já discutidos abaixo), autoauditoria com 51 PASS / 0 FAIL e lista honesta
do que não foi verificado, HANDOFF atualizado, 237 afirmações da documentação conferidas no código, prova de
pixel presente onde foi prometida (M4/M5/M9.3 via captura de tela real, não leitura de buffer de canvas).
**Ressalva de sempre:** `npm ci` segue com 24 vulnerabilidades (2 críticas), tratado como PASS pelo auditor.

## Leitura de trechos de risco (chefe, não só o relato da AGY)
- `electron/server/session-manager.ts`: token de mídia CSPRNG (32 bytes, base64url), comparação em
  `safeTokenEqual` (checagem de tamanho antes de `crypto.timingSafeEqual` — não vaza conteúdo, só se o tamanho
  bate, e o tamanho é público/fixo). Token entregue ao Guest **só** dentro do envelope cifrado `SESSION_READY`
  (`electron/server/ws.ts:308-318`), nunca no convite/QR; confirmado por leitura, não só pelo texto da ordem.
  Morre com `encerrar()`.
- `electron/server/http.ts` (`/midia/:assetId`): 404 (não 403) para asset de outra sessão, sem vazar caminho de
  disco; 416 com `Content-Range: bytes */<total>` nas faixas inválidas e multi-range; `Access-Control-Allow-Origin: *`
  justificado (o Host busca a mídia de uma origem diferente, `http://127.0.0.1:<porta>`, via `<img>`/`<video>`) e
  o `Referrer-Policy: no-referrer` global já mitiga o vazamento do token por query string (marcado
  `risco-aceito: SEGREDO_COMPARADO` na própria linha — aceito).
- `src/host/store/useHostStore.ts` (`aplicarEventoRemoto`): tipado com `GuestEventDTO`, sem `as any` na allowlist
  — usa `isAcaoPermitidaGuest` (novo, em `src/shared/autoridade.ts`). Regra de aba divergente (M9.2) confirmada
  por leitura: `electron/server/index.ts` persiste o evento com o `abaId` que o **Guest** mandou (validado contra
  path traversal por `isValidId`), não com a aba visível no Host — descarta do viewport, não perde dado.
- `electron/services/asset.service.ts`: MIME só por magic bytes (SVG rejeitado explicitamente), sanitização de
  nome cobre path traversal, nomes reservados do Windows, unicode de confusão e byte nulo; import atômico
  (`.tmp` → verifica sha256 → rename) sem órfão em queda no meio.

## Achado real (corrigido por mim, < 15 linhas — `docs/CHEFE.md` autoriza correção direta desse tamanho)
`handleAssetImport` (`electron/ipc/asset.ipc.ts`) e `AssetService.importAsset` só validavam que `sessaoId` era
uma string não vazia antes de usá-lo como componente de caminho em disco (`Assets.path = "<sessaoId>/<sha256>.<ext>"`,
depois resolvido por `path.join`/`path.resolve`). Um `sessaoId` como `../../../../pasta` escapava da raiz de
assets na escrita, e a leitura seguinte (`resolveAbsolutePath`, usada pela rota `/midia`) seguiria o mesmo
caminho. O projeto já tinha o padrão certo para isso — `isValidId`/`ID_REGEX` de `electron/services/evento.service.ts`,
aplicado ao `abaId` que chega do Guest pela rede em `server/index.ts` — só não foi replicado aqui, na borda do
IPC do Host. Apliquei o mesmo `isValidId` nos dois pontos (IPC e serviço, defesa em profundidade) e escrevi o
teste de ataque `tests/assets.test.ts` ("rejeita sessaoId com path traversal..."), que falha sem a correção.
`npm run verify` depois da correção: **392 testes, sonda 41/41**, tudo verde.

Severidade real: baixa nesta versão — `sessaoId` só chega hoje pelo IPC do próprio Host (não da rede/Guest), não
é um vazamento remoto explorável agora. Mas é uma quebra de um padrão de defesa em profundidade que o próprio
projeto já usa para o mesmo tipo de dado em outro ponto de entrada, no exato tipo de caminho (Main process grava
em disco e depois serve por HTTP) que esta disciplina de verificação existe para travar antes de uma
reestruturação futura expor esse `sessaoId` a uma fonte menos confiável.

## Não verificado (herdado da autoauditoria + o que eu mesmo não fiz)
- Aparelho Android físico (só emulação Chromium/CDP com touch sintético).
- PDF com senha ou formulário XFA.
- Múltiplos monitores com DPI heterogêneo durante reprodução de mídia.
- Múltiplos Guests simultâneos (fora de escopo desta fase, por design).
- Não rodei `tools/red-team.ps1` sobre M1–M10.
- Não reexecutei a sonda V6 eu mesmo interativamente (só via `npm run verify`, que já roda a sonda no app
  empacotado); não abri a janela manualmente além da leitura de código e do resultado da sonda.

## Decisão
Aprovada. Peço ao Alexandre o merge `--no-ff` de `fase/08-abas-midia-assets` em `main`. **Nada de push sem ordem
explícita naquele momento.**
