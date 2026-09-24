# Autoauditoria — D11: Regressão e Sonda com Evidência de Tela Real (upper-canvas transparente)

**Data:** 2026-09-24  
**Branch:** `fase/07-homologacao-1`  
**Executor:** Antigravity (agy)  
**Status:** PASS  

---

## 1. Contexto e Causa Raiz

Durante 9 rodadas de homologação, o sintoma relatado ("o desenho some ao soltar o mouse") persistiu enquanto todas as sondas automatizadas davam 27/27 PASS. A causa raiz foi confirmada:
- Em `src/shared/canvas/engine.ts`, aplicava-se `canvasElement.style.backgroundColor = '#ffffff'` no elemento HTML `<canvas>` **antes** de chamar `new Canvas(canvasElement)`.
- O Fabric.js 6, em `CanvasDOMManager.createUpperCanvas`, instancia o elemento `.upper-canvas` clonando o estilo do elemento original (`e.style.cssText = t.style.cssText`). Com isso, a camada superior (`upperCanvasEl`) herdava fundo branco e 100% opaco, posicionada diretamente sobre a camada de traços (`lowerCanvasEl`).
- Enquanto o usuário desenha (mouse pressionado), o traço ao vivo é renderizado temporariamente no `.upper-canvas`. Ao soltar o mouse, o traço ao vivo é limpo e o traço definitivo é gravado no `.lower-canvas`. Como o `.upper-canvas` era opaco e branco, ele cobria integralmente o `.lower-canvas`, tornando a tela subitamente branca para o usuário.
- O buraco de prova: todas as sondas anteriores do projeto liam `lowerCanvasEl.getContext('2d').getImageData`, que sempre continha os dados e pixels corretos na memória, mas nunca verificavam a imagem exibida na **TELA** real.

A correção mínima aplicada em `src/shared/canvas/engine.ts` configura o fundo branco exclusivamente no `lowerCanvasEl` após a instanciação do Fabric, mantendo o `upperCanvasEl` com fundo `transparent`.

---

## 2. Critérios de Avaliação e Evidências Reais

### D11.1 — Teste de regressão que FALHA sem a correção
- **Descrição:** Teste unitário em `tests/regressao-upper-canvas.test.ts` (Vitest com ambiente jsdom) instanciando `WhiteboardEngine` tanto para o Host quanto para o Guest, afirmando com rigor:
  1. `getComputedStyle(upperCanvasEl).backgroundColor` deve ser transparente (`'transparent'` ou `'rgba(0, 0, 0, 0)'`), impedindo a oclusão do `lowerCanvasEl`.
  2. `getComputedStyle(lowerCanvasEl).backgroundColor` deve ser branco (`'rgb(255, 255, 255)'` ou `'#ffffff'`).
- **Prova de Falha (sem a correção):** Reverteu-se temporariamente no construtor de `src/shared/canvas/engine.ts` a aplicação do fundo branco para antes de `new Canvas(canvasElement)`.
  - **Comando:** `npm test -- tests/regressao-upper-canvas.test.ts`
  - **Saída Real (FALHANDO):**
    ```
    RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

    ❯ tests/regressao-upper-canvas.test.ts (2 tests | 2 failed) 70ms
      × D11.1 — Regressão: Transparência Obrigatória do upper-canvas (Evita Oclusão do lower-canvas) > Host WhiteboardEngine: getComputedStyle(upperCanvasEl).backgroundColor é transparente e lowerCanvasEl tem fundo rgb(255, 255, 255) 60ms
        → expected [ 'transparent', 'rgba(0, 0, 0, 0)' ] to include 'rgb(255, 255, 255)'
      × D11.1 — Regressão: Transparência Obrigatória do upper-canvas (Evita Oclusão do lower-canvas) > Guest WhiteboardEngine: getComputedStyle(upperCanvasEl).backgroundColor é transparente e lowerCanvasEl tem fundo rgb(255, 255, 255) 9ms
        → expected [ 'transparent', 'rgba(0, 0, 0, 0)' ] to include 'rgb(255, 255, 255)'

    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
    AssertionError: expected [ 'transparent', 'rgba(0, 0, 0, 0)' ] to include 'rgb(255, 255, 255)'
    ```
- **Prova de Sucesso (com a correção restaurada):**
  - **Comando:** `npm test -- tests/regressao-upper-canvas.test.ts`
  - **Saída Real (PASSANDO):**
    ```
    RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

    ✓ tests/regressao-upper-canvas.test.ts (2 tests) 67ms

    Test Files  1 passed (1)
         Tests  2 passed (2)
    ```
- **Veredito:** **PASS**

---

