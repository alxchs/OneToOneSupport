# ADR-007 — Remoto no GitHub (substitui AWS CodeCommit)
**Contexto:** o Documento Mestre previa AWS CodeCommit. O Alexandre decidiu usar GitHub.
**Decisão:** remoto único = GitHub. CI da fase 10 = GitHub Actions. Regra mantida: nenhum `git push` sem confirmação explícita do Alexandre naquele momento.
**Consequências:** o `.gitignore` continua exaustivo (binários nativos e `node_modules` não devem ir ao remoto). Repositório privado recomendado, pois há dados de atendimento em fixtures/testes. Nunca commitar `.env`, `*.db`, chaves ou tokens.
