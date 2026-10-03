# Prova de chefe técnico — auditoria da Fase 11 (rodada 1)

Você vai fazer o trabalho que hoje é do chefe técnico: **auditar a entrega de outra IA e dar o veredito**. Esta é
uma prova: o resultado será comparado com uma auditoria independente feita sobre o mesmo código. O que conta é
achar defeitos **reais e provados**, não o volume do relatório.

## O que auditar
- Branch atual (`fase/11-quadro-estilo-paint`) contra `main`.
- Ordem de serviço que o executor recebeu: `docs/prompts/fase-11-quadro-estilo-paint.md` e
  `Issues/20261002-114038-quadro-estilo-paint/` (LEIA-ME e ordem-correcao).
- O que o executor afirma ter feito: `docs/HANDOFF.md` (seção da Fase 11) e `docs/reviews/autoauditoria-11.md`.

## Como (o método do chefe — `docs/CHEFE.md`, `docs/PROTOCOLO.md`, `AGENTS.md`)
1. Rode `node tools/auditar.cjs` e leia só o resumo. Verde no auditor NÃO é aprovação: o histórico do projeto
   (`docs/EXPERIMENTO.md`, `docs/reviews/fase-*.md`) mostra vários falsos PASS que só a leitura do chefe achou.
2. Leia o diff nas áreas de risco (`git diff main...HEAD -- <arquivo>`), principalmente o que mudou em
   comportamento, e procure: código que não foi pedido, afirmação da autoauditoria que o código não sustenta,
   caminhos que os testes não exercitam.
3. **Ataque a entrega**: para cada regra da ordem que você suspeitar, escreva um teste que tente violá-la
   (vitest, em `tests/adversarial/sombra-11-*.test.ts`) e rode. Defeito só conta com teste ou comando que o
   demonstra. Todo teste negativo ("não aconteceu") precisa de um controle positivo no mesmo teste.
4. Pense em quem usa o produto de verdade: Host Windows 4K a 150% e Guest num celular (ver `AGENTS.md`).

## Entrega
Escreva `docs/reviews/sombra-11.md` com:
- **Veredito**: APROVADA ou REJEITADA.
- **Defeitos** numerados, cada um com: regra violada, arquivo:linha, cenário concreto que falha, e a prova
  (comando + saída real, ou nome do teste + resultado).
- **O que foi verificado e passou**, em 3-6 linhas.
- **O que NÃO foi verificado.**
- **Quanto você confia** em cada defeito (provado / provável).

Você só pode criar ou alterar `docs/reviews/sombra-11.md` e `tests/adversarial/sombra-11-*`. Não altere o código
do produto, não commite, não faça push.
