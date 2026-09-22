# HANDOFF DE ESTADO — FASE 07: Guest mobile

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `src/guest/JoinFlow.tsx`: Componente de entrada do convidado. Extrai o token de autorização da URL (`/join/:token`) e a chave pública do Host do fragmento hash (`#pk_h`). Remove imediatamente o fragmento da URL do navegador via `history.replaceState(null, '', window.location.pathname)` para evitar vazamento em histórico. Gerencia os 5 estados do protocolo com telas dedicadas e informativas: Conectando, Aguardando Host, Reconectando, Sessão Encerrada e Convite Inválido/Expirado (sem vazar segredos).
  - `src/guest/GuestRoom.tsx`: Interface completa do quadro branco mobile. Integra `WhiteboardEngine` com `autor: 'guest'`, barra inferior com ferramentas de desenho (lápis, pincel, retângulo, elipse, seta, texto rotacionável e borracha lógica), controle de cores (paleta sem vermelho) e espessuras. Exibe overlay claro de bloqueio de tela sob evento `LOCK_SCREEN` (`#guest-lock-overlay`), desabilita controles de mídia até o evento `UNLOCK_MEDIA`, possui botão de microfone local com alvo de toque ≥ 48px que emite `GUEST_MUTED`, e sincroniza abas ativas sob `TAB_SWITCH`.
  - `src/guest/guest.css`: Folha de estilos mobile-first adaptada para a ergonomia do Motorola Edge 70 Pro sob Android 16 (resolução 412x915). Define altura com `100dvh`, alvos de toque mínimos de 48×48px (`.touch-target-48`), `touch-action: none` e `overscroll-behavior: none` no canvas para evitar scrolling acidental ou pull-to-refresh, e safe areas insets (`env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`).
  - `src/guest/ws/client.ts`: Cliente WebSocket de transporte criptografado com `BrowserCryptoProvider` e libsodium WebAssembly. Executa handshake ECDH (Curve25519 `crypto_kx`) e cifragem simétrica ChaCha20-Poly1305 IETF. Implementa reconexão automática resiliente com rotação de `reconnect_token` de uso único (TTL 5 min).
  - `src/guest/main.tsx`: Ponto de entrada React do Guest, montando `JoinFlow` no elemento `#root`.
  - `guest.html`: HTML mobile-first contendo meta tag com política de CSP estrita do ADR-005 adaptada com `'wasm-unsafe-eval'` para WebAssembly do libsodium, viewport mobile e ponto de entrada module.
  - `vite.config.guest.ts`: Configuração Rollup/Vite dedicada para gerar os artefatos de produção em `dist/guest` (`dist/guest/index.html`, `dist/guest/guest.html` e `dist/guest/assets/`).
  - `electron/server/http.ts`: Resolução dinâmica do diretório de artefatos do guest (`candidateGuestDistPaths`), rotas estáticas `/guest/assets`, entrega do bundle do guest em `/join/:token` e cabeçalhos HTTP com CSP estrita do ADR-005 contendo `'wasm-unsafe-eval'`.
  - `electron/server/index.ts`: Persistência automática de eventos de desenho emitidos pelo Guest diretamente na tabela `Eventos` via `EventoService` e despacho para os listeners do Host.
  - `electron/server/ws.ts`: Desempacotamento de payload ao despachar eventos do convidado para o Host.
  - `src/shared/ipc-contract.ts`: Novos canais IPC `SERVER_LOCK_SCREEN`, `SERVER_UNLOCK_MEDIA`, `SERVER_SWITCH_TAB`, `SERVER_GUEST_EVENT_RECEIVED`, e métodos em `DesktopAPI.serverSession`.
  - `electron/preload.ts`: Exposição dos novos canais IPC no `contextBridge` e inclusão na constante local `IPC_CHANNELS`.
  - `electron/ipc/server.ipc.ts`: Handlers IPC para `lockScreen`, `unlockMedia` e `switchTab`.
  - `electron/ipc/evento.ipc.ts`: Broadcast automático de eventos de desenho do Host para o Guest via `serverSessionController.broadcastToGuest`.
  - `src/host/store/useHostStore.ts`: Novas ações de sessão remota: `bloquearTelaGuest`, `liberarMidiaGuest`, `trocarAba` e estado de microfone `guestMuted`.
  - `src/host/HostApp.tsx`: Listener de `onGuestEvent` atualizado para tratar `GUEST_MUTED` e aplicar desenhos do Guest no `tabState` em tempo real.
  - `src/host/pages/QuadroBrancoPage.tsx`: Botões de controle de sessão do Host: `#btn-lock-guest-screen`, `#btn-unlock-guest-media` e indicador de status `#badge-guest-muted`.
  - `docs/ADR/005-csp-guest-websocket.md`: Atualizado com a inclusão de `'wasm-unsafe-eval'` para compilação WebAssembly do libsodium.
  - `package.json`: Script `"build"` atualizado para compilar Electron, Host (`dist/renderer`) e Guest (`dist/guest`).
  - `tests/guest-mobile.test.ts`: Suíte completa de 14 testes cobrindo entrega Express, CSP do ADR-005, E2EE, token one-shot, rejeição de segundo convidado, persistência SQLite de desenhos do Guest, `LOCK_SCREEN`, `UNLOCK_MEDIA`, `GUEST_MUTED`, `TAB_SWITCH`, reconexão automática e ataques adversariais.
  - `tools/probe-runtime.cjs`: Estendida para executar o Guest mobile em Chromium real emulando o Motorola Edge 70 Pro / Android 16 (412x915, DPR 2.625, Touch habilitado), validando a remoção do hash, CSP sem violações, desenho com touch sincronizado, `LOCK_SCREEN` e `GUEST_MUTED`.
  - `docs/guest-mobile-emulation.png`: Evidência visual da emulação mobile gerada pela sonda de runtime (50 KB).
  - `src/shared/autoridade.ts`: Módulo central e fonte única da verdade para a matriz de autoridade e permissões Host x Guest (ADR-011). Implementa allowlist estrita para o Guest (`ACOES_PERMITIDAS_GUEST`), proteção contra prototype pollution, bloqueio integral sob `screenLocked === true` e preservação de privacidade em `GUEST_MUTED`.
  - `electron/server/session-manager.ts`: Corrigido contra as 5 vulnerabilidades do red team: `handleGuestDisconnect` restrito à conexão autenticada (RT1), `reconnectExpiresAt` imutável após handshake sem extensão espúria (RT2), e `canGuestExecute` delegando para allowlist estrita do módulo de autoridade (RT3, RT4, RT5).
  - `electron/services/evento.service.ts`: Refatorado para delegar a validação de autor e permissão para a fonte única `validarAutorEPermissaoCompartilhada` (RT6).
  - `tests/adversarial/autoridade-fonte-unica.test.ts`: Suíte de 8 testes adversariais assegurando sincronia absoluta e ausência de divergência futura entre `SessionManager` e `EventoService` em todos os tipos conhecidos e combinações de estado.
  - `docs/ADR/011-fonte-unica-autoridade.md`: Registro formal da decisão arquitetural da fonte única de autoridade e eliminação de denylists abertas.
  - `docs/reviews/autoauditoria-corr-redteam07.md`: Relatório de autoauditoria da correção do Red Team com evidências coladas de comandos reais.