### D11.2 — Sonda com captura de tela real e contagem de pixels (V3b)
- **Descrição:** Em `tools/probe-runtime.cjs`, adicionou-se a verificação `V3b: traço permanece visível NA TELA (captura real) após soltar o mouse` na seção V3.
  - Utiliza `targetPage.screenshot({ clip })` na área exata do quadro branco (`matrixCanvasBox` no Host e `guestCanvasBox` no Guest).
  - Decodifica a captura PNG no próprio Chromium via `page.evaluate` utilizando `createImageBitmap` e canvas 2D sobre o screenshot em data URL (em estrita conformidade com a CSP `img-src 'self' data: blob:`).
  - Conta pixels coloridos (não-brancos e não-cinza de UI) antes do traço, logo após soltar o mouse e 1 segundo depois de soltar o mouse.
  - Regra de validação: delta de pixels coloridos na captura de tela deve ser positivo (`delta > 0`) e após soltar o mouse os pixels na captura de tela NÃO podem cair (`after1s >= after`). Aplicado para as 7 ferramentas (lápis, pincel, retângulo em 4 direções, elipse, linha, seta e texto) no Host e no Guest.
- **Prova de Falha (com o bug ativo):** Reverteu-se a correção em `src/shared/canvas/engine.ts`, recompilou-se com `npm run build` e executou-se a sonda.
  - **Comando:** `npm run probe`
  - **Saída Real (FALHANDO V3b):**
    ```
    [Probe PASS V3] Forma 'pencil' (NO_to_SE): host +1018 px, guest +127 px
    [Probe FAIL V3b] Tela real 'pencil' (NO_to_SE): Host before=9579 after=9579 1s=9579 (delta=0, retained=false) | Guest before=0 after=0 1s=0 (delta=0, retained=false)
    [Probe PASS V3] Forma 'brush' (SO_to_NE): host +2012 px, guest +177 px
    [Probe FAIL V3b] Tela real 'brush' (SO_to_NE): Host before=9579 after=9579 1s=9579 (delta=0, retained=false) | Guest before=0 after=0 1s=0 (delta=0, retained=false)
    [Probe PASS V3] Forma 'rectangle' (SO_to_NE): host +2700 px, guest +330 px
    [Probe FAIL V3b] Tela real 'rectangle' (SO_to_NE): Host before=9579 after=9579 1s=9579 (delta=0, retained=false) | Guest before=0 after=0 1s=0 (delta=0, retained=false)
    ...
    PASS  V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host
    PASS  V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest
    FAIL  V3b: traço permanece visível NA TELA (captura real) após soltar o mouse
    ```
    *Análise da falha:* A sonda clássica V3 deu falso positivo PASS (+1018 px no Host, +127 px no Guest) porque lia o buffer do `lowerCanvasEl.getImageData`. A nova sonda V3b com captura de tela real reprovou imediatamente com `FAIL`, constatando que na tela do Host `delta=0` e na tela do Guest `delta=0`, exatamente reproduzindo a oclusão total pelo `upper-canvas`.
- **Prova de Sucesso (com a correção restaurada):** Restaurou-se o código, recompilou-se com `npm run build` e executou-se a sonda.
  - **Comando:** `npm run probe`
  - **Saída Real (PASSANDO V3b):**
    ```
    [Probe PASS V3] Forma 'pencil' (NO_to_SE): host +1018 px, guest +127 px
    [Probe PASS V3b] Tela real 'pencil' (NO_to_SE): Host +896 px (1s: 15772), Guest +86 px (1s: 521)
    [Probe PASS V3] Forma 'brush' (SO_to_NE): host +2012 px, guest +177 px
    [Probe PASS V3b] Tela real 'brush' (SO_to_NE): Host +1935 px (1s: 17707), Guest +141 px (1s: 662)
    [Probe PASS V3] Forma 'rectangle' (SO_to_NE): host +2700 px, guest +330 px
    [Probe PASS V3b] Tela real 'rectangle' (SO_to_NE): Host +2695 px (1s: 20402), Guest +278 px (1s: 940)
    [Probe PASS V3] Forma 'rectangle' (NO_to_SE): host +2700 px, guest +330 px
    [Probe PASS V3b] Tela real 'rectangle' (NO_to_SE): Host +2696 px (1s: 23098), Guest +278 px (1s: 1218)
    [Probe PASS V3] Forma 'rectangle' (SE_to_NO): host +2700 px, guest +330 px
    [Probe PASS V3b] Tela real 'rectangle' (SE_to_NO): Host +2696 px (1s: 25794), Guest +278 px (1s: 1496)
    [Probe PASS V3] Forma 'rectangle' (NE_to_SO): host +2700 px, guest +330 px
    [Probe PASS V3b] Tela real 'rectangle' (NE_to_SO): Host +2612 px (1s: 28406), Guest +278 px (1s: 1774)
    [Probe PASS V3] Forma 'ellipse' (SE_to_NO): host +2095 px, guest +258 px
    [Probe PASS V3b] Tela real 'ellipse' (SE_to_NO): Host +1909 px (1s: 30315), Guest +189 px (1s: 1963)
    [Probe PASS V3] Forma 'line' (NE_to_SO): host +1127 px, guest +176 px
    [Probe PASS V3b] Tela real 'line' (NE_to_SO): Host +959 px (1s: 31274), Guest +118 px (1s: 2081)
    [Probe PASS V3] Forma 'arrow' (SO_to_NE): host +1345 px, guest +198 px
    [Probe PASS V3b] Tela real 'arrow' (SO_to_NE): Host +1183 px (1s: 32457), Guest +139 px (1s: 2220)
    [Probe PASS V3] Forma 'text' (CLICK): host +869 px, guest +111 px
    [Probe PASS V3b] Tela real 'text' (CLICK): Host +772 px (1s: 33229), Guest +76 px (1s: 2296)
    ...
    PASS  V3: Entrada real Windows SendInput com SetProcessDPIAware produziu pixels
    PASS  V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host
    PASS  V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest
    PASS  V3b: traço permanece visível NA TELA (captura real) após soltar o mouse
    ```
    *(28 de 28 verificações da sonda aprovadas)*
