# Relatório de Investigação: Ciclo de `mouse:up`, Renderização e Percepção Visual

**Data:** 2026-09-23  
**Objetivo:** Investigar exaustivamente o que ocorre no sistema quando o botão do mouse é solto após um traço (`mouse:up` / `path:created`), esclarecer se há rasterização/colagem de objetos e contrastar o comportamento no Host e no Guest.  
**Escopo:** Estritamente analítico e documental (sem alteração em código executável).

---

## 1. Resumo Executivo das Descobertas

1. **A queixa do dono ("apaga ao soltar") é um fato arquitetural real:**
   Ao soltar o mouse no lápis (`pencil`), o Fabric.js adiciona o traço ao canvas e dispara `path:created`. O listener do projeto em `src/shared/canvas/engine.ts:475` executa imediatamente `this.canvas.remove(pathObj)`, **removendo deliberadamente o traço da tela** para esperar que a projeção do Reducer (`renderState`) o re-insira.
2. **A queixa do dono ("parece colar em cima, não escrever") decorre da descontinuidade visual:**
   O traço não é raster nem carimbo (é 100% vetorial via `new Path(...)` em `src/shared/canvas/engine.ts:108`), mas o usuário desenha fluidamente no buffer temporário superior (`contextTop`); ao soltar o mouse, o traço desenhado é apagado (`canvas.remove`), o canvas fica sem ele durante a reconciliação do React, e milissegundos depois o `renderState` cria um NOVO objeto `Path` e o joga sobre o canvas (`canvas.add`). O cérebro humano percebe o desaparecimento momentâneo seguido do reaparecimento de um objeto estático pronto ("colado").
3. **Múltiplos traços rápidos (escrita contínua à mão livre) sofrem efeito estroboscópico:**
   Em escrita rápida, o usuário inicia o traço seguinte enquanto o traço anterior ainda está no limbo entre `remove` e `renderState`.
4. **Host e Guest compartilham o mesmo motor (`WhiteboardEngine`), mas o Guest tem latência agravada:**
   `src/guest/GuestRoom.tsx` não duplica a lógica do canvas — usa a mesma classe `WhiteboardEngine`. Porém, o Guest gerencia estado via React `useState` (com batching automático do React 18), executa cifragem WebAssembly (libsodium) na thread principal e roda em telas mobile de 120Hz (quadro a cada 8.3ms), tornando os frames intermediários sem o traço muito mais perceptíveis.

---

## 2. I1 — Trace Completo: de `mouse:up` ao Pixel na Tela (Lápis / `pencil`)

O ciclo completo de um traço de lápis no Host percorre exatamente a seguinte cadeia:

### Passo 1: Configuração da Ferramenta e Ativação do Modo de Desenho Livre
* **Arquivo/Linha:** `src/shared/canvas/engine.ts:867-875`
* Ao selecionar a ferramenta `pencil`, `engine.setTool('pencil')` define:
  ```ts
  this.canvas.isDrawingMode = true;
  const brush = new PencilBrush(this.canvas);
  brush.width = Math.max(1, this.strokeWidth);
  brush.color = this.strokeColor;
  this.canvas.freeDrawingBrush = brush;
  ```
* Enquanto o usuário pressiona e move o mouse, o Fabric.js captura `mousedown` e `mousemove` no canvas e delega para `PencilBrush.onMouseDown` e `PencilBrush.onMouseMove` (`node_modules/fabric/src/brushes/PencilBrush.ts:67,83`). O traço em tempo real é desenhado apenas no contexto temporário da camada superior (`this.canvas.contextTop`).

### Passo 2: O Usuário Solta o Botão do Mouse (`mouse:up`)
* O navegador emite o evento DOM `mouseup` na janela/canvas.
* O Fabric.js recebe o evento no listener de DOM e chama `Canvas._onMouseUpInDrawingMode` (`node_modules/fabric/src/canvas/Canvas.ts:999-1011`).
* `Canvas._onMouseUpInDrawingMode` invoca `this.freeDrawingBrush.onMouseUp(...)` (`node_modules/fabric/src/brushes/PencilBrush.ts:121-129`), que executa `this._finalizeAndAddPath()`.

