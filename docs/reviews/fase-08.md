# Revisão da Fase 08 — ferramentas sem mover (D12), texto (D13), limpeza de diagnósticos (D14), seleção sem arrasto (D15), rever sessão encerrada (D16)
Revisor: Claude Code (chefe), 2026-09-25. Veredito: **REPROVADA PARA MERGE ATÉ O D17** — um defeito real,
reproduzido duas vezes no app empacotado, com o auditor automático 100% verde.

## Auditor automático (`node tools/auditar.cjs`, log em `docs/execucoes/auditoria-fase-08.log`)
Tudo verde: clone limpo, `npm ci`, `npm run verify` com 354 testes, sonda 36/36, sem variável não usada,
regras de camada (renderer sem fs/electron/SQL), sem vermelho na UI, 0 falhas de sinal de risco (67 avisos),
autoauditoria-08 presente sem FAIL, HANDOFF atualizado, 243 afirmações da documentação conferidas no código,
prova de pixel presente onde foi prometida, 8 commits / 53 arquivos / +5343 −2012.
**Ressalva de sempre:** `npm ci` segue com 24 vulnerabilidades (2 críticas) e o auditor trata isso como PASS.

## Ataques do chefe no app empacotado (3 regras atacadas, 1 furou)

### A1 — FUROU: o quadro em "somente leitura" recebe traço do Guest de outra sessão
Caminho remoto (`src/host/HostApp.tsx` ~50–71) aplica o evento do Guest direto em `tabState`
(`reduceEvent` + `useHostStore.setState`), sem passar por `aplicarEventoQuadro` — onde o D16 pôs a trava
`quadroSomenteLeitura` — e sem conferir de qual sessão o evento veio (carimba com `activeSessaoId`).
Com sessão viva + Guest conectado, o quadro histórico aberto em leitura recebeu 2 elementos novos e a
captura de TELA saiu de 14750 para 20575 pixels coloridos (+5825). O SQLite não foi corrompido: a sessão
encerrada ficou em 1 evento (a trava do `EventoService` funciona), e os eventos foram para a sessão viva
(2 → 4). Evidência, comando e saída real:
`Issues/20260925-175400-vazamento-guest-no-quadro-leitura/` (LEIA-ME + `evidencia/ataque-readonly-guest.cjs`
+ `leitura-antes.png` / `leitura-depois.png`). Ordem de correção emitida: **D17**.
Por que nenhum teste pegou: todos os 13 testes do D16 e a checagem V4 da sonda exercitam o caminho LOCAL
(Host desenhando); nenhum exercita o caminho REMOTO com o quadro em leitura aberto.

### A2 — resistiu: arraste por TOQUE no modo seleção (D15)
O executor provou com `page.mouse`; ataquei com `Input.dispatchTouchEvent` e emulação de toque ligada.
Geometria idêntica antes/depois (`left 300.1`, `top 199.98`, `scaleX 1`, `angle 0`), com
`lockMovementX: true` e `hasControls: false` aplicados na seleção, e SQLite em 1 → 1 evento.
Script: `evidencia/ataque-toque-host.cjs`, captura `evidencia/a2-toque-selecao.png`.

### A3 — resistiu: desenho por TOQUE no modo leitura (D16)
A sonda V4 tentou com mouse; tentei com toque, dois arrastos: elementos 1 → 1, eventos 1 → 1, objetos com
`selectable: false`. Captura `evidencia/a3-toque-leitura.png`.

## Leitura de trechos de risco
- `electron/services/evento.service.ts`: a rejeição `SESSAO_ENCERRADA` consulta o status no SQLite antes do
  append. Não quebra fluxo legítimo — `encerrarSessao` não grava evento, e o servidor já trata
  `sucesso: false` sem repassar ao Host (`electron/server/index.ts` ~141). Ressalva menor: sessão
  inexistente (`getSessaoById` → undefined) continua aceitando append, como antes do D16.
- `src/shared/canvas/engine.ts`: 18 guardas de `readOnly`, inclusive no ponto único de emissão
  (`emitEvent`), e o `upperCanvasEl` transparente do D11 preservado; a constante
  `ARRASTO_NO_MODO_SELECAO_HABILITADO` é `export let` com setter só para teste, sem UI — como o D15 exigia.
- `src/host/store/useHostStore.ts`: travas locais corretas (aplicar/desfazer/refazer/limpar/lock/unlock) e
  `setView` limpando `quadroSomenteLeitura` ao sair do quadro. O furo do A1 não está aqui: está na porta de
  fora, no `HostApp.tsx`.
- O Guest não tem ferramenta de seleção (só lápis, pincel, retângulo, elipse, seta, texto, borracha), então
  a regra do D15 não é atacável pelo celular.

## Não verificado
- Aparelho Android real (só Motorola Edge 70 Pro emulado).
- Se o "Exportar PNG HiDPI" do quadro em leitura grava os traços vazados do A1 (provável, não medido).
- Diff completo (li os trechos de risco e o diff de `evento.service.ts`, `useHostStore.ts` e as guardas do
  engine; não li os 5343 acréscimos linha a linha).
