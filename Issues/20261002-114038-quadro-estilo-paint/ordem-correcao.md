Contexto: LEIA `AGENTS.md` e `Issues/20261002-114038-quadro-estilo-paint/LEIA-ME.md`. Trabalhe na branch
`fase/11-quadro-estilo-paint` (já criada a partir da `main`). Não faça push nem merge. Escopo: Host **e** Guest
(mesma `WhiteboardEngine` em `src/shared/canvas/engine.ts`).

# Fase 11 — Quadro com sensação de Paint (IDs P1..P8 — use estes IDs na autoauditoria)

## Objetivo, em uma frase
Para quem desenha, o quadro tem que se comportar como o Paint do Windows: tudo parece tinta na folha. Em
**nenhuma** ferramenta de desenho o usuário pode ver moldura de seleção, alças, cursor de "mover", cursor de
"proibido" ou ser jogado para um modo de seleção. Por dentro, os elementos **continuam vetoriais** (eventos
`DRAW_ADD`/`DRAW_HIDE`); **não** rasterize, **não** mude o protocolo, o reducer, o SQLite nem o formato
dos eventos.

## O que NÃO pode mudar (leia antes de começar)
- D12 (`skipTargetFind` nas ferramentas de desenho) e D15 (`ARRASTO_NO_MODO_SELECAO_HABILITADO`,
  `applySelectionDragLocks`, `syncDragLocks`) continuam no código. **Exigência do dono (D15): o código do
  arrasto/seleção NÃO é apagado**, porque volta numa versão futura. A ferramenta `select` continua existindo
  na engine e no tipo `WhiteboardTool`; o que sai é o **botão** da barra (P1).
- Modo somente leitura (sessão encerrada) continua como está: a engine usa `select` internamente com tudo
  `evented: false`. Não mexa nisso, só confira que continua sem moldura.
- Borracha de trecho (ADR-012, `destination-out`) continua apagando pedaços de traços **e** de formas.
- Nada de vermelho em cursor, ícone ou realce (regra do dono). Paleta: azul-ardósia já usada no app
  (`#0284c7`, `#0369a1`, `#0f172a`, `#38bdf8`, `#cbd5e1`).

## P1 — Tirar a Seleção da barra do Host
- Remova o botão "Selecionar e Mover Objeto" de `src/host/pages/QuadroBrancoPage.tsx`. Ferramenta inicial
  no modo ativo continua `pencil`.
- Se algum estado salvo/inicial puder trazer `ferramenta === 'select'` no modo ativo (estado React,
  `onToolChange`, persistência, troca de aba), ele deve cair em `pencil`. Procure **todos** os caminhos com
  `grep -rn "'select'" src` e trate cada um; cite a lista na autoauditoria.
- O Guest (`src/guest/GuestRoom.tsx`) já não tem botão de Seleção; confirme e registre.

## P2 — Texto não joga para a Seleção
- Em `handleTextCreation` (`engine.ts`), depois de confirmar **ou** descartar um texto, a ferramenta
  continua `text` (hoje troca para `select`). Isso também vale para qualquer outro `setTool('select')` fora do
  modo leitura (procure todos).
- Clicar fora de um texto em edição: confirma o texto atual e **não** cria outro no mesmo clique (comportamento
  do Paint; hoje já é assim, mantenha e teste).
- A barra do Host deve continuar mostrando "Texto" como ferramenta ativa depois de confirmar (o
  `onToolChange` tem que refletir a ferramenta real).

## P3 — Texto sem alças de objeto
- Texto em edição: **sem** alças de redimensionar e **sem** alça de girar (`hasControls: false`, sem
  `hasRotatingPoint`). Pode ter só o cursor de digitação e, se quiser, uma moldura tracejada fina na paleta
  azul-ardósia enquanto digita (o Paint mostra uma caixa tracejada). Depois de confirmado, o texto não mostra
  moldura nenhuma.
- Renomeie o botão "Texto Rotacionável" para "Texto" (título e rótulo). O campo `angle` continua no payload
  do evento (compatibilidade com o histórico gravado), sempre `0` para texto novo.
- Elementos de texto já gravados com `hasControls: true` (`createFabricObjectFromData`, ~linha 193) também não
  podem mostrar alças.

## P4 — Borracha (Objeto) sem cara de objeto
- Clicar ou arrastar com a Borracha (Objeto) sobre um elemento faz ele sumir (o `DRAW_HIDE` de hoje), **sem**
  moldura de seleção nem por um quadro de animação: `canvas.getActiveObject()` tem que continuar `null` antes,
  durante e depois. Dica (não obrigatória): objetos `selectable: false` com `evented: true` nesta ferramenta
  ainda entregam `opt.target` nos eventos de mouse sem ativar seleção; garanta que o D15 continue funcionando
  quando a constante for `true`.
- Cursor: troque `not-allowed` por um cursor de borracha (SVG em data URI, paleta azul-ardósia, hotspot na
  ponta). Use o mesmo cursor na Borracha (Trecho). Sem `move` ao passar sobre objetos em **nenhuma**
  ferramenta: ajuste `canvas.hoverCursor` (e `moveCursor`) para o cursor da ferramenta ativa em `setTool`.
