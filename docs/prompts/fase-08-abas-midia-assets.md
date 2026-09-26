# ORDEM DE SERVIÇO — FASE 08: Abas multimodais, assets e mídia sincronizada
Branch: `fase/08-abas-midia-assets` (confirme com `git branch --show-current`; se não estiver nela, **pare**).
Você é o executor; o chefe técnico é o Claude Code. O dono é o Alexandre.
Leia antes de tocar em código: `AGENTS.md`, `docs/FASES.md`, `docs/HANDOFF.md`, `docs/PROTOCOLO.md`, `docs/ADR/` (001 a 012)
e a revisão anterior `docs/reviews/fase-08.md` (as ressalvas 1 e 2 dela são entrega OBRIGATÓRIA aqui — ver M9).

> Nota de numeração: a branch `fase/08-ferramentas-sem-mover` (já mergeada em `main`) carregou as correções D12–D17 da
> homologação e ocupou o número 08. Esta é a Fase 08 **do plano** (`docs/FASES.md`), que nunca foi executada. Não mexa
> em nada daquela branch nem reescreva `docs/reviews/fase-08.md`: escreva o seu relatório em
> `docs/reviews/autoauditoria-08-abas-midia.md`.

## Estado real do código (conferido pelo chefe em 2026-09-25; releia antes de citar qualquer nome)
- As tabelas `Abas` e `Assets` **já existem** em `electron/db/migrations/001_init.sql` e **nunca foram usadas**: não há
  `aba.repo.ts`, `aba.service.ts`, `asset.repo.ts` nem `asset.service.ts`.
- `src/host/store/useHostStore.ts` tem `activeAbaId` fixo em `'default'`, `trocarAba(abaId)` (troca + `switchTab` no
  servidor + recarga por `obterEstadoAba`) e o funil único `aplicarEventoRemoto` (D17), que **descarta** evento do Guest
  cuja aba não seja a ativa.
- `electron/server/index.ts` tem `switchTab(abaId)` (emite `TAB_SWITCH` e `TAB_STATE`) e `handleGuestEvent`, que carimba
  o `sessaoId` da autoridade. `electron/server/http.ts` serve `/guest`, `/assets` (estáticos do Vite), `/health` e
  `/join/:token`. **Não existe rota de mídia.**
- `src/shared/autoridade.ts` (ADR-011) é a fonte única de autoridade: `ACOES_EXCLUSIVAS_HOST`, `ACOES_INTERATIVAS_GUEST`,
  `ACOES_MIDIA_GUEST` (`PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL` — já barrados sem `UNLOCK_MEDIA`), `ACOES_LOCAIS_GUEST`.
- `src/shared/events/protocol.ts` já declara os tipos `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL`, `TAB_SWITCH` e
  `UNLOCK_MEDIA` com payloads, mas **nenhum deles é emitido ou consumido de verdade** (só `TAB_SWITCH`).
- Caminho de dados: `getDefaultDbPath()` em `electron/db/connection.ts` usa `%APPDATA%/OneToOneSupport` e respeita
  `ONETOONE_DB_PATH`. Siga esse mesmo padrão para os assets (ver M2).

## Entregas (IDs M1..M10 — use estes IDs na autoauditoria)

### M1 — Abas de verdade (persistidas, ordenadas, sincronizadas)
- `electron/db/repositories/aba.repo.ts` + `electron/services/aba.service.ts` + `electron/ipc/aba.ipc.ts` (registrado em
  `electron/ipc/router.ts`) + contrato `abas` em `src/shared/ipc-contract.ts` (tipado, sem `any`).
- Operações: criar (`blank|image|pdf|video|audio`), listar por sessão, renomear, reordenar, remover (somente aba sem evento).
- INSERT idempotente no padrão do projeto (`INSERT ... SELECT ... WHERE NOT EXISTS`, colunas anuláveis comparadas com
  `IS`): clique duplo no botão "Nova aba" não pode criar duas abas iguais. `ordem` fica contígua e sem buraco depois de
  remover ou reordenar.
- UI no Host: barra de abas em `src/host/pages/QuadroBrancoPage.tsx` (sem vermelho — regra do dono). Trocar de aba usa o
  `trocarAba` que já existe; criar/reordenar recarrega a lista pelo IPC.
- Guest (`src/guest/GuestRoom.tsx`) acompanha a aba ativa do Host, inclusive o tipo da aba e a mídia de fundo.

