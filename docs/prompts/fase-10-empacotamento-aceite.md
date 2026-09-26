# ORDEM DE SERVIÇO — FASE 10: Empacotamento e Aceite da V1.0 (fase final do roteiro)
Branch: `fase/10-empacotamento-aceite` (confirme com `git branch --show-current`; se não estiver nela, **pare**).
Você é o executor; o chefe técnico é o Claude Code. O dono é o Alexandre. Esta é a **última fase do plano**
(`docs/FASES.md`) — depois dela o produto é V1.0. Leia `AGENTS.md`, `docs/PROTOCOLO.md`, `docs/HANDOFF.md`,
`docs/DOCUMENTO_MESTRE.md` §14 e §18, e todos os ADRs (001–015) antes de tocar em código. Pré-requisito: fases
01–09 mergeadas em `main` (estão).

## Critérios de aceite da V1.0 (Mestre §18 — não são negociáveis, é o que valida esta fase inteira)
1. Binário executando no Windows (instalado, não só `npm run dev`).
2. Sincronia de traços e mídia **< 200 ms** em rede local (medida, não estimada).
3. Testes de duplicidade via `EXISTS` provando ausência de lixo no banco.
4. Assets copiados fisicamente para `%APPDATA%` pós-sessão.
O critério 3 e 4 **já têm teste automatizado** desde as fases 01 e 08 (`tests/db.test.ts`,
`tests/arquivamento.test.ts`) — não reimplemente, só **cite os testes existentes** na autoauditoria com a saída
real deles. Esta fase entrega de verdade o que falta: o critério 1 (empacotamento) e o critério 2 (medição
formal e repetível de latência).

## Estado real do código (conferido pelo chefe em 2026-09-26, releia antes de citar qualquer nome)
- `electron-builder.yml` existe mas é **mínimo**: só `files: ["dist/**/*", "package.json"]`, alvo `nsis` x64,
  **sem `asar`/`asarUnpack` configurado** (assume o padrão `asar: true` do electron-builder). Isso **quebra em
  produção**: `better-sqlite3` (11.8.1) e `sodium-native` (5.1.0) são módulos nativos (`.node`), e um `.node`
  dentro de um `.asar` não pode ser `require()`ado pelo Node/Electron (o SO não consegue mapear/executar o
  binário de dentro do arquivo empacotado). **Isto tem que ser corrigido nesta fase** com `asarUnpack` cobrindo
  os dois módulos (ex.: `"node_modules/better-sqlite3/**/*"`, `"node_modules/sodium-native/**/*"`, e qualquer
  outro pacote nativo que `npm ls` revelar). Teste isso de verdade: **rode o instalador gerado numa pasta limpa
  e abra o app** — se o SQLite não abrir ou a cripto falhar, o asar está errado, não é "detalhe menor".
- **Puppeteer não precisa de tratamento especial no empacotamento**: `.npmrc` já tem
  `puppeteer_skip_download=true` (com `runtime=electron`/`target=30.5.1`), então `node_modules/puppeteer` mede
  ~420 KB (sem Chromium próprio) — `tools/probe-runtime.cjs` sempre usa o binário do Electron via
  `executablePath`/`connect()`. **Não invente um problema de tamanho de instalador aqui que não existe**
  (isso já foi verificado e corrigido em `docs/ADR/015-relatorio-pdf-electron-nativo.md`, seção "Correção").
  Ainda assim, `puppeteer` é dependência só de teste — **exclua-o explicitamente do pacote de produção** (ex.:
  `"files": ["dist/**/*", "package.json", "!node_modules/puppeteer/**/*"]` ou equivalente) por higiene, não por
  necessidade de tamanho, e documente essa distinção no ADR novo desta fase (ver T7) para não repetir a
  confusão.
- **Não existe ícone** (`build/icon.ico` ou qualquer `.ico`/`.png` de app no repositório). **Regra do dono: nunca
  vermelho, nunca vermelho+amarelo, nem vermelho com estrela amarela** (`AGENTS.md`, `CLAUDE.md` do Alexandre).
  **Paleta já decidida pelo Alexandre (perguntado pelo chefe em 2026-09-26, antes de despachar esta ordem):
  azul-ardósia** — reaproveitar as cores já usadas no produto (`#0284c7`, `#0369a1`, `#0f172a`), a mesma família
  de cor da UI do Host e do template do relatório (fase 09). Gere `build/icon.ico` (multi-resolução, 16 a 256px,
  como o Windows/NSIS exige) nessa paleta, sem vermelho em nenhum tom. Se não tiver uma ferramenta de geração de
  ícone disponível, um SVG/PNG simples e um passo de conversão (`png2ico`/`electron-icon-builder`, ou
  equivalente já presente como devDependency — confira antes de adicionar uma nova) resolve; documente a
  ferramenta escolhida no HANDOFF.
