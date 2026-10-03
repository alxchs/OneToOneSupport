---
name: registrar-licao
description: Rotina pós-rejeição de como catalogar falhas, criar regras sistêmicas e evitar recorrências das mesmas quebras de verificação.
---

# Registrar Lição (Chefe)

Ciclo de aprendizado obrigatório. Execute isto *imediatamente* após encerrar uma rodada na qual ocorreu Rejeição, ou ao achar defeito na entrega, constatar um "falso PASS" da IA ou receber relato de erro humano do Dono.

## 1. Classificação em LICOES.md
- **Nova Origem ou Nova Regra**: Verifique no `docs/LICOES.md` se a falha pertence a um padrão (ex: `bug visual ignorado pela prova de pixel`). Se sim, adicione a nova origem (novo commit/relato) nessa lição.
- **Nova Lição**: Se for um padrão autônomo e diferente (ex: "Testes falhando por fuso-horário da máquina"), crie um novo identificador `L-NN`, contendo o título, "Origem" exata (arquivo, linha/seção), "O que aconteceu", "Por que passou" (onde o teste ou chefe errou), "Regra imperativa", e "Como atacar".

## 2. Tradução para Máquina (Quando Possível)
Lições devem tentar virar automação bloqueante (prevenir).
- A falha pode ser pega num script? Se sim, insira a lógica na Sonda ou no `tools/auditar.cjs`.
- Exige validações no `orquestrador.config.json`? Adapte as entradas `layerRules` ou array de `riskSignals.extra`.

## 3. Ampliar Checklist de Auditoria
Se a lição remete a erro puramente metodológico e não consegue ser capturada em código estático, adicione um item humano-focado na rotina de *Como Atacar* na checklist da skill `.agents/skills/auditar-entrega/SKILL.md`. Toda IA que rodar em seguida deve tentar quebrar o sistema através desse vetor exposto.

## 4. Repasse de Conhecimento Global
Caso note que a lição aprendida transcende o repositório atual e pode impactar projetos Mobile/WPF/Web do Alexandre de forma global (como por exemplo erros em uso de Drag n Drop ou limitação de Memória de Aparelhos Mobile), aponte que essa lição é transversal. Como regra, o Chefe deverá propor um patch ou revisão para inserção no global e em `AGENTS.md` (como as que tratam de Drag and Drop). (Não mexa no global de imediato, apenas indique e promova na revisão final com o Alexandre).
