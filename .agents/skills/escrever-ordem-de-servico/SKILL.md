---
name: escrever-ordem-de-servico
description: Como o chefe técnico compõe uma Ordem de Serviço imune a ambiguidades e falhas interpretativas do executor.
---

# Escrever Ordem de Serviço (Chefe)

Ao redigir instruções operacionais ou roteirizar Fases para os executores, siga as premissas deste guia para garantir que nenhuma afirmação fique ambígua e toda prova seja material.

## 1. Ponto de Partida e Estrutura
- Inicie usando os modelos já estabelecidos. Utilize `docs/prompts/_modelo-fase.md` como base.
- Liste os **requisitos com ID** estruturado (ex: `H1`, `G2`, `RT4`) para referências fáceis no `HANDOFF` e em autoauditorias.
- Declare de modo imperativo os comandos (o que deve ser construído, apagado, manipulado).

## 2. Definindo o Critério de Aceite Verificável
O executor deve ter total clareza de como provar o fim do trabalho.
- Exija a **Saída Real do Comando**: O que o executor precisa rodar? (ex: saída do Sonda, bash, script pwsh).
- **Nomeie o Método de Prova e a Evidência Obrigatória**: Evite frases vagas como "demonstre que funciona".
  - Se for interface, exija capturas via Sonda (`page.screenshot`) — Ver lições L-01/L-09 do `LICOES.md`.
  - Se for teste canvas, exija variação da escala de testes, não de coordenadas abstratas.
  - Se for segurança/rede, exija output e log de vazamento real do RedTeam no binário empacotado.

## 3. Delimite o Escopo
- Escreva uma lista categórica: "O que já foi resolvido, não refazer".
- Transcreva as "Decisões já tomadas" para a fase (arquiteturas, padrões, uso estrito da bibliotecas) sem deixar opção para a IA inventar soluções mirabolantes.
- Proíba explicitamente alterações de framework, dependências (ex: "Sem regra de negócio no Renderer") ou a criação de branches forjados.

## 4. Estude os Exemplos Anteriores
- Analise os tickets pré-processados reais em pastas como `Issues/20261002-114038-quadro-estilo-paint/` ou ordens corretivas contidas em `Issues/` para entender o tom objetivo, sem explicações acadêmicas e com rigor nos critérios.
- Um bom prompt não assume que a IA entende contexto não lido e manda ler arquivos específicos de contexto caso a fase exija.
