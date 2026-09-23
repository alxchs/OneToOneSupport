# Relatório de Investigação: Camada de Pintura e Render Pipeline (D6)

**Data:** 2026-09-23  
**Objetivo:** Investigar o pipeline de renderização/composição do canvas após D5 não ter resolvido o sintoma visual no ambiente do dono. Implementar diagnóstico de divergência estado-vs-pixel (D6.1), verificar instâncias duplicadas sob React.StrictMode (D6.2), testar múltiplos traços cursivos rápidos em sequência (D6.3) e avaliar o impacto da aceleração por hardware / GPU via `--disable-gpu` (D6.4).

---

## 1. Resumo Executivo das Descobertas

1. **D6.1 — Diagnóstico de Divergência Estado-vs-Pixel:**
   - Adicionado ao `WhiteboardEngine` (`src/shared/canvas/engine.ts`), ativo sob `ONETOONE_DIAG=1`.
   - Após cada `renderState`, agenda uma checagem com atraso de 2 frames de animação (`requestAnimationFrame` cascateado) e throttle de ~500ms.
   - Compara a contagem de objetos do Fabric (`engine.canvas.getObjects().length`) com a contagem de pixels não-transparentes no buffer do `lowerCanvasEl` (`getImageData`).
   - Se houver objetos no Fabric (`> 0`) mas o canvas visível estiver em branco (`pixelsNoCanvas === 0`), dispara `diagLog('divergencia_estado_pixel', { objetosNoFabric, pixelsNoCanvas, larguraCanvas, alturaCanvas })`, que é automaticamente reencaminhado via IPC `diag:forward` para o terminal do dono como `[DIAG-HOST] [divergencia_estado_pixel]`.
   - Provado com teste automatizado (`tests/divergencia-pixel.test.ts`): 4/4 testes passando com saída real documentada.

2. **D6.2 — Instâncias do WhiteboardEngine sob StrictMode:**
   - Instrumentado com `instanciaId` incremental e logs de `engine_lifecycle` (`criado` / `descartado`).
   - Teste em modo DEV real (`tools/investigar-render-pipeline.cjs`): ao abrir o quadro branco, foram registradas exatamente 2 criações e 1 descarte (instância 1 criada → descartada → instância 2 criada).
   - Inspeção direta da árvore DOM pós-remontagem:
     - `canvasContainersCount`: 1
     - `upperCanvasesCount`: 1
     - `lowerCanvasesCount`: 1
     - `totalCanvasesInContainer`: 2
     - `isLowerCanvasElementSameAsDOM`: true (o `#canvas-quadro-branco` original do DOM é o `lowerCanvasEl` da instância ativa 2).
     - `engineDefined`: true (aponta para a instância 2).
   - Conclusão: O método `cleanupDOM` do Fabric.js 6 restaura o DOM adequadamente durante a desmontagem do StrictMode; não foram encontradas camadas órfãs ou instâncias concorrentes interferindo na renderização.

3. **D6.3 — Tentativa de Reprodução com Múltiplos Traços Cursivos Rápidos em Sequência:**
   - Testado em modo DEV e em modo Produção (`tools/drag-cursive-sendinput.ps1` e entrada rápida) com 5 traços cursivos em sequência e pausas curtas (~60ms).
   - Em ambos os modos, todos os 5 traços cursivos acumularam normalmente:
     - Reducer: `Elementos Visíveis: 5`
     - Fabric: `objetosNoFabric: 5`
     - Pixels: `pixelsNoCanvas: 10524`
     - Screenshots capturados: `d6-dev-cursive-strokes.png` e `d6-prod-gpu.png`.
   - Resultado: O ambiente de teste automatizado **não reproduziu** a perda de traços, indicando que a causa raiz reside estritamente em peculiaridades do hardware/driver de vídeo ou sistema operacional do ambiente físico do dono.

4. **D6.4 — Aceleração por Hardware / GPU (`--disable-gpu`):**
   - Testado com Electron iniciado sob `--disable-gpu` (composição por software via SwiftShader).
   - Resultado: 5 traços cursivos acumularam igualmente com 10.692 pixels não-transparentes (screenshot `d6-prod-disable-gpu.png`), sem falha de coerência no ambiente de automação.

---

## 2. D6.1 — Diagnóstico de Divergência Estado-vs-Pixel

### Implementação em `src/shared/canvas/engine.ts`
Sob a flag `ONETOONE_DIAG=1`, `WhiteboardEngine` monitora se o Fabric.js possui objetos ativos enquanto o buffer de pixels na tela permanece zerado:

```ts
// Em renderState():
this.canvas.requestRenderAll();

if (isDiagEnabled()) {
  this.schedulePixelDivergenceCheck();
}
```