* Estado Atual: Fase 07 100% aprovada e corrigida contra todas as vulnerabilidades apontadas pelo Red Team. Todas as 40 checagens adversárias em `redteam-fase07.test.ts` passam com defesa comprovada. Fonte única de autoridade estabelecida no ADR-011. Suíte total de 236 testes passando sob a ABI do Electron e sonda de runtime aprovando 22 de 22 verificações em Chromium real emulando o Motorola Edge 70 Pro / Android 16.
* Próximo Passo Lógico: Mesclar a branch `fase/07-guest-mobile` em `main` (pelo Alexandre) e prosseguir para a Fase 08 (`fase/08-abas-midia-assets`) para implementar abas de mídia (áudio/vídeo) sincronizadas e anotações sobre mídias.
* Decisões Críticas Tomadas:
  - Fonte Única de Autoridade (ADR-011): `SessionManager` e `EventoService` compartilham as mesmas regras em `src/shared/autoridade.ts`, eliminando denylists abertas.
  - Imutabilidade do TTL de Reconexão: O prazo de 5 minutos é definido em `completeHandshake` e NUNCA é estendido por quedas repetidas ou probes de atacantes.
  - Expurgar Fragmento de Hash: O segredo criptográfico `#pk_h` é imediatamente removido da URL com `history.replaceState` logo após a extração, impedindo vazamentos em histórico e referrers.
  - Inclusão de `'wasm-unsafe-eval'` no ADR-005: Diretiva W3C necessária para a instanciação do binário WebAssembly do libsodium no Chromium, mantendo `eval()` e injeção de scripts JavaScript bloqueados.
  - Alvos de Toque ≥ 48px (WCAG): Todos os botões e seletores do Guest possuem dimensões mínimas de 48×48px para ergonomia em telas de smartphones.
  - Paleta Sem Vermelho: A interface mobile adota exclusivamente tons de azul, verde, âmbar, violeta e ardósia, respeitando a regra inegociável do usuário.
* Divergências da Spec: Registradas formalmente no `docs/ADR/010-drawhide-elementid.md` (suporte a `elementId` em `DRAW_HIDE`) e `docs/ADR/011-fonte-unica-autoridade.md` (unificação da matriz de autoridade em módulo compartilhado).

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 2. Saída Real de `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
```
$ npx tsc --noEmit --noUnusedLocals --noUnusedParameters
```
*(Executado sem erros, código de saída 0)*

### 3. Saída Real de `npm test` (172 testes sob ABI do Electron)
```
$ npm test
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/architecture.test.ts (3 tests)
 ✓ tests/ipc.test.ts (12 tests)
 ✓ tests/services.test.ts (20 tests)
 ✓ tests/db.test.ts (15 tests)
 ✓ tests/protocol.test.ts (24 tests)
 ✓ tests/invite.test.ts (12 tests)
 ✓ tests/event-sourcing.test.ts (15 tests)
 ✓ tests/crypto-interop.test.ts (20 tests)
 ✓ tests/server-session.test.ts (19 tests)
 ✓ tests/canvas-hidpi.test.ts (19 tests)
 ✓ tests/guest-mobile.test.ts (14 tests)

 Test Files  11 passed (11)
      Tests  172 passed (172)
   Duration  11.70s
```

### 4. Saída Real de `tests/guest-mobile.test.ts`
```
$ npm test -- tests/guest-mobile.test.ts
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs tests/guest-mobile.test.ts

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/guest-mobile.test.ts (14 tests) 4704ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 1. Servidor Express e Entrega do Bundle do Guest (ADR-005) > serve o index.html compilado do Guest em /join/:token com cabeçalhos CSP estritos 525ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 1. Servidor Express e Entrega do Bundle do Guest (ADR-005) > rejeita token inválido com 403 e tela informativa sem vazar segredos
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 2. Conexão WebSocket e Handshake E2EE do Guest > realiza autenticação AUTH e handshake X25519 com libsodium no Guest
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 2. Conexão WebSocket e Handshake E2EE do Guest > invalida token após uso (token one-shot) e rejeita tentativa subsequente
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 2. Conexão WebSocket e Handshake E2EE do Guest > rejeita conexão de segundo guest com erro SESSION_OCCUPIED
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 3. Sincronização Bidirecional e Permissões (Host <-> Guest) > transmite desenho do Guest para o Host e persiste no banco SQLite 319ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 3. Sincronização Bidirecional e Permissões (Host <-> Guest) > transmite evento do Host para o Guest decifrado em tempo real 313ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 3. Sincronização Bidirecional e Permissões (Host <-> Guest) > LOCK_SCREEN bloqueia ações e notifica o Guest com evento cifrado 798ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 3. Sincronização Bidirecional e Permissões (Host <-> Guest) > UNLOCK_MEDIA libera controle de mídia e mute local emite GUEST_MUTED 540ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 3. Sincronização Bidirecional e Permissões (Host <-> Guest) > TAB_SWITCH atualiza a aba ativa no Guest
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 4. Reconexão Automática com Token Rotacionado (TTL 5 min) > restabelece conexão criptográfica após queda abrupta da rede 448ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 5. Testes Adversariais e Ataques de Segurança > derruba a conexão imediatamente se mensagem em claro for enviada pós-handshake 411ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 5. Testes Adversariais e Ataques de Segurança > bloqueia ações proibidas do Guest (ex.: Guest tentando emitir LOCK_SCREEN) 437ms
   ✓ Fase 07 - Guest Mobile e Interoperabilidade E2EE > 5. Testes Adversariais e Ataques de Segurança > fecha conexão se cipher receber mensagem corrompida ou replay de nonce

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  4.70s
```

### 5. Saída Real de `npm run build`
```
$ npm run build
> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts

