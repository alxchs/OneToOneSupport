# Relatório de Red Team — Fase 07: Guest Mobile

**Data:** 2026-09-20  
**Branch:** `fase/07-guest-mobile`  
**Alvo:** Segurança, robustez e integridade das garantias de sessão, autoridade e E2EE da Fase 07  
**Arquivo de Testes:** `tests/adversarial/redteam-fase07.test.ts`  
**Resultado Global:** 40 testes adversariais executados — **35 DEFENDIDOS**, **5 VULNERÁVEIS**

---

## Tabela de Ataques e Resultados

| ID | Categoria | Ataque Adversarial | Resultado | Teste | Arquivo:Linha |
|---|---|---|---|---|---|
| `ENTRADA-1` | Entrada | Token gigante (> 100.000 chars) em HTTP `/join/:token` | **DEFENDIDO** | `[ENTRADA-1] HTTP /join/:token com token gigante` | `electron/server/http.ts:76` |
| `ENTRADA-2` | Entrada | Caracteres unicode, emojis e byte nulo em HTTP `/join/:token` | **DEFENDIDO** | `[ENTRADA-2] HTTP /join/:token com caracteres unicode` | `electron/server/http.ts:79` |
| `ENTRADA-3` | Entrada | WS `AUTH` com token gigante (> 512 caracteres) | **DEFENDIDO** | `[ENTRADA-3] WS AUTH com token gigante` | `src/shared/events/protocol.ts:346` |
| `ENTRADA-4` | Entrada | WS `AUTH` com tipos inválidos no payload (número, array, boolean, objeto) | **DEFENDIDO** | `[ENTRADA-4] WS AUTH com tipos inválidos` | `src/shared/events/protocol.ts:346` |
| `ENTRADA-5` | Entrada | WS `HANDSHAKE_INIT` com chave pública corrompida / truncada | **DEFENDIDO** | `[ENTRADA-5] WS HANDSHAKE_INIT com chave pública corrompida` | `electron/server/session-manager.ts:263` |
| `ENTRADA-6` | Entrada | Injeção de protótipo (`__proto__`, `constructor`, `prototype`) no envelope WS | **DEFENDIDO** | `[ENTRADA-6] Injeção de protótipo no envelope WS` | `src/shared/events/protocol.ts:238` |
| `REPETICAO-1` | Repetição | Replay de nonce na cifra ChaCha20-Poly1305 IETF (`REPLAY_ATTACK`) | **DEFENDIDO** | `[REPETICAO-1] Replay de nonce na cifra ChaCha20-Poly1305` | `src/shared/crypto/nonce.ts:89` |
| `REPETICAO-2` | Repetição | Replay do token de primeiro acesso pós-handshake (`TOKEN_REUSED`) | **DEFENDIDO** | `[REPETICAO-2] Replay do token de primeiro acesso` | `electron/server/session-manager.ts:203` |
| `REPETICAO-3` | Repetição | Reuso de `reconnect_token` antigo após rotação subsequente | **DEFENDIDO** | `[REPETICAO-3] Reuso de reconnect_token antigo` | `electron/server/session-manager.ts:237` |
| `IDEMPOTENCIA-1` | Idempotência | Execução múltipla consecutiva de `stopSession()` | **DEFENDIDO** | `[IDEMPOTENCIA-1] stopSession chamado consecutivamente` | `electron/server/index.ts:237` |
| `IDEMPOTENCIA-2` | Idempotência | Chamadas repetidas de `lockScreen()` e `unlockMedia()` | **DEFENDIDO** | `[IDEMPOTENCIA-2] lockScreen e unlockMedia chamados repetidamente` | `electron/server/session-manager.ts:323` |
| `ORDEM-1` | Ordem | Envio de `HANDSHAKE_INIT` antes de `AUTH` | **DEFENDIDO** | `[ORDEM-1] Envio de HANDSHAKE_INIT antes de AUTH` | `electron/server/ws.ts:183` |
| `ORDEM-2` | Ordem | Envio de `ENCRYPTED` antes de `AUTH` ou `HANDSHAKE_INIT` | **DEFENDIDO** | `[ORDEM-2] Envio de pacote ENCRYPTED antes de AUTH` | `electron/server/ws.ts:183` |
| `ORDEM-3` | Ordem | Envio de mensagem em claro pós-handshake | **DEFENDIDO** | `[ORDEM-3] Envio de mensagem em claro pós-handshake` | `electron/server/ws.ts:311` |
| `CONCORRENCIA-1` | Concorrência | Disputa simultânea de duas conexões pelo mesmo token no mesmo milissegundo | **DEFENDIDO** | `[CONCORRENCIA-1] Disputa simultânea por AUTH` | `electron/server/session-manager.ts:189` |
| `CONCORRENCIA-2` | Concorrência | Segundo convidado tentando conectar enquanto o primeiro está ativo (`SESSION_BUSY`) | **DEFENDIDO** | `[CONCORRENCIA-2] Segundo convidado tentando conectar` | `electron/server/session-manager.ts:189` |
| `FALHA-1` | Falha Parcial | Queda de rede entre `AUTH` e `HANDSHAKE_INIT` preserva o token | **DEFENDIDO** | `[FALHA-1] Queda de conexão após AUTH e antes de HANDSHAKE_INIT` | `electron/server/session-manager.ts:274` |
| `FALHA-2` | Falha Parcial | Queda pós-handshake permite reconexão via `reconnect_token` | **DEFENDIDO** | `[FALHA-2] Queda de conexão após handshake bem-sucedido` | `electron/server/session-manager.ts:223` |
| `FALHA-3` | Falha Parcial | Desconexão de conexão não-autenticada transiciona indevidamente estado para `reconectando` | **VULNERAVEL** | `[FALHA-3 - VULNERAVEL] Desconexão de conexão não-autenticada` | `electron/server/session-manager.ts:309` |
| `FALHA-4` | Falha Parcial | Desconexões espúrias resetam `reconnectExpiresAt` estendendo indefinidamente o TTL | **VULNERAVEL** | `[FALHA-4 - VULNERAVEL] Desconexões espúrias não-autenticadas` | `electron/server/session-manager.ts:306` |
| `SEGREDO-1` | Segredos | Comparação em tempo constante com `safeTokenEqual` | **DEFENDIDO** | `[SEGREDO-1] Validação de token com safeTokenEqual` | `electron/server/session-manager.ts:38` |
| `SEGREDO-2` | Segredos | Higienização de buffers de chaves privadas com `memzero` | **DEFENDIDO** | `[SEGREDO-2] Encerramento da sessão higieniza chaves privadas` | `electron/crypto/handshake.ts:93` |
| `SEGREDO-3` | Segredos | Mensagens de erro em HTTP 403 e WS ERROR sem vazamento de segredos | **DEFENDIDO** | `[SEGREDO-3] Mensagens de erro de autenticação não vazam tokens` | `electron/server/ws.ts:202` |
| `SEGREDO-4` | Segredos | Validação e expurgo de chave pública do fragmento hash `#pk_h` | **DEFENDIDO** | `[SEGREDO-4] extractHostPublicKeyFromFragment valida integridade` | `src/shared/crypto/invite.ts:40` |
| `LIMITES-1` | Limites | Mensagem WebSocket excedendo 1 MB (`MAX_MESSAGE_SIZE_BYTES`) | **DEFENDIDO** | `[LIMITES-1] Mensagem WebSocket excedendo 1 MB` | `electron/server/ws.ts:62` |
| `LIMITES-2` | Limites | Rate limit de WebSocket (> 100 mensagens em 1 segundo) | **DEFENDIDO** | `[LIMITES-2] Rate limiting por conexão (> 100 msgs/seg)` | `electron/server/ws.ts:121` |
| `LIMITES-3` | Limites | Timeout de handshake derruba conexão ociosa (> 10 segundos) | **DEFENDIDO** | `[LIMITES-3] Timeout de handshake derruba conexão inativa` | `electron/server/ws.ts:94` |
| `LIMITES-4` | Limites | Expiração do token de reconexão após TTL de 5 minutos | **DEFENDIDO** | `[LIMITES-4] Token de reconexão expira após TTL de 5 minutos` | `electron/server/session-manager.ts:241` |
| `LIMITES-5` | Limites | Expiração do token de convite inicial após TTL de 15 minutos | **DEFENDIDO** | `[LIMITES-5] Token de convite inicial expira após TTL de 15 minutos` | `electron/server/session-manager.ts:209` |
| `PERMISSAO-1` | Permissões | Convidado emitindo ações exclusivas (`CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA`, `TAB_SWITCH`) | **DEFENDIDO** | `[PERMISSAO-1] Guest tentando emitir CLEAR_TAB, LOCK_SCREEN` | `electron/server/session-manager.ts:348` |
| `PERMISSAO-2` | Permissões | Convidado emitindo ação exclusiva `SCREEN_LOCKED` não é barrado no `SessionManager` | **VULNERAVEL** | `[PERMISSAO-2 - VULNERAVEL] Guest é estritamente proibido de emitir SCREEN_LOCKED` | `electron/server/session-manager.ts:348` |
| `PERMISSAO-3` | Permissões | Convidado emitindo `UNDO` com tela bloqueada (`screenLocked === true`) não é barrado | **VULNERAVEL** | `[PERMISSAO-3 - VULNERAVEL] Guest é estritamente proibido de emitir UNDO quando a tela está bloqueada` | `electron/server/session-manager.ts:333` |
| `PERMISSAO-4` | Permissões | `canGuestExecute` usa denylist aberta permitindo tipos de eventos arbitrários/desconhecidos | **VULNERAVEL** | `[PERMISSAO-4 - VULNERAVEL] canGuestExecute deve aplicar lista de permissão estrita` | `electron/server/session-manager.ts:371` |
| `PERMISSAO-5` | Permissões | Convidado emitindo ações de mídia com mídia bloqueada (`mediaUnlocked === false`) | **DEFENDIDO** | `[PERMISSAO-5] Guest emitindo controle de mídia com mediaUnlocked === false` | `electron/server/session-manager.ts:364` |
| `PERMISSAO-6` | Permissões | Convidado emitindo `DRAW_ADD` com tela bloqueada (`screenLocked === true`) | **DEFENDIDO** | `[PERMISSAO-6] Guest emitindo desenho DRAW_ADD com screenLocked === true` | `electron/server/session-manager.ts:335` |
| `TRAVERSAL-1` | Path Traversal | Path traversal em rota HTTP `/join/:token` (`..%2f..%2f`) | **DEFENDIDO** | `[TRAVERSAL-1] Requisições HTTP com path traversal em /join/:token` | `electron/server/http.ts:79` |
| `TRAVERSAL-2` | Path Traversal | Path traversal em rota estática `/guest/assets/` | **DEFENDIDO** | `[TRAVERSAL-2] Requisições a /guest/assets com traversal` | `electron/server/http.ts:61` |
| `TRAVERSAL-3` | Path Traversal | `abaId` malicioso enviado pelo Guest descartado na borda | **DEFENDIDO** | `[TRAVERSAL-3] Evento do Guest com abaId malicioso` | `electron/server/index.ts:87` |
| `INJECAO-1` | Injeção | Injeção XSS em token é sanitizada no HTML de fallback por `escapeHtml` | **DEFENDIDO** | `[INJECAO-1] Injeção de tags HTML/scripts em fallback` | `electron/server/http.ts:214` |
| `INJECAO-2` | Injeção | Diretivas CSP do ADR-005 bloqueiam `'unsafe-inline'` e `'unsafe-eval'` | **DEFENDIDO** | `[INJECAO-2] Cabeçalho Content-Security-Policy do ADR-005` | `src/shared/csp.ts:1` |

