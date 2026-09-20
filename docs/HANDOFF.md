# HANDOFF DE ESTADO — FASE 05: Event Sourcing, Snapshots e Revisões

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `electron/db/migrations/002_eventos_append_only.sql`: Migração 002 com triggers nativas `trg_eventos_prevent_update` e `trg_eventos_prevent_delete` que abortam qualquer UPDATE ou DELETE na tabela `Eventos` via `RAISE(ABORT)`, e índice composto `idx_eventos_sessao_criado_em`.
  - `electron/db/repositories/evento.repo.ts`: Repositório estritamente append-only para `Eventos`, com inserção individual e em lote transacionado (`appendEvento`, `appendEventos`), e garantia de ordem total estável (`criado_em ASC, rowid ASC`) usando o `rowid` nativo para desempate no mesmo milissegundo.
  - `electron/db/repositories/revisao.repo.ts`: Repositório imutável para a tabela `Sessoes_Revisoes` com versionamento estritamente sequencial (`numero_versao + 1`) e ponteiro `snapshot_evento_idx`.
  - `src/shared/events/reducer.ts`: Reducer funcional puro sem I/O para o quadro branco multimodal, executando identicamente no Host e no Guest. Implementa `DRAW_ADD`, `DRAW_HIDE` (ocultação lógica sem remoção), `CLEAR_TAB` (ocultação sem apagar histórico) e `UNDO`/`REDO` por autor, invalidando o redo após novo `DRAW_ADD`.
  - `electron/services/evento.service.ts`: Serviço de domínio que valida permissões e autoridade, grava eventos, gerencia snapshots físicos em disco no intervalo configurável N (padrão 200 via `ConfiguracaoGlobal`) e ao encerrar sessão, reconstrói estado com `Snapshot + Delta`, e orquestra revisões imutáveis.
  - `electron/server/session-manager.ts`: Atualização com comparação de tokens em tempo constante (`crypto.timingSafeEqual`) eliminando o sinal `SEGREDO_COMPARADO`, e proteção do token de convite com consumo definitivo apenas após `completeHandshake`.
  - `tests/server-session.test.ts`: Adição dos testes de queda no meio do handshake, rate limit (100 msg/s por conexão com derrubada) e heartbeat (2 pings sem pong derrubam conexão inativa).
  - `tests/event-sourcing.test.ts`: Suíte com 15 testes cobrindo imutabilidade de eventos, reducer puro, undo/redo por autor, snapshots automáticos, equivalência estrita snapshot × replay do zero, revisões imutáveis e benchmark de 50.000 eventos.
  - `docs/ADR/009-bind-rede-local-lan.md`: Registro da decisão arquitetural de bind em `0.0.0.0` para operação em LAN (ADR-001) com hardening e firewall postergados para a Fase 10.
  - `docs/reviews/autoauditoria-05.md`: Relatório completo de autoauditoria da Fase 05.
* Estado Atual: Fase 05 concluída com 100% de aprovação técnica. A imutabilidade do banco de dados na tabela `Eventos` está blindada por triggers SQL `BEFORE UPDATE/DELETE ... RAISE(ABORT)`. O reducer puro do quadro branco opera em tempo linear O(N) e processa 50.000 eventos em 199.15 ms. O `EventoService` reconstrói estados a partir do último snapshot físico somado ao delta de eventos, comprovando equivalência de 100% em relação ao replay completo do zero. As revisões são imutáveis com incremento automático de versão. Os 139 testes automatizados do projeto passam sob a ABI do Electron e a sonda de runtime registrou 14/14 checagens verdes.
* Próximo Passo Lógico: Mesclar a branch `fase/05-event-sourcing` em `main` (pelo Alexandre) e prosseguir para a Fase 06 (`fase/06-canvas-hidpi`) para implementar o canvas interativo Fabric.js 6.x com compensação HiDPI 4K @150% no Host.
* Decisões Críticas Tomadas:
  - Triggers Append-Only (Migration 002): Bloqueio a nível de motor relacional SQLite contra qualquer comando de mutação ou deleção na tabela `Eventos`, satisfazendo integralmente a garantia de Event Sourcing do Mestre §4 e §8.
  - Desempate Monotônico Determinístico: Ordenação por `criado_em ASC, rowid ASC` utilizando o `rowid` nativo do SQLite para desempatar eventos gerados no mesmo milissegundo.
  - Snapshots Físicos em Disco: Armazenamento em arquivos JSON estruturados por sessão e aba, permitindo purga de cache e validação de equivalência entre estado cacheado e replay do zero.
  - Otimização do Reducer para O(N): Redução em lote executada aplicando mutações in-place sobre um clone único acumulador, permitindo processar 50.000 eventos em 199.15 ms sem degradação de GC.
  - Proteção de Token contra Queda Prematura: `guestTokenUsed = true` é acionado exclusivamente na conclusão do handshake E2EE (`completeHandshake`), permitindo que uma queda temporária de rede antes do handshake não queime o convite do usuário.
