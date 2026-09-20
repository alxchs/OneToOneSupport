# Autoauditoria — Correções do Lote 2 (Fases 05, 06 e 07)
Executor: Antigravity (agy). Branch: `fase/07-guest-mobile`.

## 1. Resumo das Correções Aplicadas

Em estrito atendimento às correções obrigatórias apontadas pela revisão técnica das Fases 05, 06 e 07 (C1 a C5), todas as falhas foram sanadas com defesa em profundidade e testes de ataque (adversariais):

1. **C1 (bloqueante) — Path traversal em snapshot por abaId / sessaoId (`electron/services/evento.service.ts`):**
   - Implementado validador estrito `isValidId` com expressão regular `ID_REGEX` (`/^[A-Za-z0-9_-]{1,64}$/`).
   - Rejeição de `sessao_id` e `aba_id` inválidos com erros tipados (`SESSAO_ID_INVALIDO` / `ABA_ID_INVALIDO` / `IDENTIFICADOR_INVALIDO`).
   - Defesa em profundidade em `salvarSnapshotEmDisco`, `obterUltimoSnapshot`, `apagarTodosSnapshots`, `gerarSnapshotAba`, `reconstruirEstadoAba`, `consolidarAoEncerrar`, `salvarRevisao` e `carregarRevisao`: caminhos resolvidos com `path.resolve` devem estritamente começar com o caminho base do diretório de snapshots seguido de `path.sep` (`PATH_TRAVERSAL_DETECTED`).
   - Validação rigorosa na borda em `electron/server/index.ts` (`handleGuestEvent`) e `electron/ipc/evento.ipc.ts` (`handleEventoGravar` e `handleEventoObterEstado`). Convidado com `abaId` malicioso tem seu evento imediatamente descartado sem repasse ao Host.
   - Bateria de testes adversariais executada com 12 vetores maliciosos (`"../x"`, `"x/../../../y"`, `"..\\..\\y"`, caminho absoluto `"C:\\x"`, `"/etc/x"`, byte nulo, string de 10.000 caracteres, string vazia, `null`, `undefined`, números e objetos), provando que nenhum arquivo é criado fora do diretório de snapshots.

2. **C2 (bloqueante) — Autoridade falha aberta (`electron/services/evento.service.ts`):**
   - Substituída a lógica anterior por lista de PERMISSÃO rigorosa: `autor` deve ser exatamente `'host'` ou `'guest'`.
   - Decisão de segurança registrada: identidade estrita sem trim silencioso que altere a semântica da credencial. Qualquer valor discrepante (`"convidado"`, `""`, `"guest "`, `" Guest"`, `"Guest"`, `"GUEST"`, `"GuestX"`, `"host "`, `"HOST"`, `null`, `undefined`) é rejeitado com `permitido: false` e `motivo: 'AUTOR_INVALIDO'`.
   - Lista canônica de tipos de evento reconhecidos `TIPOS_EVENTO_CONHECIDOS`. Tipos desconhecidos são rejeitados com `TIPO_INVALIDO`.
   - Inclusão do evento `'SCREEN_LOCKED'` entre as ações estritamente proibidas ao Guest (`FORBIDDEN_ACTION_GUEST`), ao lado de `CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA` e `TAB_SWITCH`.
   - Mesma regra estrita aplicada no IPC `electron/ipc/evento.ipc.ts`.

3. **C3 — Retorno de gravarEvento ignorado (`electron/server/index.ts`):**
   - No método `handleGuestEvent`, o retorno de `gravarEvento` é verificado. Se devolver `sucesso: false` ou lançar qualquer exceção, o evento é sumariamente descartado e NÃO é repassado ao Host (`notifyGuestEvent`).
   - Teste automatizado comprova que tentativas do Guest de emitir `CLEAR_TAB`, eventos com `abaId` inválido ou ações sob tela bloqueada não disparam o listener do Host.

4. **C4 — Barra de ferramentas do Guest mobile (`src/guest/GuestRoom.tsx`, `src/guest/guest.css`):**
   - Barra inferior reorganizada em contêiner flexível `.guest-toolbar-container` com grupos lógicos `.guest-toolbar-group`.
   - Alvos de toque mantidos estritamente em 48×48px (`.touch-btn` com largura e altura mínimas de 48px).
   - Em viewport mobile de 412x915 (Motorola Edge 70 Pro / Android 16), todos os 10 botões cabem sem cortes na borda direita.
   - Sonda `tools/probe-runtime.cjs` estendida com validação via Chromium Puppeteer checando que todos os botões possuem coordenadas totalmente contidas na largura da viewport (`r.left >= 0 && r.right <= vw + 1`). Captura `docs/guest-mobile-emulation.png` regenerada.