### M2 — Importação de assets (`asset.service.ts` + `asset.repo.ts`)
- Raiz de armazenamento: `%APPDATA%/OneToOneSupport/assets/<sessao_id>/<sha256>.<ext>`, com override por variável de
  ambiente `ONETOONE_ASSETS_DIR` (mesmo padrão de `ONETOONE_DB_PATH`). **Teste e sonda são obrigados a usar o override**
  — nenhum teste pode escrever no `%APPDATA%` real.
- Fora do webroot: o diretório de assets nunca pode ser servido por `express.static`.
- `Assets.path` guarda caminho **relativo à raiz de assets**, nunca caminho absoluto nem o caminho de origem do arquivo
  escolhido pelo usuário; nada disso pode chegar ao renderer nem ao Guest.
- MIME por assinatura (magic bytes), **nunca** pela extensão. Allowlist V1: `image/png`, `image/jpeg`, `image/webp`,
  `image/gif`, `application/pdf`, `video/mp4`, `video/webm`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `video/ogg`.
  SVG é **rejeitado** em V1 (é XML executável) com o código `ASSET_TIPO_NAO_SUPORTADO`.
- Limite de tamanho configurável em `ConfiguracaoGlobal` (chave `asset.tamanho_max_mb`, padrão 250); acima disso rejeita
  com `ASSET_MUITO_GRANDE` sem deixar arquivo parcial no disco.
- Nome sanitizado em profundidade (serve só para exibição, em `Abas.titulo`): `..`, `/`, `\`, `:`, nomes reservados do
  Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1`..`COM9`, `LPT1`..`LPT9`, com e sem extensão), ponto/espaço no fim, `%00`,
  unicode de confusão (RTL override `U+202E`, zero-width), nome com 4096 caracteres.
- Import atômico: grava em arquivo temporário, confere o sha256 do que foi gravado e só então renomeia para o destino e
  insere no SQLite. Queda no meio (mate o processo ou force exceção entre gravar e inserir) **não pode** deixar linha
  órfã no banco nem arquivo meio gravado passando por asset válido.

### M3 — Servir mídia ao Guest por HTTP com Range Requests
- Rota nova em `electron/server/http.ts`: `GET /midia/:assetId` (e `HEAD`), com `Accept-Ranges: bytes`.
- Autorização: token de mídia próprio da sessão, gerado com CSPRNG (32 bytes, base64url) pelo `SessionManager`,
  entregue ao Guest **só dentro do canal cifrado** (nunca no convite, nunca no QR, nunca em log). Comparação em tempo
  constante (`crypto.timingSafeEqual`, com tamanhos normalizados antes de comparar). O token morre com a sessão.
- O asset pedido precisa pertencer à sessão ativa (`sessionManager.sessaoId`); asset de outra sessão responde **404**
  (não 403 — não vaze a existência). Resposta de erro nunca contém caminho de disco.
- Range: `bytes=0-0`, `bytes=0-`, `bytes=-500` (sufixo), faixa além do fim (satura no tamanho real), `bytes=5-2` → 416
  com `Content-Range: bytes */<tamanho>`, `bytes=abc` → 416, multi-range (`bytes=0-10,20-30`) → 416 (não implemente
  multipart em V1). Status 206 com `Content-Range` e `Content-Length` corretos; 200 só quando não há cabeçalho `Range`.
- `Content-Type` vem do MIME gravado no banco (allowlist do M2), com `X-Content-Type-Options: nosniff` (já global).

### M4 — Quadro sobre imagem (anotação por cima, original intacto)
- Aba `image`: a imagem entra como **fundo** do canvas Fabric (`src/shared/canvas/engine.ts`), escalada para caber,
  respeitando `devicePixelRatio` (host 3840x2160 @150%, ADR-003). O fundo **não** é selecionável, não é movido pelas
  ferramentas (regra do D12) e **não vira evento** — os traços continuam sendo `DRAW_ADD` por cima.
- O arquivo original nunca é modificado: prove comparando o sha256 do arquivo em disco antes e depois de anotar.
- Prova obrigatória por **pixel em captura de tela real** (`page.screenshot` + contagem de pixels), nunca lendo só o
  buffer do canvas — lição do post-mortem `docs/reviews/postmortem-desenho-some.md`.

### M5 — PDF (pdf.js) no Host e no Guest
- Dependência nova ⇒ **ADR obrigatório** em `docs/ADR/013-pdfjs-renderizacao.md` (versão, motivo, worker, licença).
- Renderize a página atual em canvas e use como fundo da aba `pdf`, igual ao M4. Navegação de página é **ação exclusiva
  do Host** em V1: tipo novo `PDF_PAGE` (payload `{ tabId, pagina }`) acrescentado a `PROTOCOL_MESSAGE_TYPES`, a
  `ACOES_EXCLUSIVAS_HOST` em `src/shared/autoridade.ts` e à validação de payload de `src/shared/events/protocol.ts`.
  Guest emitindo `PDF_PAGE` é rejeitado (teste de ataque obrigatório).
