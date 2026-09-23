Contexto: LEIA AGENTS.md inteiro antes de começar. LEIA `docs/reviews/diagnostico-sync-3.md` e
`docs/reviews/diagnostico-sync-4-gif.md` (histórico completo desta investigação — 5 rodadas sobre "o desenho
some"). Esta ordem parte de um bug **lido diretamente no código atual**, não de suposição sobre o
comportamento do usuário. Não faça push nem merge. Não altere
`docs/reviews/investigacao-mouseup.md`, `docs/reviews/diagnostico-sync-3.md`, `docs/reviews/diagnostico-sync-4-gif.md`,
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`.

## O bug (confirme lendo o código antes de tocar em qualquer coisa)
Em `src/shared/canvas/engine.ts`, `setupResolutionListeners` (por volta da linha 429-451) registra um
listener `matchMedia('(resolution: Xdppx)').addEventListener('change', onDprChange)`. Quando esse evento
dispara (o navegador detecta que a densidade de pixels efetiva da janela mudou — monitor real, escala do
Windows, trocar de monitor, etc.), `onDprChange` (linha 432-435) executa:

```ts
const onDprChange = () => {
  this.setDimensions(this.virtualWidth, this.virtualHeight);
  attachMediaQuery();
};
```

`this.virtualWidth`/`this.virtualHeight` são a cena CANÔNICA fixa (`CANONICAL_VIRTUAL_WIDTH = 1200`,
`CANONICAL_VIRTUAL_HEIGHT = 800`, linhas 21-22) — **não** o tamanho do container na tela. Mas
`setDimensions(containerWidth, containerHeight)` (linha 394) espera exatamente o tamanho REAL do
container em CSS px, e a partir dele calcula `scale = min(containerWidth/virtualWidth,
containerHeight/virtualHeight)` para caber a cena inteira. Os outros DOIS lugares que chamam
`setDimensions` sempre passam o tamanho real:
- `QuadroBrancoPage.tsx:80`: `engine.setDimensions(displayWidth, displayHeight)`, onde `displayWidth`/
  `displayHeight` vêm de `containerRef.current.getBoundingClientRect()` (linhas 62-64).
- `QuadroBrancoPage.tsx:99`: idem, no handler de `resize` da janela.

Só `onDprChange` passa o valor errado. Resultado: toda vez que esse evento de resolução dispara, o canvas é
redimensionado para caber a cena numa área de exatamente 1200×800 CSS px (porque
`scale = min(1200/1200, 800/800) = 1`), **em vez de continuar do tamanho real do container** (que
normalmente é bem menor, ex. ~610×420 CSS px numa janela de app comum). `canvas.setDimensions(...)`
(linha 414-417) troca o tamanho físico do elemento `<canvas>`, o que **limpa o buffer de pixels** — o
Fabric reconstrói o desenho depois (`requestRenderAll`), mas agora numa área/escala completamente diferente
da que o container CSS realmente reserva para o quadro branco, o que pode fazer o conteúdo ficar cortado
pelo `overflow` do container, esticado, ou simplesmente fora da área visível — o usuário vê "o desenho
sumiu", mesmo que o Reducer/estado interno continue com todos os elementos (é exatamente o que os logs reais
do dono mostram: `totalVisiveis` só cresce, `removidos` sempre `[]`, mesmo quando ele via a tela vazia).

## D5 (único objetivo obrigatório) — Corrigir e provar

### D5.1 — Correção
`onDprChange` precisa preservar o tamanho de exibição atual (não o canônico). A classe já guarda o último
tamanho de exibição correto em `this.displayWidth`/`this.displayHeight` (setados em `setDimensions`, linhas
407-408) — reaplicar esses valores recalcula a mesma escala (idempotente) e só atualiza o que de fato
depende do DPR (o buffer físico via `enableRetinaScaling`), sem distorcer o tamanho visível. Ou seja, a
correção mínima esperada é trocar:
```ts
this.setDimensions(this.virtualWidth, this.virtualHeight);
```
por algo equivalente a:
```ts
this.setDimensions(this.displayWidth, this.displayHeight);
```
**Mas não copie isso cegamente** — confirme que `this.displayWidth`/`this.displayHeight` de fato refletem o
último tamanho real aplicado em TODOS os casos (inclusive antes da primeira chamada de `setDimensions`, veja
os valores iniciais atribuídos no construtor, linhas 283-284) e que recalcular com esses valores realmente
não muda a escala nem reintroduz o mesmo bug de outra forma. Se preferir uma abordagem mais robusta (ex.:
guardar uma referência ao elemento container e reler `getBoundingClientRect()` em vez de reusar
`displayWidth`/`displayHeight`), justifique por escrito por que é melhor, mas mantenha o objetivo: o evento
de mudança de DPR NUNCA deve redimensionar o canvas para um tamanho diferente do container real.

### D5.2 — Prova de que o bug existia e foi corrigido (não é "o teste de sempre passou")
Escreva um teste automatizado NOVO (pode ser unitário sobre `WhiteboardEngine` com um `HTMLCanvasElement`
de teste + um `matchMedia` mockado, ou um teste de runtime real via Puppeteer) que:
1. Cria o engine com um container de tamanho conhecido (ex.: 610×420 CSS px) e confirma
   `engine.displayWidth`/`engine.displayHeight` (ou o tamanho real do elemento canvas) correspondem a esse
   container, não a 1200×800.
2. Desenha 1 elemento (`renderState` com um evento `DRAW_ADD` sintético, ou um traço real via
   `page.mouse`).
3. **Dispara manualmente o evento `change` do `matchMedia` que o engine escuta** (simule a mudança de DPR
   chamando o listener registrado, ou disparando o evento no mock/objeto real de `matchMedia`).
4. Confirma que, DEPOIS do evento de DPR, o canvas continua com o MESMO tamanho de exibição do container
   (não 1200×800) e que o elemento desenhado antes continua com pixels visíveis na região esperada
   (reaproveite a técnica de contagem de pixel por região já usada em `docs/reviews/diagnostico-sync-3.md`).
5. Sem a correção (reverta temporariamente D5.1 para confirmar), esse teste deve FALHAR — cole a saída real
   de antes (falhando) e depois (passando) na autoauditoria. Prova de regressão real, não só "verify passou".

### D5.3 — Não regredir o que já funciona
Rode `npm run verify` completo (inclui V1/V3) antes e depois — nada pode piorar. Teste também manualmente
(ou por automação) que redimensionar a JANELA de verdade (não só o evento de DPR) continua funcionando como
antes — `handleResize`/`setDimensions` continuam corretos.

## Proibido
Não proponha outra explicação para o sumiço nesta rodada sem antes confirmar (com o teste de D5.2, antes e
depois) que ESTE bug realmente causa perda visual reproduzível. Se o teste de D5.2 não conseguir reproduzir
o sumiço mesmo dessa forma, documente isso honestamente (não force um teste a "passar" artificialmente) e
pare — não invente uma segunda causa sem evidência. Não invente nomes de arquivo/função/linha que não
existem no código.

## Ao final
`npm run verify` verde; saída real de D5.2 (falhando sem a correção, passando com ela) colada;
`docs/reviews/autoauditoria-ondprchange.md` com critério → comando → saída real → PASS/FAIL, e o que NÃO foi
verificado; `docs/HANDOFF.md` atualizado com um parágrafo curto e literal para o dono explicando, em
português simples, que o "desenho sumindo" tinha uma causa de redimensionamento errado do quadro (não perda
de dados) e que foi corrigido.
