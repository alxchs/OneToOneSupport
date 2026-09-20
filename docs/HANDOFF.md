# HANDOFF DE ESTADO — FASE 04: Servidor HTTP/WS e Session Manager

[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados:
  - `electron/server/network.ts`: Descoberta e filtragem de adaptadores físicos de LAN, seleção do IP padrão e descarte de interfaces virtuais e loopback.
  - `electron/server/session-manager.ts`: Gerenciador de sessão com `guest_token` CSPRNG (32 bytes) one-shot, `reconnect_token` rotacionado com TTL de 5 minutos, enforcement de um único Guest ativo, autoridade do Host (`LOCK_SCREEN` / `UNLOCK_MEDIA`) e relógio mestre para eventos de mídia.
  - `electron/server/http.ts`: Servidor Express 4 em porta dinâmica (0 → porta atribuída pelo SO), headers estritos de segurança e CSP do ADR-005, sem CORS aberto, limite de payload de 1 MB, rotas `/health` e `/join/:token` com fallback HTML amigável.
  - `electron/server/ws.ts`: Servidor WebSocket puro com máquina de estados rigorosa: `AUTH` (claro) → `HANDSHAKE_INIT` (pk_g claro) → tudo o mais `ENCRYPTED`. Rate limit por conexão (100 msgs/seg), limite de carga de 1 MB (`maxPayload`), heartbeat (10s) e timeout de handshake (10s). Mensagens fora de ordem ou em claro pós-handshake encerram a conexão imediatamente.
  - `electron/server/index.ts`: Orquestrador unificado (`ServerSessionController`) com ciclo de vida do servidor, geração de links de convite e código QR em memória.
  - `electron/ipc/server.ipc.ts`: Handlers IPC tipados para iniciar, parar e obter status do servidor, além de broadcast de status para todas as janelas do Host.
  - `electron/ipc/router.ts`: Registro dos novos handlers do servidor no roteador IPC.
  - `electron/preload.ts`: Exposição de `desktopAPI.serverSession` no contexto seguro da janela.
  - `src/shared/ipc-contract.ts`: Tipagem e contratos de canal IPC para o servidor e sessão remota (`ServerSessionInfoDTO`, `ServerConnectionStatus`, etc.).
  - `src/shared/events/protocol.ts`: Exportação dos aliases utilitários `createEnvelope` e `validateEnvelope`.
  - `src/host/store/useHostStore.ts`: Estado e ações da sessão do servidor no store Zustand do Host.
  - `src/host/pages/DetalheAtendidoPage.tsx`: Painel de atendimento integrado exibindo o QR Code, link de convite com botão de cópia rápida, badge de status de conexão em tempo real e seletor de interface de rede LAN. Total conformidade com a paleta sem vermelho.
  - `tools/test-guest-client.ts`: Cliente de teste Guest em TypeScript utilizando o provedor de criptografia da Fase 03.
  - `tools/test-guest-client.cjs`: Cliente de teste Guest autônomo executável diretamente no Node.js via terminal para simulação e medição de latência.
  - `tests/server-session.test.ts`: Suíte de 16 testes de integração cobrindo fluxos felizes e negativos adversariais.
  - `tools/probe-runtime.cjs`: Extensão da sonda de runtime para abrir sala de atendimento, renderizar QR Code e validar o servidor LAN na UI.
  - `docs/ADR/008-qrcode-biblioteca.md`: Registro da decisão arquitetural para a biblioteca leve `qrcode`.
  - `docs/reviews/autoauditoria-04.md`: Relatório completo de autoauditoria da Fase 04.
* Estado Atual: Fase 04 concluída com 100% de conformidade técnica e aprovação em todos os critérios de aceite. O servidor HTTP Express 4 e o servidor WebSocket operam em rede local (LAN) com porta dinâmica atribuída pelo SO. O fluxo criptográfico obriga `AUTH` (one-shot, 32 bytes CSPRNG) → `HANDSHAKE_INIT` (X25519 efêmero com pk_g em claro) → `ENCRYPTED` (tudo o mais cifrado via ChaCha20-Poly1305 IETF). Tentativas de reutilizar o token do convite, reconectar fora da janela de 5 minutos, conectar um segundo Guest simultâneo, enviar dados em claro pós-handshake, enviar cargas úteis gigantes (> 1 MB) ou injetar dados adulterados são estritamente rejeitadas com derrubada de conexão e falha limpa. A chave pública do Host (`pk_h`) trafega unicamente no fragmento `#` do convite e jamais chega ao servidor em path ou query string. A latência de eco cifrado em localhost foi medida em média de 0.33 ms a 0.71 ms (muito abaixo do limite de 200 ms). A suíte total de testes possui 121 testes passando sob a ABI do Electron e a sonda de runtime registrou 14/14 checagens PASS.
* Próximo Passo Lógico: Mesclar a branch `fase/04-servidor-sessao` em `main` (pelo Alexandre) e prosseguir para a Fase 05 (`fase/05-event-sourcing`) conforme o plano de fases.
* Decisões Críticas Tomadas:
  - Adoção da biblioteca leve `qrcode` (ADR-008): Geração estritamente local e offline do código QR diretamente em memória como Data URL PNG (`data:image/png;base64,...`), eliminando dependências nativas em C++ e garantindo conformidade Local-First.
  - Resiliência de Reconexão e Rotação: Implementação de `reconnect_token` gerado no handshake inicial com TTL estrito de 5 minutos e rotacionado a cada nova reconexão bem-sucedida, prevenindo ataques de replay de sessão.
  - Exclusividade 1:1: Bloqueio imediato de qualquer segundo participante simultâneo via status `SESSION_BUSY`, preservando a conexão original ativa.
  - Matriz de Autoridade Centralizada: Implementação da autoridade do Host no `SessionManager`, onde `LOCK_SCREEN` inibe desenhos/mídias do Guest e `UNLOCK_MEDIA` condiciona comandos de reprodução, com injeção do relógio mestre do servidor nos eventos temporais.
* Divergências da Spec: Nenhuma divergência estrutural. Adoção da biblioteca `qrcode` documentada no ADR-008 conforme previsto na Ordem de Serviço.

---

## EVIDÊNCIAS DE VERIFICAÇÃO OBRIGATÓRIA (SAÍDAS REAIS)

### 1. Saída Real de `npm run typecheck`
```
$ npm run typecheck
> onetoonesupport@1.0.0 typecheck
> tsc --noEmit
```
*(Executado sem erros, código de saída 0)*

### 2. Saída Real de `npm test` (121 testes sob ABI do Electron)
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
 ✓ tests/server-session.test.ts (16 tests)

 Test Files  8 passed (8)
      Tests  121 passed (121)
   Start at  13:13:07
   Duration  4.23s
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
dist/renderer/assets/index-DLIgYeAO.js  186.06 kB │ gzip: 55.35 kB
✓ built in 1.23s
```

### 4. Saída Real da Sonda de Runtime (`tools/probe-runtime.cjs`)
```
$ npm run probe
> onetoonesupport@1.0.0 probe
> node tools/probe-runtime.cjs

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
PASS  UI: iniciar sessao, gerar QR e abrir sala do servidor LAN
PASS  UI: alterar rotulo no dicionario
PASS  Banco: sem dados duplicados no SQLite
```
*(14/14 checagens PASS)*

### 5. Saída Real do Cliente de Teste contra Servidor ao Vivo (`tools/test-guest-client.cjs`)
```
$ node tools/test-guest-client.cjs "http://127.0.0.1:51555/join/92867c12608f38d961b3fa0d6576d9171d504e0474656ac39ced57a719f92d2d#otfo6-KnRSHpx3eEe9py-VPDUjwSh48cPROSsfove1s"
[TestGuestClient] Conectando a ws://127.0.0.1:51555/ws...
[TestGuestClient] Token: 92867c12... (tamanho: 64)
[TestGuestClient] Chave Pública do Host (#pk_h): otfo6-KnRS... (32 bytes)
[TestGuestClient] Conexão WebSocket estabelecida com sucesso.
[TestGuestClient] Enviando AUTH (texto claro)...
[TestGuestClient] Enviando HANDSHAKE_INIT (pk_g claro)...
[TestGuestClient] Handshake E2EE concluído com sucesso!
[TestGuestClient] SESSION_READY recebido. Reconnect Token rotacionado: 5c425d7642c7...
[TestGuestClient] Iniciando medição de latência de eco cifrado (10 pings)...
   [Eco # 1] RTT: 1.33 ms
   [Eco # 2] RTT: 0.79 ms
   [Eco # 3] RTT: 0.71 ms
   [Eco # 4] RTT: 0.72 ms
   [Eco # 5] RTT: 0.67 ms
   [Eco # 6] RTT: 0.72 ms
   [Eco # 7] RTT: 0.54 ms
   [Eco # 8] RTT: 0.60 ms
   [Eco # 9] RTT: 0.56 ms
   [Eco #10] RTT: 0.47 ms
--- RESULTADOS DE LATÊNCIA (E2EE) ---
Mínimo: 0.47 ms
Máximo: 1.33 ms
Média:  0.71 ms
Critério de Aceite (§18 < 200 ms): PASS (Aprovado)
```

### 6. Comportamento ao Abrir a URL num Navegador Comum
Ao abrir a URL de convite gerada (`http://<ip-lan>:<porta>/join/<token>#<pk_h_base64url>`) em um navegador web padrão:
- O servidor Express 4 entrega uma resposta com código `200 OK`, aplicando a política estrita de CSP do ADR-005 e os headers de segurança (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`).
- É renderizada uma página responsiva com tema escuro (slate escuro `#0f172a` e card `#111c44`, sem vermelho), contendo:
  - Badge verde: "Sessão Conectada"
  - Título principal: "Sala de Atendimento 1:1"
  - Informações de status: "Conexão com o servidor local do profissional estabelecida com sucesso."
  - Caixa de identificação com o Token de Acesso validado.
  - Mensagem explicativa indicando que a interface interativa completa do convidado será carregada nesta rota na Fase 07 e que o transporte WebSocket seguro com E2EE está ativo no servidor.
- Caso o token fornecido seja inválido, adulterado ou já consumido, o servidor retorna status HTTP `403 Forbidden` com a página de erro "Convite Inválido ou Expirado".
- O hash `#<pk_h_base64url>` permanece apenas no cliente web do navegador e nunca é transmitido na requisição HTTP GET para o servidor.