- Red team desta fase (`tools/red-team.ps1` não foi executado sobre D12–D16).
- D12, D13 e D14 não foram reatacados pelo chefe nesta rodada; o veredito deles se apoia no auditor
  automático e nas autoauditorias do executor.

## Decisão
Entrega boa no mérito (D12–D16 fazem o que prometem pelo caminho local, e dois ataques do chefe
resistiram), mas **não vai para `main` antes do D17**: a promessa de tela "O histórico desta sessão é
permanente e imutável" é falsa hoje na situação mais provável de uso — professor revendo aula antiga durante
aula ao vivo. Merge e push dependem de ordem explícita do Alexandre.

---

## Fechamento (2026-09-25, à noite): correção D17 entregue e auditada
Executor: `agy` (Antigravity), despachado pelo chefe com a ordem D17 + LEIA-ME (log em
`docs/execucoes/issue-20260925-175400-vazamento-guest-no-quadro-leitura-agy-20260925_1858.log`).
Entrega: commit `4e8c10d`, 18 arquivos, +766 −41. **Veredito: APROVADA para merge**, pendente da decisão do
dono.

### O que o chefe verificou por conta própria (não é a palavra do executor)
1. **O ataque que furou agora resiste.** Rodei `ataque-readonly-guest.cjs` contra o build do `4e8c10d`:
   quadro em leitura em 1 elemento e 14750 pixels, **delta 0**, com os controles positivos subindo (Guest
   2 → 4 elementos; SQLite da sessão viva 2 → 4; sessão encerrada intacta em 1).
2. **Regressão do caminho feliz — o risco real desta correção.** Um funil rigoroso demais passaria no item 1
   e quebraria a aula ao vivo, e nenhuma prova do executor cobria isso no mesmo cenário. Escrevi
   `evidencia/ataque-pos-d17.cjs`, que testa as duas metades na mesma execução: com o quadro da sessão VIVA
   aberto, o traço do Guest **chega e é desenhado** (+1 elemento, pixels 19055 → 21613). Captura
   `evidencia/pos-d17-viva-depois.png`: "Elementos Visíveis: 5", barra de ferramentas completa,
   "Convidado Conectado (E2EE)".
3. **Auditor automático em clone limpo, rodado por mim** (`docs/execucoes/auditoria-fase-08-pos-d17.log`):
   tudo verde, 362 testes, sonda 37/37, 253 afirmações conferidas, 0 falhas de sinal de risco.
4. **Leitura do diff:** o funil `aplicarEventoRemoto` tem as 6 regras da ordem; `sessaoId` é carimbado no
   Main a partir do `SessionManager` **depois** do spread do envelope, então valor forjado pelo Guest é
   sobrescrito; `HostApp.tsx` não tem mais `setState({ tabState })` solto. `CLEAR_TAB` saiu do caminho
   remoto — **não é regressão**: é ação exclusiva do Host (`ACOES_EXCLUSIVAS_HOST`, ADR-011), o Guest nunca
   pôde emitir.
5. **A sonda V5 do executor é prova real, não uma mais fraca:** Guest de verdade por IP de LAN, toque via
   CDP, `page.screenshot` decodificado, e o PASS dela exige os controles positivos (elementos do Guest e
   eventos do SQLite subindo) — ou seja, não dá falso PASS por ataque inerte, que foi exatamente o erro que
   eu mesmo cometi na primeira rodada deste ataque.

### Ressalvas (nenhuma bloqueia o merge)
1. `aplicarEventoRemoto(event: any)`: a entrada do funil não é tipada (o auditor marca
   `TIPO_SUPRIMIDO useHostStore.ts:614`, um `as any` no `.includes` da allowlist). As validações defensivas
   cobrem o risco prático, mas o contrato IPC do evento do Guest continua `any` de ponta a ponta.
2. Evento de aba não ativa agora é descartado. Verifiquei por leitura que não há perda de dado: o servidor
   já persistiu no SQLite e `trocarAba` (`useHostStore.ts:566`) recarrega o estado da aba pelo banco. Quando
   a fase de abas (`docs/prompts/fase-08-abas-midia-assets.md`) entrar, esta regra precisa ser reavaliada —
   não testei troca de aba concorrente.
3. O executor reexecutou meu script de ataque e **sobrescreveu as capturas do defeito original**
   (`leitura-antes.png` / `leitura-depois.png`), porque o script grava ao lado de si mesmo. Restaurei as
   originais de `f769a47`; as pós-correção ficaram como `pos-d17-*.png`. Lição para as próximas ordens:
   script de evidência do chefe deve gravar em caminho com carimbo, não sobrescrever a prova do defeito.

### Não verificado nesta rodada
- Red team (`tools/red-team.ps1`) sobre D12–D17.
- Aparelho Android físico.
- Exportação PNG do quadro em leitura (o vazamento que a contaminaria está fechado, mas o caminho de
  exportação em si não foi medido por mim).
- D12, D13 e D14 seguem apoiados no auditor automático e nas autoauditorias, sem reataque do chefe.