- Anotação é **por página**: cada página é um contexto de desenho próprio; voltar e avançar a página tem que trazer de
  volta exatamente os traços daquela página (teste de ida e volta com contagem de elementos e prova de pixel).
- Se a CSP do Guest (`src/shared/csp.ts`, ADR-005) precisar mudar (ex.: `worker-src`), registre em
  `docs/ADR/014-csp-worker-pdfjs.md` e **valide a CSP no artefato final** (build empacotado), não só em dev — lição da Fase 01.

### M6 — Mídia sincronizada (vídeo/áudio) com o servidor como relógio mestre
- Tipo novo `CLOCK_SYNC` (transporte, entra em `ACOES_TRANSPORTE`): o Guest manda `t0`, o Host devolve `{ t0, t1 }` e o
  Guest estima o deslocamento do relógio. **Limite obrigatório**: no máximo 1 `CLOCK_SYNC` por segundo por conexão, com
  teste que tenta estourar (rajada de 50) e prova que o excedente é descartado sem derrubar a conexão.
- `MEDIA_CONTROL` (e `PLAY`/`PAUSE`/`SEEK`) passam a carregar `serverTs` e `playing`; a posição do Guest é
  `mediaTime + (agora_corrigido − serverTs)` enquanto estiver tocando.
- Correção de deriva **suave**, com constantes exportadas e testadas: diferença acima de `DERIVA_SEEK_SEGUNDOS` (0,5 s)
  corrige por `seek`; entre `DERIVA_AJUSTE_SEGUNDOS` (0,08 s) e 0,5 s corrige por `playbackRate` na faixa 0,97–1,03 até
  zerar, e volta a 1,0. Teste determinístico com relógio falso injetado: injete 300 ms de deriva e prove a convergência
  registrando os **números em ms** (não "ficou bom").
- Guest só controla mídia com `UNLOCK_MEDIA` ligado — a matriz `canGuestExecuteAction` já faz isso; o seu teste tem que
  **tentar violar** (Guest manda `PLAY` sem unlock, e de novo com a tela bloqueada) e provar a rejeição por
  `MEDIA_LOCKED` e `SCREEN_LOCKED`. Volume e mudo continuam locais no Guest (nunca sincronizados).

### M7 — Guest: aba de mídia usável no celular
- Homologação mental: Motorola Edge 70 Pro, Android 16, sistema em inglês, mobile-first, eventos de toque.
- O Guest carrega a mídia pela rota do M3 com o token do M3, mostra `<img>`, o canvas do PDF e `<video>`/`<audio>`, e
  continua podendo desenhar por cima quando a aba é `image` ou `pdf`.
- Autoplay bloqueado pelo navegador **não pode** travar a sincronia: se o `play()` falhar, mostre o aviso para o usuário
  tocar e reentre na sincronia quando ele tocar (esse caminho precisa de teste).

### M8 — Arquivamento no encerramento da sessão
- Ao encerrar (`electron/services/sessao.service.ts`, método `encerrar`), copie os assets da sessão para
  `%APPDATA%/OneToOneSupport/atendidos/<slug_atendido>/<YYYYMMDD_HHMM_sessao_id>/` (raiz também com override por
  `ONETOONE_ARQUIVO_DIR`, para teste).
- `slug` seguro e único (sem caractere proibido no Windows, sem nome reservado, colisão resolvida com sufixo).
- **Confira o sha256 depois de copiar**; só marque como arquivado o que passou. Nunca apague a origem antes da
  conferência. Falha no meio (disco cheio, destino já existente, arquivo em uso) não perde nada e devolve
  `ARQUIVAMENTO_FALHOU` com a lista do que ficou pendente; repetir o encerramento retoma de onde parou (idempotente).
- Teste real em diretório temporário: crie os arquivos, encerre, **liste fisicamente** a pasta e compare os hashes.

### M9 — Dívidas herdadas da revisão anterior (`docs/reviews/fase-08.md`) — obrigatórias
1. **Tipar o funil remoto:** `aplicarEventoRemoto(event: any)` em `src/host/store/useHostStore.ts` e o `onGuestEvent` de
   `src/shared/ipc-contract.ts` passam a receber um DTO tipado (ex.: `GuestEventDTO`); elimine o `as any` do `.includes`
   da allowlist (o auditor marca `TIPO_SUPRIMIDO`). Todas as validações do D17 continuam valendo.