### Passo 3: Finalização do Traço no Fabric.js
* **Arquivo/Linha:** `node_modules/fabric/src/brushes/PencilBrush.ts:273-299`
* O método `_finalizeAndAddPath` realiza a sequência:
  1. Converte a lista de pontos coletados em comandos SVG: `this.convertPointsToSVGPath(this._points)` (linha 279).
  2. Instancia o objeto `Path` nativo do Fabric: `const path = this.createPath(pathData)` (linha 289).
  3. Limpa o buffer de desenho temporário: `this.canvas.clearContext(this.canvas.contextTop)` (linha 290).
  4. Dispara evento prévio: `this.canvas.fire('before:path:created', { path: path })` (linha 291).
  5. Adiciona o objeto `Path` à coleção do canvas: `this.canvas.add(path)` (linha 292).
  6. Agenda renderização do canvas: `this.canvas.requestRenderAll()` (linha 293).
  7. Dispara o evento de conclusão: `this.canvas.fire('path:created', { path: path })` (linha 298).

### Passo 4: Listener do Projeto Intercepta `path:created` e Apaga o Traço
* **Arquivo/Linha:** `src/shared/canvas/engine.ts:465-508`
* O listener registrado em `setupEngineEventListeners` recebe `pathObj = opt.path`:
  1. Gera um UUID único para o elemento: `const elementId = generateUUID();` (linha 470).
  2. Extrai os dados puros do objeto: `const pathData = pathObj.toObject();` (linha 471).
  3. **A AÇÃO CRÍTICA:** `this.canvas.remove(pathObj);` (linha 475). O traço que o Fabric acabou de adicionar é **sumariamente removido do canvas**.
     - Internamente, `StaticCanvas.remove` (`node_modules/fabric/src/canvas/StaticCanvas.ts:222-226`) remove o objeto de `this._objects` e chama `this.requestRenderAll()`.
     - A partir deste microssegundo, o canvas **não possui mais o traço**.
  4. Monta o evento append-only: `WhiteboardEvent` com `tipo: 'DRAW_ADD'`, `autor: 'host'`, e payload `{ id: elementId, tipo: 'path', data: pathData }` (linhas 477-498).
  5. Registra o diagnóstico: `diagLog('path:created', { ... })` (linha 500).
  6. Emite o evento: `this.emitEvent(event);` (linha 507).

### Passo 5: Propagação até a Store do Host (Zustand)
* **Arquivo/Linha:** `src/host/pages/QuadroBrancoPage.tsx:72-74`
  - O callback `onEmitEvent` invoca `aplicarEventoQuadro(evento)`.
* **Arquivo/Linha:** `src/host/store/useHostStore.ts:402-416`
  - `aplicarEventoQuadro` calcula o novo estado da aba via `reduceEvent(tabState, evento)` (`src/shared/events/reducer.ts:74`).
  - O reducer insere o novo elemento em `tabState.elements` e `tabState.elementOrder`.
  - Dispara `set({ tabState: proximoEstado });` (linha 416).
  - Em paralelo (assíncrono), grava o evento no SQLite e propaga via IPC: `window.desktopAPI.eventos.gravar(...)` (linhas 418-450).

### Passo 6: Re-renderização no React e Reconciliação
* **Arquivo/Linha:** `src/host/pages/QuadroBrancoPage.tsx:117-121`
  - O componente `QuadroBrancoPage` observa `tabState` da store do Zustand.
  - O hook `useEffect` é disparado quando a referência de `tabState` muda:
    ```ts
    useEffect(() => {
      if (engineRef.current) {
        engineRef.current.renderState(tabState);
      }
    }, [tabState]);
    ```

### Passo 7: Reconstrução e Readicão em `renderState`
* **Arquivo/Linha:** `src/shared/canvas/engine.ts:1007-1047`
  - `engine.renderState` calcula `visibleElements = getVisibleElements(state)` (linha 1009).
  - Consulta `this.objectsMap.get(el.id)` (linha 1026). Como o elemento é novo, ele não existe no mapa.
  - Chama a fábrica vetorial: `fabricObj = createFabricObjectFromData(el.tipo, el.data)` (linha 1028).
  - `createFabricObjectFromData` (`engine.ts:103-120`) cai no bloco `case 'path':` e cria `new Path(data.path, { ... })`.
  - Associa metadados: `(fabricObj as any).elementId = el.id` (linha 1030).
  - **Adiciona o novo objeto ao canvas:** `this.canvas.add(fabricObj)` (linha 1032).
  - Registra no mapa: `this.objectsMap.set(el.id, fabricObj)` (linha 1033).
  - Solicita renderização do canvas: `this.canvas.requestRenderAll()` (linha 1046).

