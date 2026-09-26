# ADR-017: Empacotamento de Módulos Nativos (asarUnpack) e Exclusão de Puppeteer

## Contexto
Durante o empacotamento do OneToOneSupport para Windows com `electron-builder`:
1. **Módulos Nativos C++:** O projeto utiliza `better-sqlite3` (11.8.1) para persistência SQLite relacional e `sodium-native` (5.1.0) para criptografia E2EE de alta performance (ChaCha20-Poly1305 e X25519), além de `@napi-rs/canvas` (dependência opcional do `pdfjs-dist`). Módulos nativos compilam para arquivos binários `.node` (bibliotecas de vínculo dinâmico do Windows). O sistema operacional não consegue mapear em memória nem executar chamadas `dlopen`/`LoadLibraryEx` a partir do interior de um contêiner `.asar`. Se mantidos dentro do ASAR, o carregamento de `better-sqlite3` ou `sodium-native` falha fatalmente em tempo de execução (`ERR_DLOPEN_FAILED`).
2. **Puppeteer e Dependências de Teste:** O `puppeteer` (`^22.15.0`) foi configurado com `.npmrc` contendo `puppeteer_skip_download=true` (com `runtime=electron`/`target=30.5.1`), ocupando apenas ~420 KB e reaproveitando o executável do próprio Electron via porta CDP para a sonda de runtime (`tools/probe-runtime.cjs`). Conforme corrigido no ADR-015, o puppeteer não gera problema de centenas de megabytes no instalador deste projeto. No entanto, por ser uma ferramenta estritamente de teste e validação de desenvolvimento, incluir seus arquivos no pacote de produção distribuído aos clientes finais constituiria descuido de empacotamento e poluição de artefato.

## Decisão
1. **Descompactação Explícita de Módulos Nativos (`asarUnpack`):**
   Configurar `asar: true` com diretiva `asarUnpack` em `electron-builder.yml` cobrindo todos os módulos nativos e binários `.node`:
   - `"**/*.node"`
   - `"node_modules/better-sqlite3/**/*"`
   - `"node_modules/sodium-native/**/*"`
   - `"node_modules/@napi-rs/**/*"`
   O `electron-builder` extrai esses diretórios para `resources/app.asar.unpacked/`, permitindo que o Electron resolva e carregue os módulos nativos normalmente pelo sistema operacional.
2. **Exclusão Explícita de Dependências de Teste:**
   Definir no array `files` de `electron-builder.yml` filtros negativos explícitos:
   - `"!node_modules/puppeteer/**/*"`
   - `"!node_modules/@puppeteer/**/*"`
   - `"!**/*.map"`
   Isso garante que o Puppeteer não seja empacotado no binário do cliente, mantendo o artefato de distribuição limpo e sem ferramentas de automação/depuração.
3. **Alvos de Distribuição Windows:**
   - **NSIS (`target: nsis`):** Instalador guiado padrão com opção de escolha de diretório (`allowToChangeInstallationDirectory: true`), atalhos e integração com o Firewall do Windows (ADR-016).
   - **Portable (`target: portable`):** Executável autônomo para execução sem necessidade de instalação administrativa.

## Consequências
- Persistência com SQLite e criptografia com Libsodium funcionam sem falhas no aplicativo empacotado.
- Redução da superfície de ataque do pacote de distribuição ao remover bibliotecas de teste (Puppeteer).
- Disponibilidade de instalador NSIS e executável portátil para os usuários.
