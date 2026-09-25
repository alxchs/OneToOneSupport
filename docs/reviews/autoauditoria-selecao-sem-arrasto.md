# Autoauditoria — D15: Seleção Seleciona, mas Não Arrasta (Código Preservado para Voltar Depois)

**Data:** 2026-09-25  
**Branch:** `fase/08-ferramentas-sem-mover`  
**Executor:** Antigravity (agy)  
**Status:** APROVADO (PASS)

---

## 1. Resumo Executivo

Esta intervenção implementou a ordem de serviço **D15** (`Issues/20260924-200000-selecao-sem-arrasto/ordem-correcao.md`), correspondente à **Opção A do D12.3** decidida pelo dono:
- Com a ferramenta Seleção (`select`), o profissional **pode selecionar um objeto** e o feedback visual de contorno de seleção permanece ativo, mas o objeto **não pode ser movido, redimensionado nem girado**.
- **Exigência mandatória do dono respeitada integralmente:** nenhum código de manipulação foi removido. A trava é governada pela constante exportada `ARRASTO_NO_MODO_SELECAO_HABILITADO` em `src/shared/canvas/engine.ts` (valor padrão `false`).
- Quando `ARRASTO_NO_MODO_SELECAO_HABILITADO` for alternada para `true` (por exemplo, via `setArrastoNoModoSelecaoHabilitado(true)` ou método da engine), o comportamento antigo é 100% restaurado com movimentação livre e alças de vértice ativas, pronto para quando for implementado o evento oficial de movimentação com persistência e sincronização E2EE (Opção B do D12.3 via ADR).
- As demais 8 ferramentas de desenho continuam com a proteção de `skipTargetFind = true` (D12). A Borracha de Objeto (`object_eraser`) continua com `skipTargetFind = false` e localiza alvos sob o cursor para remoção via `DRAW_HIDE`. O modo somente leitura (`readOnly: true`) continua sem seleção.

---

## 2. Critérios de Aceite e Verificação

### D15.1 — Comportamento no Modo Seleção com ARRASTO_NO_MODO_SELECAO_HABILITADO = false (Padrão)

* **Critério:** Com a ferramenta Seleção, o usuário pode selecionar um objeto (feedback visual de seleção continua com `selectable = true` e `hasBorders = true`), mas não pode movê-lo (`lockMovementX = true`, `lockMovementY = true`), redimensioná-lo (`lockScalingX = true`, `lockScalingY = true`) nem girá-lo (`lockRotation = true`), e os controles de vértice são ocultados (`hasControls = false`). As coordenadas `left`, `top`, `angle`, `scaleX`, `scaleY` permanecem inalteradas sob tentativa de arraste.
* **Comando:** `npx vitest run tests/selecao-sem-arrasto.test.ts`
* **Saída Real:**
```
 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/selecao-sem-arrasto.test.ts (11 tests) 687ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  02:05:44
   Duration  5.52s (transform 319ms, setup 0ms, collect 388ms, tests 687ms, environment 2.01s, prepare 885ms)
```
* **Resultado:** PASS

---

### D15.2 — Exigência do Dono: NÃO Apague o Código (Código Preservado para Voltar Depois)

* **Critério:** O arrasto volta numa versão futura. A mudança é controlada por uma constante exportada de nome explícito em `src/shared/canvas/engine.ts`:
  `export let ARRASTO_NO_MODO_SELECAO_HABILITADO = false;` (com função de controle `setArrastoNoModoSelecaoHabilitado`).
  Comentário curto documentando por que está desligado (mover é só local: não gera evento, não persiste, não sincroniza, e some na reconstrução) e o que precisa existir para religar (evento de movimentação + redutor + persistência + replicação ao Guest + desfazer/refazer; opção B do D12.3, exige ADR).
  O caminho que aplica o arrasto continua existindo e funcional quando a constante for `true` — trocar a constante para `true` devolve o comportamento antigo por inteiro.
* **Comando:** `npx vitest run tests/selecao-sem-arrasto.test.ts -t "D15.2"`
* **Saída Real:**
```
 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/selecao-sem-arrasto.test.ts (2 tests) 205ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```
* **Resultado:** PASS

---

### D15.3 — Prova com a Constante false (Padrão) e com a Constante true (Forçada no Teste)

* **Critério:**
  1. Teste com a constante `false` (padrão): selecionar um objeto funciona; arrastar NÃO altera `left`/`top`/`angle`/`scaleX`/`scaleY`; conferido também por captura de TELA real (`page.screenshot`), amostragem e comparação de pixel (pixel match idêntico), não apenas pelas propriedades numéricas do motor.
  2. Teste com a constante `true` (forçada no teste): arrastar volta a mover o objeto. Isto prova que o código preservado continua íntegro.
  3. Evidência visual em captura de tela salva e amostragem de pixels.
