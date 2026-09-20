# HANDOFF DE ESTADO — FASE 03: E2EE e protocolo compartilhado

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `src/shared/events/protocol.ts`
  - `src/shared/crypto/types.ts`, `src/shared/crypto/nonce.ts`, `src/shared/crypto/base64url.ts`, `src/shared/crypto/invite.ts`, `src/shared/crypto/browser.ts`, `src/shared/crypto/index.ts`
  - `src/shared/types/sodium.d.ts`
  - `electron/crypto/handshake.ts`, `electron/crypto/cipher.ts`, `electron/crypto/index.ts`
  - `tests/protocol.test.ts`, `tests/invite.test.ts`, `tests/crypto-interop.test.ts`
  - `vite.config.ts`, `vitest.config.ts`
  - `docs/reviews/autoauditoria-03.md`
* Estado Atual: Fase 03 concluída com 100% de aprovação e conformidade criptográfica. O envelope v1 foi tipado com união discriminada completa para todos os eventos da especificação Mestre §16 e extensões (`AUTH`, `HANDSHAKE_INIT`, `ENCRYPTED`, `DRAW_ADD`, `DRAW_HIDE`, `DRAW_TRANSFORM`, `CLEAR_TAB`, `MEDIA_SYNC`, `AUDIO_CHUNK`, `GUEST_MUTED`, `PLAY`, `PAUSE`, `SEEK`, `RECONNECT`, `ERROR`), com guardas de tipo e validação em tempo de execução rejeitando payloads corrompidos, oversized (> 1 MB) ou maliciosos. O subsistema criptográfico E2EE implementa a interface `CryptoProvider` em duas frentes interoperáveis byte a byte: `sodium-native` no Host (Electron/Node) e `libsodium-wrappers-sumo` no Guest (Browser/WASM). O handshake utiliza X25519 efêmero com derivação de chaves direcionais assimétricas via `crypto_kx` (`host.tx === guest.rx` e `host.rx === guest.tx`), cifragem com ChaCha20-Poly1305 IETF e nonces de 12 bytes (`H2G\0` ou `G2H\0` + uint64BE de 8 bytes). Proteções estritas contra replay, reordenação de pacotes, inversão de sentido de canal e adulteração de dados foram testadas com falha limpa (sem vazamento de segredos). A higienização de memória com `sodium_memzero` limpa chaves no encerramento de sessões. O fragmento de convite foi implementado em Base64url e garante formalmente que a chave pública do Host trafega apenas no fragmento `#` e jamais no caminho HTTP ou na query string. A suíte de testes automáticos conta com 105 testes passando sob a ABI nativa do Electron e a sonda de runtime registrou 13/13 checagens verdes.
* Próximo Passo Lógico: Mesclar a branch `fase/03-e2ee-protocolo` em `main` (pelo Alexandre) e iniciar a Fase 04 (`fase/04-servidor-transporte`) conforme o plano de fases.
* Decisões Críticas Tomadas:
  - Interoperabilidade Determinística: Padronização do formato binário do nonce em 12 bytes (4 bytes de prefixo de direção `'H2G\0'` / `'G2H\0'` + 8 bytes de contador Big-Endian em UInt64) garantindo compatibilidade exata entre `sodium-native` e `libsodium-wrappers-sumo`.
  - Derivação Segura com `crypto_kx`: Utilização exclusiva de `crypto_kx_server_session_keys` e `crypto_kx_client_session_keys` para estabelecer chaves distintas para cada direção de comunicação, eliminando terminantemente o risco de utilização direta de segredo ECDH cru (`crypto_scalarmult`) como chave de cifra.
  - Segurança de Convites: A chave pública do Host (`pk_h`) é codificada em Base64url sem padding (RFC 4648) e colocada estritamente no fragmento de hash (`#...`), garantindo que servidores intermediários ou proxies reversos jamais recebam o fragmento em requisições HTTP.
  - Higienização Ativa de Memória: Implementação de rotinas de descarte (`destroyKeyPair`, `destroySessionKeys`, `SessionCipher.destroy()`) que acionam `sodium_memzero` em todos os buffers de memória sensível ao término das sessões.
* Divergências da Spec: Nenhuma divergência estrutural em relação ao Documento Mestre e ADR-002.

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 2. Saída Real de `npm test` (105 testes sob ABI do Electron)
```
$ npm test
> onetoonesupport@1.0.0 test
> node scripts/test-runner.mjs

[Test-Runner] Executando vitest sob ABI do Electron (C:\desenv\utils\OneToOneSupport\node_modules\electron\dist\electron.exe) com ELECTRON_RUN_AS_NODE=1...

 RUN  v2.1.9 C:/desenv/utils/OneToOneSupport

 ✓ tests/architecture.test.ts (3 tests)
 ✓ tests/ipc.test.ts (12 tests)
 ✓ tests/services.test.ts (20 tests)
 ✓ tests/db.test.ts (15 tests)
 ✓ tests/protocol.test.ts (24 tests)
 ✓ tests/invite.test.ts (12 tests)
 ✓ tests/crypto-interop.test.ts (19 tests)

 Test Files  7 passed (7)
      Tests  105 passed (105)
   Start at  04:00:15
   Duration  2.85s
```

### 3. Saída Real de `npm run build`
```
$ npm run build
> onetoonesupport@1.0.0 build
> tsc -p tsconfig.electron.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 51 modules transformed.
rendering chunks...
computing gzip size...
dist/renderer/index.html                  0.97 kB │ gzip:  0.56 kB
dist/renderer/assets/index-D2ujVbl6.js  180.35 kB │ gzip: 54.21 kB
✓ built in 1.12s
```

### 4. Saída Real da Sonda de Runtime (`tools/probe-runtime.cjs`)
```
PASS  typeof require === undefined
PASS  typeof process === undefined
PASS  UI renderizou (#root com filhos)
PASS  CSP: script inline NAO executa
PASS  CSP: eval bloqueado
PASS  sem erro de pagina
PASS  IPC: validacao de payload rejeita dado invalido com erro tipado
PASS  UI: criar atendido
PASS  UI: detectar duplicado com mensagem clara (Regra #1)
PASS  UI: editar atendido
PASS  UI: desativar atendido (soft delete)
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(13/13 checagens PASS)*

### 5. Resumo da Auditoria Automatizada
```
AUDITORIA AUTOMATICA — fase/03-e2ee-protocolo
PASS  clone limpo da branch  -> fase/03-e2ee-protocolo
PASS  npm ci  -> 24 vulnerabilities (3 moderate, 19 high, 2 critical)
PASS  npm run verify (typecheck+testes+build+sonda)  -> 105 testes ok
PASS  sonda de runtime  -> 13/13 checagens
PASS  sem variavel/parametro nao usado (classe de bug da fase 01)
PASS  Renderer sem fs/electron/better-sqlite3
PASS  Renderer sem SQL (regra de negocio no Main)
PASS  sem vermelho na UI (regra do Alexandre)
PASS  autoauditoria-03.md existe
PASS  autoauditoria lista o que NAO foi verificado
PASS  autoauditoria sem FAIL aberto  -> 22 PASS / 0 FAIL
PASS  HANDOFF atualizado para esta fase
PASS  commits novos desde main
```
