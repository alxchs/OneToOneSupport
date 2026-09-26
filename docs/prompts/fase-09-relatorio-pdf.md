# ORDEM DE SERVIÇO — FASE 09: Relatório em PDF da Sessão
Branch: `fase/09-relatorio-pdf` (confirme com `git branch --show-current`; se não estiver nela, **pare**).
Você é o executor; o chefe técnico é o Claude Code. O dono é o Alexandre.
Leia antes de tocar em código: `AGENTS.md`, `docs/FASES.md`, `docs/HANDOFF.md`, `docs/PROTOCOLO.md`, `docs/ADR/`
(001 a 014) e este documento inteiro — a arquitetura já foi decidida pelo chefe (seção "Decisão de arquitetura"),
**não é para reabrir essa escolha nem propor Puppeteer**. Pré-requisito: fases 05, 06, 07 e 08 mergeadas em `main`
(estão).

## Decisão de arquitetura (já tomada pelo chefe — só documente em ADR, não decida de novo)
A ordem original deste roteiro (`docs/FASES.md`) previa gerar o PDF com Puppeteer. **Isso mudou.** `puppeteer`
(`^22.15.0`) já é dependência do projeto, mas só é usado por `tools/probe-runtime.cjs` (ferramenta de
desenvolvimento/teste) e baixa/embute o próprio Chromium — se reaproveitado para gerar PDF em produção,
`electron-builder` (`files: ["dist/**/*", "package.json"]`, sem exclusão de `node_modules`) empacotaria esse
Chromium extra dentro do instalador de cada cliente, **duplicando** o Chromium que o próprio Electron já traz.

**Use a API nativa do Electron: um `BrowserWindow` fora de tela (`show: false`) carregando o template do
relatório localmente, e `webContents.printToPDF(options)`** (`Promise<Buffer>`, ver
`node_modules/electron/electron.d.ts` — `PrintToPDFOptions` aceita `pageSize`, `printBackground`, `margins`,
`displayHeaderFooter`, `headerTemplate`, `footerTemplate`, `landscape`). Zero dependência nova, zero Chromium
duplicado. `puppeteer` continua existindo só para teste/dev (`tools/probe-runtime.cjs`); não o remova.
Registre isso em `docs/ADR/015-relatorio-pdf-electron-nativo.md` (motivo, o que foi descartado — Puppeteer — e
por quê, tamanho evitado no instalador).

## Estado real do código (conferido pelo chefe em 2026-09-26, releia antes de citar qualquer nome)
- `Sessoes_Revisoes` (`electron/db/repositories/revisao.repo.ts`): `RevisaoRecord { id, sessao_id, numero_versao,
  snapshot_evento_idx, titulo, criado_em, autor }`. `EventoService.reconstruirEstadoAba(sessaoId, abaId, ateIdx?)`
  já reconstrói o `TabState` de uma aba até um índice de evento (ou o estado atual se omitido);
  `EventoService.listRevisoes(sessaoId)` e a leitura por `numero_versao` (`getRevisaoByVersao`) já existem.
- `TabState` (`src/shared/events/reducer.ts`): `{ elements: Record<string, DrawElement>, elementOrder: string[],
  history: {...} }`. `getVisibleElements(state)` devolve os elementos não ocultados, na ordem — é o que se
  precisa para saber se uma aba tem conteúdo (lista vazia = aba em branco, não gerar miniatura à toa).
- `Abas` (fase 08, `electron/db/repositories/aba.repo.ts`): `AbaRecord { id, sessao_id, tipo
  ('blank'|'image'|'pdf'|'video'|'audio'), ordem, asset_id, titulo, criado_em }`, listadas por
  `listAbasBySessao(sessaoId)` em ordem contígua.
- `Assets` (fase 08, `electron/services/asset.service.ts`): `AssetService.getById(assetId)` devolve
  `{ mime, path, hash_sha256, ... }`; `AssetService.resolveAbsolutePath(asset)` resolve o caminho físico. PDF
  tem paginação por `<abaId>_p<pagina>` como convenção de sub-contexto de desenho (ver `QuadroBrancoPage.tsx` e
  `useHostStore.ts`, campo `pdfPagina`).