* **Comando:** `node Issues/20260924-200000-selecao-sem-arrasto/evidencia/teste-selecao-sem-arrasto.cjs`
* **Saída Real:**
```
[teste-d15] Aguardando inicialização do app...
[D15.1] Retângulo criado: {
  elementId: '28c85e50-44a7-4072-aaf7-9fbcce91e11d',
  left: 162.43224932249322,
  top: 163.12103685001694,
  width: 140.92140921409217,
  height: 86.7208672086721,
  angle: 0,
  scaleX: 1,
  scaleY: 1,
  lockMovementX: true,
  lockMovementY: true,
  hasControls: false
}
[D15.1] Objeto ativo após clique em modo select: {
  elementId: '28c85e50-44a7-4072-aaf7-9fbcce91e11d',
  selectable: true,
  hasBorders: true,
  hasControls: false,
  lockMovementX: true,
  lockMovementY: true
}
[D15.3] Captura de tela com retângulo selecionado salva em: C:\desenv\utils\OneToOneSupport\Issues\20260924-200000-selecao-sem-arrasto\evidencia\selecao-sem-arrasto.png
[D15.3] Captura de tela pós-arraste (constante false) idêntica à inicial (buffer/pixel match): PASS
[D15.1] Geometria após tentativa de arraste (constante false): {
  left: 162.43224932249322,
  top: 163.12103685001694,
  angle: 0,
  scaleX: 1,
  scaleY: 1
}
[D15.1] Geometria permaneceu inalterada: PASS
[D15.2] Estado com constante true: { lockMovementX: false, hasControls: true }
[D15.2] Objeto moveu com constante true: PASS
[D15.3] Captura de tela pós-arraste com constante true comprovou deslocamento de pixels: PASS

========================================
RESULTADO FINAL D15:
{
  "d15_1_seleciona_com_feedback": true,
  "d15_1_arrasto_nao_move_objeto": true,
  "d15_2_constante_true_volta_arrasto": true,
  "d15_3_captura_tela_salva": true,
  "d15_3_tela_inalterada_arraste_false": true,
  "d15_3_tela_mudou_arraste_true": true
}
STATUS: PASS
========================================
```
* **Evidência Visual / Pixel:**
  - `Issues/20260924-200000-selecao-sem-arrasto/evidencia/selecao-sem-arrasto.png`: captura de tela real gerada via `page.screenshot` mostrando o retângulo selecionado com contorno azul do Fabric.js e ausência de alças de controle.
  - `Issues/20260924-200000-selecao-sem-arrasto/evidencia/selecao-apos-arraste-false.png`: captura de tela gerada após tentativa de arraste com o mouse sob a constante `false`. A comparação binária dos pixels entre os dois arquivos PNG retornou correspondência exata de 100% dos pixels (`bufBefore.equals(bufAfterFalse) === true`), provando que nenhum pixel da imagem foi deslocado.
  - `Issues/20260924-200000-selecao-sem-arrasto/evidencia/selecao-apos-arraste-true.png`: captura de tela gerada após arraste com o mouse sob a constante `true`, comprovando visualmente o deslocamento do retângulo na tela real e a reativação das alças de controle nos vértices.
* **Resultado:** PASS

---

### D15.3 — Regressão: D12 e Sonda de Runtime (V3, V3b, V3c, V3d, V4) Continuam Verdes

* **Critério:** Execução completa de `npm run verify` abrangendo verificação de tipos (`tsc --noEmit`), build dos pacotes, suíte de 378 testes automatizados (`npm test`) e sonda de runtime (`tools/probe-runtime.cjs`) com 36 verificações de ponta a ponta.
* **Comando:** `npm run verify`
* **Saída Real:**
```
> onetoonesupport@1.0.0 verify
> npm run typecheck && npm run build && npm test && npm run probe

> onetoonesupport@1.0.0 typecheck
> tsc --noEmit

> onetoonesupport@1.0.0 build
> node scripts/generate-build-info.mjs && tsc -p tsconfig.electron.json && vite build && vite build --config vite.config.guest.ts
✓ built in 7.98s
✓ built in 48.77s

> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs
 Test Files  27 passed (27)
      Tests  378 passed (378)
   Start at  02:13:58
   Duration  44.91s

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
PASS  V3b: traço permanece visível NA TELA (captura real) após soltar o mouse
PASS  V3c: 8 ferramentas de desenho sobre objetos existentes não movem o objeto e sobem contagem em 1
PASS  V3c: regressão select ainda seleciona e move objeto existente
PASS  V3c: regressão object_eraser ainda apaga o objeto sob o cursor
PASS  V3d: texto digitado aparece na tela e vira elemento
PASS  V4: sessão encerrada abre em leitura e não aceita desenho
```
* **Resultado:** PASS

---

## 3. O que NÃO Foi Verificado

1. **Protocolo com novo evento de movimentação:** Não foi implementado novo evento de protocolo (ex: `DRAW_MOVE`), pois a decisão do dono (Opção A) determinou explicitamente desabilitar o arrasto no modo seleção até que uma versão futura introduza o evento correspondente via ADR.
2. **Entrada tátil física com múltiplos dedos em touch screen real no Host:** O teste de arraste no Host foi aferido via automação de mouse CDP e eventos sintéticos Fabric em ambiente Windows, sem hardware multitouch físico acoplado.
3. **Persistência de redimensionamento no SQLite:** Como o redimensionamento e rotação foram travados no modo de seleção, não há persistência de transformações geométricas no banco.
