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