- `README.md` existe mas está **vazio** (0 linhas). `docs/ARQUITETURA.md` **não existe**. Nenhum dos dois pode
  ser copiado do `docs/DOCUMENTO_MESTRE.md` (que é a spec original, nem sempre igual ao que foi construído) —
  cada afirmação nos dois documentos novos precisa ser lida do código atual no momento em que a frase é escrita
  (regra de ouro do `AGENTS.md`, e o motivo exato de o Mestre já ter errado a sintaxe do `WHERE NOT EXISTS` que
  a fase 01 corrigiu).
- `npm audit --omit=dev` (só produção, já rodado pelo chefe em 2026-09-26): **8 vulnerabilidades (7 altas, 1
  crítica)**, não as 24 (2 críticas) que `npm ci` mostra completo (que inclui devDependencies como
  `electron-builder`/`puppeteer`/`vitest`, nunca embarcadas no binário do cliente). As 8 de produção:
  - `fabric` (usado por `src/shared/canvas/engine.ts`) — **alta**, XSS armazenado na exportação/serialização
    SVG (`GHSA-hfvx-25r5-qc3w`, `GHSA-w22m-hvvm-xmwx`), correção disponível só com **breaking change** para
    `fabric@7.4.0`. **Decisão que você tem que tomar e documentar, não ignorar:** o projeto usa
    `canvas.toDataURL()` (PNG) para miniaturas, não exportação SVG — confirme por busca se `toSVG()`/exportação
    SVG do Fabric é chamada em algum caminho alcançável por dado do Guest (que é quem poderia injetar o payload
    malicioso via `DRAW_ADD`/`gradient colorStops`); se não for chamada em nenhum lugar, documente isso como
    risco aceito justificado (`risco-aceito: FABRIC_SVG_XSS` na config do auditor, `orquestrador.config.json` →
    `riskSignals`, se aplicável) em vez de simplesmente silenciar. Se for chamada, ou vire `fabric@7.4.0` com os
    testes todos passando, ou registre ADR explicando por que não deu para corrigir nesta fase.
  - `tar` (crítica) via `@mapbox/node-pre-gyp` — confirme que isso é **só ferramenta de build de módulo nativo**
    (compilação de `better-sqlite3`/`sodium-native` em tempo de instalação/dev), nunca código que roda dentro do
    app empacotado entregue ao cliente. Se confirmado, documente como risco aceito (não afeta o binário final);
    se não tiver certeza, não afirme — escreva "não confirmado" e explique o que faltou checar.
  - As demais (transitivas de `puppeteer`/`@puppeteer/browsers`): mesma lógica — `puppeteer` não vai para o
    binário de produção (ver acima), então essas vulnerabilidades não chegam ao cliente. Documente a mesma
    forma.
- Não existe `.github/workflows/`. **Este é o primeiro CI real do projeto** — sem histórico para reaproveitar.
- `act` (executor local de GitHub Actions) **não está instalado nesta máquina**; `gh` CLI **está** instalado e
  autenticado. Isso significa: você consegue **validar localmente** que os passos do workflow funcionam
  (rodando os mesmos comandos manualmente, "execução local equivalente" — já previsto no `AGENTS.md`), mas a
  execução real **no GitHub Actions** só acontece depois que a branch for enviada ao remoto, o que exige
  `git push` — proibido para você. **Não invente que rodou no GitHub**: registre no HANDOFF exatamente que
  "workflow escrito e validado localmente passo a passo; execução real no GitHub Actions pendente do push do
  dono" — o chefe é quem vai disparar e conferir a execução real depois do merge (ver seção "Fechamento" no
  fim desta ordem). Escrever "CI pronto" sem isso é a mesma armadilha do incidente do QuickStacks.
- `scripts/build-report.mjs` (fase 09) já é chamado por `scripts/generate-build-info.mjs`, que é o primeiro
  passo de `npm run build` — **não reimplemente isso**, só confirme que o instalador final contém
  `dist/electron/reports/report-renderer.bundle.js` depois de empacotado (teste real, não suposição).