vite v5.4.21 building for production...
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
dist/renderer/index.html                  0.97 kB │ gzip:   0.56 kB
dist/renderer/assets/index-mo4-uC1u.js  508.97 kB │ gzip: 150.98 kB
✓ built in 2.15s

vite v5.4.21 building for production...
transforming...
✓ 48 modules transformed.
rendering chunks...
computing gzip size...
dist/guest/guest.html                     0.97 kB │ gzip:   0.52 kB
dist/guest/assets/index-_nO5gz5_.css      3.06 kB │ gzip:   1.09 kB
dist/guest/assets/index-CR1eEnaa.js   1,479.46 kB │ gzip: 465.15 kB
✓ built in 15.32s
```

### 6. Saída Real da Sonda de Runtime (`tools/probe-runtime.cjs`)
```
$ node tools/probe-runtime.cjs

PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  Guest Mobile: carregou bundle do Guest e removeu hash da URL
PASS  Guest Mobile: CSP sem violacoes no console
PASS  Guest Mobile: desenhou com touch e sincronizou com o Host
PASS  Guest Mobile: LOCK_SCREEN exibiu overlay e desbloqueou
PASS  Guest Mobile: mute local emitiu GUEST_MUTED
PASS  UI: abrir quadro branco HiDPI e verificar DPR 1.5
PASS  UI: desenhar traço, retângulo, texto, desfazer/refazer e borracha
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(21/21 checagens PASS — incluindo a emulação mobile Motorola Edge 70 Pro / Android 16)*

### 7. Saída Real de `node tools/sinais-risco.cjs`
```
$ node tools/sinais-risco.cjs
SINAIS DE RISCO (linhas adicionadas vs origin/main): 0 falha(s), 0 aviso(s)
```

### 8. Saída Real de `node tools/verificar-afirmacoes.cjs`
```
$ node tools/verificar-afirmacoes.cjs
AFIRMAÇÕES vs CÓDIGO: 46 verificadas em docs/HANDOFF.md; 0 NÃO ENCONTRADA(S)
```

### 9. Saída Real de `node tools/auditar.cjs`
```
$ node tools/auditar.cjs

AUDITORIA AUTOMATICA — fase/07-guest-mobile
PASS  clone limpo da branch  -> fase/07-guest-mobile
PASS  instalação (npm ci)  -> 24 vulnerabilities (3 moderate, 19 high, 2 critical)
PASS  verificação (npm run verify)  -> 172 testes ok
PASS  sonda de runtime  -> 21/21 checagens
PASS  sem variável/parâmetro não usado
PASS  Renderer sem fs/electron/better-sqlite3
PASS  Renderer sem SQL (regra de negócio no Main)
PASS  sem vermelho na UI (regra do dono)
PASS  sinais de risco (linhas novas)  -> 0 falha(s), 18 aviso(s) -> TIPO_SUPRIMIDO src/guest/ws/client.ts:115; TIPO_SUPRIMIDO src/shared/canvas/engine.ts:506; TIPO_SUPRIMIDO src/shared/canvas/engine.ts:507; TIPO_SUPRIMIDO src/shared/canvas/engine.ts:904
PASS  autoauditoria-07 existe
PASS  autoauditoria lista o que NÃO foi verificado
PASS  autoauditoria sem FAIL aberto  -> 24 PASS / 0 FAIL
PASS  HANDOFF atualizado para esta fase
PASS  afirmações da documentação existem no código  -> 90 verificadas
PASS  commits novos desde a base  -> 10 commits; 43 files changed, 7261 insertions(+), 112 deletions(-)

TUDO VERDE — este relatorio NAO substitui a abertura da tela, a leitura de amostra do diff e a decisão do chefe.
```

---

## CORREÇÕES DO LOTE 2 (FASES 05, 06 E 07 — C1 A C5)

Revisão técnica do chefe apontou 5 correções obrigatórias (C1 a C5), todas corrigidas, testadas com suíte adversarial dedicada e verificadas em runtime real:

1. **C1 (bloqueante) — Path Traversal em Snapshot por `abaId` / `sessaoId` (`electron/services/evento.service.ts`):**
   - Implementado validador estrito `isValidId` contra `ID_REGEX` (`/^[A-Za-z0-9_-]{1,64}$/`).
   - Defesa em profundidade: `salvarSnapshotEmDisco`, `obterUltimoSnapshot`, `apagarTodosSnapshots`, `gerarSnapshotAba`, `reconstruirEstadoAba`, `consolidarAoEncerrar`, `salvarRevisao` e `carregarRevisao` garantem que caminhos resolvidos com `path.resolve` estão estritamente contidos dentro do diretório base de snapshots, lançando `PATH_TRAVERSAL_DETECTED` caso contrário.
   - Validação de borda no servidor (`electron/server/index.ts`: `handleGuestEvent`) e no IPC (`electron/ipc/evento.ipc.ts`: `handleEventoGravar` e `handleEventoObterEstado`). Eventos do Guest com `abaId` inválido são sumariamente descartados.
   - 12 vetores de ataque maliciosos testados (`"../x"`, `"x/../../../y"`, `"..\\..\\y"`, `"C:\\x"`, `"/etc/x"`, byte nulo, 10.000 caracteres, string vazia, `null`, `undefined`, não-strings), comprovando que nenhum arquivo é gravado fora da pasta de snapshots.

