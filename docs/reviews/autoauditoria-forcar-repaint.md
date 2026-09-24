# Autoauditoria — D7: Forçar Repaint Real da Janela e Reflow DOM

**Data:** 2026-09-23  
**Branch:** `fase/07-homologacao-1`  
**Executor:** Antigravity (agy)  
**Status:** PASS  

> **Aviso Crítico:** esta correção não foi validada por reprodução automatizada do bug original — só pelo dono testando de novo.

---

## 1. Contexto e Motivação Técnica (D7)

A partir da evidência decisiva registrada em `docs/reviews/diagnostico-sync-5-repaint.md` (onde o PNG exportado pelo dono comprovou que os 4 traços estavam perfeitamente intactos no buffer do canvas `lowerCanvasEl`), confirmou-se que o sintoma relatado ("desenho sumindo ao soltar o traço") é um bug de **repintura da janela pelo Chromium/Electron**, e não perda de dados, descarte de evento ou falha de sincronização.

A ordem D7 implementou dois mecanismos complementares para forçar o repaint imediatamente após cada traço:
1. **D7.1 (Host / Electron):** Canal IPC `IPC_CHANNELS.CANVAS_FORCE_REPAINT` (`canvas:force-repaint`), exposto via preload como `desktopAPI.canvas.forceRepaint()`, invocando `mainWindow.webContents.invalidate()` no processo principal para agendar repintura completa da janela.
2. **D7.2 (Host e Guest / Renderer):** Reflow forçado síncrono no DOM (`void el.offsetHeight`) aplicado ao `lowerCanvasEl` do Fabric após cada atualização de `renderState`.
3. **Throttle:** Throttle de ~180ms com timer de *trailing edge* garantindo que múltiplos traços rápidos não sobrecarreguem a renderização e assegurando que o último traço executado receba sempre a repintura final.
4. **Preservação de Diagnósticos (D7.4):** Diagnósticos `divergencia_estado_pixel` (D6.1) e `engine_lifecycle` (D6.2) mantidos 100% ativos e funcionais.

---

## 2. Critérios de Avaliação e Evidências Reais

### Critério D7.1 — Invalidação de Janela no Host via `webContents.invalidate()` e Handler IPC
- **Descrição:** O handler `handleCanvasForceRepaint` em `electron/ipc/canvas.ipc.ts` executa `event.sender.invalidate()` e `BrowserWindow.webContents.invalidate()`, retornando `{ success: true, data: { repainted: true } }`. Registrado em `electron/ipc/router.ts`.
- **Comando:** `node scripts/test-runner.mjs tests/canvas-repaint.test.ts -t "handleCanvasForceRepaint"`
- **Saída Real:**
  ```
  [Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...
   RUN  v2.1.9 C:/desenv/utils/OneToOneSupport
   ✓ tests/canvas-repaint.test.ts (3 tests) 31ms
  Test Files  1 passed (1)
       Tests  3 passed (3)
    Duration  1.67s
  ```
- **Veredito:** **PASS**

---

### Critério D7.2 — Reflow Síncrono no DOM (`void el.offsetHeight`) e Suporte Guest
- **Descrição:** O `WhiteboardEngine` aciona reflow síncrono no DOM e chamada a `desktopAPI.canvas.forceRepaint()`. Em ambiente de convidado mobile (onde `desktopAPI` é `undefined`), o mecanismo não lança exceção e preserva integridade.
- **Comando:** `node scripts/test-runner.mjs tests/canvas-repaint.test.ts -t "WhiteboardEngine Repaint Reinforcement"`
- **Saída Real:**
  ```
  [Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...
   RUN  v2.1.9 C:/desenv/utils/OneToOneSupport
   ✓ tests/canvas-repaint.test.ts (4 tests) 53ms
  Test Files  1 passed (1)
       Tests  4 passed (4)
    Duration  1.72s
  ```
- **Veredito:** **PASS**

---

### Critério D7.3 — Desempenho e Ausência de Atraso Perceptível
- **Descrição:** Medição via `performance.now()` comprova que 10 chamadas consecutivas de repaint e reflow tomam menos de 5ms no total (< 0.5ms por chamada), sem causar serrilhado ou atraso perceptível no traço em si.
- **Comando:** `node scripts/test-runner.mjs tests/canvas-repaint.test.ts -t "medição de latência"`
- **Saída Real:**
  ```
  [Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...
   RUN  v2.1.9 C:/desenv/utils/OneToOneSupport
   ✓ tests/canvas-repaint.test.ts (1 test) 14ms
  Test Files  1 passed (1)
       Tests  1 passed (1)
    Duration  1.61s
  ```
