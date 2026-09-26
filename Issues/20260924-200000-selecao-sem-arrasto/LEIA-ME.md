# Issues - Seleção não arrasta (decisão A do dono, com o código preservado) — 2026-09-24

- Decisão do dono, tomada em 2026-09-24 sobre as opções levantadas no D12.3
  (`docs/reviews/autoauditoria-ferramentas-sem-mover.md`): **opção A — desligar o arrasto no modo Seleção**,
  com uma condição explícita: **manter o código no lugar, porque o arrasto deve voltar numa versão futura.**
- Motivo: hoje arrastar um objeto muda só a tela local. Não gera evento, não persiste no SQLite, não vai
  para o Guest e o objeto pula de volta na primeira reconstrução do quadro. Dá ao profissional a impressão
  de que moveu, e não moveu.
- O que falta para o arrasto valer de verdade (a versão futura): evento de movimentação no protocolo,
  redutor correspondente, persistência append-only, replicação E2EE para o Guest e integração com
  desfazer/refazer. Isso é a opção B do D12.3 e exige ADR.