2. **Reavaliar a regra de aba divergente com abas de verdade:** com o Host na aba B e o Guest desenhando na aba A, o
   evento é descartado da tela (correto), mas **não pode haver perda de dado**: prove que o evento foi gravado no SQLite
   e que ao trocar para a aba A o traço aparece (contagem de elementos + prova de pixel em captura de tela).
3. **O isolamento do quadro em leitura continua valendo com abas e mídia:** sessão encerrada aberta em "somente
   leitura" não importa asset, não controla mídia, não emite nada e não recebe evento do Guest de uma aula viva.
   Reexecute o ataque do chefe `Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs`
   **gravando as capturas novas com carimbo de data no nome** — é proibido sobrescrever `leitura-antes.png` e
   `leitura-depois.png`, que são a prova do defeito original.

### M10 — Sonda, testes e evidência
- Estenda `tools/probe-runtime.cjs` com uma seção **V6** que, no app **buildado** (`npm run verify` já roda `probe`):
  cria a sessão, importa uma imagem PNG e um PDF gerados em diretório temporário, cria as abas dos dois tipos, conecta o
  Guest emulado **pelo IP da LAN do convite** (não 127.0.0.1), troca de aba e prova com **captura de tela real e
  contagem de pixels** que: (a) a imagem aparece no Host e no Guest; (b) o traço fica **por cima** da imagem; (c) trocar
  de aba e voltar preserva os traços; (d) o quadro em leitura não recebe nada.
- Testes novos, cada regra com pelo menos um teste que tenta **violá-la**: `tests/abas.test.ts`, `tests/assets.test.ts`
  (sanitização com lista de nomes maliciosos, MIME falsificado — PNG com conteúdo de PDF e vice-versa, limite de
  tamanho, import interrompido), `tests/midia-range.test.ts` (todos os casos do M3), `tests/midia-sync.test.ts` (deriva
  em ms, limite do `CLOCK_SYNC`, `PLAY` sem `UNLOCK_MEDIA`), `tests/arquivamento.test.ts` (hash pós-cópia, falha
  parcial, idempotência).
- Nada de vermelho na UI nova (o auditor reprova). Nenhuma regra de negócio no renderer (`src/` não importa `fs`,
  `path`, `electron` nem `better-sqlite3`, e não escreve SQL).

## Verificação e autoauditoria (seção "Autoauditoria obrigatória" do `AGENTS.md`)
1. Clone limpo da sua branch **fora** do projeto, `npm ci`, `npm run verify` lá; cole a saída real.
2. Gate: `npm run verify` (typecheck + build + test + probe) verde, com a V6 dentro da sonda.
3. Rode `node tools/auditar.cjs` antes de declarar pronto e corrija o que ele apontar.
4. Escreva `docs/reviews/autoauditoria-08-abas-midia.md`: cada ID (M1..M10) → comando → **saída real** → PASS/FAIL, mais
   a lista explícita do que **NÃO** foi verificado. Prova prometida = prova entregue: onde está escrito pixel ou captura
   de tela, a evidência tem que ser de pixel/captura de tela de verdade (`tools/checar-provas.cjs`).
5. Atualize `docs/HANDOFF.md` (com o resumo em português simples para o Alexandre), commite em passos pequenos e **pare**.

## Aceite (o chefe reexecuta tudo e tenta quebrar)
- Abas persistem, reordenam sem buraco e sincronizam Host↔Guest.
- Asset importado com MIME por assinatura, limite respeitado, nome malicioso neutralizado, nada gravado fora da raiz de assets.
- `/midia/:assetId` responde 206 com `Content-Range` correto, 416 nas faixas inválidas, 404 para asset de outra sessão e
  403 sem token válido — com comparação em tempo constante.
- Imagem e PDF aparecem no Host e no celular emulado, com anotação por cima e o original com o mesmo sha256.
- Vídeo e áudio sincronizados com deriva medida e **registrada em ms** (alvo: menos de 200 ms na LAN depois de convergir).
- Encerramento arquiva os assets com hash conferido e a pasta **listada fisicamente** na evidência.
- As 3 dívidas do M9 fechadas, com o ataque de leitura reexecutado sem sobrescrever a prova antiga.

## Não fazer
Não implemente o relatório em PDF (Fase 09) nem o empacotamento/CI (Fase 10). Não mude a stack, a ordem das fases nem os
critérios de aceite — divergência exige ADR em `docs/ADR/` e aviso no HANDOFF. **Nunca** `git push` nem merge.
