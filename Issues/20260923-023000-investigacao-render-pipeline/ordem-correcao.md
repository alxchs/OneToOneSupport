Contexto: LEIA AGENTS.md inteiro antes de começar, em especial "Lições específicas do projeto" (a lição da
Fase 07 sobre visibilidade de diagnóstico, e a lição sobre automação/CDP não reproduzir toda a cadeia de um
SO real). LEIA TAMBÉM, na ordem, todo o histórico desta investigação — é longo, mas cada rodada eliminou uma
hipótese real, não adivinhou:
- `docs/reviews/diagnostico-sync-3.md` (rodada 3: log real, reducer limpo, repro do chefe sem sucesso)
- `docs/reviews/investigacao-mouseup.md` (investigação do agy: trace completo do mouse:up; a teoria do
  "flicker de ~2ms" que ela propôs foi DEPOIS refutada por evidência — não é a causa)
- `docs/reviews/diagnostico-sync-4-gif.md` (rodada 4: GIF do dono mostra perda PERMANENTE, não flicker;
  3 repros automatizados do chefe sem sucesso; D4 acrescentou encaminhamento de exceções JS pro terminal)
- `Issues/20260923-013000-correcao-ondprchange/ordem-correcao.md` e o commit `994ba55` (D5: bug real e
  corrigido em `onDprChange`, com teste de regressão comprovando antes/depois — MAS o dono testou de novo
  DEPOIS da correção, com log limpo (sem evento de DPR, sem exceção) e o desenho sumiu de novo. D5 era um
  bug real, mas não é a causa do sintoma relatado.)

**Estado atual, muito importante:** SEIS logs reais do dono, em rodadas diferentes, mostram a camada de
eventos/reducer 100% saudável: `totalVisiveis` só cresce, `removidos` é sempre `[]`, nenhuma exceção
(`erro_nao_capturado`/`promise_rejeitada_sem_catch`, adicionado em D4) apareceu nunca. Ao mesmo tempo, o dono
relata consistentemente, e mostrou num GIF, que o traço desenhado desaparece da TELA (permanentemente) ao
soltar o botão do mouse. O chefe tentou reproduzir por automação de 5 formas diferentes (CDP simples, CDP
com traço longo/cursivo/autointersectante, com Guest real conectado via LAN, em modo DEV real com Vite +
React StrictMode, e com entrada real do Windows via SendInput/mouse_event visando a janela em foreground) e
NENHUMA reproduziu. Conclusão por eliminação: **o bug não está na camada de dados — está na camada de
pintura/composição do canvas, e só acontece no ambiente real do dono**, que a automação até agora não
consegue replicar.

