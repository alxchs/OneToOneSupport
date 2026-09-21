# Revisão da Fase 06 — Quadro branco HiDPI (Fabric.js)
Revisor: Claude Code (chefe). Veredito: **APROVADA COM RESSALVAS**.
Evidência: auditor 158 testes, sonda 16/16. Eu rodei `npm run probe` na branch 07 (que contém a 06): `quadroDprOk`, `quadroControlesOk`, `quadroInteracaoOk` true; contagem de elementos 6 → undo 5 → redo 6 → borracha 5. Captura `docs/whiteboard-hidpi.png`: DPR 1.50x, ferramentas e cores sem vermelho.
Conferido: `engine.ts` lê `window.devicePixelRatio` (linhas 365, 403, 927); `as any` em `elementId`/`autor` do Fabric (avisos TIPO_SUPRIMIDO, aceitável).
## Ressalvas
1. Mudança no reducer da fase 05 (`DRAW_HIDE` aceita `elementId`) sem ADR/HANDOFF explícito.
2. `evento.ipc.ts` repassa `autor`, `aba_id` e `sessao_id` sem lista de permissão/sanitização: expõe os defeitos 1 e 2 da fase 05.
Não verificado: HiDPI em outra escala (só 1.5x); 2 regras não tentadas por mim na UI (Limpar Tela preserva histórico; undo por autor).