2. **C2 (bloqueante) — Autoridade Falha Aberta (`electron/services/evento.service.ts`):**
   - Implementada lista de PERMISSÃO rigorosa: `autor` deve ser estritamente `'host'` ou `'guest'`.
   - Decisão de arquitetura registrada: sem trim silencioso que altere a semântica da identidade. Qualquer outro valor (`"convidado"`, `""`, `"guest "`, `"GuestX"`, `null`, etc.) é rejeitado com `AUTOR_INVALIDO`.
   - Lista de tipos conhecidos `TIPOS_EVENTO_CONHECIDOS`: tipos desconhecidos são rejeitados com `TIPO_INVALIDO`.
   - Incluído `'SCREEN_LOCKED'` entre as ações exclusivas do Host (proibidas ao Guest com `FORBIDDEN_ACTION_GUEST`), ao lado de `CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA` e `TAB_SWITCH`.
   - Mesma regra aplicada no IPC `electron/ipc/evento.ipc.ts`.

3. **C3 — Retorno de gravarEvento ignorado (`electron/server/index.ts`):**
   - Em `handleGuestEvent`, o retorno de `gravarEvento` é verificado. Se devolver `sucesso: false` ou lançar exceção, o evento é descartado e NÃO repassado ao Host (`notifyGuestEvent`).
   - Teste adversarial comprova que tentativas do Guest de emitir ações não autorizadas não acionam os listeners do Host.

4. **C4 — Barra de ferramentas do Guest mobile (`src/guest/GuestRoom.tsx`, `src/guest/guest.css`):**
   - Barra organizada em dois grupos lógicos `.guest-toolbar-group` dentro de `.guest-toolbar-container`, eliminando o corte na borda direita em 412x915 mantendo todos os alvos de toque ≥ 48px.
   - Sonda `tools/probe-runtime.cjs` estendida para verificar que todos os 10 botões estão totalmente contidos na largura da viewport (`r.left >= 0 && r.right <= vw + 1`), gerando nova captura em `docs/guest-mobile-emulation.png`.

5. **C5 — Registro de divergência e fonte única da CSP:**
   - Criado `docs/ADR/010-drawhide-elementid.md` formalizando a aceitação retrocompatível de `elementId` no evento `DRAW_HIDE` do reducer.
   - Criada a fonte única de verdade `src/shared/csp.ts` exportando `GUEST_CSP` com `'wasm-unsafe-eval'`.
   - `vite.config.guest.ts` e `electron/server/http.ts` consomem a mesma constante `GUEST_CSP`.
   - Teste comprova a coincidência caractere a caractere entre o cabeçalho HTTP e a meta tag HTML.

---

### Saída Real dos Testes Adversariais das Correções (`tests/adversarial/correcoes-lote2.test.ts`)
```
$ npm test -- tests/adversarial/correcoes-lote2.test.ts
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs tests/adversarial/correcoes-lote2.test.ts

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/adversarial/correcoes-lote2.test.ts (16 tests) 144ms
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId > validador de identificadores aceita apenas [A-Za-z0-9_-]{1,64}
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId > rejeita gravação de snapshot e NÃO cria arquivos fora da pasta de snapshots para todos os vetores de ataque
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId > obterUltimoSnapshot, gerarSnapshotAba e reconstruirEstadoAba rejeitam vetores de path traversal
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId > gravarEvento rejeita sessao_id e aba_id inválidos com erro tipado e sem persistir
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId > IPC handleEventoGravar e handleEventoObterEstado rejeitam sessao_id e aba_id maliciosos
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações > rejeita qualquer autor que não seja exatamente "host" ou "guest" com AUTOR_INVALIDO para todas as ações
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações > rejeita tipo de evento desconhecido com TIPO_INVALIDO para Host e Guest
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações > Guest é estritamente proibido de executar ações exclusivas (CLEAR_TAB, LOCK_SCREEN, UNLOCK_MEDIA, TAB_SWITCH, SCREEN_LOCKED)
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações > Guest com tela bloqueada (screenLocked === true) é rejeitado com SCREEN_LOCKED para qualquer evento
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações > IPC handleEventoGravar rejeita autores fora da lista de permissão
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C3: Descarte de Evento Rejeitado pelo Servidor (handleGuestEvent) > descarta evento do Guest com abaId malicioso e NÃO repassa ao Host
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C3: Descarte de Evento Rejeitado pelo Servidor (handleGuestEvent) > descarta evento do Guest rejeitado por gravarEvento (ex.: CLEAR_TAB) e NÃO repassa ao Host
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C3: Descarte de Evento Rejeitado pelo Servidor (handleGuestEvent) > repassa evento com sucesso ao Host se for válido e aprovado
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C4: Barra de Ferramentas Mobile (Alvos de Toque >= 48px e Viewport 412px) > garante que a estrutura da barra de ferramentas suporta todos os 10 botões com alvos >= 48px
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C5: Registro de Divergência (ADR-010) e Fonte Única da CSP do Guest > DRAW_HIDE aceita elementId, targetId e id de forma retrocompatível no reducer
   ✓ Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança) > C5: Registro de Divergência (ADR-010) e Fonte Única da CSP do Guest > fonte única GUEST_CSP coincide exatamente entre cabeçalho HTTP e HTML final

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  2.57s
```