- `package.json` **não tem nenhum script de empacotamento** (`electron-builder` só está como devDependency).
  Crie `"package": "electron-builder --win"` (ou nome equivalente) — é o comando que este projeto vai usar para
  gerar o instalador; documente-o no README.

## Entregas (IDs T1..T9 — use estes IDs na autoauditoria)

### T1 — `electron-builder.yml` corrigido e funcional
- `asarUnpack` cobrindo todo módulo nativo real (rode `npm ls --omit=dev` e confirme a lista completa antes de
  fixar os padrões — não assuma que só `better-sqlite3`/`sodium-native` existem, **verifique**).
- `npmRebuild` (padrão do electron-builder já reconstrói nativos para a ABI do Electron alvo — confirme que
  está ativo e funcionando, não desative sem justificar).
- Alvos Windows: **NSIS** (instalador, com `oneClick: false` e escolha de pasta — já configurado) **e**
  **portable** (`target: portable` — pedido no stub original da fase; se decidir não entregar portable, é
  divergência de escopo e precisa de ADR explicando o motivo, não pode só desaparecer).
- Ícone: só entra depois da resposta do Alexandre sobre a paleta (ver acima). Aplique em `win.icon` e nas
  demais chaves de ícone do `electron-builder.yml`/NSIS.
- Exclusão explícita de `node_modules/puppeteer/**/*` (e qualquer outra devDependency pesada que `npm ls
  --omit=dev` mostrar estar presente por engano) do array `files`.
