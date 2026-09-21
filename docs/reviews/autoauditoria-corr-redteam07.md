# Autoauditoria de Correção do Red Team — Fase 07: Guest Mobile

**Data:** 2026-09-20  
**Branch:** `fase/07-guest-mobile`  
**Executor:** Antigravity  
**Alvo:** Correção das 5 vulnerabilidades apontadas pelo Red Team em `docs/reviews/redteam-07.md` e eliminação da causa raiz comum via fonte única de autoridade (`docs/ADR/011-fonte-unica-autoridade.md`).

---

## 1. Critérios de Correção e Evidências

### Critério RT1 (FALHA-3): Desconexão de conexão não-autenticada não altera estado da sessão
- **Descrição:** `SessionManager.handleGuestDisconnect` deve ignorar conexões não-autenticadas ou probes espúrios de rede. O estado permanece `aguardando_guest` e listeners não são acionados.
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts -t "FALHA-3"`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (1 test) 5ms
    ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-3 - VULNERAVEL] Desconexão de conexão não-autenticada NÃO deve alterar estado da sessão para reconectando 5ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```
- **Veredito:** **PASS**

---

### Critério RT2 (FALHA-4): Desconexões espúrias repetidas não estendem o TTL de reconexão
- **Descrição:** `reconnectExpiresAt` é definido em `completeHandshake` e NUNCA é estendido em desconexões. Desconexões sucessivas de atacantes mantêm o TTL estrito de 5 minutos da queda do convidado legítimo.
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts -t "FALHA-4"`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (1 test) 2ms
    ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 4. Estado Após Falha Parcial > [FALHA-4 - VULNERAVEL] Desconexões espúrias não-autenticadas NÃO devem estender indefinidamente o TTL de reconexão 2ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```
- **Veredito:** **PASS**

---

### Critério RT3 (PERMISSAO-2): Guest proibido de emitir SCREEN_LOCKED
- **Descrição:** `SCREEN_LOCKED` é ação exclusiva do Host. Guest é barrado em `SessionManager.canGuestExecute` com `FORBIDDEN_ACTION`.
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts -t "PERMISSAO-2"`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (1 test) 1ms
    ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-2 - VULNERAVEL] Guest é estritamente proibido de emitir SCREEN_LOCKED em canGuestExecute 1ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```
- **Veredito:** **PASS**

---

### Critério RT4 (PERMISSAO-3): Bloqueio de UNDO sob tela bloqueada
- **Descrição:** Quando `screenLocked === true`, o Guest não pode emitir `UNDO` nem nenhuma ação interativa ou de mídia. Barrado com `SCREEN_LOCKED`.
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts -t "PERMISSAO-3"`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (1 test) 1ms
    ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-3 - VULNERAVEL] Guest é estritamente proibido de emitir UNDO quando a tela está bloqueada (screenLocked === true) 1ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```
- **Veredito:** **PASS**

---

### Critério RT5 (PERMISSAO-4): canGuestExecute opera em allowlist estrita
- **Descrição:** Denylist aberta removida. Apenas os 9 tipos permitidos ao Guest (`DRAW_ADD`, `DRAW_HIDE`, `UNDO`, `REDO`, `GUEST_MUTED`, `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL`) são admitidos. Tipos desconhecidos (`ARBITRARY_ACTION_TYPE`), vazios ou chaves de protótipo (`__proto__`, `constructor`) são rejeitados com `allowed: false`.
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts -t "PERMISSAO-4"`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (1 test) 1ms
    ✓ Red Team Fase 07 - Ataques Adversariais e Testes de Penetração > 7. Permissões e Autoridade (Ator Sem Direito) > [PERMISSAO-4 - VULNERAVEL] canGuestExecute deve aplicar lista de permissão estrita e rejeitar tipos desconhecidos 1ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
  ```
- **Veredito:** **PASS**

---

### Critério RT6: Causa Raiz Comum e Fonte Única de Verdade (`src/shared/autoridade.ts` e ADR-011)
- **Descrição:** Criação de `src/shared/autoridade.ts` consumido tanto por `SessionManager.canGuestExecute` quanto por `EventoService.validarAutorEPermissao`. Suite de testes adversariais `tests/adversarial/autoridade-fonte-unica.test.ts` percorre todos os tipos conhecidos e inválidos assegurando veredito idêntico para o Guest.
- **Comando:** `npm test -- tests/adversarial/autoridade-fonte-unica.test.ts`
- **Saída Real:**
  ```
  ✓ tests/adversarial/autoridade-fonte-unica.test.ts (8 tests) 37ms
  Test Files  1 passed (1)
       Tests  8 passed (8)
  ```
- **Veredito:** **PASS**

---

### Critério Suite Red Team Completa (40/40 Defendidos)
- **Comando:** `npm test -- tests/adversarial/redteam-fase07.test.ts`
- **Saída Real:**
  ```
  ✓ tests/adversarial/redteam-fase07.test.ts (40 tests) 3805ms
  Test Files  1 passed (1)
       Tests  40 passed (40)
  ```
- **Veredito:** **PASS**

---

### Critério Gate Único (`npm run verify`)
- **Comando:** `npm run verify`
- **Saída Real:**
  ```
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
- **Veredito:** **PASS**

---

### Critério Variáveis e Parâmetros Não Usados
- **Comando:** `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- **Saída Real:** Código de saída 0, nenhuma ocorrência.
- **Veredito:** **PASS**

---

## 2. O que NÃO Foi Verificado

1. **Aparelho Físico Motorola Edge 70 Pro:** A homologação do comportamento tátil, safe areas e desempenho contínuo no hardware físico depende de homologação real pelo Alexandre (conforme exigido na Ordem de Serviço). Os testes automatizados rodaram sob emulação Chromium com viewport 412x915 e DPR 2.625.
2. **Canais Físicos Laterais e Força Bruta Criptográfica:** Conforme documentado no relatório de Red Team, primitivas do libsodium (Curve25519 e ChaCha20-Poly1305) não foram submetidas a ataques de força bruta matemática contra suas curvas.