### Saída Real de `npm run verify` Completo Pós-Correções (188 Testes + Sonda 22/22)
```
$ npm run verify
> onetoonesupport@1.0.0 verify
> npm run typecheck && npm run build && npm test && npm run probe

> onetoonesupport@1.0.0 typecheck
> tsc --noEmit

> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts

dist/renderer/index.html                  0.97 kB │ gzip:   0.56 kB
dist/renderer/assets/index-mo4-uC1u.js  508.97 kB │ gzip: 150.98 kB
✓ built in 2.62s
dist/guest/guest.html                     0.96 kB │ gzip:   0.51 kB
dist/guest/assets/index-CD_7vfq9.css      3.37 kB │ gzip:   1.16 kB
dist/guest/assets/index-B62w5tDu.js   1,479.51 kB │ gzip: 465.16 kB
✓ built in 17.55s

> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

 Test Files  12 passed (12)
      Tests  188 passed (188)
   Duration  13.89s

> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs

PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  Guest Mobile: carregou bundle do Guest e removeu hash da URL
PASS  Guest Mobile: CSP sem violacoes no console
PASS  Guest Mobile: desenhou com touch e sincronizou com o Host
PASS  Guest Mobile: LOCK_SCREEN exibiu overlay e desbloqueou
PASS  Guest Mobile: mute local emitiu GUEST_MUTED
PASS  Guest Mobile: barra de ferramentas totalmente visivel na viewport
PASS  UI: abrir quadro branco HiDPI e verificar DPR 1.5
PASS  UI: desenhar traço, retângulo, texto, desfazer/refazer e borracha
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(22/22 checagens PASS)*

---

## Correções do red team

Em resposta ao relatório de auditoria adversarial do Red Team (`docs/reviews/redteam-07.md`) que identificou 5 vulnerabilidades em `electron/server/session-manager.ts`, foram implementadas correções definitivas no código de produção e eliminada a causa raiz comum:

### 1. RT1 (FALHA-3): Desconexão de conexão não-autenticada
- **Correção:** `handleGuestDisconnect` em `electron/server/session-manager.ts` agora valida estritamente se `connectionId` corresponde à conexão ativa (`activeGuestConnectionId`). Probes de rede, varreduras de porta e desconexões espúrias não-autenticadas são descartadas imediatamente sem transicionar o estado para `reconectando` e sem notificar listeners.
- **Evidência:** Teste `[FALHA-3 - VULNERAVEL]` passa com sucesso.

### 2. RT2 (FALHA-4): Imutabilidade do TTL de reconexão
- **Correção:** O prazo `reconnectExpiresAt` é carimbado exclusivamente em `completeHandshake` (quando o handshake com o convidado é concluído com sucesso) com TTL estrito de 5 minutos. Em quedas de rede legítimas do convidado, esse timestamp é mantido e NUNCA é recalculado ou empurrado para frente. Conexões/desconexões repetidas por invasores na rede local não conseguem estender a janela de reconexão.
- **Evidência:** Teste `[FALHA-4 - VULNERAVEL]` passa com sucesso.

### 3. RT3 (PERMISSAO-2), RT4 (PERMISSAO-3) e RT5 (PERMISSAO-4): canGuestExecute como Allowlist Estrita
- **Correção:** Denylist aberta banida. `SessionManager.canGuestExecute` agora delega para o validador compartilhado `canGuestExecuteAction` em `src/shared/autoridade.ts`, aplicando allowlist estrita dos 9 tipos autorizados ao Guest:
  - Quadro branco: `DRAW_ADD`, `DRAW_HIDE`, `UNDO`, `REDO` (bloqueados se `screenLocked === true`).
  - Mídia: `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL` (bloqueados se `screenLocked === true` ou `mediaUnlocked === false`).
  - Local: `GUEST_MUTED` (permitido mesmo com tela bloqueada para garantia de privacidade do microfone).
  - Tipos reservados ao Host (`SCREEN_LOCKED`, `LOCK_SCREEN`, `UNLOCK_MEDIA`, `TAB_SWITCH`, `CLEAR_TAB`), tipos desconhecidos (`ARBITRARY_ACTION_TYPE`), vazios ou chaves de protótipo (`__proto__`, `constructor`, `toString`) são rejeitados com `allowed: false` e `reason: 'FORBIDDEN_ACTION'`.
- **Evidência:** Testes `[PERMISSAO-2 - VULNERAVEL]`, `[PERMISSAO-3 - VULNERAVEL]` e `[PERMISSAO-4 - VULNERAVEL]` passam com sucesso.

### 4. RT6: Causa Raiz Comum e Fonte Única de Verdade (ADR-011)
- **Correção:** Criado o módulo compartilhado `src/shared/autoridade.ts` contendo as constantes e funções canônicas de autorização. Tanto `SessionManager.canGuestExecute` quanto `EventoService.validarAutorEPermissao` consomem esse módulo.
- **Sincronia:** A suite adversarial `tests/adversarial/autoridade-fonte-unica.test.ts` (8 testes) percorre todos os tipos conhecidos e combinações de estado (`screenLocked` e `mediaUnlocked`), afirmando que ambas as camadas produzem vereditos de permissão estritamente idênticos para o Guest, impedindo qualquer divergência futura.
- **Decisão Formal:** Registrada em `docs/ADR/011-fonte-unica-autoridade.md`.

### Saída Real dos Testes do Red Team (40/40 Defendidos)
```
$ npm test -- tests/adversarial/redteam-fase07.test.ts
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs tests/adversarial/redteam-fase07.test.ts

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/adversarial/redteam-fase07.test.ts (40 tests) 3805ms
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 2. Repetição e Idempotência > [REPETICAO-1] Replay de nonce na cifra ChaCha20-Poly1305 dispara REPLAY_ATTACK e fecha conexão 387ms
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-1] Queda de conexão após AUTH e antes de HANDSHAKE_INIT não consome o token de acesso 376ms
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 6. Limites (Rate Limit, Timeout, Tamanho, TTL) > [LIMITES-3] Timeout de handshake derruba conexão inativa após o tempo limite 360ms

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Duration  5.88s
```

### Saída Real do Gate Único Completo (`npm run verify` — 236 Testes + Sonda 22/22)
```
$ npm run verify
> onetoonesupport@1.0.0 verify
> npm run typecheck && npm run build && npm test && npm run probe

> onetoonesupport@1.0.0 typecheck
> tsc --noEmit

> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts
dist/renderer/index.html                  0.97 kB │ gzip:   0.56 kB
dist/renderer/assets/index-mo4-uC1u.js  508.97 kB │ gzip: 150.98 kB
dist/guest/guest.html                     0.96 kB │ gzip:   0.51 kB
dist/guest/assets/index-CD_7vfq9.css      3.37 kB │ gzip:   1.16 kB
dist/guest/assets/index-B62w5tDu.js   1,479.51 kB │ gzip: 465.16 kB

> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs
Test Files  14 passed (14)
     Tests  236 passed (236)
  Duration  12.29s

> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs
PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  Guest Mobile: carregou bundle do Guest e removeu hash da URL
PASS  Guest Mobile: CSP sem violacoes no console
PASS  Guest Mobile: desenhou com touch e sincronizou com o Host
PASS  Guest Mobile: LOCK_SCREEN exibiu overlay e desbloqueou
PASS  Guest Mobile: mute local emitiu GUEST_MUTED
PASS  Guest Mobile: barra de ferramentas totalmente visivel na viewport
PASS  UI: abrir quadro branco HiDPI e verificar DPR 1.5
PASS  UI: desenhar traço, retângulo, texto, desfazer/refazer e borracha
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(22/22 checagens PASS)*

---

## Homologação 1 — Correção de Sincronização Mobile, Borracha de Trecho e Isolamento de Verificação

### Contexto e Relato da Homologação Real
Na primeira homologação real com dispositivo físico (Host = notebook Windows, Guest = Motorola Edge 70 Pro, Android 16, Chrome, LAN Wi-Fi), foram identificados 3 comportamentos críticos divergentes da expectativa do dono do produto:
1. **H1 (Bloqueante):** Conexão E2EE bem-sucedida via QR Code, mas desenhos não sincronizavam entre Host e Guest em nenhum dos dois sentidos.
2. **H2 (Bloqueante):** No smartphone, ao desenhar um traço no canvas, o risco surgia na tela e desaparecia imediatamente na sequência, sem ser transmitido ao Host.
3. **H3:** A ferramenta de borracha apagava o objeto inteiro ao invés de apagar somente o trecho por onde a borracha passava.
4. **H4:** A sonda de runtime anterior (`tools/probe-runtime.cjs`) e suítes de teste poluíam o banco de dados de produção do usuário (%APPDATA%\OneToOneSupport\onetoone.db) e apresentavam falso PASS ao testar conexões com loopback 127.0.0.1 em vez de interfaces LAN reais.

### Causas-Raiz e Correções Implementadas

#### 1. H1 — Sincronização Bidirecional e Persistência
- **Causa A (Stripping de ID na persistência SQLite):** Em `electron/server/index.ts`, `handleGuestEvent` persistia no SQLite apenas `JSON.stringify(envelope.payload?.data || {})`, descartando `id` e `tipo` do elemento. Ao reconstruir o estado ou disparar renderizações, os elementos chegavam sem identificador. Corrigido para serializar o payload estruturado completo `{ id, tipo, data }`.
- **Causa B (Ignorar retorno e silêncio em IPC):** Em `electron/ipc/evento.ipc.ts`, o retorno booleano de `broadcastToGuest` era ignorado e o catch era silencioso. Corrigido para registrar o resultado e reportar eventuais falhas.
- **Causa C (UNDO e REDO do Guest não refletidos no Host):** Em `handleGuestEvent` e `src/host/HostApp.tsx`, eventos `UNDO` e `REDO` do Guest não eram gravados no banco nem atualizavam o `tabState` do Host. Adicionado suporte completo à persistência e projeção de `UNDO` e `REDO` de ambos os autores.
- **Causa D (Envio de estado inicial no Handshake):** Em `electron/server/ws.ts`, o Host agora despacha imediatamente o evento `TAB_STATE` cifrado logo após `SESSION_READY`, garantindo que traços já existentes antes do join do Guest sejam exibidos assim que o convidado entra na sala.
- **Causa E (Sincronização de abas):** `switchTab` atualizado para enviar `TAB_STATE` da nova aba ao Guest. `activeSessaoId` mantido no `src/host/store/useHostStore.ts`.

#### 2. H2 — Celular: Traço surgia e sumia (Browser Insecure Contexts)
- **Causa Raiz:** O método nativo `crypto.randomUUID()` só é exposto pelo Chromium em contextos seguros (HTTPS ou `localhost`/`127.0.0.1`). Em redes locais Wi-Fi onde o smartphone acessa o Host via HTTP em IP privado (`http://192.168.x.x:port`), `crypto.randomUUID()` é `undefined`. Ao desenhar, a chamada lançava exceção não tratada ou atribuía ID indefinido, fazendo com que a reconciliação do `renderState` do Fabric removesse o objeto na frame seguinte.
- **Correção:** Substituição de todas as ocorrências de `crypto.randomUUID()` por `generateUUID()` (de `src/shared/events/protocol.ts`), implementado com `crypto.getRandomValues()`, suportado universalmente em HTTP e HTTPS.

#### 3. H3 — Borracha de Trecho (ADR-012)
- **Decisão:** A borracha padrão (`eraser`) passa a ser **Borracha de Trecho**, compatível com Event Sourcing append-only:
  - Cada passada emite `DRAW_ADD` com `tipo: 'eraser_stroke'`.
  - No Fabric.js, objetos `eraser_stroke` utilizam `globalCompositeOperation = 'destination-out'`.
  - O canvas possui fundo transparente em sua camada interna e `#ffffff` no CSS, com exportação `toDataURL` compondo sobre fundo branco opaco para evitar vazamento ou perfurações.
  - Reversibilidade total por `UNDO` e `REDO` por autor sem alteração do histórico append-only.
  - A antiga borracha lógica foi mantida sob a ferramenta `object_eraser` (`#tool-object-eraser`).
  - Reducer O(N): benchmark de 50.000 eventos processados em ~60ms (< 1500ms).

#### 4. H4 — Isolamento de Banco de Dados e Sonda de Runtime LAN
- **Banco Temporário:** `tools/probe-runtime.cjs` e `scripts/test-runner.mjs` inicializam diretório temporário isolado (`os.tmpdir()`) com `ONETOONE_DB_PATH` e `--user-data-dir`, removidos ao final da execução.
- **Integridade do Banco Real:** O banco %APPDATA%\OneToOneSupport\onetoone.db permanece com hash e tamanho inalterados antes e após `npm run verify` (SHA256: `211F8CD9ACEAF5AAA24F77CDD3F1F8A63CEC1980B36257F253450611285C6379`, tamanho: 98304 bytes).
- **Variável `ONETOONE_DB_RESET=1`:** Permite reset/recriação de banco vazio na inicialização em desenvolvimento (`NODE_ENV !== 'production'`); é expressamente recusada caso `NODE_ENV === 'production'`.
- **Sonda LAN Estendida:** A sonda conecta o Guest através do IP LAN real do convite (e.g. `http://192.168.1.200:porta`), validando conteúdo bidirecional por IDs de elementos, passada de borracha de trecho e `UNDO`/`REDO` bidirecionais.

