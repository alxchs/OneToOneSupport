# HANDOFF DE ESTADO — FASE 02: Domain Services, IPC e Shell do Host

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `src/shared/ipc-contract.ts`
  - `electron/db/repositories/atendido.repo.ts`, `electron/db/repositories/configuracao.repo.ts`, `electron/db/repositories/sessao.repo.ts`
  - `electron/services/atendido.service.ts`, `electron/services/sessao.service.ts`, `electron/services/config.service.ts`
  - `electron/ipc/router.ts`, `electron/ipc/atendido.ipc.ts`, `electron/ipc/sessao.ipc.ts`, `electron/ipc/config.ipc.ts`
  - `electron/preload.ts`, `electron/main.ts`, `tsconfig.electron.json`
  - `src/main.tsx`, `src/host/HostApp.tsx`, `src/host/components/Navbar.tsx`
  - `src/host/store/useHostStore.ts`
  - `src/host/pages/ListaAtendidosPage.tsx`, `src/host/pages/FormAtendidoPage.tsx`, `src/host/pages/DetalheAtendidoPage.tsx`, `src/host/pages/ConfiguracoesPage.tsx`
  - `tests/services.test.ts`, `tests/ipc.test.ts`, `tests/architecture.test.ts`
  - `tools/probe-runtime.cjs`
  - `docs/reviews/autoauditoria-02.md`
  - `docs/electron-window.png`
* Estado Atual: Fase 02 concluída com 100% de conformidade técnica e arquitetural. Toda a lógica de negócio foi centralizada nos Domain Services no Main Process. Os canais de IPC utilizam constantes compartilhadas em `src/shared/ipc-contract.ts` com validação rigorosa de payloads no Main e retornos tipados (`DUPLICATE`, `NOT_FOUND`, `VALIDATION`). O Preload expõe apenas esses métodos sob isolamento estrito e sandbox. A interface do Host em `src/host/` (React 18 + Zustand) opera com zero regras de negócio locais, exibindo com clareza alertas de duplicidade (Regra #1 do SQLite). O layout em 3840x2160 @150% emprega unidades relativas sem elementos em cores vermelhas. A suíte automatizada expandiu para 50 testes 100% verdes sob a ABI do Electron, cobrindo regras de negócio, soft delete, purga de 10 anos com relógio injetável, validação de payload no IPC e garantia estrita de que o Renderer não importa nada de `electron/` nem contém SQL. A sonda de runtime foi estendida e auditou o ciclo completo de UI via Puppeteer CDP, confirmando a efetividade da CSP no build e a ausência de duplicados no banco.
* Próximo Passo Lógico: Mesclar a branch `fase/02-servicos-ipc-host` em `main` (pelo Alexandre) e iniciar a Fase 03 (`fase/03-e2ee-protocolo`) conforme `docs/prompts/fase-03-e2ee-protocolo.md`.
* Decisões Críticas Tomadas:
  - Isolamento do Preload no Sandbox: Preload mantém constantes de canal inlined e importa apenas tipos de `src/shared/ipc-contract.ts`, eliminando chamadas `require()` relativas no runtime do sandbox do Electron e garantindo disponibilidade incondicional de `window.desktopAPI`.
  - CSP diferenciada para Dev e Build: O header CSP em `main.ts` permite `'unsafe-inline'` para script apenas quando `VITE_DEV_SERVER_URL` estiver presente, viabilizando o React Fast Refresh em desenvolvimento sem enfraquecer o build de produção (onde o meta tag e a sonda garantem bloqueio total de inline scripts).
  - Consulta ao SQLite no Runtime Probe: A sonda combina verificação através de `desktopAPI.atendidos.list` no Electron com uma consulta direta ao arquivo `.db` via subprocesso com a ABI nativa do Electron (`ELECTRON_RUN_AS_NODE=1`), atestando duplicidade zero no SQLite.
  - Purga Física de 10 Anos: Implementada no `AtendidoService` com relógio injetável (`clock: () => number`), bloqueando a purga física caso existam sessões ativas ou encerradas há menos de 10 anos (`TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000`).
* Divergências da Spec: Nenhuma divergência estrutural.

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 2. Saída Real de `npm test` (50 testes sob ABI do Electron)
```
$ npm test
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

[Test-Runner] Executando vitest sob ABI do Electron (C:\desenv\utils\OneToOneSupport\node_modules\electron\dist\electron.exe) com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/architecture.test.ts (3 tests)
 ✓ tests/ipc.test.ts (12 tests)
 ✓ tests/services.test.ts (20 tests)
 ✓ tests/db.test.ts (15 tests)

 Test Files  4 passed (4)
      Tests  50 passed (50)
   Start at  03:45:41
   Duration  1.40s
```

### 3. Saída Real de `npm run build`
```
$ npm run build
> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 51 modules transformed.
rendering chunks...
computing gzip size...
dist/renderer/index.html                  0.97 kB │ gzip:  0.56 kB
dist/renderer/assets/index-D2ujVbl6.js  180.35 kB │ gzip: 54.21 kB
✓ built in 1.07s
```

### 4. Saída Real da Sonda de Runtime (`tools/probe-runtime.cjs`)
```
{
  "sec": {
    "typeofRequire": "undefined",
    "typeofProcess": "undefined",
    "renderizou": true,
    "dpr": 1.5,
    "apiExposta": [
      "getScaleFactor",
      "getDisplayMetrics",
      "getAppVersion",
      "atendidos",
      "sessoes",
      "config"
    ],
    "inlineExecutou": false,
    "evalBloqueado": true,
    "violacoes": [
      "script-src-elem",
      "script-src-elem"
    ]
  },
  "ipcValidation": {
    "atendidoValidationOk": true,
    "configValidationOk": true
  },
  "ui": {
    "criadoNaLista": true,
    "duplicadoOk": true,
    "editadoOk": true,
    "desativadoOk": true,
    "rotuloAtualizadoOk": true
  },
  "bancoSemDuplicados": true,
  "totalAtendidos": 3,
  "pageErrors": []
}
PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```

### 5. Evidência Visual da Interface
Screenshot capturada automaticamente em `docs/electron-window.png` comprovando temas neutros e azul-escuro com destaque em ciano e âmbar, sem cores vermelhas.