5. **C5 — Registro de divergência e fonte única de CSP:**
   - Criado `docs/ADR/010-drawhide-elementid.md` documentando formalmente a aceitação polimórfica de `elementId` no reducer (`src/shared/events/reducer.ts`) para o evento `DRAW_HIDE`.
   - Criada a fonte única de verdade `src/shared/csp.ts` exportando a constante `GUEST_CSP` contendo `'wasm-unsafe-eval'` para libsodium WebAssembly.
   - `vite.config.guest.ts` e `electron/server/http.ts` consomem a mesma constante `GUEST_CSP`.
   - Teste automatizado comprova que o cabeçalho HTTP emitido pelo Express e a meta tag `<meta http-equiv="Content-Security-Policy">` do HTML final coincidem caractere por caractere.

---

## 2. Critérios de Avaliação e Saídas Reais

| Critério | Comando | Saída Real | Status |
| --- | --- | --- | --- |
| C1: Rejeição de 12 vetores de path traversal em snapshot | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | 12 vetores testados; arquivos fora de snapshots: 0; erros tipados `IDENTIFICADOR_INVALIDO`, `PATH_TRAVERSAL_DETECTED`, `SESSAO_ID_INVALIDO`, `ABA_ID_INVALIDO` | PASS |
| C1: Validação de borda no IPC e servidor | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | `handleEventoGravar` e `handleGuestEvent` rejeitam e descartam `abaId` malicioso | PASS |
| C2: Autoridade estrita com lista de permissão | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | Autores inválidos rejeitados com `AUTOR_INVALIDO`; tipos desconhecidos com `TIPO_INVALIDO` | PASS |
| C2: Ações proibidas ao Guest incluem `SCREEN_LOCKED` | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | `CLEAR_TAB`, `LOCK_SCREEN`, `UNLOCK_MEDIA`, `TAB_SWITCH` e `SCREEN_LOCKED` rejeitados com `FORBIDDEN_ACTION_GUEST` | PASS |
| C3: Descarte no servidor sem repasse ao Host | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | `hostListener` não é chamado sob erro de `gravarEvento` ou `abaId` inválido | PASS |
| C4: Barra cabe na viewport mobile 412x915 com alvos ≥ 48px | `node tools/probe-runtime.cjs` | Sonda aprova `barraFerramentasVisivel: true` e gera `docs/guest-mobile-emulation.png` | PASS |
| C5: ADR-010 registrado no repositório | `cat docs/ADR/010-drawhide-elementid.md` | Arquivo presente documentando aceitação de `elementId` em `DRAW_HIDE` | PASS |
| C5: Coincidência exata entre cabeçalho HTTP e meta tag CSP | `npm test -- tests/adversarial/correcoes-lote2.test.ts` | `expressCspHeader === GUEST_CSP` e `metaCsp === GUEST_CSP` comprovados | PASS |
| Sonda de runtime (22/22 checagens) | `node tools/probe-runtime.cjs` | 22/22 PASS sob Chromium real emulando Motorola Edge 70 Pro | PASS |
| Suíte de testes automatizados (188 testes) | `npm test` | 12 arquivos, 188/188 testes passando sob ABI do Electron | PASS |
| Ausência de variáveis não usadas | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | 0 erros TS6133/TS6138 (código de saída 0) | PASS |
| Sinais de risco em linhas novas | `node tools/sinais-risco.cjs` | 0 falhas contra origin/main | PASS |
| Validação de afirmações da documentação | `node tools/verificar-afirmacoes.cjs` | 0 afirmações não encontradas | PASS |

---

## 3. O que NÃO foi verificado

1. **Homologação em dispositivo físico real Motorola Edge 70 Pro:** Verificado através de emulação Chromium CDP em viewport 412×915 com DPR 2.625 e eventos de toque simulados; homologação final no hardware cabe ao Alexandre.
2. **Abas de mídia (áudio e vídeo sincronizados) e anotações sobre mídia:** Escopo da Fase 08 (`fase/08-abas-midia-assets`).
3. **Geração de PDF do relatório de atendimento:** Escopo da Fase 09 (`fase/09-relatorio-pdf`).
4. **Instalador executável de produção (.exe):** Escopo da Fase 10 (`fase/10-empacotamento-aceite`).
