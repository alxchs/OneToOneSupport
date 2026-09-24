Contexto: LEIA AGENTS.md inteiro antes de começar, em especial "Lições específicas do projeto" (Fase 07,
sumiço do desenho) e leia `docs/reviews/diagnostico-sync-3.md` (análise do log real que o dono colou desta
vez, e do repro automatizado que o chefe rodou e NÃO reproduziu). Esta é a 5ª rodada sobre o MESMO sintoma
("o desenho some/sobrepõe ao desenhar"). O D1 (Issues/20260922-013720) já colocou o log de eventos no
terminal do dono; o log real chegou e está SAUDÁVEL na camada de eventos (nada é removido, contagem só
cresce) — logo o bug, se existir, está na camada visual (o que aparece na tela) ou num cenário de uso que
ainda não testamos (traços rápidos e próximos, como escrita cursiva de verdade), não na camada de eventos.
PARE de propor "causa raiz" sem reproduzir. Não faça push nem merge. Não altere
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`, nem `docs/reviews/diagnostico-sync-3.md`.

## D2 (único objetivo obrigatório) — Prova visual amarrada ao timeline + repro de traços rápidos

### D2.1 — Sonda de traços rápidos/próximos (o cenário ainda não testado)
Crie `tools/probe-fast-strokes.cjs` (pode copiar a estrutura de abertura do quadro branco de
`tools/probe-runtime.cjs`, seção 7/7.1). Diferente da V3 existente (que testa 1 forma por vez com canvas
limpo antes/depois — não serve para este sintoma), esta sonda deve:
1. Abrir o quadro branco do Host (build de produção, `dist/`, DPR 1.5, igual à V3).
2. Desenhar **N traços de lápis (N ≥ 6) próximos entre si** (dentro de uma área de ~150x80px, simulando
   uma palavra escrita à mão), **sem pausa artificial entre eles** (no máximo o tempo que o `page.mouse`
   leva para mover — nada de `setTimeout` de 500ms como o repro do chefe fez), incluindo pelo menos um caso
   de traços que **se cruzam/sobrepõem** propositalmente.
3. Depois de CADA traço, meça pixels não-transparentes na região de CADA traço anterior individualmente
   (não só o delta total do canvas) — do jeito que `docs/reviews/diagnostico-sync-3.md` descreve o repro do
   chefe; reaproveite a mesma técnica de `getImageData` por região.
4. Repita o mesmo teste também **com o Guest mobile desenhando os traços** (reaproveite a emulação Chromium
   already usada na V3) e também **misturando Host e Guest alternadamente**, porque o log real do dono
   mostrou justamente essa alternância (1 traço Host, 5 traços Guest, 2 traços Host).
5. Se ALGUM traço anterior perder pixel de forma significativa (ex.: cair mais de 50%) depois de um traço
   subsequente, a sonda deve **falhar com saída não-zero** e imprimir exatamente qual traço sumiu e depois
   de qual outro traço.
6. Cole a saída REAL (passando ou falhando) na autoauditoria. Se a sonda **falhar** (reproduziu o bug),
   pare aqui, NÃO tente corrigir cegamente: descreva exatamente o padrão que reproduziu (quantos traços,
   distância entre eles, Host/Guest) em `docs/reviews/autoauditoria-fast-strokes.md` e pare — a correção
   de código vem numa ordem seguinte, já com reprodução confirmada. Se a sonda **passar** mesmo com traços
   rápidos e sobrepostos, vá para D2.2 mesmo assim (a prova visual amarrada ao log continua útil para a
   PRÓXIMA vez que o dono relatar o bug ao vivo).

### D2.2 — Captura de PNG do canvas amarrada ao mesmo timeline de `[DIAG-HOST]`
Hoje `diagLog('renderState', ...)` (chamado em `WhiteboardEngine.renderState`, `src/shared/canvas/engine.ts`)
manda só contagens para o terminal via D1. Sob a mesma flag `ONETOONE_DIAG=1` (reaproveite `isDiagEnabled()`),
adicione:
1. A cada chamada de `renderState`, se `ONETOONE_DIAG=1` **e** estiver rodando no Host (Electron, não no
   Guest — o celular do dono não tem para onde salvar), capture o PNG atual do canvas
   (`engine.toDataURL()` já existe) e envie por um canal IPC novo (ex.: `diag:snapshot`) para o processo
   principal.
2. No processo principal, salve o PNG recebido em `<userData>/diag-snapshots/<timestamp>-renderState-N.png`
   (N = contador sequencial) e imprima no MESMO stdout `[DIAG-HOST] [timestamp] [snapshot] {"arquivo":"..."}`
   — mesmo padrão de linha dos outros checkpoints de D1, para o dono colar o caminho junto do resto do log.
3. **Limite de taxa obrigatório**: não salve mais de 1 snapshot a cada 300ms (use um "debounce"/throttle por
   aba) — o dono pode desenhar rápido e não queremos lotar o disco nem atrasar o desenho de verdade. Se um
   `renderState` for descartado por causa do throttle, isso é aceitável (o objetivo é amostragem, não every
   frame) — não precisa logar o descarte.
4. Atualize `docs/HANDOFF.md` com uma frase curta e literal para o dono, complementando a de D1.6: "os PNGs
   ficam em `%APPDATA%\OneToOneSupport\diag-snapshots\` (ou a pasta que `tools\homologar.ps1` imprimir) —
   quando relatar o problema, também zipe essa pasta e mande junto com o texto do terminal."
5. Teste automatizado: com `ONETOONE_DIAG=1`, desenhe 2 traços via SendInput real (reaproveitando
   `tools/drag-sendinput.ps1` como D1 já faz) e confirme que aparecem pelo menos 2 arquivos PNG na pasta de
   snapshots, que o segundo PNG (aberto e comparado por pixel, não só por existir) contém pixels não
   transparentes na região do PRIMEIRO traço além da região do segundo (ou seja, o PNG por si só já prova
   ou desmente a queixa visualmente, sem precisar do dono relatar de novo).

## D3 — Não regredir o que já funciona
Rode `npm run verify` inteiro (inclui V3 já existente) antes e depois. Nenhuma checagem pode piorar. Se D2
tocar em `engine.ts`/`useHostStore.ts`/`electron/ipc/*`, rode também o teste de borracha de trecho e o de
sincronização bidirecional por IDs. A sonda nova (D2.1) roda À PARTE do `verify` padrão (ela é diagnóstica,
pode ficar vermelha se reproduzir o bug — isso é esperado e útil, não é regressão do `verify`).

## Proibido
Não proponha uma correção de código para o sumiço/sobreposição do desenho nesta rodada, a menos que D2.1
reproduza o bug de verdade com saída colada. Se D2.1 reproduzir, PARE na reprodução e descreva o padrão —
a correção fica para a próxima ordem, já com o padrão exato em mãos. Não invente nomes de arquivo/função/
linha de log que não existem no código.

## Ao final
`npm run verify` verde; `docs/HANDOFF.md` atualizado com a instrução de onde ficam os PNGs; saída real de
D2.1 (passou ou reproduziu) colada; `docs/reviews/autoauditoria-fast-strokes.md` com critério → comando →
saída real → PASS/FAIL/REPRODUZIU, e o que NÃO foi verificado.