Não faça push nem merge. Não altere os arquivos de investigação/diagnóstico listados acima nem
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`.

## D6 (objetivo obrigatório) — Diagnóstico da camada de pintura, não mais correção às cegas

### D6.1 — Diagnóstico de divergência estado-vs-pixel (o mais importante)
Adicione, sob a mesma flag `ONETOONE_DIAG=1` (nunca em produção), uma checagem periódica e barata que
compara o que o Fabric.js ACHA que está desenhado com o que REALMENTE está pintado no canvas visível:
1. Depois de cada `renderState` (`engine.ts:1007-1047`), agende (com um pequeno atraso, ex. 2 frames via
   `requestAnimationFrame` duas vezes, para dar tempo do Fabric realmente pintar) uma checagem: conte
   `this.canvas.getObjects().length` (quantos objetos o Fabric acha que tem) e compare com uma contagem de
   pixels não-transparentes do `lowerCanvasEl` (mesma técnica de `getImageData` já usada nos repros do
   chefe, mas rodando DENTRO do app, não numa sonda externa).
2. Se houver objetos (`length > 0`) mas a contagem de pixels estiver muito abaixo do esperado (ex.: zero ou
   quase zero, um limiar razoável — pense num valor mínimo plausível por objeto, tipo `> 0` já basta como
   primeiro sinal), registre via `diagLog('divergencia_estado_pixel', { objetosNoFabric, pixelsNoCanvas,
   larguraCanvas, alturaCanvas })`. Isso aparece no terminal do dono (`[DIAG-HOST]`) automaticamente, sem
   ele precisar fazer nada além do que já faz.
3. **Throttle obrigatório**: no máximo 1 checagem a cada ~500ms por aba (um contador/timestamp simples),
   para não pesar o desenho de verdade nem gerar ruído.
4. Teste automatizado: force esse diagnóstico a disparar de propósito num teste (ex.: adicione um objeto ao
   `objectsMap`/`_objects` sem de fato desenhá-lo no contexto, ou mocke `getImageData` para devolver tudo
   transparente) e confirme que o `diagLog('divergencia_estado_pixel', ...)` dispara. Cole a saída real.

### D6.2 — Instâncias duplicadas do WhiteboardEngine (StrictMode)
`src/main.tsx` e `QuadroBrancoPage.tsx` rodam sob `React.StrictMode`, que em modo DEV invoca o efeito de
criação do `WhiteboardEngine` (linhas 56-114 de `QuadroBrancoPage.tsx`) duas vezes (monta, desmonta,
remonta) de propósito. `WhiteboardEngine.dispose()` (`engine.ts:1094-1105`) chama `this.canvas.dispose()`
**sem aguardar a Promise** que o Fabric.js retorna (veja `node_modules/fabric/dist/src/canvas/StaticCanvas.mjs`,
método `dispose()`, linha ~1218: ele roda `cleanupDOM` de forma síncrona mas adia o `destroy()` real para
depois se houver uma renderização pendente `this.nextRenderHandle`).
1. Instrumente (temporariamente, só para diagnosticar, ou permanentemente sob `ONETOONE_DIAG=1`) o
   construtor e o `dispose()` de `WhiteboardEngine` para logar via `diagLog('engine_lifecycle', { evento:
   'criado'|'descartado', instanciaId })` com um contador incremental simples.
2. Rode o app de verdade (`tools\homologar.ps1` ou equivalente) e abra o quadro branco: confirme quantas
   vezes `WhiteboardEngine` é criado/descartado ao abrir a tela UMA vez. Se for mais de uma criação por
   abertura (esperado em StrictMode: 2 criações, 1 descarte), confirme que o `window.__whiteboardEngine`
   final e o `canvasRef.current` do React apontam para a MESMA instância que está de fato recebendo eventos
   de mouse — e que a instância descartada não deixou nenhum listener remanescente ativo no MESMO elemento
   `<canvas>` (Fabric substitui a estrutura DOM ao redor do elemento original; confirme se sobra alguma
   camada extra de `upper-canvas`/`lower-canvas` órfã no DOM depois do dispose).
3. Se encontrar uma instância duplicada/órfã interferindo, documente o mecanismo exato (não só "acho que é
   isso") antes de propor correção — isso é diagnóstico, não correção nesta ordem, a menos que a causa fique
   inequívoca com evidência (nesse caso, corrija e prove com teste antes/depois, como em D5).

### D6.3 — Tente reproduzir você mesmo, com múltiplos traços reais em sequência
Os repros do chefe usaram no máximo 1 traço por tentativa antes de medir. O dono sempre desenha VÁRIOS
traços seguidos (os logs reais mostram sempre 4 a 8 elementos). Tente reproduzir com SendInput real
(`tools/drag-sendinput.ps1` já existe no projeto — estenda-o ou copie-o se precisar de um caminho cursivo,
mas documente o que mudou) desenhando 4-6 traços cursivos em sequência RÁPIDA, sem pausa longa entre eles,
com a janela do Electron em foreground de verdade (não headless), tanto em build de produção quanto em modo
DEV (`npm run dev` real, não simulado). Cole a saída real, reproduzindo ou não.

### D6.4 — Aceleração de hardware / GPU (hipótese aberta, só investigar, não mude nada sem medir)
Teste (manualmente ou por automação) se o sintoma muda ao iniciar o Electron com `--disable-gpu` ou
equivalente (isso desliga a composição acelerada por GPU). Isso é só um experimento de diagnóstico para
isolar se o problema está no pipeline de composição do Chromium/Electron neste hardware específico — NÃO
proponha desligar GPU como "correção" permanente sem entender o impacto; é só um dado a mais.

## Proibido
Não aplique nenhuma correção de código nesta ordem a menos que D6.1, D6.2, D6.3 ou D6.4 produzam evidência
inequívoca (não suposição) do mecanismo exato. Se nada disso reproduzir ou divergir, documente honestamente
"não reproduzi, aqui está tudo que tentei" — isso também é resultado válido. Não invente nomes de arquivo/
função/linha que não existem no código.

## Ao final
`npm run verify` verde (mesmo que D6 não altere nada além do diagnóstico); `docs/reviews/investigacao-render-pipeline.md`
com os resultados de D6.1 a D6.4 (saída real de cada um, mesmo que negativa); `docs/HANDOFF.md` atualizado
com um parágrafo curto e literal para o dono: "se o desenho sumir de novo, cole o terminal — agora ele deve
mostrar `[divergencia_estado_pixel]` se for um bug de pintura, ou nada de especial se for outra coisa."