- **Veredito:** **PASS**

---

### D11.3 — Varredura de erros da mesma classe
- **Descrição:** Varredura exaustiva por grep no repositório procurando:
  1. Locais onde a verificação lê o canvas (`lowerCanvasEl.getImageData`) em vez da tela real:
     - `tools/probe-runtime.cjs`: V3 fazia leitura do `lowerCanvasEl`. Agora reforçada e complementada com V3b (captura de tela real via `screenshot`).
     - `src/shared/canvas/engine.ts`: método diagnóstico `checkStatePixelDivergence` (D6.1) lê `lowerCanvasEl.getImageData`.
     - `tools/investigar-render-pipeline.cjs`: lê `lowerCanvasEl.getImageData`.
     - `tests/ondprchange.test.ts`: lê `lowerCanvasEl.getImageData`.
  2. Locais onde estilo é aplicado ao `<canvas>` antes de `new Canvas` ou `new StaticCanvas`:
     - `src/shared/canvas/engine.ts`: único local de instanciação de `Canvas` em todo o projeto. O fundo branco antes de `new Canvas` foi completamente removido; agora o fundo `#ffffff` é aplicado unicamente em `lowerCanvasEl` após `new Canvas`, e `upperCanvasEl` recebe explicitamente `transparent`.
     - `src/host/pages/QuadroBrancoPage.tsx`: o elemento `<canvas id="canvas-quadro-branco" ref={canvasRef} />` não possui nenhuma estilização inline prévia nem classe com background.
     - `src/guest/GuestRoom.tsx`: o elemento `<canvas ref={canvasRef} id="guest-canvas" className="whiteboard-canvas-mobile" />` não possui estilização inline de background; o fundo `#ffffff` é aplicado no container `<main id="guest-whiteboard-area">`.
     - `src/guest/guest.css`: a classe `.whiteboard-canvas-mobile` continha `background-color: #ffffff;`. Como o Fabric clona as classes do elemento original para o `upper-canvas`, o estilo inline explícito `upperCanvasEl.style.backgroundColor = 'transparent'` tem precedência de especificidade e neutraliza a classe, mas essa ocorrência foi mapeada como risco da mesma classe.
- **Veredito:** **PASS**

---

## 3. O que NÃO foi verificado

1. Dispositivo físico Motorola Edge 70 Pro real (utilizou-se a emulação estrita do Chromium com viewport mobile 412x915, DPR e touch events conforme protocolo).
2. Monitores múltiplos físicos 4K simultâneos com taxas de escala fracionárias dinâmicas heterogêneas (testado via parâmetro `--force-device-scale-factor=1.5` no Electron e suíte `tests/ondprchange.test.ts`).

---

## 4. Portão de Verificação Final

- **Typecheck:** `npm run typecheck` → **PASS** (código 0, sem erros)
- **Build:** `npm run build` → **PASS** (renderer + guest compilados com sucesso)
- **Testes Unitários e Adversariais:** `npm test` → **PASS** (22 suítes, 292 testes aprovados)
- **Sonda Runtime com V3b:** `npm run probe` → **PASS** (28/28 checagens aprovadas)
- **Pipeline Completo:** `npm run verify` → **PASS** (tudo verde)