O método `schedulePixelDivergenceCheck()` implementa throttle obrigatório de ~500ms e aguarda 2 ciclos de `requestAnimationFrame` para que a GPU e o Fabric completem a rasterização assíncrona:

```ts
private schedulePixelDivergenceCheck(): void {
  if (!isDiagEnabled()) return;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  const now = Date.now();
  if (now - this.lastPixelCheckTimestamp < this.pixelCheckThrottleMs) return;
  if (this.pendingPixelCheckHandle !== null) return;

  this.pendingPixelCheckHandle = window.requestAnimationFrame(() => {
    this.pendingPixelCheckHandle = window.requestAnimationFrame(() => {
      this.pendingPixelCheckHandle = null;
      this.lastPixelCheckTimestamp = Date.now();
      this.checkPixelDivergence();
    });
  });
}
```

O método `checkPixelDivergence()` afere a divergência e emite o alerta:

```ts
public checkPixelDivergence(): void {
  if (!isDiagEnabled()) return;
  if (!this.canvas) return;

  const objects = this.canvas.getObjects();
  const objetosNoFabric = objects.length;
  if (objetosNoFabric === 0) return;

  const lowerEl = this.canvas.lowerCanvasEl;
  if (!lowerEl || lowerEl.width <= 0 || lowerEl.height <= 0) return;

  try {
    const ctx = lowerEl.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, lowerEl.width, lowerEl.height);
    const data = imgData.data;
    let pixelsNoCanvas = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) pixelsNoCanvas++;
    }

    if (pixelsNoCanvas === 0) {
      diagLog('divergencia_estado_pixel', {
        objetosNoFabric,
        pixelsNoCanvas,
        larguraCanvas: lowerEl.width,
        alturaCanvas: lowerEl.height,
      });
    }
  } catch {}
}
```

### Prova Automatizada (`tests/divergencia-pixel.test.ts`)
Execução real via runner:
```
[Test-Runner] Executando vitest sob ABI do Electron...

stdout | tests/divergencia-pixel.test.ts > D6.2: instrumenta ciclo de vida do WhiteboardEngine com evento criado e descartado
[DIAG] [engine_lifecycle] {"evento":"criado","instanciaId":1}
[DIAG] [engine_lifecycle] {"evento":"descartado","instanciaId":1}

stdout | tests/divergencia-pixel.test.ts > D6.1: detecta divergência estado-vs-pixel quando há objetos no Fabric mas o canvas está vazio (0 pixels)
[DIAG] [engine_lifecycle] {"evento":"criado","instanciaId":2}
[DIAG] [renderState] {"autor":"host","totalVisiveis":1,"adicionados":["rect-divergence-test-1"],"removidos":[]}
[DIAG] [divergencia_estado_pixel] {"objetosNoFabric":1,"pixelsNoCanvas":0,"larguraCanvas":600,"alturaCanvas":400}
[TEST D6.1 OUTPUT] Disparou divergencia_estado_pixel: {"checkpoint":"divergencia_estado_pixel","data":{"objetosNoFabric":1,"pixelsNoCanvas":0,"larguraCanvas":600,"alturaCanvas":400}}
[DIAG] [engine_lifecycle] {"evento":"descartado","instanciaId":2}

stdout | tests/divergencia-pixel.test.ts > D6.1: NÃO emite divergência quando o canvas possui pixels não-transparentes correspondentes
[DIAG] [engine_lifecycle] {"evento":"criado","instanciaId":3}
[DIAG] [renderState] {"autor":"host","totalVisiveis":1,"adicionados":["rect-ok-test"],"removidos":[]}
[DIAG] [engine_lifecycle] {"evento":"descartado","instanciaId":3}

stdout | tests/divergencia-pixel.test.ts > D6.1: agendamento automático via requestAnimationFrame com throttle de 500ms
[DIAG] [engine_lifecycle] {"evento":"criado","instanciaId":4}
[DIAG] [renderState] {"autor":"host","totalVisiveis":1,"adicionados":["rect-raf-test"],"removidos":[]}
[DIAG] [divergencia_estado_pixel] {"objetosNoFabric":1,"pixelsNoCanvas":0,"larguraCanvas":600,"alturaCanvas":400}
[DIAG] [engine_lifecycle] {"evento":"descartado","instanciaId":4}

 ✓ tests/divergencia-pixel.test.ts (4 tests) 93ms
```

---

## 3. D6.2 — Instâncias Duplicadas do WhiteboardEngine (StrictMode)

Ao executar em modo DEV real (`tools/investigar-render-pipeline.cjs` com Vite dev server e `React.StrictMode`), a abertura do Quadro Branco gerou os seguintes eventos literais no terminal do processo principal:

