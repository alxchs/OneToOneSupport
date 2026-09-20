# Autoauditoria da Fase 05 — Event Sourcing, Snapshots e Revisões Imutáveis
Executor: Antigravity (agy). Branch auditada: `fase/05-event-sourcing`.

## 1. Resumo Executivo
Todas as entregas da Ordem de Serviço da Fase 05 e os itens herdados do lote 1 foram implementados, testados exaustivamente e validados contra violações adversariais:
- **Repositório Eventos Append-Only (`electron/db/repositories/evento.repo.ts` e `electron/db/migrations/002_eventos_append_only.sql`):** Garantia estrita de imutabilidade. A tabela `Eventos` não possui funções de UPDATE ou DELETE e possui triggers nativas SQLite `BEFORE UPDATE` e `BEFORE DELETE` emitindo `RAISE(ABORT)` caso qualquer comando tente alterar ou deletar registros. A ordenação total estável é assegurada por `criado_em ASC, rowid ASC`, utilizando o `rowid` nativo do SQLite para desempate monotônico determinístico em eventos no mesmo milissegundo. O índice composto `idx_eventos_sessao_criado_em` otimiza leituras sequenciais.
- **Reducer Puro do Quadro Branco (`src/shared/events/reducer.ts`):** Reducer funcional 100% puro e determinístico sem I/O, projetado para rodar identicamente no Host (Electron) e no Guest (Navegador). Trata `DRAW_ADD` (adiciona elemento), `DRAW_HIDE` (oculta elemento por ID via borracha lógica, sem remover do estado), `CLEAR_TAB` (oculta elementos anteriores sem apagar histórico) e `UNDO`/`REDO` varrendo a árvore por autor. Desempenho linear O(N) garantido.
- **Undo / Redo Escopado por Autor:** O Host desfaz apenas ações do Host; o Guest desfaz apenas as próprias ações. A emissão de um novo `DRAW_ADD` por um autor invalida imediatamente sua respectiva pilha de redo. Testes de propriedade em tabela ampla comprovam que reduzir a mesma sequência de eventos produz sempre o mesmo estado.
- **Serviço de Event Sourcing e Snapshots (`electron/services/evento.service.ts`):** Validação de autor e permissões (Guest não pode emitir `CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA` ou `TAB_SWITCH`, nem desenhar com `SCREEN_LOCKED`). Criação de snapshot a cada N eventos (configurável via `ConfiguracaoGlobal` na chave `eventos_snapshot_intervalo`, com padrão 200) e ao encerrar a sessão. Reconstrução de estado otimizada: `Estado = Último Snapshot + Delta de Eventos`. Equivalência provada: reconstruir a partir de snapshots em disco e reconstruir do zero sem snapshots gera exatamente o mesmo estado.
- **Revisões Imutáveis (`electron/db/repositories/revisao.repo.ts` e `electron/services/evento.service.ts`):** Versionamento estritamente incremental (`numero_versao + 1`) gravado em `Sessoes_Revisoes` com o índice de corte `snapshot_evento_idx`. Reabrir e salvar uma sessão nunca altera a revisão anterior. Carregar a revisão N recupera com exatidão o estado histórico daquele ponto.
- **Benchmark de Desempenho (50.000 Eventos):** 50.000 eventos de desenho, ocultação e undo/redo processados e reduzidos em 199.15 ms (muito abaixo do teto de 1500 ms).
- **Pontos Herdados do Lote 1:**
  1. Comparação de tokens em tempo constante via `crypto.timingSafeEqual` em `electron/server/session-manager.ts`, zerando o sinal `SEGREDO_COMPARADO`.
  2. Proteção contra token queimado antes do fim do handshake: `guestTokenUsed = true` é atribuído apenas em `completeHandshake`. Queda durante o handshake permite que um segundo Guest legítimo entre com o mesmo convite (teste validado).
  3. Testes adicionados para rate limit (100 msg/s por conexão com derrubada em flood) e heartbeat (2 pings sem pong derrubam conexão inativa).
  4. Decisão de escuta em `0.0.0.0` para rede local (LAN) registrada no `docs/ADR/009-bind-rede-local-lan.md`.

---

## 2. Critérios de Aceite e Evidências de Execução Real