---

## Análise Detalhada das 5 Vulnerabilidades Reais Encontradas

### 1. `[FALHA-3]` Desconexão de conexão não-autenticada transiciona indevidamente estado da sessão para `reconectando`
- **Arquivo:Linha:** `electron/server/session-manager.ts:309`
- **Causa Raiz:** O método `handleGuestDisconnect(connectionId)` verifica apenas se `this.activeGuestConnectionId` não bate com `connectionId`. Porém, quando nenhuma conexão se autenticou ainda (`activeGuestConnectionId === null` e `state === 'aguardando_guest'`), qualquer cliente que fechar o socket WebSocket (por exemplo, um scanner de portas local, monitor de rede ou sonda) faz o método executar as linhas 303–310 e disparar `this.notifyStateChange('reconectando')`.
- **Impacto:** A UI do Host passa a exibir o estado do Convidado como "Reconectando..." quando nenhum convidado jamais ingressou na sala de atendimento.
- **Falha no Teste:**
  ```
  AssertionError: expected 'reconectando' to be 'aguardando_guest'
  Expected: "aguardando_guest"
  Received: "reconectando"
  ```

### 2. `[FALHA-4]` Desconexões espúrias resetam `reconnectExpiresAt` estendendo indefinidamente o TTL de reconexão
- **Arquivo:Linha:** `electron/server/session-manager.ts:306`
- **Causa Raiz:** Em `handleGuestDisconnect`:
  ```ts
  if (this.reconnectExpiresAt < now + this.reconnectTokenTtlMs) {
    this.reconnectExpiresAt = now + this.reconnectTokenTtlMs;
  }
  ```
  Como o método não restringe a atualização à desconexão do convidado que estava de fato autenticado, qualquer conexão TCP/WebSocket espúria aberta e fechada por um terceiro empurra a data de expiração `reconnectExpiresAt` para `now + 5 minutos`.