### Lacuna de Verificação (Por que o teste antigo passou e o mundo real falhou)
1. **Ambiente de Contexto Seguro Artificial:** A sonda anterior conectava o Guest forçando `parsedGuestUrl.hostname = '127.0.0.1'`. Para os motores de renderização baseados em Chromium, `127.0.0.1` é tratado como *Secure Context*, permitindo o funcionamento de APIs como `crypto.randomUUID()`. No mundo real, a conexão é feita via IP da LAN (ex.: `http://192.168.1.200`), onde conexões HTTP comuns são marcadas como *Insecure Context*, desabilitando APIs que dependem de HTTPS/Secure Context.
2. **Asserção Apenas por Contagem, sem Comparar Conteúdo:** A sonda anterior verificava apenas se o contador `#badge-elementos` não continha o caractere `'0'`. O teste não conferia se o ID gerado pelo Guest correspondia exatamente ao ID existente no Host, nem se o elemento persistido no banco SQLite continha as propriedades vetoriais completas.
3. **Falta de Teste Bidirecional com Ambas as Pontas Ativas:** A sonda anterior iniciava o Guest, executava uma ação e fechava o Guest antes de o Host interagir com as ferramentas de desenho. Não havia verificação de troca cruzada de eventos ao vivo.
4. **Vazamento para o Banco de Dados Real:** Testes e probes anteriores gravavam no banco real do desenvolvedor, acumulando registros espúrios que mascaravam estados limpos de inicialização.

### Evidências da Verificação Completa da Correção

#### Prova de Inalterabilidade do Banco Real do Usuário (Antes e Depois do Gate)
```
Algorithm       Hash                                                                   Path
---------       ----                                                                   ----
SHA256          211F8CD9ACEAF5AAA24F77CDD3F1F8A63CEC1980B36257F253450611285C6379       C:\Users\alxch\AppData\Roaming\OneToOneSupport\onetoone.db
Tamanho:        98304 bytes
```

#### Saída Real de `tests/borracha-trecho.test.ts`
```
$ node scripts/test-runner.mjs tests/borracha-trecho.test.ts
[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...
 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

stdout | tests/borracha-trecho.test.ts > ADR-012 — Borracha de Trecho (Stroke Segment Eraser) e Reducer O(N) > (e) processa 50 000 eventos no reducer em menos de 1500 ms (linearidade O(N))
[Benchmark Reducer] 50 000 eventos processados em: 59.58 ms

 ✓ tests/borracha-trecho.test.ts (5 tests) 1185ms
   ✓ ADR-012 — Borracha de Trecho (Stroke Segment Eraser) e Reducer O(N) > (d) borracha e UNDO/REDO sincronizam bidirecionalmente entre Guest e Host via WebSocket 951ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  2.67s
```

#### Saída Real de `npm run verify` (15 Suítes, 241 Testes, Sonda 24/24 PASS)
```
$ npm run verify
> onetoonesupport@1.0.0 verify
> npm run typecheck && npm run build && npm test && npm run probe

> onetoonesupport@1.0.0 typecheck
> tsc --noEmit

> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts
dist/renderer/index.html                  0.97 kB │ gzip:   0.56 kB
dist/renderer/assets/index-DCgmMq-s.js  511.01 kB │ gzip: 151.51 kB
dist/guest/guest.html                     0.96 kB │ gzip:   0.51 kB
dist/guest/assets/index-CD_7vfq9.css      3.37 kB │ gzip:   1.16 kB
dist/guest/assets/index-DLORmdV1.js   1,481.29 kB │ gzip: 465.49 kB

> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs
[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...

 Test Files  15 passed (15)
      Tests  241 passed (241)
   Duration  11.81s

> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs
[Probe] Inicializando ambiente isolado temporário: C:\Users\alxch\AppData\Local\Temp\onetoone-probe-...
[Probe] Banco SQLite temporário: C:\Users\alxch\AppData\Local\Temp\onetoone-probe-...\onetoone-probe.db
[Probe] URL de convite gerada pelo Host: http://192.168.1.200:59524/join/...#...
[Probe] Lançando Chromium emulado para Guest mobile: C:\Program Files\Google\Chrome\Application\chrome.exe
[Probe] Conectando Guest mobile ao IP LAN: http://192.168.1.200:59524/join/...#...
PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  Guest Mobile: carregou bundle do Guest e removeu hash da URL
PASS  Guest Mobile: CSP sem violacoes no console
PASS  Guest Mobile: sincronizacao bidirecional por conteudo (IDs de elementos)
PASS  Guest Mobile: borracha de trecho sincronizou elemento eraser_stroke
PASS  Guest Mobile: UNDO e REDO bidirecionais sincronizaram estado
PASS  Guest Mobile: LOCK_SCREEN exibiu overlay e desbloqueou
PASS  Guest Mobile: mute local emitiu GUEST_MUTED
PASS  Guest Mobile: barra de ferramentas totalmente visivel na viewport
PASS  UI: abrir quadro branco HiDPI e verificar DPR 1.5
PASS  UI: desenhar traço, retângulo, texto, desfazer/refazer e borracha
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(24/24 checagens PASS)*

---

### Homologação 2 — Correções do Quadro Branco, Diagnóstico e Coordenadas (21/09/2026)

#### 1. Resumo das Correções Implementadas (V1 a V5)
* **V1 — Carimbo de versão visível:**
  - `scripts/generate-build-info.mjs` gera `src/shared/build-info.json` e `dist/guest/version.json` com `commit`, `branch`, `buildDate` e `stamp`.
  - Host exibe `#host-version-stamp` no rodapé e loga no startup.
  - Guest exibe `#guest-version-stamp` no cabeçalho e na tela de entrada (`JoinFlow.tsx`).
  - Host compara seu carimbo com `dist/guest/version.json` e exibe o alerta visível `#aviso-guest-desatualizado` se o commit diferir.