### Passo 8: Rasterização Final na GPU
* O método `requestRenderAll` do Fabric solicita um callback de `requestAnimationFrame` (`StaticCanvas.ts:518-522`).
* No próximo ciclo de animação, o Fabric executa `renderAll()` (`StaticCanvas.ts:492-498`), percorrendo `this._objects` e invocando `fabricObj.render(ctx)`.
* As instruções de desenho 2D são enviadas para o elemento HTML `<canvas>` subjacente (`lowerCanvasEl`), que o compositor do Chromium (GPU rasterizer) projeta na janela do Electron e desenha nos pixels do monitor.

---

## 3. I2 — Vetorial vs Raster, Chamadas Bitmap e Ordem Z

### 3.1 O objeto é vetorial ou um carimbo raster?
* **Evidência concreta:** O objeto reconstruído em `createFabricObjectFromData` (`src/shared/canvas/engine.ts:103-120`) é **estritamente vetorial**.
  ```ts
  case 'path': {
    if (typeof data === 'string') {
      return new Path(data);
    }
    if (data.path) {
      return new Path(data.path, {
        left: data.left,
        top: data.top,
        fill: data.fill ?? null,
        stroke: data.stroke ?? '#0284c7',
        strokeWidth: data.strokeWidth ?? 2,
        strokeLineCap: data.strokeLineCap ?? 'round',
        strokeLineJoin: data.strokeLineJoin ?? 'round',
        selectable: true,
      });
    }
    return null;
  }
  ```
  Ele recebe a sequência exata de comandos SVG do traço (`data.path`, ex.: `[['M', x0, y0], ['Q', cx, cy, x1, y1], ...]`) e instancia a classe `Path` do Fabric.js.
* **Diferença para a borracha de trecho (`eraser_stroke`):** O caminho `eraser_stroke` (`engine.ts:85-101`) também cria um `Path` vetorial, mas com `globalCompositeOperation: 'destination-out'` para apagar pixels transparentes. O lápis (`pencil`) **nunca** entra no bloco `eraser_stroke`; seu tipo é `'path'`.

### 3.2 O traço passa por conversão para bitmap/raster no caminho de desenho?
* Realizou-se busca exaustiva (`grep`) por métodos de manipulação de imagem/raster (`toDataURL`, `Image`, `drawImage`, `putImageData`, `getImageData`) em `src/shared/canvas/engine.ts`.
* **Resultados e finalidades de cada ocorrência:**
  1. `src/shared/canvas/engine.ts:1057`: `public toDataURL(options?: { ... })` — método público utilizado **exclusivamente** para exportação do quadro para PNG/JPEG sob comando explícito do usuário (`handleExportarImagem` em `QuadroBrancoPage.tsx:145`).
  2. `src/shared/canvas/engine.ts:1075`: `ctx.drawImage(lowerEl, 0, 0);` — parte interna do método `toDataURL` para composição sobre fundo branco opaco (ADR-012).
  3. `src/shared/canvas/engine.ts:1076`: `return tempCanvas.toDataURL(...)` — retorno do PNG exportado.
  4. `src/shared/canvas/engine.ts:1084`: `return this.canvas.toDataURL(...)` — fallback do método `toDataURL`.
* **Conclusão:** Não existe **nenhuma** chamada a `drawImage`, `putImageData`, `getImageData` ou conversão de bitmap no ciclo de desenho (`mousedown`, `mousemove`, `mouseup`, `path:created`, `renderState`). O traço permanece em formato vetorial durante 100% do tempo.

### 3.3 Ordem Z (empilhamento) e reordenação de objetos
* Em `renderState` (`src/shared/canvas/engine.ts:1032`), a inclusão é feita via `this.canvas.add(fabricObj)`.
* No Fabric.js (`node_modules/fabric/dist/src/Collection.min.mjs:1`), `add` realiza `this._objects.push(...e)`. Portanto, o objeto recém-adicionado é invariavelmente colocado no **topo** da pilha de renderização.
* Não existe **nenhuma chamada** a `moveTo`, `sendToBack`, `bringToFront`, `sendBackwards` ou `bringForward` em todo o código-fonte de `src/` (nem no `engine.ts` nem em outros arquivos).
* **Por que a impressão de "colar em cima"?**
  Porque o objeto é desenhado no buffer temporário (`contextTop`), subitamente removido na finalização (`canvas.remove`), e logo em seguida inserido como um objeto pronto via `canvas.add`, com `selectable: true` habilitado. Ele não se funde gradualmente com a tela; ele é "plantado" pronto por cima da pilha.

