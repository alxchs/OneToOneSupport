# ORDEM DE SERVIÇO — FASE 03: E2EE e protocolo compartilhado
Branch: `fase/03-e2ee-protocolo` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §6 e §16, `docs/FASES.md` (**ADR-002 é a especificação de cripto**), `docs/HANDOFF.md`.

## Entregas
1. `src/shared/events/protocol.ts`: tipos do envelope v1 (`v,id,ts,type,payload`), união discriminada de todos os tipos da §16 (+ `GUEST_MUTED`, `CLEAR_TAB`, `PLAY/PAUSE/SEEK`, `RECONNECT`, `ERROR`), guardas de tipo e validação runtime de cada mensagem (rejeitar formato desconhecido, tamanho excessivo, campos extras perigosos).
2. Interface `CryptoProvider` em `src/shared/crypto/`. Implementações: `electron/crypto/handshake.ts` + `cipher.ts` com `sodium-native`; `src/shared/crypto/browser.ts` com `libsodium-wrappers-sumo`. **As duas devem interoperar byte a byte.**
3. Handshake: X25519 efêmero; chaves de sessão por direção via `crypto_kx`; ChaCha20-Poly1305 IETF; nonce = prefixo de direção (4 B) + contador (8 B) monotônico; receptor rejeita contador repetido/regressivo e nonce de outra direção; ciphertext adulterado falha limpo (sem exceção vazando segredo). Zerar (`sodium_memzero`) chaves ao encerrar sessão. Nunca logar chave, segredo, plaintext.
4. Fragmento do convite: codificação/decodificação de `pk_h` em base64url + testes (o `#` nunca vai ao servidor: função que monta a URL e teste que `pk` não aparece em path/query).
5. Testes: vetores fixos; roundtrip Node↔Node, Node↔browser (rodar o provider browser em Node/vitest), replay, reorder, tamper, chave errada, mensagem truncada, 10 000 mensagens sem colisão de nonce.

## Verificação (cole no HANDOFF)
`npm run typecheck` · `npm test` · lista dos testes de interoperabilidade com a saída real.

## Aceite
Node e browser cifram/decifram entre si; nenhum uso do segredo ECDH cru como chave (grep prova); replay/tamper rejeitados; nenhuma dependência nova fora de ADR.
## Não fazer
Servidor, UI, WS real (isto é fase 04). Nada de push. Encerrar com HANDOFF e parar.
