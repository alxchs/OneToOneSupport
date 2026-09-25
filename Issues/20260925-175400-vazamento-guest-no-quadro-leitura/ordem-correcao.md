Contexto: LEIA AGENTS.md e `Issues/20260925-175400-vazamento-guest-no-quadro-leitura/LEIA-ME.md` (tem o
defeito, a causa raiz e o comando que reproduz). Continue na branch `fase/08-ferramentas-sem-mover`.
Não faça push nem merge. Escopo: Host (renderer + main), sem mexer no protocolo do Guest.

## D17 — Evento do Guest não pode entrar por uma porta sem trava

### D17.1 — O defeito
O evento do Guest é aplicado direto no `tabState` em `src/host/HostApp.tsx` (`reduceEvent` +
`useHostStore.setState`), desviando de `aplicarEventoQuadro`, que é onde mora a trava
`quadroSomenteLeitura` do D16. Resultado provado: com uma sessão viva e o Guest conectado, o quadro de uma
sessão ENCERRADA aberto em "somente leitura" recebe os traços novos do aluno (+2 elementos, +5825 pixels
coloridos na captura de tela). Reproduza ANTES de corrigir, com o comando do LEIA-ME, e cole a saída.

### D17.2 — Corrija a causa raiz, não o sintoma
Não basta acrescentar `if (quadroSomenteLeitura) return;` no `HostApp.tsx`. Esse caminho tem dois furos e os
dois são a mesma causa: **entrada de evento remoto sem funil único e sem identidade de sessão**.

1. **Funil único no store.** Crie uma ação no `useHostStore` (nome sugerido: `aplicarEventoRemoto`) que seja
   o ÚNICO ponto por onde evento vindo do Guest entra no `tabState`. O `HostApp.tsx` passa a só chamar essa
   ação. Nenhum `useHostStore.setState({ tabState })` solto fora da store.
2. **Identidade de sessão vinda do Main, não do Guest.** Hoje o evento repassado
   (`SERVER_GUEST_EVENT_RECEIVED`, em `electron/ipc/server.ipc.ts`) não diz de que sessão ele é, e o
   renderer carimba com `activeSessaoId` — ou seja, com a sessão que por acaso estiver na tela. O Main deve
   incluir no evento repassado o `sessaoId` **da autoridade** (o `SessionManager`/`ServerSessionController`,
   que sabe qual sessão está servindo), nunca um campo que venha da mensagem do Guest. Se o evento não
   trouxer `sessaoId`, o renderer descarta.
3. **Regras do funil** (todas com teste que tenta violá-las):
   - descarta se `quadroSomenteLeitura` estiver ligado;
   - descarta se `sessaoId` do evento ≠ `activeSessaoId` aberto na tela;
   - descarta se `abaId` do evento ≠ `activeAbaId` aberto na tela;
   - descarta evento sem `sessaoId`, com `sessaoId` vazio/nulo, ou com tipo fora da lista permitida
     (reaproveite a allowlist única já existente — ADR-011 —, não crie uma segunda lista);
   - cada descarte registra diagnóstico (`diagLog`), sem derrubar a conexão nem travar a sessão viva:
     depois de descartar, o Host tem que continuar recebendo normalmente os eventos da sessão certa.

### D17.3 — Não regrida o que já funciona
A sincronização Host↔Guest da sessão viva tem que continuar idêntica: sonda V3/V3b/V3c/V3d e V4 verdes.
Um descarte errado aqui quebra a aula ao vivo — isto é mais grave que o defeito que você está consertando.
Teste explicitamente o caminho feliz (quadro da sessão viva aberto, Guest desenha, Host recebe) DEPOIS da
mudança.

### D17.4 — Prova (esta ordem não está cumprida sem ela)
1. **Reexecute o ataque do chefe** `Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs`
   e cole a saída real. Ele precisa sair com código 0 e a linha "Trava resistiu", **com o controle provando
   que o Guest desenhou de verdade** (elementos no Guest e eventos da sessão viva no SQLite subindo). Sem o
   controle subindo, o PASS não vale — foi exatamente assim que a primeira versão do ataque deu falso
   negativo.
2. **Sonda:** acrescente a checagem `V5: quadro em leitura não recebe traço do Guest de outra sessão` em
   `tools/probe-runtime.cjs`, no mesmo formato das demais (PASS/FAIL), com Guest real conectado pelo IP de
   LAN, captura de TELA (`page.screenshot`) e contagem de pixels coloridos antes/depois — não apenas leitura
   de propriedade ou contagem de elementos.
3. **Testes unitários** do funil: um por regra do D17.2.3, incluindo sessão trocada, aba trocada, `sessaoId`
   ausente, tipo não permitido e quadro em leitura.
4. `npm run verify` verde e `node tools/auditar.cjs` verde.

## Ao final
`docs/reviews/autoauditoria-vazamento-remoto.md` (critério → comando → saída real → PASS/FAIL + o que NÃO
foi verificado), `docs/HANDOFF.md` com um parágrafo curto em português simples para o dono explicando que o
quadro em modo leitura agora ignora o que o aluno desenha na aula ao vivo, e ADR se você divergir desta
ordem. Commit local único, sem push.