- `WhiteboardEngine` (`src/shared/canvas/engine.ts`): já expõe **exatamente** o que este relatório precisa, sem
  reimplementar nada do desenho:
  - `renderState(state: TabState): void` — carrega um estado reconstruído no canvas.
  - `setBackgroundImage(source: string): Promise<void>` — aceita `data:` URI (usa como `<img>.src`); é assim
    que se coloca o fundo de imagem/página de PDF atrás do desenho de uma miniatura.
  - `toDataURL(options?): string` — exporta PNG do estado atual do canvas.
  - `dispose(): void` — libera a instância depois de exportar cada miniatura.
- `AtendidoRecord`/`SessaoRecord`: `Atendidos.nome/contato/email/notas`; `Sessoes.titulo/status/iniciado_em/
  encerrado_em/notas_host`. `ConfigService.getDictionary()` dá os rótulos dinâmicos (`rotulo.host`,
  `rotulo.guest`, `rotulo.sessao`) já usados no Host.
- Convenção de diretório de arquivamento (fase 08, `electron/services/asset.service.ts`):
  `getDefaultArquivoRootDir()` respeita `ONETOONE_ARQUIVO_DIR`; `slugifyAtendidoNome`, `formatSessaoTimestamp`
  e `arquivarAssetsSessao` já geram `<raiz>/<slug>/<YYYYMMDD_HHMM_sessaoId>/assets/`. O relatório desta fase usa
  a **mesma pasta da sessão**, só acrescentando `relatorio.pdf` ao lado de `assets/`.
- `id.trim()` e afins já usam `isValidId`/`ID_REGEX` (`electron/services/evento.service.ts`,
  `/^[A-Za-z0-9_-]{1,64}$/`) como padrão do projeto para qualquer id usado em caminho de arquivo — **reuse-o**
  para `sessaoId` neste serviço novo também (o achado da auditoria da fase 08,
  `docs/reviews/fase-08-abas-midia.md`, foi exatamente esquecer isso em um serviço novo).
- CSP do Guest está centralizada em `src/shared/csp.ts` (`GUEST_CSP`, ADR-005). A janela do relatório é
  **interna** (não é o Guest), mas segue o mesmo princípio de isolamento (ver R3).

## Entregas (IDs R1..R9 — use estes IDs na autoauditoria)

### R1 — Serviço de geração (`electron/services/relatorio.service.ts`)
- `RelatorioService.gerar(sessaoId: string, numeroVersao?: number): Promise<IPCResult<{ path: string }>>`.
  - Valida `sessaoId` com `isValidId` (reaproveite de `evento.service.ts`, não duplique o regex).
  - Busca `SessaoRecord`, `AtendidoRecord`, dicionário de rótulos, `listAbasBySessao(sessaoId)`.
  - Se `numeroVersao` for passado: resolve `snapshot_evento_idx` pela revisão (`getRevisaoByVersao`); senão usa
    o estado atual (sem índice, evento mais recente). Título do PDF indica a revisão usada (ou "estado atual").
  - Para cada aba, em ordem: reconstrói o `TabState` até o índice da revisão
    (`EventoService.reconstruirEstadoAba`); se `getVisibleElements(state).length === 0` **e** a aba não tem
    `asset_id`, pula a miniatura dessa aba no PDF (mas ainda lista o título/tipo dela no sumário — não invente
    conteúdo que não existe).
  - Gera a miniatura de cada aba com conteúdo (ver R2) e monta o HTML do relatório (ver R4) com Handlebars-like
    string templating simples (sem nova dependência de template engine — funções de string/array do próprio
    TypeScript bastam; **todo dado do usuário passa por escape de HTML antes de entrar no template**, função
    `escapeHtml` própria ou reaproveitada — procure se já existe uma em `electron/server/http.ts`, que já tem uma
    para o convite, antes de escrever outra).
  - Chama R3 para renderizar HTML→PDF, grava em
    `<raiz_arquivo>/<slug_atendido>/<pasta_sessao_da_mesma_convenção_do_M8>/relatorio.pdf` (mesma pasta que
    `arquivarAssetsSessao` usa — reaproveite `slugifyAtendidoNome`/`formatSessaoTimestamp` de
    `asset.service.ts`, não duplique). Escrita **atômica** (arquivo temporário + rename), sobrescrevendo
    relatório anterior da mesma sessão sem deixar arquivo parcial em caso de erro no meio.
  - Devolve o caminho absoluto do PDF gerado (nunca exponha esse path ao Guest; é só para o Host abrir).

