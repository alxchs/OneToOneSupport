# ORDEM DE SERVIÇO — FASE 01: Scaffolding e Banco de Dados
Branch: `fase/01-scaffolding-db` (confirme com `git branch --show-current`; se não estiver nela, pare).
Você é executor. O chefe técnico é o Claude Code; escopo e critérios abaixo não são negociáveis.

## Leia primeiro
`AGENTS.md`, `docs/DOCUMENTO_MESTRE.md` (inteiro), `docs/FASES.md` (decisões ADR-001..005 e o erro do `INSERT ... WHERE NOT EXISTS`).

## Entregas
1. `.gitignore` exaustivo: Node, Vite, Electron/electron-builder (`release/`, `dist/`, `out/`), builds C++ nativos
   (`build/`, `*.node`, `*.obj`, `*.pdb`, `.node-gyp`), Puppeteer cache, `.env*`, `*.db`/`*.sqlite*`, logs, IDE, SO. Também `.gitattributes` com `* text=auto eol=lf` (exceto `*.ps1`/`*.cmd`).
2. `package.json` raiz com workspaces e `electron-builder.yml`, `tsconfig.base.json`. Dependências: `electron`, `vite`, `react`, `react-dom`, `better-sqlite3`, `fabric`(6.x), `sodium-native`, `libsodium-wrappers-sumo`, `zustand`, `express`(4), `ws`, `puppeteer`, mais dev: `typescript`, `vitest`, `@electron/rebuild`, tipos. `.npmrc` com `puppeteer_skip_download=true`.
   Versões fixas (sem `^` em nativos). Scripts: `dev`, `build`, `typecheck`, `test`, `rebuild`.
3. `electron/main.ts` e `electron/preload.ts`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP via header, bloqueio de navegação/`window.open`, preload expondo só `contextBridge` mínimo e tipado. Janela lê o scale factor do display (a máquina é 3840x2160 @150%) e nunca fixa pixels em CSS px de forma que quebre nesse cenário.
4. `electron/db/connection.ts` (abre em `%APPDATA%/OneToOneSupport/`, `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, runner de migrações com tabela de controle) e `electron/db/migrations/001_init.sql` com **exatamente as 7 tabelas** da seção 9, sem inventar colunas. Índices extras só em colunas de FK/consulta, sem UNIQUE que substitua a regra de duplicidade.
5. `electron/db/repositories/atendido.repo.ts` com `createAtendido(data)` e `updateAtendido(id, data)`:
   `INSERT INTO Atendidos (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM Atendidos WHERE nome IS ? AND contato IS ? AND email IS ? AND notas IS ?)`.
   Retornar resultado discriminado `{ created: true, id } | { created: false, reason: 'DUPLICATE', existingId }`. Fazer a checagem e o INSERT numa única instrução/transação. O UPDATE também só efetiva se o estado resultante não duplicar outro registro. Considerar `ativo`/`deletado_em` conforme regra do Mestre e documentar a escolha em ADR.
   Criar também `configuracao.repo.ts` com `setConfig(chave, valor)` sob a mesma regra (Regra #1 vale para `ConfiguracaoGlobal`).
6. ADRs `docs/ADR/001..005` conforme `docs/FASES.md` (curtos: contexto, decisão, consequência) + ADR-006 sobre a regra de `ativo` na duplicidade.
7. Testes vitest, rodando na ABI do Electron (ADR-004), cobrindo: insert novo; duplicado exato rejeitado; duplicado com contato/email/notas NULL rejeitado (o caso que `=` deixaria passar); diferença em um único campo cria; update que geraria duplicata é rejeitado; rodar `createAtendido` 1000x com os mesmos dados deixa 1 linha; `ConfiguracaoGlobal` idem; as 7 tabelas existem com as colunas exatas.

## Verificação obrigatória (cole as saídas reais no `docs/HANDOFF.md`)
`npm ci` · `npm run typecheck` · `npm test` · `npm run build` · abrir a janela do Electron de verdade (`npm run dev`), confirmar que sobe sem erro no console e sem `require` disponível no renderer (teste: `typeof require` e `typeof process` = `'undefined'` no DevTools), e anexar captura ou descrição do que viu.

## Critérios de aceite (o chefe vai reexecutar tudo)
Testes verdes na ABI do Electron; app abre; `contextIsolation` e `nodeIntegration` verificados em runtime, não só no código; SQL do repositório contém `NOT EXISTS` com `SELECT` e `IS`; nenhuma tabela/coluna fora da seção 9; `git status` limpo; nada de `push`.

## Não fazer
Não implementar serviços, IPC de negócio, UI, servidor, cripto ou canvas. Não trocar a stack. Não usar vermelho em nenhum ícone.

## Encerramento
Atualize `docs/HANDOFF.md` no formato da seção 17, commit(s) em português, e pare. Não faça merge.
