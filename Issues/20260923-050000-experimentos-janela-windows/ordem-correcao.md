Contexto: LEIA AGENTS.md inteiro antes de começar. LEIA `docs/reviews/diagnostico-sync-5-repaint.md`,
`docs/reviews/investigacao-render-pipeline.md` e o log de commits D4 a D9 (`git log --oneline -15`). Resumo do
estado, que você deve tratar como fato já estabelecido por evidência real do dono:
- O desenho SOME DA TELA ao soltar o botão do mouse, a tela inteira do quadro fica em branco (não só o último
  traço). Reproduz 100% na máquina do dono (Windows 11, monitor 2560x1440 @150%), zero vezes em 7+ tentativas
  de automação (CDP, SendInput real, Guest real, dev/StrictMode, GPU desligada).
- O buffer do canvas está CORRETO o tempo todo: o botão "Exportar PNG" do dono mostrou todos os traços.
- Descartados com evidência: perda de dados (reducer sempre limpo em 9 logs reais), exceções JS (D4), pixel
  vazio (D6.1), canvas escondido por CSS/DOM (D8), instâncias duplicadas (D6.2), onDprChange (D5, bug real
  mas não é a causa), repaint forçado dentro do processo via `webContents.invalidate()` (D7), GPU desligada
  com `--disable-gpu` no teste real do dono (D9).
- Hipótese que sobra: o Chromium desenha certo por dentro, mas o Windows não entrega o quadro novo à tela.
  Causas conhecidas na comunidade Electron/Chromium: (a) detecção de oclusão nativa do Windows
  (`CalculateNativeWinOcclusion`) marcando a janela como oculta/coberta e parando de pintar; (b)
  `backgroundThrottling` do Chromium pausando pintura/rAF quando ele julga a janela em segundo plano;
  (c) swapchain preso depois de um reset do driver de vídeo, só liberado por evento real de janela
  (resize/mover/minimizar).

Não faça push nem merge. Não altere `docs/reviews/*` existentes de investigação/diagnóstico nem
`tests/adversarial/redteam-fase07.test.ts`, `docs/reviews/redteam-07.md`, `docs/reviews/fase-0[567].md`,
`docs/reviews/homologacao-1.md`.

## D10 (único objetivo obrigatório) — Experimentos ligáveis por ambiente, padrão inalterado

Implemente em `electron/main.ts` (processo principal, ANTES de `app.whenReady()` para os switches de
linha de comando, e dentro de `createWindow` para os demais) uma variável de ambiente
`ONETOONE_RENDER_EXPERIMENT` que aceita uma lista separada por vírgula, ou `all`. **Sem a variável, NENHUM
comportamento muda** (teste isso). Os experimentos:

1. `occlusion` — `app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')` (só
   `process.platform === 'win32'`). Se já houver um `disable-features` no ambiente, concatene com vírgula,
   não sobrescreva.
2. `nothrottle` — `webPreferences.backgroundThrottling = false` no `BrowserWindow` do Host.
3. `nudge` — depois de cada traço confirmado, faça um "empurrãozinho" de janela para forçar o DWM do
   Windows a recompor: `win.setBounds` aumentando 1px na largura e voltando ao valor original no frame
   seguinte (use `setTimeout`/`setImmediate` curto, sem animar; se a janela estiver maximizada/fullscreen,
   NÃO redimensione, use alternativa segura ou pule e registre no diagnóstico). Disparo via o canal IPC
   `canvas:force-repaint` já existente (`electron/ipc/canvas.ipc.ts`, criado em D7): quando o experimento
   `nudge` estiver ativo, o handler faz o nudge além do `invalidate()`. **Throttle obrigatório** (no máximo 1
   nudge a cada ~300ms) e nunca durante um arrasto ao vivo (só depois de `path:created`/`renderState` com
   elemento novo, como o D7 já faz).
4. `all` equivale a `occlusion,nothrottle,nudge`.

Cada experimento ativo deve imprimir UMA linha clara no terminal do Host na inicialização, no estilo
`[Main] ONETOONE_RENDER_EXPERIMENT ativo: occlusion, nothrottle, nudge`, para o dono ver que pegou. Se o
valor tiver um nome desconhecido, imprima aviso e ignore só aquele nome (não derrube o app).

Também adicione ao diagnóstico (só sob `ONETOONE_DIAG=1`) eventos do próprio `BrowserWindow` que ajudam a
ver se o Windows julga a janela oculta: registre no terminal (`[DIAG-HOST] [janela_evento]`) os eventos
`show`, `hide`, `minimize`, `restore`, `focus`, `blur` e, se existir no Electron 30, o estado de
`win.isVisible()`/`win.isMinimized()` no momento de cada `renderState` que adiciona elemento (isso pode
exigir um pequeno canal IPC diag; reaproveite o `diag:forward` já existente, sem criar superfície nova em
produção).

### Provas exigidas (o que dá para provar por automação)
- Sem `ONETOONE_RENDER_EXPERIMENT`: nada muda (teste unitário/integração que confirme que os switches e o
  `backgroundThrottling` NÃO são alterados por padrão).
- Com cada valor: o switch/opção é de fato aplicado (teste do que puder ser testado sem janela real; para o
  resto, mostre a saída real do log de inicialização rodando o app de verdade com a variável).
- `npm run verify` completo verde antes e depois.
- Frase obrigatória na autoauditoria: "estes experimentos NÃO foram validados contra o bug original (que não
  reproduz em automação) — só o dono testando na máquina real pode dizer se algum resolve".

### Roteiro para o dono (escreva literal em `docs/HANDOFF.md`, em português simples)
Teste 1: `$env:ONETOONE_RENDER_EXPERIMENT="all"` depois `tools\homologar.ps1`, desenhar como sempre. Se
resolver, repetir isolando: só `occlusion`, depois só `nothrottle`, depois só `nudge`, para achar qual foi.
Sempre colar o terminal completo. Se não resolver com `all`, dizer isso também — é informação útil.

## Proibido
Não mude nenhum comportamento padrão. Não desligue a GPU. Não declare o bug resolvido. Não invente nomes de
switch do Chromium: use somente `CalculateNativeWinOcclusion` (documentado) e confirme no código do Electron/
Chromium disponível em `node_modules` ou na documentação local do que você tiver acesso; se não conseguir
confirmar que o switch existe nesta versão (Electron 30.5.1), registre isso honestamente em vez de assumir.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-experimentos-janela.md` (critério → comando → saída real →
PASS/FAIL, e o que NÃO foi verificado); `docs/HANDOFF.md` com o roteiro do dono; commit único local, sem push.