---

## 4. I3 — Timing entre Remover e Readicionar e Testes Práticos

### 4.1 Medição empírica de latência (`canvas.remove` → `renderState`)
Utilizando o instrumento de medição de alta precisão (`performance.now()` e monitoramento de ticks de `requestAnimationFrame` executado via Puppeteer sob o runtime do Electron), mediram-se os seguintes intervalos:

#### Cenário A: Traço único de lápis
```json
[
  {
    "event": "canvas.remove",
    "t": 4286.60,
    "rafCounter": 32,
    "countRemaining": 0
  },
  {
    "event": "path:created",
    "t": 4288.00,
    "rafCounter": 32
  },
  {
    "event": "renderState",
    "t": 4288.80,
    "rafCounter": 32,
    "objectsBefore": 0,
    "objectsAfter": 1
  }
]
```
* **Tempo entre `canvas.remove` e `renderState`:** **2,20 ms**.
* **Objetos no canvas antes de `renderState`:** **0**. O canvas ficou completamente desprovido de objetos (`countRemaining = 0`) durante essa janela.

#### Cenário B: Três traços rápidos consecutivos (escrita cursiva à mão livre, pausa de 15 ms)
```json
[
  { "event": "canvas.remove", "t": 4766.60, "rafCounter": 61, "countRemaining": 1 },
  { "event": "renderState",   "t": 4768.10, "rafCounter": 61, "objectsBefore": 1, "objectsAfter": 2 },
  { "event": "canvas.remove", "t": 4866.00, "rafCounter": 67, "countRemaining": 2 },
  { "event": "renderState",   "t": 4867.80, "rafCounter": 67, "objectsBefore": 2, "objectsAfter": 3 },
  { "event": "canvas.remove", "t": 4966.00, "rafCounter": 73, "countRemaining": 3 },
  { "event": "renderState",   "t": 4967.30, "rafCounter": 73, "objectsBefore": 3, "objectsAfter": 4 }
]
```
* **Tempo médio entre remoção e readição:** **1,50 ms a 1,80 ms**.

### 4.2 Por que o olho humano nota a descontinuidade se o tempo medido é ~2 ms?
Aqui reside a chave da percepção visual:
1. **O Fabric agenda renderização no `remove`:**
   Ao executar `this.canvas.remove(pathObj)`, o Fabric chama `this.requestRenderAll()`, que agenda um callback de `requestAnimationFrame`.
2. **O desacoplamento do `useEffect` do React:**
   No React, `useEffect` é assíncrono e agendado pelo despachante do React para executar **após o commit da árvore de componentes**.
3. **A corrida de frames do navegador:**
   Se um ciclo de renderização de frame (vsync a cada 16.6 ms a 60Hz, ou 8.3 ms a 120Hz) ocorrer entre o `canvas.remove` e o disparo do `useEffect`:
   - O callback de `requestAnimationFrame` do Fabric é processado.
   - O Fabric renderiza o array `this._objects`.
   - **O objeto recém-desenhado NÃO ESTÁ em `this._objects`.**
   - O frame é pintado na tela com o traço ausente.
   - O monitor apresenta 1 frame sem o traço.
   - Quando o `useEffect` finalmente executa, o traço é readicionado e o frame seguinte o reapresenta.
4. **Percepção visual de flicker de 1 frame:**
   Para o olho humano focado na ponta da caneta/cursor em fundo branco, um salto de 1 frame de apagamento gera exatamente a queixa relatada: *"o traço piscou/apagou ao soltar o mouse e depois colou de novo"*.

### 4.3 O que ocorre durante escrita rápida consecutiva?
Quando o usuário desenha várias letras cursivas sem pausar:
* Ao soltar a primeira perna de uma letra, o traço é retirado do canvas.
* Se ele iniciar imediatamente o traço seguinte, o primeiro traço está temporariamente ausente do canvas principal enquanto o segundo está sendo desenhado no `contextTop`.
* Ao concluir múltiplos traços rápidos em sucessão, ocorre uma sucessão ininterrupta de "apaga traço atual -> limpa buffer -> re-insere traço anterior -> projeta traço novo", gerando instabilidade visual.