- **Impacto:** Violação da garantia inegociável de TTL estrito de 5 minutos (Mestre §11 e Ordem de Serviço). Um invasor na LAN pode manter a janela de reconexão aberta infinitamente através de pings periódicos.
- **Falha no Teste:**
  ```
  AssertionError: expected true to be false
  - false
  + true
  ```

### 3. `[PERMISSAO-2]` Emissão de `SCREEN_LOCKED` permitida ao Guest em `SessionManager.canGuestExecute`
- **Arquivo:Linha:** `electron/server/session-manager.ts:348`
- **Causa Raiz:** No lote 2 de correções (C2), `SCREEN_LOCKED` foi incluído como ação restrita exclusiva do Host em `EventoService.validarAutorEPermissao` (`electron/services/evento.service.ts:137`). No entanto, a checagem no `SessionManager.canGuestExecute` não incluiu `SCREEN_LOCKED` na lista:
  ```ts
  if (
    actionType === 'LOCK_SCREEN' ||
    actionType === 'UNLOCK_MEDIA' ||
    actionType === 'TAB_SWITCH' ||
    actionType === 'CLEAR_TAB'
  ) {
    return { allowed: false, reason: 'FORBIDDEN_ACTION' };
  }
  ```
  Como `SCREEN_LOCKED` não está na lista e não é `DRAW_ADD`/`DRAW_HIDE`/`CLEAR_TAB`, em `electron/server/index.ts:124` o evento passa sem passar por `EventoService` e é despachado diretamente ao Host via `this.notifyGuestEvent(envelope)`.