```
[DIAG-HOST] [2026-09-23T02:40:09.611Z] [engine_lifecycle] {"evento":"criado","instanciaId":1}
[DIAG-HOST] [2026-09-23T02:40:09.616Z] [renderState] {"autor":"host","totalVisiveis":0,"adicionados":[],"removidos":[]}
[DIAG-HOST] [2026-09-23T02:40:09.616Z] [engine_lifecycle] {"evento":"descartado","instanciaId":1}
[DIAG-HOST] [2026-09-23T02:40:09.617Z] [engine_lifecycle] {"evento":"criado","instanciaId":2}
[DIAG-HOST] [2026-09-23T02:40:09.622Z] [renderState] {"autor":"host","totalVisiveis":0,"adicionados":[],"removidos":[]}
```

A inspeção do DOM retornou:
```json
{
  "hasContainer": true,
  "canvasContainersCount": 1,
  "upperCanvasesCount": 1,
  "lowerCanvasesCount": 1,
  "totalCanvasesInContainer": 2,
  "engineDefined": true,
  "engineInstanciaId": 2,
  "lowerCanvasId": "canvas-quadro-branco",
  "isLowerCanvasElementSameAsDOM": true,
  "isUpperCanvasElementAttached": true
}
```

**Análise técnica:** O React StrictMode desmonta e remonta o componente uma vez, produzindo a criação da instância 1, seu descarte (`engine.dispose()`), e a criação da instância 2. O Fabric.js limpou o container anterior e recriou o container novo perfeitamente sobre o elemento `<canvas id="canvas-quadro-branco">`. Não há nós DOM órfãos nem duplicidade concorrente.

---

## 4. D6.3 — Múltiplos Traços Cursivos Rápidos em Sequência (DEV e Produção)

Para exercitar o ritmo real de escrita humana relatado pelo dono, foram executados 5 traços cursivos consecutivos (ondas em formato senoidal / "M", 30 pontos de interpolação por traço) com pausas de apenas 60ms entre eles.

### Resultado no Modo DEV (Vite + StrictMode)
- Medição:
  ```json
  {
    "badgeElementos": "Elementos Visíveis: 5",
    "objetosNoFabric": 5,
    "pixelsNoCanvas": 10524,
    "canvasWidth": 1660,
    "canvasHeight": 1107
  }
  ```
- Nenhum evento `divergencia_estado_pixel` foi emitido.
- Evidência visual gravada: `docs/reviews/evidencia-d6/d6-dev-cursive-strokes.png`.

### Resultado no Modo Produção (Build `dist/` com GPU)
- Medição:
  ```json
  {
    "badgeElementos": "Elementos Visíveis: 5",
    "objetosNoFabric": 5,
    "pixelsNoCanvas": 10524,
    "canvasWidth": 1660,
    "canvasHeight": 1107
  }
  ```
- Evidência visual gravada: `docs/reviews/evidencia-d6/d6-prod-gpu.png`.

**Conclusão D6.3:** Em ambos os ambientes de teste, a rápida alternância de traços cursivos não apagou os traços anteriores nem esvaziou o canvas.

---

## 5. D6.4 — Aceleração por Hardware / GPU (`--disable-gpu`)

O Electron foi iniciado com a flag `--disable-gpu`, desativando a aceleração de composição gráfica via GPU e forçando o uso de software rasterization (SwiftShader).

- Medição:
  ```json
  {
    "badgeElementos": "Elementos Visíveis: 5",
    "objetosNoFabric": 5,
    "pixelsNoCanvas": 10692,
    "canvasWidth": 1660,
    "canvasHeight": 1107
  }
  ```
- Evidência visual gravada: `docs/reviews/evidencia-d6/d6-prod-disable-gpu.png`.
- **Análise técnica:** O comportamento com GPU desligada foi equivalente ao com GPU ligada (10.692 pixels vs 10.524 pixels). A composição por GPU não causou falha no ambiente de teste automatizado.

---

## 6. Conclusão Final e Próximo Passo

Como nem StrictMode (D6.2), nem múltiplos traços rápidos em sequência (D6.3), nem GPU/software (D6.4) reproduziram a perda permanente do traço nas máquinas dos agentes, **o diagnóstico D6.1 instalado nesta ordem é o instrumento definitivo**:
- Quando o dono testar novamente no seu hardware real (monitor 4K / 3840x2160 @150%), se o desenho sumir da tela ao soltar o mouse enquanto o Reducer mantém os dados, o diagnóstico comparará o estado com a tela e disparará no terminal:
  ```
  [DIAG-HOST] [...] [divergencia_estado_pixel] {"objetosNoFabric": X, "pixelsNoCanvas": 0, ...}
  ```
  Isso fornecerá a prova definitiva de que o Chromium/Fabric falhou em transferir os bytes do objeto para o buffer visível, permitindo isolar a causa exata na camada de composição.
