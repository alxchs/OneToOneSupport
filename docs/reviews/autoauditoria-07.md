# Autoauditoria da Fase 07 — Guest mobile e Interoperabilidade E2EE
Executor: Antigravity (agy). Branch auditada: `fase/07-guest-mobile`.

## 1. Resumo Executivo
Todas as entregas da Ordem de Serviço da Fase 07 foram implementadas, testadas sob a ABI do Electron e verificadas em runtime real através de sonda automatizada com emulação mobile Chromium:
- **Fluxo de Entrada e Segurança de Fragmento (`src/guest/JoinFlow.tsx`):** Leitura segura do token de convite no pathname (`/join/:token`) e da chave pública do Host (`pk_h`) no fragmento de hash (`#pk_h`). O hash `#pk_h` é imediatamente expurgado da URL via `history.replaceState(null, '', window.location.pathname)` logo após a extração da chave, garantindo que o segredo não fique registrado em histórico de navegação nem em logs de proxy/servidor. Implementação completa dos 5 estados de conexão com telas amigáveis e feedback claro: Conectando, Aguardando Host, Reconectando, Sessão Encerrada e Convite Inválido/Expirado (sem vazar detalhes internos).
- **Cliente WebSocket Criptografado (`src/guest/ws/client.ts`):** Camada de transporte WebSocket com suporte à libsodium WebAssembly via `BrowserCryptoProvider`. Executa autenticação estrita (`AUTH` ou `RECONNECT`), derivação de chave de sessão por Diffie-Hellman com curvas elípticas Curve25519 (`crypto_kx`) e cifragem simétrica autenticada ChaCha20-Poly1305 IETF. Implementa reconexão automática resiliente com rotação de `reconnect_token` de uso único e TTL de 5 minutos, garantindo recuperação transparente de quedas de rede móvel.
- **Interface Mobile-First do Convidado (`src/guest/GuestRoom.tsx` e `src/guest/guest.css`):** Construída com foco no dispositivo alvo Motorola Edge 70 Pro (Android 16, 412x915):
  - Uso de `100dvh` para evitar saltos com o teclado virtual ou barras dinâmicas do navegador.
  - Safe area insets aplicadas no header e footer (`env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`).
  - Alvos de toque estritamente conformes com WCAG (mínimo de 48×48px) para todas as ferramentas e botões.
  - `touch-action: none` e `overscroll-behavior: none` no canvas para evitar scroll acidental ou gestos de pull-to-refresh.
  - Ausência total de efeitos baseados unicamente em hover (`:hover` encapsulado em `@media (hover: hover)`).
  - Consumo do dicionário dinâmico do sistema (ex.: exibição de rótulos configuráveis como "Atendido", "Paciente", etc.).
  - Paleta de cores estritamente conforme com a regra inegociável do Alexandre (zero vermelho, cores em azul `#0284c7`, verde `#059669`, âmbar `#d97706`, violeta `#7c3aed`, grafite `#0f172a` e branco `#ffffff`).
- **Sincronização Bidirecional e Permissões de Sala:**
  - O convidado desenha no canvas somente quando o Host permitir (`screenLocked === false`).
  - `LOCK_SCREEN` emitido pelo Host bloqueia imediatamente as interações do Guest e exibe overlay visual claro e informativo (`#guest-lock-overlay`).
  - Botões de reprodução de mídia do Guest permanecem desabilitados até a emissão do comando `UNLOCK_MEDIA` pelo Host.
  - O botão de mute de microfone do Guest opera localmente e emite a notificação cifrada `GUEST_MUTED`, permitindo que o Host veja na sua tela o status do áudio do convidado (`#badge-guest-muted`).
  - A troca de aba pelo Host (`TAB_SWITCH`) sincroniza automaticamente a visualização do Guest para a aba ativa sem perda do histórico de desenho.
- **Persistência Automática e Event Sourcing:**
  - Desenhos emitidos pelo Guest são decifrados no Host, persistidos no banco SQLite via `EventoService` com trigger de imutabilidade append-only (Migration 002) e propagados em tempo real para a tela do profissional.
- **Entrega do Bundle e Política CSP do ADR-005:**
  - Build Rollup dedicado do Guest gerando artefatos em `dist/guest`. Servido pelo servidor Express em `/join/:token` e rotas estáticas `/guest/assets`.
  - Cabeçalhos CSP estritos do ADR-005 atualizados para comportar WebAssembly (`script-src 'self' 'wasm-unsafe-eval'`), bloqueando absolutamente qualquer script inline ou externo e mantendo `eval()` desabilitado.
