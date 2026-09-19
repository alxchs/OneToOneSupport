# ORDEM DE SERVIÇO — FASE 06: Quadro branco Fabric.js HiDPI
Branch: `fase/06-canvas-hidpi` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §12 e Regra #2, `docs/FASES.md` (**ADR-003**), `docs/HANDOFF.md`. Pré-requisito: fase 05 mergeada.

## Entregas
1. `src/shared/canvas/engine.ts` (Fabric.js 6.x): fundo branco estático; dimensionamento com `window.devicePixelRatio` conforme ADR-003 (`setDimensions({width,height},{cssOnly:true})` + buffer real = virtual × DPR), reagir a mudança de DPR (`matchMedia('(resolution: ...)')`) e a resize. **Sem escala dupla.**
2. Ferramentas: Lápis, Pincel (larguras/cores), formas (retângulo, elipse, linha, seta), texto rotacionável, seleção/movimento, borracha (emite `DRAW_HIDE`, não remove do estado do reducer). Flood fill fora do escopo.
3. Engine **não decide regra**: emite eventos (`DRAW_ADD`/`DRAW_HIDE`/`CLEAR_TAB`) e renderiza o estado vindo do reducer da fase 05. Aplicar evento remoto e local pelo mesmo caminho.
4. Coordenadas: função única de conversão ponteiro→coordenada de cena; testes com DPR 1, 1.5 e 2 provando que o traço cai no ponto clicado (sem offset) e que `toDataURL` sai nítido (multiplier correto).
5. Página do Host com o quadro, barra de ferramentas, desfazer/refazer, limpar tela. Paleta sem vermelho como cor padrão de UI (o usuário do quadro pode escolher cores dentro do quadro; a UI do app não usa vermelho).
6. Suporte a caneta/touch (Pointer Events), prevenção de rolagem/zoom acidental.

## Verificação (cole no HANDOFF)
`typecheck`, `test`, `build`. **Abrir o app de verdade** e desenhar: descreva/anexe captura com DPR real da tela (`window.devicePixelRatio` lido no console; esperado 1.5 no host alvo) e prove traço exatamente sob o cursor, zoom da janela sem borrão, desfazer/refazer, borracha, texto girado.
## Aceite
Teste automatizado de DPR (1/1.5/2) verde + verificação manual descrita. Nada de push. HANDOFF e parar.