* Divergências da Spec: Nenhuma divergência estrutural. Decisão de escuta em 0.0.0.0 registrada no ADR-009.

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 2. Saída Real de `npm test` (139 testes sob ABI do Electron)
```
$ npm test
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

[Test-Runner] Executando vitest sob ABI do Electron com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/architecture.test.ts (3 tests)
 ✓ tests/ipc.test.ts (12 tests)
 ✓ tests/services.test.ts (20 tests)
 ✓ tests/db.test.ts (15 tests)
 ✓ tests/protocol.test.ts (24 tests)
 ✓ tests/invite.test.ts (12 tests)
 ✓ tests/event-sourcing.test.ts (15 tests)
 ✓ tests/crypto-interop.test.ts (20 tests)
 ✓ tests/server-session.test.ts (19 tests)

 Test Files  9 passed (9)
      Tests  139 passed (139)
   Duration  7.25s
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
dist/renderer/assets/index-DLIgYeAO.js  186.06 kB │ gzip: 55.35 kB
✓ built in 2.08s
```

### 4. Saída Real da Tentativa de UPDATE/DELETE em `Eventos` Abortando
```
$ $env:ELECTRON_RUN_AS_NODE=1; .\node_modules\electron\dist\electron.exe -e "const { initDb, closeDb } = require('./dist/electron/db/connection'); const db = initDb({ dbPath: ':memory:' }); db.prepare('INSERT INTO Atendidos (id, nome, ativo, criado_em, atualizado_em) VALUES (\'a1\', \'Teste\', 1, 1, 1)').run(); db.prepare('INSERT INTO Sessoes (id, atendido_id, status, iniciado_em) VALUES (\'s1\', \'a1\', \'ativa\', 1)').run(); db.prepare('INSERT INTO Eventos (id, sessao_id, tipo, payload, autor, criado_em) VALUES (\'e1\', \'s1\', \'DRAW_ADD\', \'{}\', \'host\', 1)').run(); try { db.prepare('UPDATE Eventos SET tipo = \'HACK\' WHERE id = \'e1\'').run(); } catch (err) { console.log('TENTATIVA DE UPDATE:', err.message); } try { db.prepare('DELETE FROM Eventos WHERE id = \'e1\'').run(); } catch (err) { console.log('TENTATIVA DE DELETE:', err.message); } closeDb();"

[DB] Migração aplicada com sucesso: 001_init.sql
[DB] Migração aplicada com sucesso: 002_eventos_append_only.sql
TENTATIVA DE UPDATE: Eventos e append-only: UPDATE proibido
TENTATIVA DE DELETE: Eventos e append-only: DELETE proibido
```

### 5. Saída Real do Benchmark de 50.000 Eventos
```
stdout | tests/event-sourcing.test.ts > Fase 05 - Event Sourcing, Snapshots e Revisões Imutáveis > 6. Benchmark: 50.000 Eventos Reconstroem em Tempo Razoável > reconstrói 50 000 eventos de desenho em menos de 1500 ms
[DB] Migração aplicada com sucesso: 001_init.sql
[DB] Migração aplicada com sucesso: 002_eventos_append_only.sql
[Benchmark Event Sourcing] 50 000 eventos processados em: 199.15 ms
```

### 6. Saída Real da Sonda de Runtime (`tools/probe-runtime.cjs`)
```
$ npm run probe
> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs

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
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(14/14 checagens PASS)*