- **Suíte de Testes Automatizados e Sonda de Runtime:**
  - 14 novos testes dedicados em `tests/guest-mobile.test.ts`, elevando a cobertura total da aplicação para **172 testes passando** (100% de sucesso sob a ABI do Electron).
  - Sonda de runtime (`tools/probe-runtime.cjs`) executada com sucesso contra o app Electron empacotado e Chromium real emulando o Motorola Edge 70 Pro sob Android 16 (DPR 2.625, viewport 412x915, Touch events via CDP). Todas as 21 verificações aprovadas com "PASS" e geração da evidência visual em `docs/guest-mobile-emulation.png`.

---

## 2. Critérios de Aceite e Evidências de Execução Real

| Critério de Aceite | Comando Executado | Saída Real / Evidência | Status |
| --- | --- | --- | --- |
| 1. Servidor Express entrega bundle compilado do Guest em `/join/:token` | `npm test -- tests/guest-mobile.test.ts` | Serviu HTML com id `#root` e assets `/guest/assets/` com status 200 | PASS |
| 2. Cabeçalhos CSP estritos do ADR-005 com `'wasm-unsafe-eval'` | `npm test -- tests/guest-mobile.test.ts` | Headers `Content-Security-Policy` validados sem violações de console | PASS |
| 3. Remoção do fragmento `#pk_h` da URL pós-handshake | `node tools/probe-runtime.cjs` | `window.location.hash === ''` verificado na sonda de runtime | PASS |
| 4. Cifragem E2EE X25519 + ChaCha20-Poly1305 IETF no navegador | `npm test -- tests/guest-mobile.test.ts` | Handshake completo com libsodium WASM e tráfego cifrado bidirecional | PASS |
| 5. Token one-shot de convite e rejeição de 2º guest | `npm test -- tests/guest-mobile.test.ts` | Segundo convidado recebe erro tipado e token consumido rejeitado | PASS |
| 6. Sincronização de desenho Guest -> Host com persistência SQLite | `npm test -- tests/guest-mobile.test.ts` | Traço do Guest persistido na tabela `Eventos` e refletido no Host | PASS |
| 7. Sincronização Host -> Guest em tempo real | `npm test -- tests/guest-mobile.test.ts` | Evento `DRAW_ADD` do Host transmitido e renderizado no Guest | PASS |
| 8. `LOCK_SCREEN` bloqueia interação e exibe overlay claro no Guest | `node tools/probe-runtime.cjs` | Overlay `#guest-lock-overlay` exibido e removido conforme comando do Host | PASS |
| 9. `UNLOCK_MEDIA` habilita controles de mídia do Guest | `npm test -- tests/guest-mobile.test.ts` | Botões de mídia habilitados sob liberação explícita | PASS |
| 10. Mute local do Guest emite `GUEST_MUTED` e reflete no Host | `node tools/probe-runtime.cjs` | Botão `#btn-guest-mute` acionado e badge `#badge-guest-muted` exibido no Host | PASS |
| 11. Sincronia de abas (`TAB_SWITCH`) | `npm test -- tests/guest-mobile.test.ts` | Mudança de aba no Host atualiza estado ativo no Guest | PASS |
| 12. Reconexão automática com rotação de token (TTL 5 min) | `npm test -- tests/guest-mobile.test.ts` | Reconexão bem-sucedida após queda abrupta com novo token emitido | PASS |
| 13. Testes adversariais (mensagem em claro, ações proibidas) | `npm test -- tests/guest-mobile.test.ts` | Queda imediata de conexão ao violar envelope cifrado ou emitir comando proibido | PASS |
| 14. Mobile-first: alvos de toque ≥ 48px, 100dvh e safe-areas | `node tools/probe-runtime.cjs` | Layout verificado em viewport 412x915 com DPR 2.625 | PASS |
| 15. Paleta sem cor vermelha (Regra do Alexandre) | `node tools/auditar.cjs` | 0 ocorrências de vermelho nos componentes e folhas de estilo | PASS |
| 16. Verificação estrita de TypeScript (`typecheck`) | `npm run typecheck` | `tsc --noEmit` executado com código de saída 0 | PASS |
| 17. Ausência de variáveis ou parâmetros não utilizados | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | 0 erros TS6133/TS6138 | PASS |
| 18. Suíte completa de testes automatizados (172 testes) | `npm test` | 11 arquivos de teste, 172/172 testes passando sob ABI Electron | PASS |
| 19. Build de produção (Host + Guest) | `npm run build` | Bundles `dist/renderer` e `dist/guest` gerados sem falhas | PASS |
| 20. Sonda de runtime estendida com emulação mobile Chromium | `node tools/probe-runtime.cjs` | 21/21 checagens verdes, simulação de touch e captura de tela | PASS |
| 21. Evidência visual do Guest mobile emulado | `ls docs/guest-mobile-emulation.png` | Arquivo PNG de 50 KB registrado em `docs/guest-mobile-emulation.png` | PASS |
| 22. Ausência de sinais de risco em linhas adicionadas | `node tools/sinais-risco.cjs` | 0 falhas contra origin/main | PASS |
| 23. Conformidade das afirmações da documentação | `node tools/verificar-afirmacoes.cjs` | 0 afirmações não encontradas | PASS |

