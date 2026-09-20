# ORDEM DE SERVIÇO — FASE NN: <título>
Branch: `fase/NN-<slug>` (confirme com `git branch --show-current`; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, `docs/FASES.md`, `docs/HANDOFF.md`, `docs/ADR/`. Pré-requisito: <fase anterior> entregue.

## Entregas
1. <entrega concreta, com caminho de arquivo e comportamento observável>
2. <...>
(Cada entrega deve poder ser verificada por comando ou teste. Nomeie arquivos, eventos, códigos de erro: o verificador de afirmações confere que existem.)

## Regras específicas desta fase (cada uma vira teste que tenta VIOLÁ-LA)
- <regra 1: ex.: "token de uso único"> — ataque esperado: reuso, expirado, concorrente, queda no meio.
- <regra 2>

## Pontos herdados de fases anteriores (resolver aqui)
- <pendências/ressalvas da revisão anterior, se houver>

## Verificação e autoauditoria
Siga a seção **Autoauditoria obrigatória** do `AGENTS.md`. O gate é o comando de verificação do projeto (`orquestrador.config.json`). Cole no HANDOFF a saída real.

## Aceite (o chefe reexecuta tudo)
- Verificação verde em clone limpo; autoauditoria com PASS/FAIL por critério e lista do que NÃO foi verificado.
- <critérios mensuráveis específicos>

## Não fazer
<escopo excluído desta fase>. Nada de push nem merge. Encerre com o HANDOFF e pare.
