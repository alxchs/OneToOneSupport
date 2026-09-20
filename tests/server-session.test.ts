import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { SessionManager } from '../electron/server/session-manager';
import { startHttpServer, HttpServerHandle } from '../electron/server/http';
import { createWebSocketServer, WsServerHandle } from '../electron/server/ws';
import { ServerSessionController } from '../electron/server/index';
import { TestGuestClient } from '../tools/test-guest-client';
import { buildInviteUrl, verifyInviteUrlSecurity } from '../src/shared/crypto/invite';
import { createProtocolEnvelope, ProtocolEnvelope } from '../src/shared/events/protocol';

describe('Fase 04 - Servidor HTTP/WS, Session Manager e E2EE', () => {
  let activeHttp: HttpServerHandle | null = null;
  let activeWs: WsServerHandle | null = null;
  let activeClients: TestGuestClient[] = [];

  afterEach(async () => {
    for (const c of activeClients) {
      c.close();
    }
    activeClients = [];

    if (activeWs) {
      await activeWs.close();
      activeWs = null;
    }
    if (activeHttp) {
      await activeHttp.close();
      activeHttp = null;
    }
  });

  describe('1. Servidor HTTP (Express 4) e Segurança', () => {
    it('inicia em porta dinâmica (0), serve headers de segurança e CSP do ADR-005', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-teste-01',
        atendidoId: 'atendido-teste-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      expect(activeHttp.port).toBeGreaterThan(0);

      // 1. Testa rota de Health Check
      const healthRes = await fetch(`http://127.0.0.1:${activeHttp.port}/health`);
      expect(healthRes.status).toBe(200);
      const healthData = await healthRes.json();
      expect(healthData.status).toBe('ok');
      expect(healthData.sessaoId).toBe('sessao-teste-01');

      // Verifica Headers de Segurança e CSP do ADR-005
      const csp = healthRes.headers.get('content-security-policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('connect-src');
      expect(csp).toContain('ws:');
      expect(csp).toContain('wss:');
      expect(csp).toContain('img-src');
      expect(csp).toContain('blob:');
      expect(csp).toContain('data:');

      expect(healthRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(healthRes.headers.get('x-frame-options')).toBe('DENY');
      expect(healthRes.headers.get('referrer-policy')).toBe('no-referrer');
      // Garante ausência de CORS aberto
      expect(healthRes.headers.get('access-control-allow-origin')).toBeNull();

      // 2. Testa rota de Join com token válido
      const validToken = sm.getGuestToken();
      const joinRes = await fetch(`http://127.0.0.1:${activeHttp.port}/join/${validToken}`);
      expect(joinRes.status).toBe(200);
      const html = await joinRes.text();
      expect(html).toContain('Sala de Atendimento');
      expect(html).toContain(validToken);

      // 3. Testa rota de Join com token inválido
      const invalidRes = await fetch(`http://127.0.0.1:${activeHttp.port}/join/token-falso-inexistente`);
      expect(invalidRes.status).toBe(403);
    });
  });

  describe('2. Fluxo Feliz Completo (AUTH -> HANDSHAKE_INIT -> ENCRYPTED)', () => {
    it('executa handshake X25519 e troca mensagens cifradas com sucesso', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-happy-path',
        atendidoId: 'atendido-01',
      });

      const guestEventsReceived: ProtocolEnvelope[] = [];

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
        onGuestEvent: (env) => {
          guestEventsReceived.push(env);
        },
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);

      await client.connect();
      expect(sm.getState()).toBe('aguardando_guest');

      // 1. AUTH em texto claro
      await client.sendAuth();

      // 2. HANDSHAKE_INIT com a chave pública do Guest
      const { reconnectToken } = await client.performHandshake();
      expect(reconnectToken).toBeDefined();
      expect(typeof reconnectToken).toBe('string');
      expect(reconnectToken.length).toBe(64); // 32 bytes hex
      expect(sm.getState()).toBe('conectado');
      expect(sm.isGuestConnected()).toBe(true);

      // 3. Envio de evento cifrado pelo Guest (DRAW_ADD)
      await client.sendEncrypted({
        type: 'DRAW_ADD',
        tabId: 'tab-quadro-1',
        elementId: 'elem-stroke-1',
        data: { stroke: 'azul', width: 2 },
      });

      // Aguarda processamento do servidor
      await new Promise((r) => setTimeout(r, 100));

      expect(guestEventsReceived.length).toBe(1);
      expect(guestEventsReceived[0].type).toBe('DRAW_ADD');
      const payload = guestEventsReceived[0].payload as { tabId: string; elementId: string };
      expect(payload.tabId).toBe('tab-quadro-1');
      expect(payload.elementId).toBe('elem-stroke-1');
    });
  });

  describe('3. Token One-Shot (Invalidado no Join / Teste de Reuso)', () => {
    it('rejeita reutilização do guest_token por um segundo cliente', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-oneshot',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const token = sm.getGuestToken();
      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token,
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      // Primeiro cliente conecta e consome o token (one-shot)
      const client1 = new TestGuestClient({ inviteUrl });
      activeClients.push(client1);
      await client1.connect();
      await client1.sendAuth();
      await client1.performHandshake();
      expect(sm.isGuestConnected()).toBe(true);

      // Cliente 1 desconecta
      client1.close();
      await new Promise((r) => setTimeout(r, 100));
      expect(sm.isGuestConnected()).toBe(false);

      // Segundo cliente tenta usar o MESMO guest_token
      const client2 = new TestGuestClient({ inviteUrl });
      activeClients.push(client2);
      await client2.connect();

      await client2.sendAuth();
      const errEnv = await client2.waitForEnvelope(2000);

      // Servidor deve responder com erro de token reutilizado e encerrar
      expect(errEnv.type).toBe('ERROR');
      const errPayload = errEnv.payload as { code: string };
      expect(errPayload.code).toBe('TOKEN_REUSED');

      // Verifica que conexão 2 é fechada
      await new Promise((r) => setTimeout(r, 100));
      expect(client2.ws?.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('4. Token Expirado', () => {
    it('rejeita autenticação quando o prazo do token expira', async () => {
      let currentTime = 1000000;
      const sm = new SessionManager({
        sessaoId: 'sessao-expired',
        atendidoId: 'atendido-01',
        guestTokenTtlMs: 60_000, // 1 minuto
        clock: () => currentTime,
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      // Avança o relógio 2 minutos no futuro (além do TTL de 1 min)
      currentTime += 120_000;

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();

      await client.sendAuth();
      const errEnv = await client.waitForEnvelope(2000);

      expect(errEnv.type).toBe('ERROR');
      const errPayload = errEnv.payload as { code: string };
      expect(errPayload.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('5. Reconexão dentro e fora da janela de 5 minutos', () => {
    it('permite reconexão dentro de 5 minutos e rotaciona o token', async () => {
      let currentTime = 2000000;
      const sm = new SessionManager({
        sessaoId: 'sessao-reconnect',
        atendidoId: 'atendido-01',
        reconnectTokenTtlMs: 5 * 60 * 1000,
        clock: () => currentTime,
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client1 = new TestGuestClient({ inviteUrl });
      activeClients.push(client1);
      await client1.connect();
      await client1.sendAuth();
      const { reconnectToken: initialRecToken } = await client1.performHandshake();

      // Cliente cai
      client1.close();
      await new Promise((r) => setTimeout(r, 100));
      expect(sm.getState()).toBe('reconectando');

      // Avança o tempo em 3 minutos (dentro dos 5 min)
      currentTime += 3 * 60 * 1000;

      // Reconecta com o reconnectToken
      const client2 = new TestGuestClient({
        wsUrl: `ws://127.0.0.1:${activeHttp.port}`,
        hostPublicKey: sm.getHostPublicKeyBase64Url() ? client1.hostPublicKey : new Uint8Array(32),
      });
      activeClients.push(client2);
      await client2.connect();
      await client2.sendReconnect(initialRecToken);
      const { reconnectToken: rotatedRecToken } = await client2.performHandshake();

      expect(sm.getState()).toBe('conectado');
      // Garante que o token de reconexão foi rotacionado
      expect(rotatedRecToken).not.toBe(initialRecToken);
      expect(rotatedRecToken.length).toBe(64);
    });

    it('rejeita reconexão se exceder a janela de 5 minutos', async () => {
      let currentTime = 3000000;
      const sm = new SessionManager({
        sessaoId: 'sessao-reconnect-expired',
        atendidoId: 'atendido-01',
        reconnectTokenTtlMs: 5 * 60 * 1000,
        clock: () => currentTime,
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client1 = new TestGuestClient({ inviteUrl });
      activeClients.push(client1);
      await client1.connect();
      await client1.sendAuth();
      const { reconnectToken } = await client1.performHandshake();

      client1.close();
      await new Promise((r) => setTimeout(r, 100));

      // Avança o tempo em 5 minutos e 5 segundos (expirou)
      currentTime += 5 * 60 * 1000 + 5000;

      const client2 = new TestGuestClient({
        wsUrl: `ws://127.0.0.1:${activeHttp.port}`,
        hostPublicKey: client1.hostPublicKey,
      });
      activeClients.push(client2);
      await client2.connect();
      await client2.sendReconnect(reconnectToken);

      const errEnv = await client2.waitForEnvelope(2000);
      expect(errEnv.type).toBe('ERROR');
      const errPayload = errEnv.payload as { code: string };
      expect(errPayload.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('6. Um Único Guest por Sessão (Segundo Join Rejeitado)', () => {
    it('rejeita um segundo Guest simultâneo com SESSION_BUSY mantendo o primeiro ativo', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-single-guest',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      // Guest 1 conecta e fica ativo
      const client1 = new TestGuestClient({ inviteUrl });
      activeClients.push(client1);
      await client1.connect();
      await client1.sendAuth();
      await client1.performHandshake();
      expect(sm.isGuestConnected()).toBe(true);

      // Guest 2 tenta conectar enquanto Guest 1 está conectado
      const client2 = new TestGuestClient({ inviteUrl });
      activeClients.push(client2);
      await client2.connect();
      await client2.sendAuth();

      const errEnv = await client2.waitForEnvelope(2000);
      expect(errEnv.type).toBe('ERROR');
      const errPayload = errEnv.payload as { code: string };
      expect(errPayload.code).toBe('SESSION_BUSY');

      // Guest 1 continua ativo e conectado normalmente
      expect(sm.isGuestConnected()).toBe(true);
      expect(client1.ws?.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('7. Mensagem em Claro pós-handshake e Mensagens Fora de Ordem', () => {
    it('derruba a conexão imediatamente ao receber qualquer mensagem em claro pós-handshake', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-plaintext-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();
      await client.sendAuth();
      await client.performHandshake();

      // Envia mensagem em claro pós-handshake (ex: tentativa de injetar DRAW_ADD sem cifrar)
      const clearEnv = createProtocolEnvelope('DRAW_ADD', {
        tabId: 'tab-1',
        elementId: 'elem-1',
        data: {},
      });

      client.ws?.send(JSON.stringify(clearEnv));

      // Espera fechamento imediato da conexão pelo servidor
      await new Promise((r) => setTimeout(r, 200));
      expect(client.ws?.readyState).toBe(WebSocket.CLOSED);
    });

    it('derruba conexão ao receber HANDSHAKE_INIT antes de AUTH (fora de ordem)', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-outoforder-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const client = new TestGuestClient({
        wsUrl: `ws://127.0.0.1:${activeHttp.port}`,
        hostPublicKey: sm.getHostPublicKeyBase64Url() ? new Uint8Array(32) : new Uint8Array(32),
      });
      activeClients.push(client);
      await client.connect();

      // Pula AUTH e envia HANDSHAKE_INIT diretamente
      const hsEnv = createProtocolEnvelope('HANDSHAKE_INIT', {
        clientPublicKey: 'chave-publica-teste',
      });
      client.ws?.send(JSON.stringify(hsEnv));

      await new Promise((r) => setTimeout(r, 200));
      expect(client.ws?.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('8. Payload Gigante (> 1 MB)', () => {
    it('derruba conexão ao receber payload superior a 1 MB', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-maxpayload-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const client = new TestGuestClient({
        wsUrl: `ws://127.0.0.1:${activeHttp.port}`,
      });
      activeClients.push(client);
      await client.connect();

      // Carga gigante de 1.2 MB
      const hugeString = 'X'.repeat(1.2 * 1024 * 1024);
      try {
        client.ws?.send(hugeString);
      } catch {
        // ws pode lançar antes de enviar se exceder buffer
      }

      await new Promise((r) => setTimeout(r, 300));
      expect(client.ws?.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('9. Mensagem Cifrada Adulterada (Tamper Attack)', () => {
    it('detecta adulteração via integridade MAC Poly1305 e fecha com falha limpa', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-tamper-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();
      await client.sendAuth();
      await client.performHandshake();

      // Cifra uma mensagem legítima
      const encrypted = client.guestCipher!.encrypt(JSON.stringify({ type: 'DRAW_ADD' }));

      // Adultera o ciphertext
      const tamperedBytes = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedBytes[0] ^= 0xff; // Inverte bits do primeiro byte
      const tamperedCiphertext = tamperedBytes.toString('base64');

      const tamperedEnv = createProtocolEnvelope('ENCRYPTED', {
        nonce: encrypted.nonce,
        ciphertext: tamperedCiphertext,
      });

      client.ws?.send(JSON.stringify(tamperedEnv));

      // Servidor rejeita e encerra a conexão adulterada
      await new Promise((r) => setTimeout(r, 200));
      expect(client.ws?.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('10. Medição de Latência de Eco Cifrado em Localhost', () => {
    it('mede e reporta latência de eco cifrado (Mestre §18: < 200 ms em rede local)', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-latencia-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();
      await client.sendAuth();
      await client.performHandshake();

      const samples: number[] = [];
      for (let i = 0; i < 10; i++) {
        const lat = await client.measureEchoLatency();
        samples.push(lat);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const min = Math.min(...samples);
      const max = Math.max(...samples);

      console.log(`[Latência Cifrada Localhost] Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms | Média: ${avg.toFixed(2)}ms`);

      // Latência em localhost deve ser bem inferior a 200ms (geralmente < 15ms)
      expect(avg).toBeLessThan(200);
      expect(max).toBeLessThan(200);
    });
  });

  describe('11. Matriz de Autoridade do Host e Relógio Mestre', () => {
    it('bloqueia ações do Guest quando a tela está bloqueada (LOCK_SCREEN)', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-lock-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();
      await client.sendAuth();
      await client.performHandshake();

      // Host bloqueia a tela
      sm.setScreenLocked(true);

      // Guest tenta desenhar
      await client.sendEncrypted({
        type: 'DRAW_ADD',
        tabId: 'tab-1',
        elementId: 'elem-1',
        data: {},
      });

      const response = await client.receiveEncrypted();
      expect(response.type).toBe('ERROR');
      expect(response.reason).toBe('SCREEN_LOCKED');
    });

    it('bloqueia controle de mídia se UNLOCK_MEDIA não foi concedido pelo Host', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-media-test',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');
      activeWs = createWebSocketServer({
        server: activeHttp.server,
        sessionManager: sm,
      });

      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: sm.getHostPublicKeyBase64Url(),
      });

      const client = new TestGuestClient({ inviteUrl });
      activeClients.push(client);
      await client.connect();
      await client.sendAuth();
      await client.performHandshake();

      // mediaUnlocked é falso por padrão
      expect(sm.isMediaUnlocked()).toBe(false);

      // Guest tenta emitir PLAY
      await client.sendEncrypted({
        type: 'PLAY',
        tabId: 'tab-video-1',
        currentTime: 10.5,
      });

      const response = await client.receiveEncrypted();
      expect(response.type).toBe('ERROR');
      expect(response.reason).toBe('MEDIA_LOCKED');
    });
  });

  describe('12. Prova de Segurança: pk_h NUNCA exposto em logs, path ou query', () => {
    it('garante que pk_h só existe no hash fragment (#) e nunca chega ao servidor HTTP', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-pkh-security',
        atendidoId: 'atendido-01',
      });

      activeHttp = await startHttpServer(sm, 0, '127.0.0.1');

      const pk_h = sm.getHostPublicKeyBase64Url();
      const inviteUrl = buildInviteUrl({
        baseUrl: `http://127.0.0.1:${activeHttp.port}`,
        token: sm.getGuestToken(),
        hostPublicKey: pk_h,
      });

      const security = verifyInviteUrlSecurity(inviteUrl);
      expect(security.isSecure).toBe(true);
      expect(security.hasFragment).toBe(true);
      expect(security.pkInPathOrQuery).toBe(false);

      // Simula uma requisição HTTP real ao endpoint do convite
      const urlObj = new URL(inviteUrl);
      expect(urlObj.pathname).toBe(`/join/${sm.getGuestToken()}`);
      expect(urlObj.search).toBe('');
      expect(urlObj.hash).toBe(`#${pk_h}`);

      // Na requisição HTTP real, o navegador envia apenas o pathname
      const res = await fetch(`http://127.0.0.1:${activeHttp.port}${urlObj.pathname}`);
      expect(res.status).toBe(200);
      const text = await res.text();
      // O HTML retornado contém o token mas NUNCA contém a chave pk_h
      expect(text).not.toContain(pk_h);
    });
  });

  describe('13. ServerSessionController e Geração de QR Code (ADR-008)', () => {
    it('inicia sessão completa com URL e QR Code gerado localmente em memória', async () => {
      const controller = new ServerSessionController();
      const info = await controller.startSession('sessao-ctrl-01', 'atendido-ctrl-01', '127.0.0.1');

      expect(info.sessaoId).toBe('sessao-ctrl-01');
      expect(info.status).toBe('aguardando_guest');
      expect(info.port).toBeGreaterThan(0);
      expect(info.inviteUrl).toContain('/join/');
      expect(info.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);

      // Altera IP da LAN
      const updated = await controller.setIp('127.0.0.1');
      expect(updated.selectedIp).toBe('127.0.0.1');

      await controller.stopSession();
      expect(controller.getStatus()).toBeNull();
    });
  });
});