- **Impacto:** Quebra de autoridade do Host: o Convidado pode forjar e emitir evento `SCREEN_LOCKED` diretamente para os listeners do Host.
- **Falha no Teste:**
  ```
  AssertionError: expected true to be false
  - false
  + true
  ```

### 4. `[PERMISSAO-3]` Bypass de bloqueio de tela com ação `UNDO` em `SessionManager.canGuestExecute`
- **Arquivo:Linha:** `electron/server/session-manager.ts:333`
- **Causa Raiz:** A checagem de bloqueio de tela em `canGuestExecute` verifica apenas:
  ```ts
  if (this.screenLocked) {
    if (
      actionType === 'DRAW_ADD' ||
      actionType === 'DRAW_HIDE' ||
      actionType === 'CLEAR_TAB' ||
      actionType === 'PLAY' ||
      actionType === 'PAUSE' ||
      actionType === 'SEEK' ||
      actionType === 'MEDIA_CONTROL'
    ) {
      return { allowed: false, reason: 'SCREEN_LOCKED' };
    }
  }
  ```
  A ação `UNDO` (desfazer) não foi incluída nesta lista. Logo, quando o Host bloqueia a tela (`screenLocked === true`), `canGuestExecute('UNDO')` retorna `{ allowed: true }`.
- **Impacto:** Convidado com tela bloqueada pelo Host consegue emitir evento `UNDO` cifrado e desfaz interações ativas à revelia do bloqueio de tela.
- **Falha no Teste:**
  ```
  AssertionError: expected true to be false
  - false
  + true
  ```

### 5. `[PERMISSAO-4]` Denylist aberta em `SessionManager.canGuestExecute` permitindo tipos arbitrários
- **Arquivo:Linha:** `electron/server/session-manager.ts:371`
- **Causa Raiz:** `canGuestExecute` conclui com `return { allowed: true };` para qualquer tipo de evento não explicitamente proibido na denylist, em vez de exigir uma lista de permissão estrita (allowlist) dos tipos permitidos ao Guest (`DRAW_ADD`, `DRAW_HIDE`, `GUEST_MUTED` e ações de mídia desbloqueadas).
- **Impacto:** Convidado pode injetar payloads com tipos desconhecidos/arbitrários (`ARBITRARY_ACTION_TYPE`) que são aceitos pelo WebSocket e encaminhados ao Host.
- **Falha no Teste:**
  ```
  AssertionError: expected true to be false
  - false
  + true
  ```

---

## O que NÃO Foi Atacado (Limitações do Red Team)