- Script novo `"package"` em `package.json` rodando `electron-builder --win`.
- **Teste real, não suposição:** rode `npm run package` (ou o nome escolhido), pegue o instalador de
  `release/`, **instale numa pasta limpa** (fora do repositório, ex. `%TEMP%\onetoone-instalado\`), abra o
  `.exe` instalado, crie um atendido, abra uma sessão, desenhe no quadro, gere um relatório PDF. Cole a saída
  real de cada passo no HANDOFF — inclusive se algo falhar (principalmente se falhar: é isso que esta fase
  existe para pegar).

### T2 — Firewall do Windows (Mestre §14)
- O Express+WS (fase 04) escuta em porta **dinâmica** (`0` → SO atribui) — não dá para abrir uma regra de porta
  fixa. A abordagem correta é uma regra por **caminho do executável instalado** (`program=<caminho do .exe>`),
  perfil **Privado** (`profile=private`), direção de entrada (`dir=in`), **sem** perfil Público/Domínio.
- Implemente a criação da regra no **instalador NSIS** (script customizado, `electron-builder.yml` →
  `nsis.include`/`installer.nsh`), que já roda elevado — não peça UAC em tempo de execução do app. Comando de
  referência (adapte ao caminho real de instalação):
  `netsh advfirewall firewall add rule name="OneToOneSupport" dir=in action=allow program="<installDir>\OneToOneSupport.exe" profile=private enable=yes`
- **Reversível na desinstalação:** o script de desinstalação do NSIS remove a mesma regra
  (`netsh advfirewall firewall delete rule name="OneToOneSupport"`).
- **Sem abrir para a internet:** confirme que o perfil é só `private` (nunca `public`/`domain` sem pedir), e
  que a regra é de entrada para o processo específico, não uma porta genérica.
- Teste real: instale, confirme com `netsh advfirewall firewall show rule name="OneToOneSupport"` que a regra
  existe com o perfil certo; desinstale e confirme que ela some. Cole as duas saídas reais no HANDOFF.
- Documente em `docs/ADR/016-firewall-instalacao.md` (ver T7) a decisão e por que é regra de programa, não de
  porta.

### T3 — Assinatura de código e SmartScreen (documentar, não inventar)
- **Não compre nem invente certificado de assinatura de código.** Documente no README e no HANDOFF, em
  linguagem simples para o Alexandre: o instalador vai disparar o aviso do SmartScreen do Windows ("Windows
  protegeu o computador") na primeira execução em cada máquina nova, porque não há assinatura Authenticode; o
  usuário precisa clicar em "Mais informações" → "Executar assim mesmo". Isso é esperado para V1.0 sem
  orçamento de certificado — não é bug desta fase.

### T4 — CI real no GitHub Actions
- `.github/workflows/ci.yml`: runner `windows-latest` (o projeto é Windows-first, com módulos nativos e testes
  que dependem de `Electron`/`ELECTRON_RUN_AS_NODE`, ADR-004). Passos: checkout, setup-node (versão compatível
  com o `engines`/CI do projeto — confirme qual Node a spec pede, ADR-004 já registra Node 20 vs Node 24 local),
  `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Gatilho em `push`/`pull_request` para `main` e
  para `fase/**`.
- **Decida e documente** se `npm run probe` (sonda com Puppeteer/CDP e captura de tela) entra no CI: um runner
  do GitHub Actions Windows tem sessão de desktop disponível (diferente de Linux headless), então é plausível
  que funcione, mas **não afirme que funciona sem testar** — se não conseguir validar localmente que os mesmos
  passos rodam de forma equivalente, inclua no workflow mas registre honestamente como "não confirmado que
  passa no runner do GitHub" até a execução real (que o chefe fará após o push, ver "Fechamento" abaixo).
- **Validação local equivalente, obrigatória:** rode você mesmo, na sua máquina, exatamente a sequência de
  comandos do workflow (`npm ci` limpo se possível, `npm run typecheck`, `npm test`, `npm run build`) e cole a
  saída real no HANDOFF. Isso não substitui a execução real no GitHub, mas é o que está ao seu alcance sem
  `push` nem `act` instalado.

### T5 — Medição formal de latência (< 200 ms, Mestre §18, critério 2)
- Script novo `tools/medir-latencia.cjs` (ou extensão de `tools/probe-runtime.cjs` numa seção nova, sua
  escolha, documente a decisão): mede o tempo entre o Host emitir um evento `DRAW_ADD` e o Guest confirmar
  recepção/aplicação (reaproveite a conexão real Host↔Guest pelo IP da LAN que a sonda já usa, não
  `127.0.0.1` disfarçado de LAN).
- **1000 amostras**, sem aquecer a amostra com descarte de outliers escondido — se descartar warm-up, diga
  quantas amostras e por quê. Calcule e registre **p50, p95 e máximo em milissegundos**, não só a média.
- Repita para mídia sincronizada (reaproveite `MediaSyncManager`/`CLOCK_SYNC` da fase 08 — não implemente um
  segundo mecanismo de medição de deriva).
- Critério de aceite: **p95 < 200 ms** em rede local real (não loopback). Se não bater, não maquie o número —
  registre o valor real e investigue a causa antes de declarar a fase pronta (mesma disciplina que já pegou o
  bug do `forceRepaint` custando ~10 ms médios e +51 ms no p95, ver `docs/reviews/varredura-host-2026-09-24.md`
  — não repita aquele tipo de sobrecarga escondida).
- Resultado vai para `docs/reviews/latencia-v1.md` com os números reais e o comando usado para gerar.

### T6 — Documentação final
- Preencher `README.md` (está vazio): o que é o produto, como rodar em dev (`npm run dev`), como testar
  (`npm run verify`), como empacotar (`npm run package`), requisitos (Windows, Node versão X, Electron Y),
  aviso do SmartScreen (T3), limitações conhecidas (ver T9).
- Criar `docs/ARQUITETURA.md`: diagrama textual das camadas (Main/Renderer/Guest), tabelas do SQLite reais (leia
  `electron/db/migrations/*.sql` no momento de escrever, não confie na tabela do Mestre), protocolo WS real
  (leia `src/shared/events/protocol.ts` e `src/shared/autoridade.ts` atuais — o Mestre §16 já está desatualizado
  frente ao que existe hoje: faltam `PDF_PAGE`, `CLOCK_SYNC`, `MEDIA_CONTROL`, `GUEST_MUTED`, `RECONNECT`,
  `ERROR`, entre outros). Cada afirmação técnica conferida no código nesse momento — `tools/verificar-afirmacoes.cjs`
  vai reprovar nome inventado.
- Guia de release: passo a passo de como gerar e distribuir uma nova versão (bump de versão, `npm run
  package`, onde fica o instalador, checklist antes de publicar).

### T7 — ADRs desta fase
- `docs/ADR/016-firewall-instalacao.md` (T2).
- `docs/ADR/017-empacotamento-nativo-e-puppeteer.md`: `asarUnpack` dos módulos nativos (T1), e a distinção clara
  entre "puppeteer não precisa de tratamento por tamanho" (já não baixa Chromium, `.npmrc`) vs "puppeteer é
  excluído do pacote de produção por higiene, é dependência de teste" — feche de vez a confusão que a Fase 09
  quase repetiu.
- Se decidir não entregar o alvo `portable`, ou mudar algo do escopo original do stub desta fase: ADR
  registrando a divergência.

### T8 — Checklist de segurança final
- CSP do Guest (`src/shared/csp.ts`, ADR-005): releia e confirme que ainda cobre tudo que o Guest carrega hoje
  (imagem/PDF/vídeo/áudio da fase 08, `worker-src` do pdf.js da fase 08/ADR-014) — **valide no artefato
  empacotado**, não só em dev (lição da Fase 01: CSP por header não vale em `file://`).
- IPC: reconfirme que nenhum canal novo das fases 08/09 aceita payload não validado (rode
  `node tools/auditar.cjs`, que já confere `TIPO_SUPRIMIDO`/`as any` nas linhas novas).
- Cripto: nenhuma mudança nesta fase deveria tocar `electron/crypto/`; se tocar, justifique.
- Path traversal: reconfirme que `isValidId` está aplicado em toda borda que vira componente de caminho em
  disco (assets, relatório — já corrigidos nas fases 08/09 pelo chefe; **procure se sobrou algum outro ponto**
  antes de assumir que está tudo coberto).
- `npm audit` de produção: ver a seção "Estado real do código" acima — não pule, decida cada um dos 8 itens.

### T9 — Limitações conhecidas (documentar, não esconder)
Liste no README/HANDOFF o que V1.0 **não** faz: 1 Guest por vez (`SESSION_OCCUPIED`), sem assinatura de código
(T3), sem impressão física testada (herdado da Fase 09), sem PDF com senha/XFA (herdado da Fase 09), sem teste
em hardware Android físico (herdado das Fases 07/08/09), volumes extremos de abas (>100, herdado da Fase 09)
não exercitados. Não invente limitações que não existem nem esconda as que existem.

## Verificação e autoauditoria (seção "Autoauditoria obrigatória" do `AGENTS.md`)
1. Clone limpo da sua branch **fora** do projeto, `npm ci`, `npm run verify` lá; cole a saída real.
2. Gate: `npm run verify` verde **e** `npm run package` gerando um instalador que **você efetivamente instalou
   e abriu** numa pasta limpa (T1) — sem isso, o critério de aceite 1 (Mestre §18) não está cumprido.
3. `node tools/auditar.cjs` antes de declarar pronto; corrija o que ele apontar.
4. `docs/reviews/autoauditoria-10-empacotamento.md`: cada ID (T1..T9) → comando → **saída real** → PASS/FAIL,
   mais o que **não** foi verificado (aqui é onde "execução real no GitHub Actions pendente do push" entra,
   sem se disfarçar de PASS).
5. Commite em passos pequenos, à medida que cada entrega ficar de pé.

## Fechamento — o que o chefe faz depois (não é seu trabalho, só para você entender o fluxo completo)
Depois que você entregar e eu auditar: o merge e o `git push` só acontecem com ordem explícita do Alexandre
naquele momento (como sempre). Depois do push, **eu** (chefe) disparo a execução real do workflow no GitHub
Actions (`gh workflow run` / verificação via `gh run list`), confirmo o resultado e só então declaro o
critério "CI executado de verdade" fechado — isso não bloqueia sua entrega, só significa que a linha "CI: não
executado no GitHub ainda" no seu HANDOFF é esperada e correta, não uma falha sua.

## Aceite (o chefe reexecuta tudo e tenta quebrar)
- Instalador gerado, instalado numa pasta limpa, app abre e funciona (SQLite e cripto funcionando de dentro do
  asar — é o teste que mais provavelmente pega um erro real).
- Firewall: regra criada na instalação (perfil privado, programa específico), removida na desinstalação.
- Latência medida com números reais (p50/p95/máximo em ms) e p95 < 200 ms, ou o número real registrado com
  investigação se não bater.
- `npm audit` de produção com cada um dos 8 itens decidido e documentado, não silenciado.
- README e `docs/ARQUITETURA.md` preenchidos com afirmações verificadas no código atual.
- Ícone só aplicado depois da resposta do Alexandre sobre paleta; nunca vermelho sem perguntar.

## Não fazer
Não invente certificado de assinatura de código. Não afirme execução real de CI no GitHub sem tê-la disparado
(você não pode — é o chefe que faz isso após o push). Não decida a paleta do ícone sozinho. Não mude a stack
nem os critérios de aceite do Mestre §18 — divergência exige ADR + aviso no HANDOFF. **Nunca** `git push` nem
merge.