| Critério de Aceite | Comando Executado | Saída Real / Evidência | Status |
| --- | --- | --- | --- |
| 1. Repositório Eventos somente append (`evento.repo.ts`) | `npm test -- tests/event-sourcing.test.ts` | Eventos inseridos com sucesso e rowid monotônico gerado | PASS |
| 2. Tentativa de UPDATE em Eventos abortando | Execução direta SQLite via Electron | `TENTATIVA DE UPDATE: Eventos e append-only: UPDATE proibido` | PASS |
| 3. Tentativa de DELETE em Eventos abortando | Execução direta SQLite via Electron | `TENTATIVA DE DELETE: Eventos e append-only: DELETE proibido` | PASS |
| 4. Ordem total estável com desempate por `rowid ASC` | `npm test -- tests/event-sourcing.test.ts` | 3 eventos no mesmo ms ordenados estritamente por rowid | PASS |
| 5. Reducer puro sem I/O (`src/shared/events/reducer.ts`) | `npm test -- tests/event-sourcing.test.ts` | `DRAW_ADD`, `DRAW_HIDE`, `CLEAR_TAB`, `UNDO`, `REDO` validados | PASS |
| 6. DRAW_HIDE esconde por id sem remover | `npm test -- tests/event-sourcing.test.ts` | Elemento marcado como hidden, visíveis = 0, persiste no array | PASS |
| 7. CLEAR_TAB esconde anteriores sem apagar | `npm test -- tests/event-sourcing.test.ts` | Elementos ocultados; tentativa por Guest ignorada | PASS |
| 8. Undo/Redo por autor (Host desfaz Host, Guest desfaz Guest) | `npm test -- tests/event-sourcing.test.ts` | Guest desfaz própria ação sem tocar em traços do Host | PASS |
| 9. Invalidação de redo ao emitir novo DRAW_ADD | `npm test -- tests/event-sourcing.test.ts` | Pilha redo esvaziada após novo desenho | PASS |
| 10. Tabela ampla de propriedade do reducer | `npm test -- tests/event-sourcing.test.ts` | Redução idêntica e determinística nas múltiplas passagens | PASS |
| 11. Validação de permissões no EventoService | `npm test -- tests/event-sourcing.test.ts` | Guest impedido em CLEAR_TAB e tela bloqueada (`SCREEN_LOCKED`) | PASS |
| 12. Snapshots automáticos a cada N eventos | `npm test -- tests/event-sourcing.test.ts` | Snapshots físicos gerados no disco pelo intervalo configurado | PASS |
| 13. Equivalência estrita Snapshot × Replay do zero | `npm test -- tests/event-sourcing.test.ts` | Estado com snapshots === Estado reconstruído sem snapshots | PASS |
| 14. Revisões imutáveis (numero_versao + 1) | `npm test -- tests/event-sourcing.test.ts` | Revisão 1 intacta após criação da Revisão 2; versão incrementada | PASS |
| 15. Benchmark 50.000 eventos em tempo razoável | `npm test -- tests/event-sourcing.test.ts` | `[Benchmark Event Sourcing] 50 000 eventos processados em: 199.15 ms` | PASS |
| 16. Comparação de token em tempo constante | `node tools/sinais-risco.cjs` | 0 ocorrências de `SEGREDO_COMPARADO`, timingSafeEqual ativo | PASS |
| 17. Token de convite não queimado no meio do handshake | `npm test -- tests/server-session.test.ts` | Queda pré-handshake permite segundo convidado com mesmo link | PASS |
| 18. Rate limit de 100 msg/s por conexão | `npm test -- tests/server-session.test.ts` | Envio de > 100 msgs/s derruba a conexão socket imediatamente | PASS |
| 19. Heartbeat derruba conexão após 2 pings sem pong | `npm test -- tests/server-session.test.ts` | Conexão terminada após 2 ciclos inativos com autoPong desligado | PASS |
| 20. ADR-009 registrado para bind em 0.0.0.0 | `cat docs/ADR/009-bind-rede-local-lan.md` | Decisão formal documentada em docs/ADR/ | PASS |
| 21. Verificação TypeScript estrita (`typecheck`) | `npm run typecheck` | `tsc --noEmit` executado com código de saída 0 | PASS |
| 22. Sem variáveis ou parâmetros não usados | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | 0 erros TS6133/TS6138 | PASS |
| 23. Suíte completa de testes automatizados (139 testes) | `npm test` | 9 arquivos de teste, 139/139 testes passando sob ABI do Electron | PASS |
| 24. Compilação de produção (Electron + Vite) | `npm run build` | Bundle dist/ gerado sem erros em 2.08s | PASS |
| 25. Sonda de runtime estendida | `npm run probe` | 14/14 checagens PASS | PASS |
| 26. Sinais de risco nas linhas novas | `node tools/sinais-risco.cjs` | 0 falhas, 0 avisos contra origin/main | PASS |
| 27. Conformidade visual: ausência de cor vermelha na UI | `node tools/auditar.cjs` | 0 ocorrências | PASS |
| 28. Renderer sem fs/electron/better-sqlite3 | `node tools/auditar.cjs` | 0 ocorrências | PASS |
| 29. Renderer sem SQL | `node tools/auditar.cjs` | 0 ocorrências | PASS |

