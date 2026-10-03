# Resultado da prova cega de chefe — Fase 11, rodada 1 (2026-10-02)

Ordem: `docs/prompts/aprendizado/prova-chefe-11.md`. Clone higienizado em `95f176d` (sem `docs/reviews/fase-11.md`,
sem o teste de ataque do chefe, sem refs posteriores). Auditor: AGY, `gemini-3.1-pro-high` (o grupo Claude da AGY
estava sem cota: 429, renovação em ~71 h). Log: `docs/execucoes/prova-chefe-11-gemini-agy-20261002_2331.log`.
Relatório da AGY e teste dela copiados nesta pasta como `sombra-11-relatorio-agy.md` e `sombra-11-borracha.test.ts.txt` (extensão .txt para não entrar na suíte).

## Placar
| Defeito real (achado pelo chefe) | AGY achou? |
| --- | --- |
| 1. Busca de alvo com heurísticas compara tela × cena; apaga elemento longe do toque na escala do celular | não |
| 2. `containsPoint({x,y})` lança `TypeError` a cada clique em área vazia no Host | não |
| **Defeitos inventados pela AGY** | **1** |

Veredito dela: REJEITADA (o veredito certo), **pelo motivo errado**.

## O defeito inventado
"Borracha (Traço inteiro) apaga a Borracha (Trecho) via `opt.target`, e o traço apagado reaparece." Falso:
`engine.ts:793` (em `95f176d`) já filtra `tipo !== 'eraser_stroke'`. O próprio teste dela espera "nenhum
`DRAW_HIDE`" e **passa** (rodado pelo chefe: `npx vitest run tests/adversarial/sombra-11-borracha.test.ts` →
`1 passed`). O relatório diz "falhando a expectativa": ela não leu o resultado do teste que citou como prova.

## Por que errou (vira lição)
1. Afirmou resultado de teste sem colar a saída — exatamente o que o AGENTS.md proíbe ao executor.
2. Repetiu o método fraco que causou os 2 defeitos reais: alvo injetado (`fire('mouse:down', { target })`) e
   engine em escala 1. A ordem dizia "pense no Host a 150% e no Guest no celular"; nenhum teste mudou a escala.
3. Não leu o código **novo** da busca de alvo (as 4 heurísticas não pedidas), onde estavam os 2 defeitos. Código
   que a ordem não pediu é o primeiro lugar a auditar.
4. Mexeu em `src/shared/canvas/engine.ts` ("modificações de espionagem") num papel somente-leitura e reverteu.
   O `delegar.ps1` não pegou porque o arquivo voltou ao original; a regra foi quebrada mesmo assim.

## Erro do chefe nesta prova
O cabeçalho comum (`New-Cabecalho` em `tools/_comum.ps1`) manda "Só termine depois de commitar TUDO" também ao
auditor, contradizendo a ordem ("não commite"). A AGY notou o conflito e seguiu a ordem, mas a ferramenta não
pode mandar o contrário do papel. Corrigido em `tools/delegar.ps1`.

## Nível
Continua no **nível 1**. Placar da sombra: 0/2, 1 inventado.
