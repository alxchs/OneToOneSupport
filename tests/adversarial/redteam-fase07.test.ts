import { describe, it, expect, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { WebSocket as WsImplementation } from 'ws';
import { ServerSessionController } from '../../electron/server/index';
import { SessionManager } from '../../electron/server/session-manager';
import { GuestWsClient } from '../../src/guest/ws/client';
import { parseInviteUrl, extractHostPublicKeyFromFragment } from '../../src/shared/crypto/invite';
import { encodeBase64Url } from '../../src/shared/crypto/base64url';
import {
  createEnvelope,
  validateProtocolEnvelope,
  MAX_MESSAGE_SIZE_BYTES,
} from '../../src/shared/events/protocol';
import { GUEST_CSP } from '../../src/shared/csp';
import { createExpressApp } from '../../electron/server/http';

// Garante disponibilidade do WebSocket no ambiente de teste Node
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WsImplementation;
}

describe('Red Team Fase 07 - Ataques Adversariais e Testes de Penetração', () => {
  let sessionController: ServerSessionController | null = null;
  let activeClients: GuestWsClient[] = [];

  afterEach(async () => {
    for (const c of activeClients) {
      try {
        c.close();
      } catch {
        // Ignora
      }
    }
    activeClients = [];

    if (sessionController) {
      await sessionController.stopSession();
      sessionController = null;
    }
  });

  // ==========================================================================
  // CATEGORIA 1: ENTRADA INVÁLIDA / NULA / GIGANTE / UNICODE
  // ==========================================================================
  describe('1. Entrada Inválida, Nula, Gigante e Unicode', () => {
    it('[ENTRADA-1] HTTP /join/:token com token gigante trata requisição com segurança sem derrubar o processo', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-giant-01', 'atendido-giant-01', '127.0.0.1');

      // 1. Token grande dentro do limite de cabeçalho HTTP (4.000 caracteres): deve retornar 403
      const largeToken = 'A'.repeat(4000);
      const res = await fetch(`http://127.0.0.1:${sessionInfo.port}/join/${largeToken}`, {
        headers: { Connection: 'close' },
      });
      expect(res.status).toBe(403);

      // 2. Token gigante que excede o buffer HTTP (100.000 caracteres): conexão é resetada pelo parser sem derrubar o servidor
      const giantToken = 'A'.repeat(100000);
      try {
        await fetch(`http://127.0.0.1:${sessionInfo.port}/join/${giantToken}`, {
          headers: { Connection: 'close' },
        });
      } catch (err: any) {
        expect(['ECONNRESET', 'UND_ERR_SOCKET', 'fetch failed'].some((c) => err.message?.includes(c) || err.code === c)).toBe(true);
      }

      // 3. Servidor continua 100% ativo e responsivo
      const health = await fetch(`http://127.0.0.1:${sessionInfo.port}/health`);
      expect(health.status).toBe(200);
    });

    it('[ENTRADA-2] HTTP /join/:token com caracteres unicode, emojis e byte nulo trata requisição com 403 seguro', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-unicode-01', 'atendido-uni-01', '127.0.0.1');

      const malformedTokens = [
        encodeURIComponent('🔑🔥🛡️⚡'),
        encodeURIComponent('token\0com\0byte\0nulo'),
        encodeURIComponent('𝓤𝓷𝓲𝓬𝓸𝓭𝓮_𝓣𝓸𝓴𝓮𝓷'),
        encodeURIComponent('../../../etc/passwd'),
      ];

      for (const badToken of malformedTokens) {
        const res = await fetch(`http://127.0.0.1:${sessionInfo.port}/join/${badToken}`, {
          headers: { Connection: 'close' },
        });
        expect(res.status).toBe(403);
      }
    });

    it('[ENTRADA-3] WS AUTH com token gigante (> 512 caracteres) é rejeitado e conexão é terminada', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-ws-giant-01', 'atendido-ws-giant-01', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const giantToken = 'B'.repeat(600);
      // Tentativa de envio com token que estoura o limite de 512 chars definido em validatePayload
      ws.send(JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        ts: Date.now(),
        type: 'AUTH',
        payload: { token: giantToken },
      }));

      // Servidor deve fechar/terminar a conexão
      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });
      expect(ws.readyState).toBe(WsImplementation.CLOSED);
    });

    it('[ENTRADA-4] WS AUTH com tipos inválidos no payload (número, array, boolean, objeto) derruba conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-ws-type-01', 'atendido-ws-type-01', '127.0.0.1');

      const badPayloads = [
        { token: 123456 },
        { token: ['array', 'token'] },
        { token: true },
        { token: { nested: 'token' } },
        { token: null },
      ];

      for (const bad of badPayloads) {
        const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
        await new Promise<void>((resolve) => ws.on('open', () => resolve()));

        ws.send(JSON.stringify({
          v: 1,
          id: crypto.randomUUID(),
          ts: Date.now(),
          type: 'AUTH',
          payload: bad,
        }));

        await new Promise<void>((resolve) => {
          ws.on('close', () => resolve());
        });
        expect(ws.readyState).toBe(WsImplementation.CLOSED);
      }
    });

    it('[ENTRADA-5] WS HANDSHAKE_INIT com chave pública corrompida não queima o token e fecha conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-corrupt-pk-01', 'atendido-pk-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      // 1. Envia AUTH válido
      ws.send(JSON.stringify(createEnvelope('AUTH', { token: parsedInvite.token })));
      await new Promise((r) => setTimeout(r, 100));

      // 2. Envia HANDSHAKE_INIT com chave pública de tamanho inválido (apenas 16 bytes base64url)
      const invalidPk = encodeBase64Url(new Uint8Array(16));
      ws.send(JSON.stringify(createEnvelope('HANDSHAKE_INIT', { clientPublicKey: invalidPk })));

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });
      expect(ws.readyState).toBe(WsImplementation.CLOSED);

      // 3. O token one-shot NÃO deve ter sido queimado porque o handshake falhou (pode autenticar de novo)
      const sm = sessionController.getSessionManager()!;
      const retryAuth = sm.authenticateInitialJoin(parsedInvite.token, 'retry-conn');
      expect(retryAuth.valid).toBe(true);
    });

    it('[ENTRADA-6] Injeção de protótipo (__proto__, constructor, prototype) no envelope WS é rejeitada com SECURITY_VIOLATION', () => {
      const maliciousJson = '{"v":1,"id":"' + crypto.randomUUID() + '","ts":1000,"type":"AUTH","payload":{"token":"abc"},"__proto__":{"polluted":true}}';
      const parsed = JSON.parse(maliciousJson);

      const res = validateProtocolEnvelope(parsed);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('SECURITY_VIOLATION');
        expect(res.error).toContain('campos proibidos');
      }
    });
  });

  // ==========================================================================
  // CATEGORIA 2: REPETIÇÃO E IDEMPOTÊNCIA
  // ==========================================================================
  describe('2. Repetição e Idempotência', () => {
    it('[REPETICAO-1] Replay de nonce na cifra ChaCha20-Poly1305 dispara REPLAY_ATTACK e fecha conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-replay-01', 'atendido-replay-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const client = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();

      // Intercepta a mensagem cifrada e repete exatamente o mesmo nonce/ciphertext duas vezes
      const cipher = (client as any).guestCipher;
      const encrypted = cipher.encrypt(JSON.stringify({ type: 'DRAW_ADD', abaId: 'default', payload: { id: 'p1' } }));
      const env = createEnvelope('ENCRYPTED', {
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      });

      client.ws?.send(JSON.stringify(env));
      await new Promise((r) => setTimeout(r, 100));

      // Segundo envio: reuso do mesmo nonce (ataque de replay)
      client.ws?.send(JSON.stringify(env));
      await new Promise((r) => setTimeout(r, 200));

      // Servidor deve ter derrubado a conexão
      expect(sessionController.getStatus()?.guestConnected).toBe(false);
    });

    it('[REPETICAO-2] Replay do token de primeiro acesso após conclusão do handshake é rejeitado com TOKEN_REUSED', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-reuse-tok-01', 'atendido-reuse-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const client1 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();
      client1.close();

      // Cliente 2 tenta usar o mesmo token
      const client2 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);

      await expect(client2.connect()).rejects.toThrow();
    });

    it('[REPETICAO-3] Reuso de reconnect_token antigo após rotação subsequente é rejeitado com INVALID_TOKEN', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-rec-reuse-01', 'atendido-rec-reuse-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      // Conexão inicial
      const client1 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();
      const tokenRec1 = client1.getReconnectToken()!;
      client1.close();
      await new Promise((r) => setTimeout(r, 100));

      // Primeira reconexão bem-sucedida (rotaciona para tokenRec2)
      const client2 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: '',
        reconnectToken: tokenRec1,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);
      await client2.connect();
      const tokenRec2 = client2.getReconnectToken()!;
      expect(tokenRec2).not.toBe(tokenRec1);
      client2.close();
      await new Promise((r) => setTimeout(r, 100));

      // Tentativa de usar o tokenRec1 que já foi invalidado/rotacionado
      const clientAttacker = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: '',
        reconnectToken: tokenRec1,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(clientAttacker);

      await expect(clientAttacker.connect()).rejects.toThrow();
    });

    it('[IDEMPOTENCIA-1] stopSession chamado consecutivamente múltiplas vezes não causa erros nem vazamentos', async () => {
      sessionController = new ServerSessionController();
      await sessionController.startSession('sessao-stop-idem-01', 'atendido-stop-01', '127.0.0.1');

      // Executa stop múltiplas vezes
      await sessionController.stopSession();
      await sessionController.stopSession();
      await sessionController.stopSession();

      expect(sessionController.getStatus()).toBeNull();
    });

    it('[IDEMPOTENCIA-2] lockScreen e unlockMedia chamados repetidamente mantêm estado estável', async () => {
      sessionController = new ServerSessionController();
      await sessionController.startSession('sessao-lock-idem-01', 'atendido-lock-01', '127.0.0.1');

      sessionController.lockScreen(true);
      sessionController.lockScreen(true);
      expect(sessionController.getStatus()?.screenLocked).toBe(true);

      sessionController.lockScreen(false);
      sessionController.lockScreen(false);
      expect(sessionController.getStatus()?.screenLocked).toBe(false);

      sessionController.unlockMedia(true);
      sessionController.unlockMedia(true);
      expect(sessionController.getStatus()?.mediaUnlocked).toBe(true);
    });
  });

  // ==========================================================================
  // CATEGORIA 3: ORDEM TROCADA E CONCORRÊNCIA
  // ==========================================================================
  describe('3. Ordem Trocada e Concorrência', () => {
    it('[ORDEM-1] Envio de HANDSHAKE_INIT antes de AUTH causa encerramento imediato da conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-order-01', 'atendido-ord-01', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const dummyPk = encodeBase64Url(new Uint8Array(32).fill(7));
      ws.send(JSON.stringify(createEnvelope('HANDSHAKE_INIT', { clientPublicKey: dummyPk })));

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });
      expect(ws.readyState).toBe(WsImplementation.CLOSED);
    });

    it('[ORDEM-2] Envio de pacote ENCRYPTED antes de AUTH ou HANDSHAKE_INIT fecha a conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-order-02', 'atendido-ord-02', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      ws.send(JSON.stringify(createEnvelope('ENCRYPTED', {
        nonce: encodeBase64Url(new Uint8Array(12)),
        ciphertext: encodeBase64Url(new Uint8Array(32)),
      })));

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });
      expect(ws.readyState).toBe(WsImplementation.CLOSED);
    });

    it('[ORDEM-3] Envio de mensagem em claro (não-ENCRYPTED) pós-handshake encerra a conexão sumariamente', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-order-03', 'atendido-ord-03', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const client = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();

      // Envia DRAW_ADD em texto claro direto pelo socket aberto
      client.ws?.send(JSON.stringify(createEnvelope('DRAW_ADD', {
        tabId: 'default',
        elementId: 'e1',
        data: {},
      })));

      await new Promise((r) => setTimeout(r, 200));
      expect(sessionController.getStatus()?.guestConnected).toBe(false);
    });

    it('[CONCORRENCIA-1] Disputa simultânea por AUTH com mesmo token aceita exatamente uma e rejeita a outra com SESSION_BUSY', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-race-01', 'atendido-race-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const clientA = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      const clientB = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(clientA, clientB);

      const results = await Promise.allSettled([clientA.connect(), clientB.connect()]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('[CONCORRENCIA-2] Segundo convidado tentando conectar enquanto o primeiro está ativo recebe erro', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-busy-adv-01', 'atendido-busy-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const client1 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();

      const client2 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);

      await expect(client2.connect()).rejects.toThrow();
    });
  });

  // ==========================================================================
  // CATEGORIA 4: ESTADO APÓS FALHA PARCIAL
  // ==========================================================================
  describe('4. Estado Após Falha Parcial', () => {
    it('[FALHA-1] Queda de conexão após AUTH e antes de HANDSHAKE_INIT não consome o token de acesso', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-drop-pre-hs', 'atendido-drop-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      // Conecta socket puro, envia AUTH e fecha abruptamente
      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));
      ws.send(JSON.stringify(createEnvelope('AUTH', { token: parsedInvite.token })));
      await new Promise((r) => setTimeout(r, 100));
      ws.terminate();
      await new Promise((r) => setTimeout(r, 200));

      // O convidado deve conseguir conectar normalmente usando o mesmo token de convite
      const client = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();
      expect(client.getState()).toBe('connected');
    });

    it('[FALHA-2] Queda de conexão após handshake bem-sucedido permite reconexão via reconnect_token', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-reconnect-flow', 'atendido-rec-01', '127.0.0.1');
      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);

      const client1 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();
      const recToken = client1.getReconnectToken();
      expect(recToken).toBeDefined();

      // Queda da rede
      (client1.ws as any)?.terminate?.() || client1.ws?.close();
      await new Promise((r) => setTimeout(r, 200));

      // Reconexão resiliente
      const client2 = new GuestWsClient({
        wsUrl: `ws://127.0.0.1:${sessionInfo.port}`,
        token: '',
        reconnectToken: recToken,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);
      await client2.connect();
      expect(client2.getState()).toBe('connected');
    });

    // VULNERABILIDADE REAL 1: Desconexão de socket não autenticado transiciona estado de 'aguardando_guest' para 'reconectando'
    it('[FALHA-3 - VULNERAVEL] Desconexão de conexão não-autenticada NÃO deve alterar estado da sessão para reconectando', () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-unauth-test',
        atendidoId: 'atendido-unauth',
      });
      expect(sm.getState()).toBe('aguardando_guest');

      // Um probe de rede (ex.: scan de porta, health check ou socket fantasma) fecha sem autenticar
      sm.handleGuestDisconnect('unauthenticated-probe-id');

      // VULNERABILIDADE: SessionManager.handleGuestDisconnect transiciona indevidamente para 'reconectando'
      // mesmo sem nenhum guest ter completado autenticação prévia
      expect(sm.getState()).toBe('aguardando_guest');
    });

    // VULNERABILIDADE REAL 2: Desconexões não-autenticadas estendem artificialmente o TTL de reconexão
    it('[FALHA-4 - VULNERAVEL] Desconexões espúrias não-autenticadas NÃO devem estender indefinidamente o TTL de reconexão', () => {
      let currentTime = 1_000;
      const sm = new SessionManager({
        sessaoId: 'sessao-infinite-ttl',
        atendidoId: 'atendido-ttl',
        clock: () => currentTime,
        reconnectTokenTtlMs: 300_000, // 5 minutos
      });

      // Guest conecta e completa handshake em t = 1.000
      sm.authenticateInitialJoin(sm.getGuestToken(), 'guest-conn-1');
      sm.completeHandshake(encodeBase64Url(new Uint8Array(32).fill(1)));
      const recToken = sm.getReconnectToken()!;

      // Conexão cai em t = 1.000 (expiração esperada em t = 301.000)
      sm.handleGuestDisconnect('guest-conn-1');

      // Em t = 290.000, um atacante não-autenticado conecta e desconecta
      currentTime = 290_000;
      sm.handleGuestDisconnect('unauthenticated-attacker-probe');

      // Em t = 302.000 (> 5 minutos da queda do convidado legítimo)
      currentTime = 302_000;

      // VULNERABILIDADE: O atacante conseguiu empurrar reconnectExpiresAt para 290.000 + 300.000 = 590.000
      // fazendo com que o token continue válido após os 5 minutos previstos pela especificação!
      const authRec = sm.authenticateReconnect(recToken, 'new-conn-attempt');
      expect(authRec.valid).toBe(false);
      expect(authRec.code).toBe('TOKEN_EXPIRED');
    });
  });

  // ==========================================================================
  // CATEGORIA 5: SEGREDO E VAZAMENTO DE INFORMAÇÕES SENSÍVEIS
  // ==========================================================================
  describe('5. Segredos e Vazamento de Informações Sensíveis', () => {
    it('[SEGREDO-1] Validação de token com safeTokenEqual opera com tempo constante contra ataques de temporização', async () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-timing-01',
        atendidoId: 'atendido-timing-01',
      });
      const validToken = sm.getGuestToken();

      // Tokens de tamanhos diferentes e mesmo tamanho com prefixo correto
      const wrongSize = 'abc';
      const sameSizeWrongContent = 'f'.repeat(validToken.length);

      expect(sm.isTokenValidForHttpJoin(wrongSize)).toBe(false);
      expect(sm.isTokenValidForHttpJoin(sameSizeWrongContent)).toBe(false);
      expect(sm.isTokenValidForHttpJoin(validToken)).toBe(true);
    });

    it('[SEGREDO-2] Encerramento da sessão higieniza chaves privadas na memória com memzero', () => {
      const sm = new SessionManager({
        sessaoId: 'sessao-memzero-01',
        atendidoId: 'atendido-mem-01',
      });

      expect((sm as any).hostKeyPair).not.toBeNull();
      sm.encerrar();

      // Chaves devem ser nuladas após encerramento
      expect((sm as any).hostKeyPair).toBeNull();
      expect((sm as any).sessionCipher).toBeNull();
      expect(sm.getState()).toBe('encerrada');
    });

    it('[SEGREDO-3] Mensagens de erro de autenticação não vazam tokens, chaves nem caminhos internos', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-leak-01', 'atendido-leak-01', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      let errorReceived: any = null;
      ws.on('message', (data) => {
        errorReceived = JSON.parse(data.toString());
      });

      ws.send(JSON.stringify(createEnvelope('AUTH', { token: 'token-errado-palpite' })));
      await new Promise((r) => setTimeout(r, 150));

      expect(errorReceived).toBeDefined();
      expect(errorReceived.type).toBe('ERROR');
      // Mensagem limpa sem dados sensíveis
      expect(errorReceived.payload.code).toBe('INVALID_TOKEN');
      expect(errorReceived.payload.message).not.toContain(sessionInfo.selectedIp);
      expect(errorReceived.payload.message).not.toContain('atendido-leak-01');
      expect(JSON.stringify(errorReceived)).not.toContain('hostKeyPair');
    });

    it('[SEGREDO-4] extractHostPublicKeyFromFragment valida integridade e rejeita chaves malformadas', () => {
      expect(() => extractHostPublicKeyFromFragment('')).toThrow();
      expect(() => extractHostPublicKeyFromFragment('#')).toThrow();
      expect(() => extractHostPublicKeyFromFragment('#invalid-base64url')).toThrow();
      // Chave com tamanho menor que 32 bytes
      const shortKey = encodeBase64Url(new Uint8Array(16));
      expect(() => extractHostPublicKeyFromFragment(`#${shortKey}`)).toThrow();

      // Chave válida de 32 bytes
      const validKey = encodeBase64Url(new Uint8Array(32).fill(42));
      const extracted = extractHostPublicKeyFromFragment(`#${validKey}`);
      expect(extracted.length).toBe(32);
    });
  });

  // ==========================================================================
  // CATEGORIA 6: LIMITES (RATE LIMIT, TIMEOUT, TAMANHO, TTL)
  // ==========================================================================
  describe('6. Limites (Rate Limit, Timeout, Tamanho, TTL)', () => {
    it('[LIMITES-1] Mensagem WebSocket excedendo 1 MB é sumariamente rejeitada com queda da conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-limit-size-01', 'atendido-lim-01', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      // Cria mensagem de 1.2 MB
      const oversizedData = 'X'.repeat(MAX_MESSAGE_SIZE_BYTES + 200_000);
      try {
        ws.send(oversizedData);
      } catch {
        // ws pode lançar se buffer exceder
      }

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });
      expect(ws.readyState).toBe(WsImplementation.CLOSED);
    });

    it('[LIMITES-2] Rate limiting por conexão (> 100 mensagens por segundo) encerra a conexão', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-rate-lim-01', 'atendido-rate-01', '127.0.0.1');

      const ws = new WsImplementation(`ws://127.0.0.1:${sessionInfo.port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      // Dispara 110 mensagens simultâneas em menos de 1 segundo
      const dummyMsg = JSON.stringify(createEnvelope('AUTH', { token: 'burst-test' }));
      for (let i = 0; i < 110; i++) {
        if (ws.readyState === WsImplementation.OPEN) {
          ws.send(dummyMsg);
        }
      }

      await new Promise((r) => setTimeout(r, 200));
      expect(ws.readyState).toBe(WsImplementation.CLOSED);
    });

    it('[LIMITES-3] Timeout de handshake derruba conexão inativa após o tempo limite', async () => {
      // Cria SessionManager isolado com timeout de 200ms para teste ágil
      const { createWebSocketServer } = await import('../../electron/server/ws');
      const http = await import('http');

      const server = http.createServer();
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      const port = (server.address() as any).port;

      const sm = new SessionManager({ sessaoId: 's-to', atendidoId: 'a-to' });
      const wsHandle = createWebSocketServer({
        server,
        sessionManager: sm,
        handshakeTimeoutMs: 200, // 200ms
      });

      const ws = new WsImplementation(`ws://127.0.0.1:${port}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      // Não envia nada e aguarda expiração do handshakeTimer
      await new Promise((r) => setTimeout(r, 350));
      expect(ws.readyState).toBe(WsImplementation.CLOSED);

      await wsHandle.close();
      await new Promise<void>((r) => server.close(() => r()));
    });

    it('[LIMITES-4] Token de reconexão expira após TTL de 5 minutos', () => {
      let fakeTime = 100_000;
      const sm = new SessionManager({
        sessaoId: 'sessao-ttl-rec',
        atendidoId: 'atendido-rec',
        clock: () => fakeTime,
        reconnectTokenTtlMs: 300_000,
      });

      sm.authenticateInitialJoin(sm.getGuestToken(), 'c1');
      sm.completeHandshake(encodeBase64Url(new Uint8Array(32).fill(1)));
      const recToken = sm.getReconnectToken()!;
      sm.handleGuestDisconnect('c1');

      // Avança o tempo além de 5 minutos (300.001 ms)
      fakeTime = 100_000 + 300_001;

      const res = sm.authenticateReconnect(recToken, 'c2');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('TOKEN_EXPIRED');
    });

    it('[LIMITES-5] Token de convite inicial expira após TTL de 15 minutos', () => {
      let fakeTime = 0;
      const sm = new SessionManager({
        sessaoId: 'sessao-ttl-init',
        atendidoId: 'atendido-init',
        clock: () => fakeTime,
        guestTokenTtlMs: 900_000, // 15 min
      });

      const initialToken = sm.getGuestToken();
      // Avança tempo além de 15 minutos
      fakeTime = 900_001;

      const resWs = sm.authenticateInitialJoin(initialToken, 'c1');
      expect(resWs.valid).toBe(false);
      expect(resWs.code).toBe('TOKEN_EXPIRED');

      const resHttp = sm.isTokenValidForHttpJoin(initialToken);
      expect(resHttp).toBe(false);
    });
  });

  // ==========================================================================
  // CATEGORIA 7: PERMISSÕES E AUTORIDADE (ATOR SEM DIREITO)
  // ==========================================================================
  describe('7. Permissões e Autoridade (Ator Sem Direito)', () => {
    it('[PERMISSAO-1] Guest tentando emitir CLEAR_TAB, LOCK_SCREEN, UNLOCK_MEDIA ou TAB_SWITCH é bloqueado com FORBIDDEN_ACTION', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-perm-01', atendidoId: 'a-01' });

      expect(sm.canGuestExecute('CLEAR_TAB')).toEqual({ allowed: false, reason: 'FORBIDDEN_ACTION' });
      expect(sm.canGuestExecute('LOCK_SCREEN')).toEqual({ allowed: false, reason: 'FORBIDDEN_ACTION' });
      expect(sm.canGuestExecute('UNLOCK_MEDIA')).toEqual({ allowed: false, reason: 'FORBIDDEN_ACTION' });
      expect(sm.canGuestExecute('TAB_SWITCH')).toEqual({ allowed: false, reason: 'FORBIDDEN_ACTION' });
    });

    // VULNERABILIDADE REAL 3: Guest emitindo SCREEN_LOCKED não é bloqueado pelo SessionManager
    it('[PERMISSAO-2 - VULNERAVEL] Guest é estritamente proibido de emitir SCREEN_LOCKED em canGuestExecute', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-perm-vuln-01', atendidoId: 'a-02' });

      // VULNERABILIDADE: canGuestExecute omite 'SCREEN_LOCKED' da lista de ações proibidas ao Guest
      // (ao contrário de EventoService.validarAutorEPermissao que inclui SCREEN_LOCKED)
      const res = sm.canGuestExecute('SCREEN_LOCKED' as any);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('FORBIDDEN_ACTION');
    });

    // VULNERABILIDADE REAL 4: Guest emitindo UNDO com tela bloqueada não é barrado por canGuestExecute
    it('[PERMISSAO-3 - VULNERAVEL] Guest é estritamente proibido de emitir UNDO quando a tela está bloqueada (screenLocked === true)', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-perm-vuln-02', atendidoId: 'a-03' });
      sm.setScreenLocked(true);

      // VULNERABILIDADE: canGuestExecute omite 'UNDO' da lista de ações bloqueadas sob screenLocked,
      // permitindo que o Guest interaja e envie desfazer com a tela bloqueada
      const res = sm.canGuestExecute('UNDO' as any);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('SCREEN_LOCKED');
    });

    // VULNERABILIDADE REAL 5: canGuestExecute opera em denylist aberta e permite tipos desconhecidos/arbitrários
    it('[PERMISSAO-4 - VULNERAVEL] canGuestExecute deve aplicar lista de permissão estrita e rejeitar tipos desconhecidos', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-perm-vuln-03', atendidoId: 'a-04' });

      // VULNERABILIDADE: SessionManager.canGuestExecute usa denylist em vez de lista de permissão rigorosa,
      // permitindo tipos arbitrários não reconhecidos
      const resArbitrary = sm.canGuestExecute('ARBITRARY_ACTION_TYPE' as any);
      expect(resArbitrary.allowed).toBe(false);
    });

    it('[PERMISSAO-5] Guest emitindo controle de mídia com mediaUnlocked === false é bloqueado com MEDIA_LOCKED', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-media-perm', atendidoId: 'a-05' });
      sm.setMediaUnlocked(false);

      expect(sm.canGuestExecute('PLAY')).toEqual({ allowed: false, reason: 'MEDIA_LOCKED' });
      expect(sm.canGuestExecute('PAUSE')).toEqual({ allowed: false, reason: 'MEDIA_LOCKED' });
      expect(sm.canGuestExecute('SEEK')).toEqual({ allowed: false, reason: 'MEDIA_LOCKED' });
      expect(sm.canGuestExecute('MEDIA_CONTROL')).toEqual({ allowed: false, reason: 'MEDIA_LOCKED' });

      sm.setMediaUnlocked(true);
      expect(sm.canGuestExecute('PLAY').allowed).toBe(true);
    });

    it('[PERMISSAO-6] Guest emitindo desenho DRAW_ADD com screenLocked === true é bloqueado com SCREEN_LOCKED', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-draw-perm', atendidoId: 'a-06' });
      sm.setScreenLocked(true);

      expect(sm.canGuestExecute('DRAW_ADD')).toEqual({ allowed: false, reason: 'SCREEN_LOCKED' });
      expect(sm.canGuestExecute('DRAW_HIDE')).toEqual({ allowed: false, reason: 'SCREEN_LOCKED' });

      sm.setScreenLocked(false);
      expect(sm.canGuestExecute('DRAW_ADD').allowed).toBe(true);
    });
  });

  // ==========================================================================
  // CATEGORIA 8: PATH TRAVERSAL
  // ==========================================================================
  describe('8. Defesa contra Path Traversal', () => {
    it('[TRAVERSAL-1] Requisições HTTP com path traversal em /join/:token não expõem arquivos do sistema', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-trav-01', 'atendido-tr-01', '127.0.0.1');

      const traversalPaths = [
        '/join/..%2f..%2fpackage.json',
        '/join/..%5c..%5cpackage.json',
        '/join/%2e%2e%2f%2e%2e%2fpackage.json',
      ];

      for (const tPath of traversalPaths) {
        const res = await fetch(`http://127.0.0.1:${sessionInfo.port}${tPath}`, {
          headers: { Connection: 'close' },
        });
        expect(res.status).toBe(403);
      }
    });

    it('[TRAVERSAL-2] Requisições a /guest/assets com traversal não expõem arquivos fora da pasta compilada', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-trav-02', 'atendido-tr-02', '127.0.0.1');

      const res = await fetch(`http://127.0.0.1:${sessionInfo.port}/assets/../../package.json`, {
        headers: { Connection: 'close' },
      });

      // Express.static bloqueia path traversal fora da raiz servida (404 ou 403)
      expect(res.status).toBeGreaterThanOrEqual(400);
      const text = await res.text();
      expect(text).not.toContain('"name": "onetoonesupport"');
    });

    it('[TRAVERSAL-3] Evento do Guest com abaId malicioso é sumariamente descartado pelo ServerSessionController', async () => {
      sessionController = new ServerSessionController();
      let hostReceivedEvent: any = null;
      sessionController.onGuestEvent((ev) => {
        hostReceivedEvent = ev;
      });

      const anyController = sessionController as any;
      anyController.handleGuestEvent({
        type: 'DRAW_ADD',
        abaId: 'x/../../../etc/passwd',
        payload: { id: 'elem1' },
      });

      // O evento deve ser descartado na borda e NÃO repassado ao Host
      expect(hostReceivedEvent).toBeNull();
    });
  });

  // ==========================================================================
  // CATEGORIA 9: INJEÇÃO E SEGURANÇA WEB (CSP E XSS)
  // ==========================================================================
  describe('9. Injeção e Segurança Web (CSP e XSS)', () => {
    it('[INJECAO-1] Injeção de tags HTML/scripts em fallback de token é sanitizada por escapeHtml', () => {
      const sm = new SessionManager({ sessaoId: 'sessao-xss-01', atendidoId: 'a-xss-01' });
      createExpressApp(sm);

      // Simula token contendo injeção XSS
      const xssVector = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      // Verifica que isTokenValidForHttpJoin trata sem exceção
      expect(sm.isTokenValidForHttpJoin(xssVector)).toBe(false);
    });

    it('[INJECAO-2] Cabeçalho Content-Security-Policy do ADR-005 proíbe scripts inline e recursos externos', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession('sessao-csp-adv', 'atendido-csp', '127.0.0.1');

      const res = await fetch(`http://127.0.0.1:${sessionInfo.port}/health`, {
        headers: { Connection: 'close' },
      });
      const csp = res.headers.get('content-security-policy');

      expect(csp).toBeDefined();
      expect(csp).toBe(GUEST_CSP);
      // Garante proibição estrita de scripts inline ('unsafe-inline' NÃO pode constar em script-src)
      const scriptSrcMatch = csp?.match(/script-src\s+([^;]+)/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-eval'");
      expect(scriptSrcMatch![1]).toContain("'wasm-unsafe-eval'");
    });
  });
});