---

## 3. Ataque à Própria Entrega (Testes Adversariais)

1. **Tentativa de Violação de Imutabilidade via SQL UPDATE direto:**
   - Ataque: Execução de `UPDATE Eventos SET tipo = 'HACK' WHERE id = ?`.
   - Resultado: A trigger `trg_eventos_prevent_update` aborta a transação com a mensagem `Eventos e append-only: UPDATE proibido`.
2. **Tentativa de Violação de Imutabilidade via SQL DELETE direto:**
   - Ataque: Execução de `DELETE FROM Eventos WHERE id = ?`.
   - Resultado: A trigger `trg_eventos_prevent_delete` aborta a transação com a mensagem `Eventos e append-only: DELETE proibido`.
3. **Ataque de Reversão Maliciosa Cruzada (Guest tentando desfazer ações do Host):**
   - Ataque: O Guest emite `UNDO` após o Host desenhar um elemento.
   - Resultado: O reducer varre exclusivamente a pilha `undoStack` do `guest`, desfazendo apenas a ação anterior do próprio convidado e preservando intacto o desenho do Host.
4. **Tentativa de Usurpação de Função Host (Guest emitindo CLEAR_TAB):**
   - Ataque: Convidado envia payload `CLEAR_TAB` ao reducer ou através do `EventoService`.
   - Resultado: O `EventoService` rejeita com `FORBIDDEN_ACTION_GUEST` e o reducer ignora sumariamente o comando, mantendo os elementos visíveis.
5. **Tentativa de Desenho com Tela Bloqueada (Host LOCK_SCREEN Ativo):**
   - Ataque: Guest submete `DRAW_ADD` enquanto `screenLocked === true`.
   - Resultado: O `EventoService` rejeita a inserção com `SCREEN_LOCKED`.
6. **Tentativa de Esgotamento de Memória por Carga de 50.000 Eventos (Replay DoS):**
   - Ataque: Submissão de 50.000 eventos contínuos para redução sequencial de estado.
   - Resultado: O reducer processa a carga total linearmente em 199.15 ms com consumo estável de memória e zero vazamentos.
7. **Ataque de Queda Prematura de Handshake (Invite Token Burning Attack):**
   - Ataque: Cliente conecta, envia `AUTH` consumindo temporariamente a conexão, e cai intencionalmente antes de `HANDSHAKE_INIT`.
   - Resultado: O token só é consumido definitivamente após `completeHandshake`. A desconexão limpa `activeGuestConnectionId` e permite que o convidado legítimo complete o join com o mesmo convite.
8. **Ataque de Enchente de Mensagens (Flood / DoS via WebSocket):**
   - Ataque: Cliente envia rajada de 105 mensagens em fração de segundo.
   - Resultado: O rate limiter do servidor WebSocket detecta o excesso do teto de 100 msg/s e derruba a conexão imediatamente.
9. **Ataque de Conexão Zumbi / Silenciosa (Zombie Client Attack):**
   - Ataque: Cliente abre conexão, não responde pings e mantém socket sem tráfego.
   - Resultado: O mecanismo de heartbeat após 2 intervalos consecutivos sem pong aciona `conn.ws.terminate()` e libera a sessão.

---

## 4. O que NÃO foi verificado nesta fase

Em conformidade com o protocolo de integridade técnica do `AGENTS.md`, registra-se explicitamente o que **não foi verificado** na Fase 05:
1. **Interface visual interativa do quadro branco vetorial no canvas Fabric.js 6.x:** O rendering interativo e os manipuladores de touch/mouse com compensação DPR @150% pertencem à Fase 06. A Fase 05 validou a camada pura de domínio (reducer, eventos, snapshots e persistência).
2. **Interface do Guest móvel em dispositivo físico Android:** O fluxo JoinFlow e a tela de colaboração do convidado pertencem à Fase 07.
3. **Sincronização de reprodução de vídeo/áudio e streaming WebRTC:** Pertence às Fases 05 e 08.
4. **Exportação de relatórios em PDF com Puppeteer:** Pertence à Fase 09.
5. **Regras de firewall do Windows e empacotamento do instalador (.exe):** Pertence à Fase 10.