### R2 — Miniaturas fiéis por aba (offscreen, reaproveitando o `WhiteboardEngine`)
- As miniaturas **não são geradas com uma nova lib de canvas do zero**: rodam dentro da mesma janela offscreen
  de R3 (que tem DOM real do Chromium), carregando um `<canvas>` oculto por aba e instanciando
  `new WhiteboardEngine(canvasEl, { sessaoId, abaId, author: 'host', readOnly: true, ... })` (confira as opções
  reais do construtor em `engine.ts:321` antes de inventar um parâmetro que não existe).
  - Chama `engine.renderState(estadoReconstruido)`.
  - Se a aba for `image` ou `pdf`: chama `await engine.setBackgroundImage(dataUri)` **antes** de `renderState`
    (mesma ordem já usada no Host — confira em `QuadroBrancoPage.tsx`), onde `dataUri` vem do asset lido do
    disco pelo processo Main e passado em base64 (nunca um caminho de arquivo cru: constrói
    `data:${asset.mime};base64,${buffer.toString('base64')}` no Main, entrega pronto à janela offscreen).
    Para `pdf`, renderize a página certa com `src/shared/pdf/pdf-loader.ts` (`PdfDocumentViewer`, já existe da
    fase 08) para um canvas intermediário e use o resultado como a imagem de fundo, do mesmo jeito que
    `QuadroBrancoPage.tsx` já faz — **não implemente um segundo caminho de renderização de PDF**.
  - Multiplicador de nitidez: use o mesmo `devicePixelRatio`/multiplicador que o Host usa hoje ao desenhar
    (ADR-003) — não invente um número fixo; leia como `engine.ts`/`QuadroBrancoPage.tsx` já decidem isso.
  - `engine.toDataURL({ multiplier: ... })` → PNG embutido como `<img src="data:image/png;base64,...">` no
    HTML do relatório. `engine.dispose()` depois de cada aba, antes de passar para a próxima (a mesma janela
    offscreen processa as abas em sequência; não crie uma `BrowserWindow` por aba).
  - Vídeo/áudio (abas `video`/`audio`): sem miniatura de desenho da mídia em si (fora de escopo desta fase);
    liste no relatório o nome do arquivo e, se a aba tiver anotações por cima (é possível anotar sobre vídeo?
    confira o código antes de assumir — se não for possível hoje, diga isso explicitamente no HANDOFF em vez
    de inventar).

### R3 — Renderização HTML → PDF (Electron nativo, sem rede)
- `BrowserWindow` com `show: false`, `webPreferences: { contextIsolation: true, nodeIntegration: false,
  sandbox: true, preload: <preload dedicado deste relatório, mínimo, sem expor fs/ipc de negócio> }` — não
  reaproveite o preload do Host nem do Guest; escreva um preload próprio, exclusivo desta janela, que só expõe
  o necessário para o Main empurrar dados de renderização (ex.: `window.__relatorio.renderAba(abaId, payload)`
  e `window.__relatorio.pronto()` para sinalizar ao Main que pode chamar `printToPDF`).
- **Sem rede:** intercepte requisições (`session` dessa janela, `webRequest.onBeforeRequest`) e bloqueie
  qualquer coisa que não seja o próprio arquivo do template carregado localmente e `data:`/`blob:` — a mesma
  disciplina de "sem CORS aberto"/CSP do projeto, adaptada para uma janela 100% offline. Justifique em ADR-015
  se precisar de exceção pontual (não deveria precisar de nenhuma).
- Fluxo: `win.loadFile(templatePath)` → aguardar sinal `pronto()` do preload (depois que todas as miniaturas
  foram desenhadas e embutidas no DOM) → `const buffer = await win.webContents.printToPDF({ pageSize: 'A4',
  printBackground: true, margins: {...}, displayHeaderFooter: true, headerTemplate: ..., footerTemplate: ...
  })` → grava `buffer` no arquivo de destino (ver R1) → `win.close()`.
- Timeout de segurança: se o sinal `pronto()` não chegar em N segundos (ex.: 15s), aborta com erro claro em vez
  de travar o processo Main indefinidamente — teste esse caminho (ver R8).

### R4 — Template do relatório (`electron/reports/templates/sessao.html` + CSS embutido, sem CDN)
- Cabeçalho: nome do atendido, rótulo dinâmico do dicionário (não hardcode "Aluno"/"Paciente"), título da
  sessão, datas de início/encerramento (formatadas, fuso local), revisão usada (número ou "estado atual").
