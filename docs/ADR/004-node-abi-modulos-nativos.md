# ADR-004: Compatibilidade de ABI do Node e Execução de Testes Nativos

## Contexto
O ambiente do sistema operacional pode possuir uma versão global do Node.js (como Node 24), enquanto o Electron empacota sua própria versão interna do runtime Node (Node 20 LTS na versão 30 do Electron). Módulos C++ nativos (`better-sqlite3`, `sodium-native`) são vinculados à ABI específica da versão do V8 sob a qual são compilados. Carregar um binário compilado para Node 24 dentro do Electron (ou vice-versa) resulta em erro de execução (`ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION mismatch`).

## Decisão
1. **Rebuild para Electron:** Todos os módulos nativos C++ são reconstruídos obrigatoriamente para a ABI do Electron usando a ferramenta `@electron/rebuild` (script `npm run rebuild`).
2. **Execução de Testes:** Os testes automatizados (vitest) que utilizam o banco de dados e os módulos nativos são executados na mesma ABI do Electron. Para isso, utiliza-se a variável de ambiente `ELECTRON_RUN_AS_NODE=1`, fazendo com que o executável do Electron atue como o runtime Node.js da execução de testes.
3. **Isolamento de Scripts:** Os scripts de teste utilizam um runner dedicado (`scripts/test-runner.mjs`) que garante a inicialização de `ELECTRON_RUN_AS_NODE=1` de maneira transparente e multiplataforma.

## Consequências
- Fim definitivo de erros de incompatibilidade de ABI durante desenvolvimento, testes e execução de produção.
- Os testes unitários e de integração validam exatamente o mesmo código binário que o aplicativo empacotado executará.