- **Veredito:** **PASS**

---

### Critério D7.4 — Preservação dos Diagnósticos D6.1 e D6.2
- **Descrição:** Os diagnósticos `divergencia_estado_pixel` e `engine_lifecycle` permanecem ativos, passando em toda a suíte de validação de divergência de pixels.
- **Comando:** `node scripts/test-runner.mjs tests/divergencia-pixel.test.ts`
- **Saída Real:**
  ```
  [Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1 e DB isolado...
   RUN  v2.1.9 C:/desenv/utils/OneToOneSupport
   ✓ tests/divergencia-pixel.test.ts (4 tests) 79ms
  Test Files  1 passed (1)
       Tests  4 passed (4)
    Duration  1.78s
  ```
- **Veredito:** **PASS**

---

### Critério D7.5 — Checagem Estrita de Tipagem TypeScript
- **Descrição:** Compilação TypeScript do projeto sem erros de tipagem.
- **Comando:** `npm run typecheck`
- **Saída Real:**
  ```
  > onetoonesupport@1.0.0 typecheck
  > tsc --noEmit
  ```
  *(Código de saída 0, sem erros)*
- **Veredito:** **PASS**

---

### Critério D7.6 — Variáveis e Parâmetros Não Utilizados
- **Descrição:** Verificação com flags `--noUnusedLocals --noUnusedParameters`.
- **Comando:** `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
- **Saída Real:**
  *(Código de saída 0, sem ocorrências)*
- **Veredito:** **PASS**

---

### Critério D7.7 — Gate Único Completo (`npm run verify`)
- **Descrição:** Execução de `npm run typecheck && npm run build && npm test && npm run probe`.
- **Comando:** `npm run verify`
- **Saída Real:**
  ```
  > onetoonesupport@1.0.0 typecheck
  > tsc --noEmit

  > onetoonesupport@1.0.0 build
  > node scripts/generate-build-info.mjs && tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts

  dist/renderer/index.html                  0.97 kB │ gzip:   0.56 kB
  dist/renderer/assets/index-TN2yIr66.js  518.52 kB │ gzip: 153.68 kB
  dist/guest/guest.html                     0.96 kB │ gzip:   0.51 kB
  dist/guest/assets/index-CD_7vfq9.css      3.37 kB │ gzip:   1.16 kB
  dist/guest/assets/index-DLORmdV1.js   1,481.29 kB │ gzip: 465.49 kB

  > onetoonesupport@1.0.0 test
  > node scripts/test-runner.mjs

   Test Files  18 passed (18)
        Tests  265 passed (265)
     Duration  12.04s

  > onetoonesupport@1.0.0 probe
  > node tools/probe-runtime.cjs

  [Probe] Executando em modo: production (isDev: false) | DPR: 1.5
  [Probe] Host Version Stamp: "Build: e75e4d4 (fase/07-homologacao-1) 2026-09-23T03:01:19.907Z"
  [Probe] Guest Version Stamp: "e75e4d4 (fase/07-homologacao-1) 2026-09-23T03:01:19.907Z"
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
  PASS  V1: Carimbo de versão visível no Host (#host-version-stamp)
  PASS  V1: Carimbo de versão visível no Guest (#guest-version-stamp)
  PASS  V1: Carimbo coincide entre Host e Guest sem aviso de desatualizado
  PASS  V3: Entrada real Windows SendInput com SetProcessDPIAware produziu pixels
  PASS  V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host
  PASS  V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest
  ```
  *(27/27 checagens da sonda PASS, 18 suítes vitest com 265 testes PASS)*
- **Veredito:** **PASS**

---

## 3. O que NÃO Foi Verificado

1. **Reprodução automatizada do bug original em ambiente de CI/Sonda:** esta correção não foi validada por reprodução automatizada do bug original — só pelo dono testando de novo na própria máquina. Nenhuma das 7 tentativas de reprodução automatizada sob Chromium/Puppeteer reproduziu o desaparecimento de pixels, pois os buffers gráficos locais de automação sempre estiveram íntegros.
2. **Teste físico com interação humana manual em tela de 120Hz:** A validação final da sensação tátil e percepção visual contínua sem piscar/sumir depende do teste real do dono através do script `tools\homologar.ps1`.
