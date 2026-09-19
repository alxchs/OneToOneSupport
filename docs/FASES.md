# Plano de fases (autoridade: chefe técnico)

Uma fase = uma branch `fase/NN-slug`, criada de `main` depois que a anterior foi mergeada.
Ordens de serviço em `docs/prompts/`. Veredito de cada fase em `docs/reviews/fase-NN.md`.

| Fase | Branch | Entrega | Depende de | UI a abrir? |
| --- | --- | --- | --- | --- |
| 01 | `fase/01-scaffolding-db` | Monorepo, .gitignore, Electron seguro, 7 tabelas, `createAtendido` com NOT EXISTS, testes | — | Sim (janela abre) |
| 02 | `fase/02-servicos-ipc-host` | Domain services, IPC tipado, dicionário dinâmico, CRUD de atendidos/sessões, shell React do Host | 01 | Sim |
| 03 | `fase/03-e2ee-protocolo` | Handshake X25519, cifra ChaCha20-Poly1305, envelope v1, tipos de evento compartilhados | 01 | Não |
| 04 | `fase/04-servidor-sessao` | Express+WS, tokens one-shot, reconnect 5 min, session manager, convite+QR | 02, 03 | Sim (QR) |
| 05 | `fase/05-event-sourcing` | Eventos append-only, snapshots, revisões imutáveis, undo/redo, reconstrução | 02 | Não |
| 06 | `fase/06-canvas-hidpi` | Engine Fabric.js HiDPI, ferramentas, emissão de `DRAW_*` | 05 | Sim (3840x2160@150%) |
| 07 | `fase/07-guest-mobile` | JoinFlow, GuestRoom, touch, CSP, permissões via `UNLOCK_MEDIA` | 04, 06 | Sim (emulação mobile) |
| 08 | `fase/08-abas-midia-assets` | Abas image/pdf/video/audio, Range requests, mídia sincronizada, arquivamento em %APPDATA% | 04, 05, 07 | Sim |
| 09 | `fase/09-relatorio-pdf` | Template HTML + Puppeteer, miniaturas do canvas | 05, 06 | Sim (PDF aberto) |
| 10 | `fase/10-empacotamento-aceite` | electron-builder, firewall, CI executado de verdade, testes de aceite V1.0, latência < 200 ms | todas | Sim |

Fase 05 pode andar em paralelo com 03/04 (só depende de 02), mas **nunca duas IAs na mesma branch**.

## Decisões já tomadas pelo chefe (viram ADR na fase 01)
- **ADR-001 Rede:** V1 é LAN. O próprio Express do Host serve o Guest e o WS; o convite usa o IP da LAN e a porta dinâmica.
  O host do convite é configurável (`ConfiguracaoGlobal`) para um relay futuro, que só encaminharia texto cifrado. Isso concilia
  "local-first" com a URL de relay do Mestre, que não tem escopo definido para V1.
- **ADR-002 Cripto:** `sodium-native` só existe no Node. O Guest (navegador) usa `libsodium-wrappers-sumo` (mesma libsodium, WASM).
  O segredo ECDH cru **nunca** é usado como chave: usar `crypto_kx` (X25519 + BLAKE2b) para gerar chaves `rx/tx` por direção.
  ChaCha20-Poly1305 **IETF** (nonce de 12 bytes = 4 bytes de prefixo de direção + 8 bytes de contador), contador estritamente crescente, replay rejeitado.
- **ADR-003 HiDPI:** o Fabric 6 já tem `enableRetinaScaling`. Aplicar o `setDimensions(..., { cssOnly: true })` do Mestre **sem escalar duas vezes**;
  provar com teste com `devicePixelRatio` simulado em 1.5 e 1 (traço no ponto clicado, sem deslocamento).
- **ADR-004 Node/ABI:** máquina tem Node 24, spec pede Node 20 e o Electron traz o Node dele. Módulos nativos compilam para a ABI do Electron
  (`@electron/rebuild`). Os testes do DB precisam rodar na **mesma ABI** (ex.: vitest sob `ELECTRON_RUN_AS_NODE=1`), documentado e funcionando na fase 01.
- **ADR-005 CSP do Guest:** `default-src 'self'` sozinho é insuficiente para WS; declarar `connect-src 'self' ws: wss:` e `img-src 'self' blob: data:`, `media-src 'self' blob:`.
- **Erro da spec corrigido:** `INSERT ... WHERE NOT EXISTS` sem `SELECT` é SQL inválido. O correto é `INSERT INTO ... SELECT ?,?,... WHERE NOT EXISTS (...)`.
  Colunas anuláveis comparam com `IS` (com `=`, `NULL = NULL` é falso e o duplicado passaria).
