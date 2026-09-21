Contexto: as fases 05, 06 e 07 já foram ENTREGUES nesta branch (fase/07-guest-mobile contém as três). NÃO reimplemente nada nem refaça a ordem de serviço da fase 07. Faça SOMENTE as correções abaixo, achadas pela revisão do chefe (ver docs/reviews/fase-05.md, fase-06.md e fase-07.md). Cada correção exige teste que tente VIOLAR a regra (falha antes da correção, passa depois). Commits pequenos, imperativo. Ao final: `npm run verify` deve passar, atualize docs/HANDOFF.md (seção nova "Correções do lote 2" com saída real de comando) e crie docs/reviews/autoauditoria-corr-lote2.md (critério → comando → saída → PASS/FAIL, e o que NÃO foi verificado). Não faça push nem merge.

## C1 (bloqueante) — Path traversal em snapshot por abaId/sessaoId
Arquivo: electron/services/evento.service.ts (salvarSnapshotEmDisco, obterUltimoSnapshot, limparSnapshots e qualquer outro que monte caminho com sessaoId/abaId).
Prova do defeito: abaId = "x/../../../y" grava em <appData>\OneToOneSupport\y_200.json, fora da pasta de snapshots. O Guest controla abaId (electron/server/index.ts usa envelope.payload?.abaId sem validar).
Correção: (a) validar sessaoId e abaId contra lista de permissão (ex.: /^[A-Za-z0-9_-]{1,64}$/); valor inválido = rejeitar com erro tipado, sem gravar nada; (b) defesa em profundidade: após montar o caminho, garantir que path.resolve(caminho) começa com path.resolve(snapshotsDir) + path.sep, senão lançar; (c) aplicar a mesma validação na borda: electron/server/index.ts (handleGuestEvent), electron/ipc/evento.ipc.ts e no próprio gravarEvento. Guest com abaId inválido: evento descartado e NÃO repassado ao Host.
Testes de ataque: "../x", "x/../../../y", "..\..\y", caminho absoluto "C:\x", "/etc/x", byte nulo, string de 10 000 caracteres, string vazia, valor não-string; provar que nenhum arquivo é criado fora de snapshotsDir (liste o diretório pai antes/depois).

## C2 (bloqueante) — Autoridade falha aberta
Arquivo: electron/services/evento.service.ts (validarAutorEPermissao).
Defeito: só bloqueia autor === 'guest'; qualquer outro valor ("convidado", "", "guest ", "GuestX", null) recebe poderes de Host, inclusive CLEAR_TAB.
Correção: lista de PERMISSÃO: autor deve ser exatamente 'host' ou 'guest' (decida se normaliza caixa e registre a decisão; sem trim silencioso que mude a identidade). Qualquer outro valor: rejeitado (permitido:false, motivo AUTOR_INVALIDO). Tipo de evento desconhecido: rejeitado também (lista de tipos conhecidos). Inclua 'SCREEN_LOCKED' entre as ações proibidas ao Guest OU remova a afirmação de que é bloqueada (a documentação do lote disse que era; o código não fazia). electron/ipc/evento.ipc.ts deve usar a mesma regra (não confiar no autor vindo do renderer sem validar).
Testes de ataque: os valores acima × CLEAR_TAB/LOCK_SCREEN/UNLOCK_MEDIA/TAB_SWITCH/SCREEN_LOCKED, tipos desconhecidos, tela bloqueada.

## C3 — Retorno de gravarEvento ignorado (electron/server/index.ts, handleGuestEvent)
Se gravarEvento devolver sucesso:false (ou lançar), o evento NÃO pode ser repassado ao Host (notifyGuestEvent). Teste: Guest envia evento rejeitado e o listener do Host não recebe nada.

## C4 — Barra de ferramentas do Guest mobile (src/guest/GuestRoom.tsx, src/guest/guest.css)
Em 412x915 o botão de desfazer aparece cortado na borda direita (ver docs/guest-mobile-emulation.png). Faça a barra caber (quebra de linha ou rolagem horizontal explícita com indicação), mantendo alvos de toque >= 48px. Estenda a sonda (tools/probe-runtime.cjs) para checar que todos os botões da barra estão totalmente dentro da largura da viewport (ou alcançáveis por rolagem) e regenere a captura.

## C5 — Registro de divergência
O reducer (src/shared/events/reducer.ts, DRAW_HIDE) passou a aceitar `elementId` na fase 06 sem registro. Crie docs/ADR/010-drawhide-elementid.md e cite no HANDOFF. Remova ou alinhe a constante GUEST_CSP de vite.config.guest.ts com o guest.html (a constante não tem 'wasm-unsafe-eval'; deixe UMA fonte de verdade da CSP do Guest e teste que o HTML final e o cabeçalho HTTP coincidem).

## Proibido
Não invente nomes de arquivo/função/evento na documentação (o verificador reprova). Não altere tools/red-team.ps1 nem docs/reviews/fase-0[567].md. Não declare "nenhuma divergência" se houve.