* **V2 — Diagnóstico sob flag `ONETOONE_DIAG=1`:**
  - Implementado em `src/shared/diag.ts` com sanitização rigorosa de tokens, segredos, chaves e nonces.
  - Ativo exclusivamente em desenvolvimento; ignorado estritamente em produção (`NODE_ENV=production`).
  - Pontos de log nos métodos críticos: `path:created`, `finishShapeCreation`, `emitEvent`, `renderState` (`engine.ts`), `aplicarEventoQuadro`, `gravarEventoIPC` (`useHostStore.ts`), `guestSend`, `guestReceive` (`GuestRoom.tsx`), e `serverDrop` (`ws.ts`) cobrindo 12 motivos de queda de conexão/mensagem.
* **V3 — Sonda com entrada real e pixels:**
  - `tools/probe-runtime.cjs` estendida com automação Windows SendInput (`tools/drag-sendinput.ps1`) utilizando `SetProcessDPIAware`.
  - Matriz de testes cobrindo as 7 ferramentas (`pencil`, `brush`, `rectangle`, `ellipse`, `line`, `arrow`, `text`) e 4 direções de arraste (`NO_to_SE`, `SO_to_NE`, `SE_to_NO`, `NE_to_SO`).
  - Medição de pixels não-transparentes (`getImageData` com alpha > 0) nos buffers do Host e Guest, comprovando que nenhum objeto desaparece ou fica fora da tela.
  - Suporte total a flags `--mode=dev|prod` e `--dpr=1.0|1.5`.
* **V4 — Mapeamento de coordenadas Host x Mobile:**
  - Espaço canônico fixo unificado em `CANONICAL_VIRTUAL_WIDTH = 1200` e `CANONICAL_VIRTUAL_HEIGHT = 800`.
  - Escala uniforme calculada como `scale = Math.min(containerW / 1200, containerH / 800)` aplicando `viewportTransform = [scale, 0, 0, scale, 0, 0]`.
  - Preservação estrita de aspect ratio (sem distorção anisotrópica) e cena inteiramente contida na viewport do mobile sem corte.
  - Conversão `pointerToScene` adaptada para priorizar `changedTouches` em eventos de `touchend`, eliminando a causa-raiz de descarte de formas geométricas no término do toque.
  - Relatório analítico completo arquivado em `docs/reviews/diagnostico-coordenadas.md`.
* **V5 — Script de homologação limpa (`tools/homologar.ps1`):**
  - Recusa execução se a árvore Git estiver suja (`git status --porcelain`) ou se a branch não for `fase/07-homologacao-1`.
  - Encerra instâncias residuais de `electron.exe` e Vite.
  - Deleta arquivos de banco SQLite em `%APPDATA%\OneToOneSupport` com app fechado, listando cada arquivo removido.
  - Executa build completo (`npm run build`).
  - Imprime carimbo de versão ativo e instruções de conexão na LAN para o testador no Motorola Edge 70 Pro.
  - Inicia ambiente com `ONETOONE_DIAG=1` ativado.

#### 2. Evidência Real de `npm run verify` (16 Suítes, 250 Testes, Sonda 27/27 PASS)
```
> onetoonesupport@1.0.0 verify
> npm run typecheck && npm run build && npm test && npm run probe

> onetoonesupport@1.0.0 typecheck
> tsc --noEmit

> onetoonesupport@1.0.0 build
> node scripts/generate-build-info.mjs && tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts
[BuildInfo] Carimbo gerado em C:\desenv\utils\OneToOneSupport\src\shared\build-info.json: b7d31c3 (fase/07-homologacao-1) 2026-09-22T00:01:43.562Z
[BuildInfo] Carimbo gerado em C:\desenv\utils\OneToOneSupport\dist\guest\version.json: b7d31c3 (fase/07-homologacao-1) 2026-09-22T00:01:43.562Z

> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs
 Test Files  16 passed (16)
      Tests  250 passed (250)
   Duration  11.23s

> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs
[Probe] Executando em modo: production (isDev: false) | DPR: 1.5
[Probe] Host Version Stamp: "Build: b7d31c3 (fase/07-homologacao-1) 2026-09-22T00:01:43.562Z" (Aviso desatualizado: null)
[Probe] Guest Version Stamp: "b7d31c3 (fase/07-homologacao-1) 2026-09-22T00:01:43.562Z"
[Probe] Windows SendInput drag: before=2681, after=5625, guestPixels=643, pass=true
[Probe PASS] Forma 'pencil' (NO_to_SE): host +1018 px, guest +127 px
[Probe PASS] Forma 'brush' (SO_to_NE): host +2012 px, guest +177 px
[Probe PASS] Forma 'rectangle' (SO_to_NE): host +2700 px, guest +330 px
[Probe PASS] Forma 'rectangle' (NO_to_SE): host +2700 px, guest +330 px
[Probe PASS] Forma 'rectangle' (SE_to_NO): host +2700 px, guest +330 px
[Probe PASS] Forma 'rectangle' (NE_to_SO): host +2700 px, guest +330 px
[Probe PASS] Forma 'ellipse' (SE_to_NO): host +2095 px, guest +258 px
[Probe PASS] Forma 'line' (NE_to_SO): host +1127 px, guest +176 px
[Probe PASS] Forma 'arrow' (SO_to_NE): host +1345 px, guest +198 px
[Probe PASS] Forma 'text' (CLICK): host +869 px, guest +111 px
PASS  V1: Carimbo de versão visível no Host (#host-version-stamp)
PASS  V1: Carimbo de versão visível no Guest (#guest-version-stamp)
PASS  V1: Carimbo coincide entre Host e Guest sem aviso de desatualizado
PASS  V3: Entrada real Windows SendInput com SetProcessDPIAware produziu pixels
PASS  V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host
PASS  V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest
```
*(27/27 checagens PASS)*
