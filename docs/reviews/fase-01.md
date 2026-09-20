# Revisão da Fase 01 — Scaffolding e Banco de Dados
Revisor: Claude Code (chefe técnico). Commit auditado: `fb3227f`. Executor: Antigravity (agy).

## Veredito: APROVADA (com 2 correções aplicadas pelo chefe nesta branch)

## O que foi executado pelo revisor (não copiado do relato do executor)
| Verificação | Resultado |
| --- | --- |
| Clone limpo da branch + `npm ci` | OK (audit reporta 24 vulnerabilidades, ver pendências) |
| `npm run typecheck` | OK, sem erros |
| `npm test` (vitest sob ABI do Electron, `ELECTRON_RUN_AS_NODE=1`) | 15/15 passaram, também no clone limpo |
| `npm run build` | OK |
| App aberto de verdade (Electron + CDP) | `typeof require` e `typeof process` = `'undefined'`; `window.desktopAPI` expõe só 3 métodos; `devicePixelRatio` = 1.5; monitor 2560x1440 lógicos = 3840x2160 físicos @150%; sem erro de página |
| Captura de tela | UI legível, tema azul-escuro/verde/ciano, **sem vermelho** |
| Leitura de `001_init.sql` | 7 tabelas idênticas à seção 9; só índices extras em FK, sem UNIQUE substituto |
| Leitura do `atendido.repo.ts` | `INSERT ... SELECT ... WHERE NOT EXISTS (... nome IS ? AND contato IS ? AND email IS ? AND notas IS ?)` em transação; UPDATE checa `id != ?` |
| Leitura dos testes | O teste de NULL cobre o caso em que `=` deixaria passar; os de 1000 repetições conferem a contagem no banco |

## Defeitos encontrados
1. **CSP não valia em produção (corrigido).** O `main.ts` aplica a CSP por `onHeadersReceived`, que não vale para páginas `file://`.
   Prova do defeito: em runtime, `new Function('return 1')()` executava (CSP ausente). Correção: `<meta http-equiv="Content-Security-Policy">` injetado no HTML só no build
   (`vite.config.ts`, plugin `csp-meta`, `order: 'post'`). Prova da correção (3 execuções seguidas): `eval` bloqueado, `<script>` inline injetado **não executa**, eventos
   `securitypolicyviolation` disparam, bundle continua renderizando. Nota: uma execução intermediária, com a meta já presente, ainda mostrou o `eval` como não bloqueado; não consegui explicar. As 3 execuções finais e o teste de script inline concordam.
2. **`updateAtendido` ignorava `info.changes` (corrigido).** Retornava `updated: true` mesmo que o UPDATE não alterasse linha. Agora retorna `NOT_FOUND` nesse caso. Sem teste novo (o caminho é inalcançável pela pré-checagem dentro da transação).

## Ressalvas e pendências (não bloqueiam)
- **`npm audit`: 24 vulnerabilidades (2 críticas, 19 altas).** Vêm de dependências antigas fixadas por spec (puppeteer 22, electron-builder 24 etc.). Tratar na fase 10, com avaliação de cada uma.
- **Modo `npm run dev` não foi verificado.** O header CSP do `main.ts` (`script-src 'self'`) pode bloquear o script inline do React Fast Refresh do Vite. Verificar na fase 02, quando a UI real existir.
- **`.npmrc`** com `runtime=electron`, `target`, `disturl` gera avisos no npm 11 e faz todo `npm install` compilar nativos para o Electron. É a escolha do ADR-004; só registrar.
- **`workspaces: ["packages/*"]`** aponta para uma pasta que não existe. Inofensivo por ora.
- **ADR-006 (duplicidade inclui atendidos com `ativo=0`)** é uma escolha razoável e coerente com a ordem de serviço; `ativo`/`deletado_em` não entram na comparação. Mantida.
- `sodium-native` e `libsodium-wrappers-sumo` estão como dependências, mas só serão exercitados na fase 03. Não foi verificado que `sodium-native` carrega na ABI do Electron.
- O `.gitignore` local do Alexandre tem uma linha `node_modules` extra, sem commit. Redundante, sem efeito.

## Checklist do AGENTS.md
- [x] Nenhuma ausência declarada sem busca (não se aplica a esta fase).
- [x] Sintoma repetido investigado (a divergência do teste de `eval` foi investigada; ver defeito 1).
- [x] Feature com UI aberta e usada de verdade.
- [x] Nenhum pipeline declarado pronto.
- [x] Afirmações do HANDOFF conferidas contra o código atual.