- Corpo: uma seção por aba, na ordem salva (`ordem` de `Abas`), com título da aba, tipo, miniatura (quando
  houver) e, se a aba tiver asset, o nome sanitizado do arquivo (`sanitizeAssetTitle`/`sanitizeAssetName`, já
  existe em `asset.service.ts` — reaproveite, não escreva sanitização de nome de novo).
  Observações do Host (`notas_host`) em seção própria, com **todo o texto escapado**.
- Rodapé com paginação (`headerTemplate`/`footerTemplate` do `printToPDF`, classes `pageNumber`/`totalPages`
  conforme a doc do Electron) e o nome do produto.
- Fonte embutida (não referencie fonte via `@import`/Google Fonts — nada de rede); use uma fonte do sistema
  (`system-ui`/`-apple-system`/`Segoe UI` como fallback) ou uma fonte embutida como `data:` se quiser tipografia
  fixa entre máquinas — decisão livre, documente a escolhida.
- **Nada de vermelho** (regra do dono) — nem no template, nem em eventuais destaques de erro no relatório.

### R5 — IPC e UI (Host)
- Canal novo em `src/shared/ipc-contract.ts` (`IPC_CHANNELS`, siga o padrão existente, ex.:
  `RELATORIO_GERAR: 'relatorio:gerar'`) + `DesktopAPI.relatorio.gerar(sessaoId, numeroVersao?)`.
- `electron/ipc/relatorio.ipc.ts`, registrado em `electron/ipc/router.ts` (mesmo padrão de `aba.ipc.ts`/
  `asset.ipc.ts` da fase 08 — valide payload com o mesmo rigor: `sessaoId` obrigatório e `isValidId`,
  `numeroVersao` opcional e, se presente, inteiro positivo).
- UI: botão "Gerar relatório" em `src/host/pages/DetalheAtendidoPage.tsx` (não existe hoje — confirmei por
  busca), na lista de sessões de um atendido. Se a sessão tiver mais de uma revisão
  (`listRevisoesBySessao().length > 1`), oferece escolher a revisão antes de gerar (senão gera direto do estado
  atual). Depois de gerar, abre o PDF com `shell.openPath(caminho)` (API do Electron, já usada em algum outro
  lugar do projeto? confira; se não, é a primeira vez — documente).
- Sem vermelho, sem regra de negócio no componente (só chama o IPC e mostra resultado).

### R6 — Segurança (cada uma vira teste que tenta violar)
- **XSS no relatório:** nome do atendido, título da sessão, notas do host, título de aba e nome de asset com
  `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`, emojis, acentos e strings de 10k caracteres —
  o PDF gerado não deve executar nada (é PDF estático, mas o **HTML intermediário** na janela offscreen não
  pode executar o script injetado antes do `printToPDF` — teste isso interceptando `console` ou um canário
  `window.__XSS_CANARIO__` que o payload malicioso tentaria chamar).
- **Sem requisição de rede:** grave um contador de requisições da sessão da janela offscreen; deve ser zero
  requisições que não sejam o `file://`/`data:` locais. Rode com um payload que tenta `<img src="http://…">` e
  confirme que foi bloqueado (não só "não tentamos", teste que a interceptação de fato barra).
- **`sessaoId` malicioso** (`../../../../pasta`, string vazia, 5000 caracteres): rejeitado por `isValidId` antes
  de tocar em disco — mesmo ataque da fase 08, agora neste serviço novo.
- **Sessão sem eventos** (todas as abas em branco): gera PDF válido (não vazio, não trava) com as seções sem
  miniatura, dizendo "sem conteúdo" em vez de mostrar um branco confuso.
- **Sessão com 100 abas:** gera sem travar (meça o tempo; se ficar claramente inviável, documente o limite
  encontrado no HANDOFF em vez de fingir que não existe).
- **Revisão inexistente/`numeroVersao` fora do intervalo:** erro claro (`NOT_FOUND`), sem gerar PDF corrompido
  nem travar a janela offscreen aberta.
- **Timeout do sinal `pronto()`:** simule o preload nunca chamando `pronto()` (aba trava ao renderizar) e prove
  que o timeout do R3 fecha a janela e devolve erro em vez de vazar um processo `BrowserWindow` invisível.