1. **Hardware Físico Real:** Não foi utilizado um smartphone físico Motorola Edge 70 Pro conectado via USB; os testes móveis foram executados via emulação Chromium com viewport 412x915, DPR 2.625 e eventos de toque sintetizados.
2. **Criptoanálise de Primitivas Matemáticas:** Não foram realizados ataques de quebra de força bruta contra as curvas elípticas Curve25519 (X25519) ou contra o algoritmo de cifragem ChaCha20-Poly1305, assumindo-se a integridade matemática comprovada da biblioteca libsodium.
3. **Canais Laterais Físicos:** Não foram mensurados consumos de energia, radiação eletromagnética ou temporização acústica de hardware do Host durante a derivação de chaves.
4. **Manipulação de Memória por Debugger Nativo:** Não foi atacado o processo Electron através de depuradores de sistema operacional anexados em tempo de execução (como GDB ou WinDbg).
5. **Streaming Contínuo WebRTC:** Os fluxos de áudio e vídeo em tempo real contínuo (P2P / SFU) não foram cobertos nesta fase, visto que seu desenvolvimento está alocado na Fase 08 conforme o plano mestre.

---

## Saída Real de Execução dos Testes Adversariais

```
$ npm test -- tests/adversarial/redteam-fase07.test.ts
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs tests/adversarial/redteam-fase07.test.ts

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 ❯ tests/adversarial/redteam-fase07.test.ts (40 tests | 5 failed) 4005ms
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 2. Repetição e Idempotência > [REPETICAO-1] Replay de nonce na cifra ChaCha20-Poly1305 dispara REPLAY_ATTACK e fecha conexão 393ms
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-1] Queda de conexão após AUTH e antes de HANDSHAKE_INIT não consome o token de acesso 396ms
   × Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-3 - VULNERAVEL] Desconexão de conexão não-autenticada NÃO deve alterar estado da sessão para reconectando 6ms
     → expected 'reconectando' to be 'aguardando_guest' // Object.is equality
   × Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-4 - VULNERAVEL] Desconexões espúrias não-autenticadas NÃO devem estender indefinidamente o TTL de reconexão 1ms
     → expected true to be false // Object.is equality
   ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 6. Limites (Rate Limit, Timeout, Tamanho, TTL) > [LIMITES-3] Timeout de handshake derruba conexão inativa após o tempo limite 367ms
   × Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-2 - VULNERAVEL] Guest é estritamente proibido de emitir SCREEN_LOCKED em canGuestExecute 1ms
     → expected true to be false // Object.is equality
   × Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-3 - VULNERAVEL] Guest é estritamente proibido de emitir UNDO quando a tela está bloqueada (screenLocked === true) 1ms
     → expected true to be false // Object.is equality
   × Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-4 - VULNERAVEL] canGuestExecute deve aplicar lista de permissão estrita e rejeitar tipos desconhecidos 0ms
     → expected true to be false // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/adversarial/redteam-fase07.test.ts > Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-3 - VULNERAVEL] Desconexão de conexão não-autenticada NÃO deve alterar estado da sessão para reconectando
AssertionError: expected 'reconectando' to be 'aguardando_guest' // Object.is equality

Expected: "aguardando_guest"
Received: "reconectando"

 ❯ tests/adversarial/redteam-fase07.test.ts:504:29

 FAIL  tests/adversarial/redteam-fase07.test.ts > Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-4 - VULNERAVEL] Desconexões espúrias não-autenticadas NÃO devem estender indefinidamente o TTL de reconexão
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/adversarial/redteam-fase07.test.ts:535:29

 FAIL  tests/adversarial/redteam-fase07.test.ts > Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-2 - VULNERAVEL] Guest é estritamente proibido de emitir SCREEN_LOCKED em canGuestExecute
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/adversarial/redteam-fase07.test.ts:749:27

 FAIL  tests/adversarial/redteam-fase07.test.ts > Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-3 - VULNERAVEL] Guest é estritamente proibido de emitir UNDO quando a tela está bloqueada (screenLocked === true)
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/adversarial/redteam-fase07.test.ts:761:27

 FAIL  tests/adversarial/redteam-fase07.test.ts > Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-4 - VULNERAVEL] canGuestExecute deve aplicar lista de permissão estrita e rejeitar tipos desconhecidos
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/adversarial/redteam-fase07.test.ts:772:36

 Test Files  1 failed (1)
      Tests  5 failed | 35 passed (40)
   Start at  21:29:43
   Duration  6.19s
```
