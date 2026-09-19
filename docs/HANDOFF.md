# HANDOFF DE ESTADO — FASE 01: Scaffolding e Banco de Dados

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `.gitignore`, `.gitattributes`, `.npmrc`
  - `package.json`, `package-lock.json`, `electron-builder.yml`, `tsconfig.base.json`, `tsconfig.json`, `tsconfig.electron.json`, `vite.config.ts`, `vitest.config.ts`
  - `electron/main.ts`, `electron/preload.ts`
  - `electron/db/connection.ts`
  - `electron/db/migrations/001_init.sql`
  - `electron/db/repositories/atendido.repo.ts`, `electron/db/repositories/configuracao.repo.ts`
  - `src/main.tsx`, `index.html`
  - `scripts/dev.mjs`, `scripts/test-runner.mjs`, `scripts/verify-ui.mjs`
  - `tests/db.test.ts`
  - `docs/ADR/001-rede-local-lan.md`
  - `docs/ADR/002-criptografia-e2ee.md`
  - `docs/ADR/003-canvas-hidpi-escalonamento.md`
  - `docs/ADR/004-node-abi-modulos-nativos.md`
  - `docs/ADR/005-csp-guest-websocket.md`
  - `docs/ADR/006-regra-duplicidade-soft-delete.md`
  - `docs/electron-window.png`
* Estado Atual: Scaffolding completo e banco SQLite estruturado. As 7 tabelas da seção 9 foram migradas sem desvios. O repositório implementa estritamente a validação atômica com `INSERT INTO ... SELECT ... WHERE NOT EXISTS (SELECT 1 ... WHERE col IS ?)` com comparação estrita de nulidade via `IS`. A suíte com 15 testes vitest roda 100% verde sob a ABI do Electron (`ELECTRON_RUN_AS_NODE=1`). O shell do Electron foi inicializado e auditado em runtime via Chrome DevTools Protocol com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, confirmando `typeof require` e `typeof process` como `undefined`, scale factor de 150% detectado e captura de tela registrada em `docs/electron-window.png`.
* Próximo Passo Lógico: Mesclar branch `fase/01-scaffolding-db` em `main` (pelo Alexandre) e executar `docs/prompts/fase-02-servicos-ipc-host.md` na branch `fase/02-servicos-ipc-host`.
* Decisões Críticas Tomadas:
  - ADR-001: Comunicação em LAN na V1.0 com porta dinâmica e endpoint configurável.
  - ADR-002: Criptografia com derivação via `crypto_kx` e ChaCha20-Poly1305 IETF.
  - ADR-003: HiDPI do Fabric 6 com prevenção contra dupla aplicação de escala.
  - ADR-004: Módulos nativos vinculados à ABI do Electron e testes executados com `ELECTRON_RUN_AS_NODE=1`.
  - ADR-005: CSP ajustada com `connect-src ws: wss:` e `img-src/media-src blob: data:`.
  - ADR-006: Escopo de duplicidade abrange toda a tabela `Atendidos` (inclusive soft deleted `ativo=0`) para preservar a integridade histórica e reativação via serviço de domínio.
* Divergências da Spec: Correção aprovada pelo chefe técnico do SQL do Mestre para `INSERT INTO ... SELECT ... WHERE NOT EXISTS (...)` e uso de `IS ?` para tratamento correto de nulidade no SQLite.

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm ci`
```
$ npm ci
npm warn Unknown project config "puppeteer_skip_download". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "runtime". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "target". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "disturl". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn skipping integrity check for git dependency ssh://git@github.com/electron/node-gyp.git

added 636 packages, and audited 637 packages in 42s

95 packages are looking for funding
  run `npm fund` for details

24 vulnerabilities (3 moderate, 19 high, 2 critical)
```

### 2. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 3. Saída Real de `npm test` (sob ABI do Electron - ADR-004)
```
$ npm test
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

[Test-Runner] Executando vitest sob ABI do Electron (C:\desenv\utils\OneToOneSupport\node_modules\electron\dist\electron.exe) com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > deve conter exatamente as 7 tabelas de negócio e a tabela de controle de migrações
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela ConfiguracaoGlobal deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Atendidos deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Sessoes deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Sessoes_Revisoes deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Abas deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Eventos deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > 8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md) > tabela Assets deve ter as colunas exatas da seção 9
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 1. deve criar um novo atendido com sucesso (insert novo)
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 2. deve rejeitar duplicado exato retornando existingId
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 3. deve rejeitar duplicado com contato/email/notas NULL (o caso que = deixaria passar)
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 4. deve permitir criação se houver diferença em pelo menos um único campo de negócio
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 5. update que geraria duplicata com outro registro existente é rejeitado
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?) > 6. rodar createAtendido 1000x com os mesmos dados deixa exatamente 1 linha no banco
[DB] Migração aplicada com sucesso: 001_init.sql

stdout | tests/db.test.ts > Fase 01 - Scaffolding e Banco de Dados (SQLite) > ConfiguracaoGlobal Repository - Regra Técnica #1 > 7. setConfig rejeita duplicata de valor e 1000x deixa exatamente 1 linha
[DB] Migração aplicada com sucesso: 001_init.sql

 ✓ tests/db.test.ts (15 tests) 275ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  18:38:37
   Duration  1.59s (transform 103ms, setup 0ms, collect 276ms, tests 275ms, environment 0ms, prepare 374ms)
```

### 4. Saída Real de `npm run build`
```
$ npm run build
> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 30 modules transformed.
rendering chunks...
computing gzip size...
dist/renderer/index.html                  0.78 kB │ gzip:  0.48 kB
dist/renderer/assets/index-BrguzYHk.js  145.78 kB │ gzip: 46.86 kB
✓ built in 1.29s
```

### 5. Saída Real da Abertura da Janela do Electron (`npm run dev` / Runtime Audit)
```
[Verify-UI] Iniciando Electron com --remote-debugging-port=9222...
[Electron Stderr] DevTools listening on ws://127.0.0.1:9222/devtools/browser/f47a4566-33b9-4b5e-af85-9c824fa6e28d
[Electron Stdout] [Main] Banco de dados SQLite inicializado com sucesso.
[Electron Stdout] [Main] Monitor primário detectado: 2560x1440 @ 150% scale factor (Área útil de trabalho: 2560x1392)
[Verify-UI] Conectando ao Electron via Chrome DevTools Protocol...
[Verify-UI] Páginas abertas no Electron: 1

================ RESULTADOS DA VERIFICAÇÃO EM RUNTIME ================
• typeof require: undefined
• typeof process: undefined
• document.title: OneToOneSupport
• devicePixelRatio: 1.5

--- Texto Renderizado na Janela ---
OneToOneSupport

Fase 01: Scaffolding e Banco de Dados | Versão: 1.0.0

Segurança em Runtime
contextIsolation: ATIVO
nodeIntegration: DESATIVADO
sandbox: ATIVO
typeof require: 'undefined'
typeof process: 'undefined'
Display & HiDPI (Regra #2)
window.devicePixelRatio: 1.5
Scale Factor Host: 150%
Resolução Primária: 2560 x 1440
Target de Homologação: 3840x2160 @150%
Banco SQLite WAL ativado • 7 tabelas migradas • Validação estrita via NOT EXISTS
=====================================================================

[Verify-UI] Screenshot salvo em: C:\desenv\utils\OneToOneSupport\docs\electron-window.png
[Verify-UI] Electron encerrado normalmente.
```

**Evidência Visual:** Captura salva em `docs/electron-window.png` comprovando interface nítida sem artefatos ou elementos em vermelho.
