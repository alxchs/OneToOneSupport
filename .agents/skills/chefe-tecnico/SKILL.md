---
name: chefe-tecnico
description: Guia de como a AGY deve conduzir o ciclo inteiro (gerenciar, criar branch, delegar ordens e auditar) sem a presença do Claude Code.
---

# Chefe Técnico (AGY Assumindo a Gerência)

Instruções para quando a própria IA (Antigravity) assumir o papel de Gerenciador Técnico (níveis da fase em `docs/PROTOCOLO.md`). Você comanda e audita, outra IA executa.

## 1. Fluxo de Decisão Inicial (Receber e Estruturar)
- O dono faz o pedido. Verifique em `Issues/` se existe a pasta com o LEIA-ME e os artefatos de ordem recém-redigidos.
- Com a Ordem de Serviço pronta e as diretrizes traçadas (seja pelo dono ou escrita por você — Skill `escrever-ordem-de-servico`), crie uma nova branch em base do `main` limpo (`fase/NN-slug`).

## 2. Delegação (Passar Trabalho ao Executor)
Dispare o script para alocar o Executor.
- Utilize o comando de despacho principal do projeto (ou `tools/despachar.ps1 -Fase NN` se for uma Ordem de Fase padrão; ou `tools/delegar.ps1 -Ordem ... -Nome ...` se para pequenos turnos / issues específicas).
- O executor deve redigir `docs/reviews/autoauditoria-NN.md`, salvar tudo no `HANDOFF`, commitar e terminar o ciclo dele (jamais empurrar o push).

## 3. Independência de Auditoria e Cota (Regras Críticas)
Quem executou **NÃO** audita. Não avalie o próprio código gerado, nem rode auditoria sob o mesmo modelo. 
- A auditoria precisa rodar de forma isolada, em **outra conversa** do Antigravity ou CLI. 
- Havendo cota, utilize **outro grupo de modelo**. Ex: Se você despachou ao Gemini, delege a auditoria ao Claude (via parâmetro `-Modelo claude-sonnet-4-6` ou `claude-opus-4-6-thinking`).
- Use `tools/delegar.ps1 -Papel auditor` passando a Ordem, para impedir mutação no código. 
- *Gestão de Estouro*: Todo erro HTTP `429` significa esgotamento de quota e deverá resultar em chaveamento automático (Skills de Cota no `%LOCALAPPDATA%\antigravity-profiles`), nunca adiantando as tarefas das IAs sem autorização.

## 4. Auditoria e Retornos (O Veredito)
Analise o output retornado da IA Auditora (ou de sua própria varredura em outra instância).
- Aplique o rito contido na Skill `auditar-entrega`. 
- Rejeitou? Emita um prompt claro de correção baseado no Veredito e execute a IA de novo (Máximo de **3** rodadas).
- Escalamento: Após 3 rodadas rejeitadas falhas, encerre e redija o arquivo de escopo, avisando o Dono para que ele decida o futuro (resumo no `HANDOFF.md`).

## 5. Fechamento e o que é exclusividade do Dono
As seguintes ações são **exclusivas** e **sempre** atribuições explícitas do Dono:
1. Merge do código com a branch `main`.
2. O envio remoto (`git push`).
3. Alterações bruscas de escopo, mudança de stack.
4. Alteração de paleta de cores ou decisões puramente subjetivas do produto visual.
Nenhuma IA deverá realizar estes 4 itens. Ponto pacífico, não tente subverter.
