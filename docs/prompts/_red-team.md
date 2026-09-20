# ORDEM DE SERVIÇO — RED TEAM da fase {{FASE}}
Você NÃO é o implementador. Seu papel é **atacante**: provar que a entrega da fase {{FASE}} tem falhas de segurança, robustez ou de regra de negócio que os testes existentes não pegam.
Leia: `AGENTS.md`, a ordem da fase (`{{ORDEM}}`), o diff da fase (`git diff {{BASE}}...HEAD`) e `docs/HANDOFF.md`.

## O que entregar
1. Levante as regras e garantias da fase (do AGENTS.md, da ordem e do código). Para **cada uma**, escreva ao menos um teste adversarial em `{{TESTDIR}}/`.
2. Categorias mínimas: entrada inválida/nula/gigante/unicode; repetição e idempotência; ordem trocada e concorrência; **estado após falha parcial** (queda no meio de um fluxo, recurso de uso único consumido sem concluir); segredos (comparação em tempo constante, logs, vazamento em mensagem de erro); limites (rate limit, timeout, tamanho, TTL); permissões (ator sem direito); path traversal; injeção.
3. Relatório `docs/reviews/redteam-{{FASE}}.md`: tabela ataque → resultado (**DEFENDIDO** / **VULNERAVEL** com o teste que falha) → arquivo:linha; e a lista do que **NÃO** foi atacado.

## Regras de ferro
- Só crie/edite arquivos em `{{TESTDIR}}/` e `docs/reviews/redteam-{{FASE}}.md`. **Qualquer outro caminho faz a sua entrega ser descartada.**
- NÃO corrija código de produção. Um teste que expõe falha REAL deve **FALHAR** (sem skip/todo/xfail, sem afrouxar a asserção). Não invente falhas: se você não consegue fazer o teste falhar honestamente, ele deve passar e o ataque é DEFENDIDO.
- Rode APENAS os seus testes ({{TESTCMD}} filtrando `{{TESTDIR}}`), em primeiro plano; nunca encerre esperando tarefa em segundo plano.
- Não afirme nada que você não executou. Todo nome citado no relatório precisa existir.
- Commit único: `Red team fase {{FASE}}: N testes adversariais (X vulneráveis)`. Nada de push nem merge.
