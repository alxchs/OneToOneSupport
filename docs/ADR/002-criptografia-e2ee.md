# ADR-002: Arquitetura Criptográfica E2EE e Interoperabilidade Host-Guest

## Contexto
O Host executa em ambiente Node.js / Electron, onde a biblioteca C++ nativa `sodium-native` oferece o melhor desempenho de cifragem. Já o Guest executa em navegadores modernos (mobile e desktop), onde módulos nativos C++ não existem, necessitando de WebAssembly (`libsodium-wrappers-sumo`). Adicionalmente, utilizar o segredo ECDH compartilhado cru diretamente como chave simétrica é vulnerável e viola as melhores práticas criptográficas.

## Decisão
1. **Bibliotecas:** O Host adota `sodium-native` e o Guest adota `libsodium-wrappers-sumo`. Ambos operam sobre as mesmas primitivas da libsodium e devem interoperar byte a byte.
2. **Derivação de Chaves:** O segredo compartilhado ECDH (X25519) nunca é usado como chave de cifra direta. Utiliza-se a função de troca de chaves da libsodium (`crypto_kx`, baseada em BLAKE2b) para derivar chaves simétricas separadas para recepção (`rx`) e transmissão (`tx`).
3. **Cifra e Envelope:** Utiliza-se ChaCha20-Poly1305 IETF. O nonce de 12 bytes é composto por:
   - 4 bytes: prefixo discriminador de direção (Host->Guest vs Guest->Host).
   - 8 bytes: contador monotônico estritamente crescente (Big-Endian).
4. **Rejeição de Replay:** Mensagens com contadores repetidos, decrescentes ou com prefixo de direção incorreto são sumariamente descartadas e fecham a conexão.
5. **Ciclo de Vida:** Todas as chaves e segredos em memória são sanitizados com `sodium_memzero` ao encerrar a sessão. Segredos, chaves e fragmentos de URL nunca são registrados em logs.

## Consequências
- Interoperabilidade transparente e determinística entre Node e navegadores.
- Imunidade a ataques de replay e confusão de direção de pacotes.
- Isolamento total de tráfego entre canais tx e rx.