---

## 3. Ataque à Própria Entrega (Testes Adversariais)

1. **Ataque de Exfiltração de Chave Pública pelo Hash da URL:**
   - Ataque: O convidado acessa o link de convite contendo `#pk_h` na barra de navegação e tenta ler a chave através do histórico de navegação ou redirecionamentos futuros.
   - Resultado: A função `JoinFlow.tsx` executa `history.replaceState(null, '', window.location.pathname)` imediatamente após capturar a chave no carregamento da página. Na sonda de runtime, comprovou-se que `window.location.hash === ''` e a URL visível permanece limpa.
2. **Tentativa de Injeção de Mensagem em Claro Pós-Handshake:**
   - Ataque: Um atacante no meio do transporte WebSocket tenta injetar um envelope JSON desprotegido (`DRAW_ADD` sem cifragem) fingindo ser uma mensagem legítima.
   - Resultado: O servidor de sessão no Host detecta violação de protocolo e sumariamente fecha a conexão do socket com código fatal, desvinculando o cliente imediatamente (`expect(sessionController.getStatus()?.guestConnected).toBe(false)`).
3. **Tentativa de Escalação de Privilégios pelo Guest (`LOCK_SCREEN` emitido pelo Convidado):**
   - Ataque: O convidado cifra e envia um comando `LOCK_SCREEN` direcionado ao Host para tentar travar a tela do profissional.
   - Resultado: O servidor valida a autoridade do autor. Comandos administrativos (`LOCK_SCREEN`, `UNLOCK_MEDIA`, `SWITCH_TAB`) são exclusivos do Host e são sumariamente descartados e registrados como evento não autorizado.
4. **Tentativa de Conexão Concorrente (Ataque de Segundo Guest):**
   - Ataque: Um segundo usuário descobre a URL ou tenta reutilizar o link enquanto a sessão 1:1 já está em andamento.
   - Resultado: O servidor HTTP/WS aplica a regra estrita de unicidade: o token inicial é de uso único (one-shot). Tentativas subsequentes recebem erro `SESSION_BUSY` ou HTTP 403 e a conexão é rejeitada antes do handshake.
5. **Ataque de Queda Abrupta de Conexão com Reuso de Token Antigo:**
   - Ataque: Durante oscilação de rede 4G/5G, a conexão cai e o atacante tenta utilizar o token original expirado ou um `reconnect_token` já utilizado.
   - Resultado: O `reconnect_token` possui rotação estrita e uso único. A cada reconexão bem-sucedida, um novo segredo criptográfico CSPRNG de 32 bytes é emitido e o anterior é invalidado. O teste automatizado comprova que `segundoReconnectToken !== primeiroReconnectToken`.
6. **Ataque de Violação de CSP no Navegador Mobile (WebAssembly Injection):**
   - Ataque: O navegador tenta instanciar WebAssembly para a criptografia libsodium sob uma política CSP restritiva (`script-src 'self'`).
   - Resultado: A diretiva padrão da W3C `'wasm-unsafe-eval'` foi estritamente configurada no cabeçalho HTTP e na meta tag do Guest (ADR-005). Testes em Chromium provam que a compilação do libsodium ocorre com zero violações de CSP enquanto `eval()` e injeção de scripts continuam bloqueados.
7. **Tentativa de Desenho Não Autorizado com Tela Bloqueada:**
   - Ataque: O convidado aciona eventos de desenho (touch no canvas) enquanto `screenLocked === true`.
   - Resultado: A engine de desenho do Guest e os listeners de UI bloqueiam a emissão e nenhum evento `DRAW_ADD` é gerado ou enviado ao Host enquanto o overlay claro de bloqueio estiver ativo.

---

## 4. O que NÃO foi verificado nesta fase

Em estrita conformidade com o protocolo de verificação do `AGENTS.md`, registra-se explicitamente o que **não foi verificado** na Fase 07:
1. **Homologação em Hardware Físico Real Motorola Edge 70 Pro com Android 16:** A verificação foi realizada por emulação rigorosa via protocolo CDP do Puppeteer em Chromium real (resolução 412×915, DPR 2.625, eventos de toque reais e User-Agent do dispositivo). A validação em aparelho físico real cabe à homologação pelo Alexandre.
2. **Abas de mídia com reprodução de áudio/vídeo e anotações sobre mídias:** Pertence à Fase 08 (`fase/08-abas-midia-assets`).
3. **Exportação de relatório consolidado em PDF via Puppeteer:** Pertence à Fase 09 (`fase/09-relatorio-pdf`).
4. **Empacotamento com instalador executável (.exe / NSIS):** Pertence à Fase 10 (`fase/10-empacotamento-aceite`).