---

## 5. I4 — Diferença de Comportamento Host vs Guest

### 5.1 O Guest duplica a lógica de canvas?
* **Não.** A análise de `src/guest/GuestRoom.tsx` revelou que o componente mobile **não** duplica a lógica do canvas.
* Na linha 190 de `src/guest/GuestRoom.tsx`, ele instancia exatamente a mesma classe `WhiteboardEngine`:
  ```ts
  const engine = new WhiteboardEngine(canvasRef.current, {
    virtualWidth: CANONICAL_VIRTUAL_WIDTH,
    virtualHeight: CANONICAL_VIRTUAL_HEIGHT,
    autor: 'guest',
    sessaoId,
    abaId: activeAbaId,
    onEmitEvent: (evento) => { ... }
  });
  ```
* Logo, o mesmo mecanismo de `path:created` -> `this.canvas.remove(pathObj)` -> `this.emitEvent` -> `renderState` -> `this.canvas.add` ocorre **idênticamente** no Guest.

### 5.2 Diferenças Críticas entre Host e Guest que afetam o Sintoma
Embora a classe seja a mesma, as condições de execução e o pipeline de estado diferem expressivamente:

| Critério | Host (Desktop Windows) | Guest (Motorola Edge 70 Pro / Android 16) |
|---|---|---|
| **Gerenciamento de Estado** | Zustand (`useHostStore.ts:402`), notificação síncrona aos subscribers. | React `useState` (`GuestRoom.tsx:209`), sujeito ao *automatic batching* do React 18. |
| **Carga da Thread Principal** | IPC para processo Node.js nativo (Main process faz a criptografia). | Criptografia WebAssembly libsodium (`wsClient.sendEncrypted`) executando na **mesma thread de interface**. |
| **Taxa de Atualização da Tela** | Monitor convencional (60 Hz = 16,6 ms por frame). | Tela de alta taxa (120 Hz a 144 Hz = 8,3 ms a 6,9 ms por frame). |
| **Sensibilidade a Frames Vazios** | 1 frame de 16,6 ms a 60 Hz. | A janela de ~2 a 10 ms frequentemente atravessa 1 a 2 vsyncs de 8,3 ms a 120 Hz. |
| **Taxa de Amostragem do Ponteiro** | Mouse Windows (tipicamente 100–125 Hz). | Digitalizador touch mobile (tipicamente 240–360 Hz de amostragem de toque). |
| **Evento de Término** | `mouseup` do mouse. | `touchend` do Android, processado por `Canvas._onTouchEnd` (`node_modules/fabric/src/canvas/Canvas.ts:687`). |

* **Impacto no relato do dono:**
  Como 5 dos 8 traços do log vieram do Guest (celular), a combinação de tela a 120Hz + criptografia libsodium na thread principal de UI + batching do React 18 amplia sensivelmente a probabilidade de o quadro intermediário sem o traço ser exibido no smartphone antes de `renderState` ser disparado pelo `useEffect`.

---

## 6. Conclusão e Respostas Objetivas aos Questionamentos do Dono

1. *"tudo que é feito quando eu solto o pressionamento do botão do mouse depois que eu acabo o traço":*
   - O Fabric cria o traço e o adiciona ao canvas (`_finalizeAndAddPath`).
   - Imediatamente, a engine do projeto **remove o traço do canvas** (`engine.ts:475`) para forçá-lo a passar pelo Reducer.
   - O evento viaja pela store/reducer e aciona o React.
   - O React executa o `useEffect` de `renderState` e cria um novo objeto `Path` vetorial do zero (`engine.ts:1028`).
   - O novo objeto é reinserido no canvas (`engine.ts:1032`) e renderizado na GPU.
2. *"Veja também se estão colando objetos com o que eu desenho ou se está escrevendo no canvas ou algo semelhante":*
   - O desenho não é rasterizado nem carimbado com bitmaps.
   - Porém, a remoção instantânea do traço cru seguida da reinserção de um objeto vetorial estático via `renderState` faz com que o traço desapareça e reapareça subitamente como um bloco pronto. Visualmente e psicologicamente, o usuário sente que o traço contínuo que ele estava escrevendo foi deletado e um objeto novo foi "colado" por cima.
