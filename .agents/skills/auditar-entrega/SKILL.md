---
name: auditar-entrega
description: O método rigoroso para auditar entregas de desenvolvimento (IA executora), executando código, testes e validações contra invenção.
---

# Auditar Entrega (Chefe / Auditor)

Como auditor ou chefe técnico, o seu papel é desconfiar ativamente da documentação entregue. Não aprove nada antes de testar a funcionalidade na prática.

## Passo 1: Clone limpo e Automação Básica
1. Se estiver num ambiente limpo, clone o repositório ou obtenha a branch; se na mesma, execute o comando de auditoria automatizado:
   ```powershell
   node tools/auditar.cjs
   ```
2. Analise os resultados de `npm ci`, verificações estáticas, e a Sonda. 
3. **Leia o diff** minuciosamente nas áreas de maior risco (componentes de borda, I/O e interfaces visuais).

## Passo 2: O Checklist de Ataque de LICOES.md
As validações manuais ou adições de script do auditor **PRECISAM atacar os erros mais cometidos (vistos em `docs/LICOES.md`)**:
- **L-01 / L-09**: Validar que as *provas visuais/pixels* pedidas correspondem à tela renderizada (ex: captura Sonda) e não à memória do estado.
- **L-03**: Provas visuais que acionam Canvas, CSS opaco, z-index encobridor, devem usar inspeção de DOM renderizado (`getComputedStyle`) ou captura real (`page.screenshot`), nunca métodos internos (ex: `getImageData`).
- **L-04**: Para eventos de clique crítico / drag, utilize input direto no processo do Host (`SendInput` via script PowerShell), e não apenas CDP (eventos simulados via código).
- **L-05**: Testes de Canvas e área/coord devem passar com escalas/DPR divergentes de 1x1 (celular Guest 0.34, Host 1.5).
- **L-06**: Valide tentativas não autorizadas usando envio forjado do Guest (`allowlist` rigorosa vs `denylist`).
- **L-07 / L-08**: A evidência deve advir de execução visível e final (ambiente `app.asar` empacotado para checagens de CSP) com feedback IPC legível pelo dono no output.

## Passo 3: Ataque Negativo e Controle Positivo
- Todo teste negativo gerado para invalidar ou estourar a entrega deve obrigatoriamente possuir um **controle positivo** na mesma bateria (se você escreve um teste que espera a falha de um ataque, escreva um teste de caminho feliz idêntico garantindo que ele não quebrou a base também).

## Passo 4: O Veredito de Avaliação
Elabore o relatório e grave em `docs/reviews/fase-NN.md`. Siga rigorosamente este formato:

1. Resultado final: **APROVADA** ou **REJEITADA**
2. Se REJEITADA, liste e enumere os defeitos (Defeitos numerados) junto da prova real:
   - Caminho/linha.
   - Trecho que causa o problema e evidência/log real do `node tools/auditar.cjs` ou script provador.
3. Se APROVADA, liste as ressalvas menores (algo que não quebra o produto mas requer anotação).
4. O que **não foi verificado** (limitações físicas do auditor, impossibilidade de rodar hardware específico, ou testes desativados com aviso ao Dono).
