Contexto: LEIA AGENTS.md inteiro antes de começar. LEIA `docs/reviews/diagnostico-sync-5-repaint.md`
(evidência decisiva: PNG exportado prova que o buffer do canvas está sempre correto — o bug é a JANELA não
repintar) e `docs/reviews/investigacao-render-pipeline.md` (D6: 7 tentativas de reprodução automatizada
falharam, incluindo com GPU desligada). Esta é uma correção **experimental**: não posso provar por automação
que resolve, porque nunca consegui reproduzir o bug para testar antes/depois. A validação final vai ser o
dono testando na própria máquina depois. Não faça push nem merge. Não altere
`docs/reviews/diagnostico-sync-5-repaint.md`, `docs/reviews/investigacao-render-pipeline.md`,
`docs/reviews/investigacao-mouseup.md`, `docs/reviews/diagnostico-sync-3.md`, `docs/reviews/diagnostico-sync-4-gif.md`,
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`.

## D7 (objetivo obrigatório) — Forçar repaint real da janela após cada traço

### D7.1 — Mecanismo principal: `webContents.invalidate()` (Electron 30, só no Host)
O Electron expõe `mainWindow.webContents.invalidate()` — "agenda um repaint completo da janela", exatamente
o tipo de operação que parece já acontecer implicitamente quando `toDataURL()` roda (por isso o PNG exportado
sempre está correto). Implemente:
1. Novo canal IPC (ex.: `IPC_CHANNELS.CANVAS_FORCE_REPAINT`), exposto no preload como
   `desktopAPI.canvas.forceRepaint()` (ou nome equivalente coerente com o padrão de `src/shared/ipc-contract.ts`).
2. No processo principal (`electron/ipc/*.ts` + registro em `electron/ipc/router.ts`), o handler chama
   `mainWindow.webContents.invalidate()` na janela do Host (não existe janela própria no Guest — o Guest é
   navegador comum, não Electron; não crie esse canal lá).
3. No `WhiteboardEngine` (`src/shared/canvas/engine.ts`), depois que `renderState` termina de aplicar um
   novo elemento (ou, se ficar mais simples/confiável, depois do próprio `path:created`/`finishShapeCreation`
   local do autor host — decida com base no que faz mais sentido para cobrir tanto os traços do próprio Host
   quanto os que chegam do Guest e são renderizados no Host), chame esse IPC. **Throttle obrigatório** (ex.:
   no máximo 1 chamada a cada ~150-200ms por aba) para não sobrecarregar a janela em desenho contínuo rápido.
4. Só ative isso quando `window.desktopAPI` existir (Host), nunca quebre o Guest (que não tem essa API).

### D7.2 — Mecanismo alternativo/complementar: reflow forçado no DOM (renderer, sem IPC)
Como reforço (ou fallback caso D7.1 não seja suficiente sozinho), force um reflow síncrono barato no
elemento do canvas logo após `renderState` desenhar algo novo — um truque padrão e seguro (ler uma
propriedade de layout força o navegador a recalcular e repintar):
```ts
const el = this.canvas.lowerCanvasEl;
void el.offsetHeight; // força reflow síncrono
```
Aplique também throttle equivalente. Isso funciona tanto no Host quanto no Guest (não depende de IPC/Electron),
então é o único dos dois mecanismos que pode ajudar o Guest também, se o mesmo tipo de bug existir lá
(ainda não confirmado — não invente que existe, só deixe o mecanismo disponível nos dois lados por segurança
e sem custo).

### D7.3 — Não regredir e não pesar o desenho
`npm run verify` completo antes e depois, tudo verde. Meça (com `console.time`/`performance.now()` num teste
manual) se o novo mecanismo introduz atraso perceptível ao desenhar rapidamente em sequência — se o
throttle escolhido não for suficiente, ajuste até não haver serrilhado/atraso perceptível no traço em si
(o reforço de repaint é para DEPOIS que o traço já foi desenhado localmente pelo Fabric, nunca durante o
arrasto ao vivo).

### D7.4 — Diagnóstico continua ativo
Não remova nem desative o diagnóstico `divergencia_estado_pixel` (D6.1) nem `engine_lifecycle` (D6.2) — eles
continuam sendo a forma de saber, na próxima vez que o dono testar, se o problema mudou de figura.

## Proibido
Não desligue aceleração de hardware/GPU permanentemente como "correção" (D6.4 mostrou que não muda nada nos
testes automatizados, e é uma mudança grande de comportamento/performance para decidir sem o dono saber).
Não remova o comentário "esta é uma correção experimental, não comprovada por automação" de nenhum lugar em
que você o documentar — é importante que o dono saiba que a prova real vem do teste dele, não de
`npm run verify`.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-forcar-repaint.md` com critério → comando → saída real →
PASS/FAIL, e a frase explícita "esta correção não foi validada por reprodução automatizada do bug original —
só pelo dono testando de novo"; `docs/HANDOFF.md` atualizado com um parágrafo curto e literal para o dono
pedindo que ele teste de novo e diga se o desenho continua sumindo ou não.