### R7 — Verificação do conteúdo do PDF gerado
- `pdfjs-dist` **já é dependência** do projeto (fase 08) — use-o nos testes para abrir o PDF gerado e extrair
  texto real (`getTextContent()` por página), confirmando que nome do atendido, rótulos e notas aparecem no
  texto extraído (não é screenshot, é o texto real do PDF — mais forte e mais barato que renderizar).
  Confirme também `numPages > 0`.
- Miniaturas: prova por **captura de tela real** de uma miniatura renderizada na janela offscreen antes do
  `printToPDF` (`page`/`webContents.capturePage()`) com contagem de pixels não-brancos, e comparação de que a
  imagem de fundo (quando a aba é `image`/`pdf`) aparece atrás do traço — mesma disciplina de prova de pixel já
  usada nas fases 06/08 (nunca provar por `getImageData` do buffer isolado; a prova é da tela/superfície
  renderizada de fato).

### R8 — Testes (arquivo novo, cada regra com pelo menos um teste que tenta violá-la)
`tests/relatorio.test.ts`: XSS neutralizado, `sessaoId` inválido rejeitado, sessão sem eventos, sessão com
muitas abas, revisão inválida, timeout do sinal `pronto()`, texto extraído do PDF (R7), miniatura com fundo de
imagem/PDF (prova de pixel), escrita atômica (interrompa entre gravar o temporário e o rename e confirme que
não sobra half-arquivo nem PDF corrompido é aberto por engano depois).

### R9 — HANDOFF e ADR
- `docs/ADR/015-relatorio-pdf-electron-nativo.md`: decisão já tomada acima — documente com os números reais do
  seu ambiente (ex.: tamanho do instalador com/sem Puppeteer embutido, se conseguir medir; senão diga que não
  mediu em vez de inventar um número).
- HANDOFF com o resumo em português simples para o Alexandre, evidência real de cada critério (R1..R9),
  PASS/FAIL, e a lista do que **não foi verificado** (ex.: impressora física, PDF em máquina com fontes
  diferentes, abrir o relatório em leitor de PDF de terceiros).

## Verificação e autoauditoria (seção "Autoauditoria obrigatória" do `AGENTS.md`)
1. Clone limpo da sua branch **fora** do projeto, `npm ci`, `npm run verify` lá; cole a saída real.
2. Gate: `npm run verify` (typecheck + build + test + probe) verde. Estenda `tools/probe-runtime.cjs` com uma
   seção **V7** que, no app empacotado, cria uma sessão real com pelo menos uma aba `blank` desenhada e uma aba
   `image` com asset importado, gera o relatório pelo fluxo real de IPC, abre o PDF gerado (ou ao menos lê seus
   bytes com `pdfjs-dist`) e confirma texto e miniatura — não é suficiente só rodar `tests/relatorio.test.ts`
   isoladamente.
3. `node tools/auditar.cjs` antes de declarar pronto; corrija o que ele apontar.
4. `docs/reviews/autoauditoria-09-relatorio-pdf.md`: cada ID (R1..R9) → comando → **saída real** → PASS/FAIL,
   mais o que **não** foi verificado. Onde a prova pedida é pixel/captura de tela, a evidência tem que ser de
   pixel/captura de tela de verdade (`tools/checar-provas.cjs` confere isso).
5. Commite em passos pequenos, à medida que cada entrega (R1..R9) ficar de pé — **não acumule tudo num commit
   só no fim**; se sua execução for interrompida (rodízio de máquina, cota, o que for), o que já estiver
   commitado não se perde.

## Aceite (o chefe reexecuta tudo e tenta quebrar)
- PDF abre de verdade (o chefe também abre), com texto extraível correto e miniaturas fiéis ao que está no
  quadro (traço por cima de imagem/PDF quando aplicável).
- Nenhuma requisição de rede durante a geração; XSS injetado não executa em nenhum momento do processo.
- `sessaoId` malicioso rejeitado; sessão sem conteúdo e sessão grande (muitas abas) não travam nem corrompem.
- Puppeteer não entra no caminho de execução em produção (só segue existindo para os testes/sonda de sempre).
- Sem vermelho na UI; sem regra de negócio no renderer/componente React.

## Não fazer
Não implemente o empacotamento/CI da Fase 10. Não reabra a escolha de arquitetura (Electron nativo está
decidido, não é Puppeteer). Não mude a stack, a ordem das fases nem os critérios de aceite — divergência exige
ADR em `docs/ADR/` e aviso no HANDOFF. **Nunca** `git push` nem merge.