- Renomeie o rótulo "✕ Borracha (Objeto)" para "Borracha (Traço inteiro)" e o título para "Apaga de uma vez o
  traço ou a forma em que você clicar ou passar por cima". Ajuste o equivalente no Guest se existir.

## P5 — Nenhuma moldura em nenhuma ferramenta, no Host e no Guest
Para cada ferramenta ativa (`pencil`, `brush`, `rectangle`, `ellipse`, `line`, `arrow`, `text`, `eraser`,
`object_eraser`), começando o gesto **em cima** de um elemento existente (traço à mão livre, retângulo, seta,
texto): nenhuma moldura de seleção, nenhuma alça, nenhum retângulo de seleção por arrasto (marquee), nenhum
objeto ativo (`getActiveObject() === null`) e o elemento antigo não se move. No Guest, o mesmo com toque.

## P6 — Documentação
- `README.md`: lista de ferramentas atualizada (sem Seleção; "Texto"; "Borracha (Traço inteiro)") e uma frase
  dizendo que o quadro funciona como uma folha de desenho: o que você desenha não é agarrado nem movido.
- `docs/ARQUITETURA.md`: uma nota curta de que os elementos continuam vetoriais por dentro e por quê (sync,
  desfazer, histórico, relatório, HiDPI). Só afirme o que estiver no código.
- `docs/HANDOFF.md`: seção nova no topo, "FASE 11", com um parágrafo em português simples para o Alexandre.

## P7 — Prova (o mesmo método pedido, não um mais barato)
1. **Captura de TELA real** (`page.screenshot`, nunca `toDataURL`/`getImageData` do canvas; lição do
   `docs/reviews/postmortem-desenho-some.md`): para cada ferramenta do P5, com gesto começando em cima de um
   elemento existente, tire captura antes e depois e **conte os pixels** da cor da moldura/alça de seleção do
   Fabric (defina `borderColor`/`cornerColor` explicitamente numa cor única para o teste conseguir contar, por
   exemplo a padrão `rgb(178,204,255)`): **0 pixels** em todas. Mais `getActiveObject() === null` e
   `left`/`top` do elemento antigo inalterados.
2. **Entrada real do sistema operacional** (`SendInput`, ver `tools/drag-sendinput.ps1`) em pelo menos
   retângulo-sobre-retângulo, seta-sobre-texto, lápis-sobre-forma e Borracha (Traço inteiro) sobre forma; não
   só `page.mouse`/CDP.
3. Cursor: `getComputedStyle(upperCanvasEl).cursor` com o ponteiro sobre um elemento, para cada ferramenta:
   nunca `move` nem `not-allowed`.
4. DOM: não existe botão de Seleção na barra do Host; depois de confirmar um texto, a ferramenta ativa é
   `text` (engine e barra).
5. **Ataque à própria entrega** (obrigatório, `AGENTS.md`): tente quebrar cada regra, por exemplo duplo
   clique sobre um texto antigo com a ferramenta Texto, arrastar com Borracha (Traço inteiro) atravessando
   três elementos, trocar de ferramenta no meio de um texto em edição, trocar de aba com a ferramenta Texto
   ativa, Ctrl+A/Delete com o canvas focado. Cada tentativa vira teste.
6. Regressão de D15: com `ARRASTO_NO_MODO_SELECAO_HABILITADO = true` forçado no teste e a ferramenta `select`
   ativada pela API da engine, arrastar volta a mover (o teste atual `tests/selecao-sem-arrasto.test.ts`
   continua verde, ajustado se precisar).
7. Estenda a sonda (`tools/probe-runtime.cjs`) com uma checagem nova (V8) que prove o item 1 com captura de
   tela real no Host e no Guest emulado. `npm run verify` executa a sonda: ela precisa passar.
8. Regressões: `tests/ferramentas-sem-mover.test.ts`, `tests/ferramenta-texto.test.ts`,
   `tests/selecao-sem-arrasto.test.ts`, sonda V3/V3b/V3c/V5 e `node tools/test-touch-and-drawing-fix.cjs`.

## P8 — Artefato final
Rode `npm run package`, instale (`/S /D=<pasta em %TEMP%>`; o instalador pede UAC, se não conseguir elevar,
use o `release/win-unpacked/OneToOneSupport.exe`) e rode a sonda contra o executável com
`ONETOONE_EXE=<caminho>`. Cole a saída.

## Ao final
- Clone limpo da branch fora do projeto, `npm ci`, `npm run verify` lá; cole a saída real.
- `node tools/auditar.cjs` verde.
- `docs/reviews/autoauditoria-11.md`: cada ID P1..P8 → comando → **saída real** → PASS/FAIL, com a contagem de
  pixels da captura de tela perto dos IDs P5/P7, e a lista do que **NÃO** foi verificado (por exemplo:
  celular físico).
- Commits pequenos na branch, mensagem no imperativo. Sem push. Pare.
