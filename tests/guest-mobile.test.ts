import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocket as WsImplementation } from 'ws';
import { ServerSessionController } from '../electron/server/index';
import { GuestWsClient } from '../src/guest/ws/client';
import { parseInviteUrl } from '../src/shared/crypto/invite';
import { EventoService } from '../electron/services/evento.service';
import { createEnvelope } from '../src/shared/events/protocol';

// Garante que o ambiente de teste em Node execute WebSockets sem browser
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WsImplementation;
}

describe('Fase 07 - Guest Mobile e Interoperabilidade E2EE', () => {
  let sessionController: ServerSessionController | null = null;
  let activeClients: GuestWsClient[] = [];

  afterEach(async () => {
    for (const c of activeClients) {
      c.close();
    }
    activeClients = [];

    if (sessionController) {
      await sessionController.stopSession();
      sessionController = null;
    }
  });

  describe('1. Servidor Express e Entrega do Bundle do Guest (ADR-005)', () => {
    it('serve o index.html compilado do Guest em /join/:token com cabeçalhos CSP estritos', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-teste-guest-01',
        'atendido-teste-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const token = parsedInvite.token;

      // Requisição HTTP para a rota de join do convite
      const joinUrl = `http://127.0.0.1:${sessionInfo.port}/join/${token}`;
      const res = await fetch(joinUrl, { headers: { Connection: 'close' } });

      expect(res.status).toBe(200);
      const html = await res.text();

      // Confirma que o HTML servido é o bundle do Guest da Fase 07
      expect(html).toContain('OneToOneSupport - Sala de Atendimento');
      expect(html).toContain('id="root"');
      expect(html).toContain('/guest/assets/');

      // Validação estrita dos cabeçalhos CSP do ADR-005
      const csp = res.headers.get('content-security-policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('connect-src');
      expect(csp).toContain('ws:');
      expect(csp).toContain('wss:');
      expect(csp).toContain('img-src');
      expect(csp).toContain('blob:');
      expect(csp).toContain('data:');
      expect(csp).toContain('media-src');
      expect(csp).toContain('style-src');
      expect(csp).toContain('script-src');
      expect(csp).toContain('object-src');
      expect(csp).toContain('base-uri');

      // Cabeçalhos complementares de segurança
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('access-control-allow-origin')).toBeNull(); // Sem CORS aberto
    });

    it('serve assets estáticos do Guest (/guest/assets/...) com código 200', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-teste-guest-02',
        'atendido-teste-02',
        '127.0.0.1'
      );

      // Descobre um arquivo de asset gerado no dist/guest/assets
      const assetsDir = path.resolve(__dirname, '../dist/guest/assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);
      expect(files.length).toBeGreaterThan(0);
      const sampleAsset = files[0];

      const assetUrl = `http://127.0.0.1:${sessionInfo.port}/guest/assets/${sampleAsset}`;
      const res = await fetch(assetUrl, { headers: { Connection: 'close' } });
      expect(res.status).toBe(200);
      expect(Number(res.headers.get('content-length'))).toBeGreaterThan(0);
    });

    it('rejeita requisição HTTP com token inválido com status 403 e mensagem limpa', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-teste-guest-03',
        'atendido-teste-03',
        '127.0.0.1'
      );

      const res = await fetch(`http://127.0.0.1:${sessionInfo.port}/join/token-inexistente-ou-falso`, {
        headers: { Connection: 'close' },
      });
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Convite Inválido ou Expirado');
    });
  });

  describe('2. Fluxo Join e Criptografia E2EE (GuestWsClient)', () => {
    it('executa AUTH -> HANDSHAKE_INIT e conclui com SESSION_READY', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-e2ee-01',
        'atendido-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let receivedSessionReady = false;
      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'SESSION_READY') {
            receivedSessionReady = true;
          }
        },
      });
      activeClients.push(client);

      await client.connect();

      expect(client.getState()).toBe('connected');
      expect(receivedSessionReady).toBe(true);
      expect(client.getReconnectToken()).toBeDefined();
      expect(client.getReconnectToken()?.length).toBe(64); // 32 bytes hex
      expect(sessionController.getStatus()?.guestConnected).toBe(true);
    });

    it('invalida o token de primeiro acesso imediatamente (propriedade one-shot)', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-oneshot-01',
        'atendido-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      // Primeiro cliente entra com sucesso
      const client1 = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();
      expect(client1.getState()).toBe('connected');

      // Fecha o primeiro cliente
      client1.close();

      // Segundo cliente tenta usar o mesmo token de convite
      const client2 = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);

      await expect(client2.connect()).rejects.toThrow();
      expect(client2.getState()).toBe('error');
    });

    it('rejeita um segundo Guest simultâneo (SESSION_BUSY)', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-busy-01',
        'atendido-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      const client1 = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client1);
      await client1.connect();
      expect(client1.getState()).toBe('connected');

      // Segundo cliente tenta conectar enquanto o primeiro está ativo
      const client2 = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client2);

      await expect(client2.connect()).rejects.toThrow();
    });
  });

  describe('3. Sincronização Bidirecional e Permissões (Host <-> Guest)', () => {
    it('transmite desenho do Guest para o Host e persiste no banco SQLite', async () => {
      const db = (await import('../electron/db/connection')).getDb();
      const now = Date.now();
      db.prepare(`
        INSERT OR IGNORE INTO Atendidos (id, nome, ativo, criado_em, atualizado_em)
        VALUES ('atendido-sync-01', 'Atendido Sync', 1, ?, ?)
      `).run(now, now);

      db.prepare(`
        INSERT OR IGNORE INTO Sessoes (id, atendido_id, status, iniciado_em)
        VALUES ('sessao-sync-draw-01', 'atendido-sync-01', 'ativa', ?)
      `).run(now);

      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-sync-draw-01',
        'atendido-sync-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let eventReceivedAtHost: any = null;
      sessionController.onGuestEvent((event) => {
        eventReceivedAtHost = event;
      });

      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();

      // Guest emite evento de desenho DRAW_ADD cifrado
      client.sendEncrypted({
        type: 'DRAW_ADD',
        abaId: 'default',
        payload: {
          id: 'rect-guest-1',
          type: 'rect',
          x: 100,
          y: 150,
          width: 50,
          height: 50,
          fill: '#0284c7',
        },
      });

      // Aguarda processamento no servidor
      await new Promise((r) => setTimeout(r, 200));

      expect(eventReceivedAtHost).toBeDefined();
      expect(eventReceivedAtHost.type).toBe('DRAW_ADD');
      expect(eventReceivedAtHost.payload.id).toBe('rect-guest-1');

      // Verifica persistência no SQLite através do EventoService
      const eventoService = new EventoService();
      const estadoReconstruido = eventoService.reconstruirEstadoAba('sessao-sync-draw-01', 'default');
      expect(estadoReconstruido.elements['rect-guest-1']).toBeDefined();
    });

    it('transmite evento do Host para o Guest decifrado em tempo real', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-sync-host-01',
        'atendido-sync-02',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let guestReceivedMessage: any = null;
      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'DRAW_ADD') {
            guestReceivedMessage = msg;
          }
        },
      });
      activeClients.push(client);
      await client.connect();

      // Host emite evento DRAW_ADD cifrado para o Guest
      sessionController.broadcastToGuest({
        type: 'DRAW_ADD',
        abaId: 'default',
        payload: {
          id: 'circle-host-1',
          type: 'ellipse',
          x: 200,
          y: 200,
          rx: 30,
          ry: 30,
        },
      });

      await new Promise((r) => setTimeout(r, 200));

      expect(guestReceivedMessage).toBeDefined();
      expect(guestReceivedMessage.type).toBe('DRAW_ADD');
      expect(guestReceivedMessage.payload.id).toBe('circle-host-1');
    });

    it('LOCK_SCREEN bloqueia ações e notifica o Guest com evento cifrado', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-lock-01',
        'atendido-lock-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let lockEventReceived: any = null;
      let actionBlockedReceived: any = null;

      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'LOCK_SCREEN') lockEventReceived = msg;
          if (msg.type === 'ERROR' && msg.code === 'ACTION_BLOCKED') actionBlockedReceived = msg;
        },
      });
      activeClients.push(client);
      await client.connect();

      // 1. Host bloqueia a tela
      sessionController.lockScreen(true);
      await new Promise((r) => setTimeout(r, 200));

      expect(lockEventReceived).toBeDefined();
      expect(lockEventReceived.locked).toBe(true);
      expect(sessionController.getStatus()?.screenLocked).toBe(true);

      // 2. Guest tenta emitir desenho com tela bloqueada -> servidor rejeita
      client.sendEncrypted({
        type: 'DRAW_ADD',
        abaId: 'default',
        payload: { id: 'tentativa-bloqueada' },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(actionBlockedReceived).toBeDefined();
      expect(actionBlockedReceived.reason).toBe('SCREEN_LOCKED');

      // 3. Host libera a tela
      sessionController.lockScreen(false);
      await new Promise((r) => setTimeout(r, 200));
      expect(sessionController.getStatus()?.screenLocked).toBe(false);
    });

    it('UNLOCK_MEDIA libera controle de mídia e mute local emite GUEST_MUTED', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-media-01',
        'atendido-media-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let mediaEventReceived: any = null;
      let hostReceivedMute: any = null;

      sessionController.onGuestEvent((event) => {
        if (event.type === 'GUEST_MUTED') hostReceivedMute = event;
      });

      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'UNLOCK_MEDIA') mediaEventReceived = msg;
        },
      });
      activeClients.push(client);
      await client.connect();

      // 1. Host desbloqueia mídia
      sessionController.unlockMedia(true);
      await new Promise((r) => setTimeout(r, 200));

      expect(mediaEventReceived).toBeDefined();
      expect(mediaEventReceived.unlocked).toBe(true);
      expect(sessionController.getStatus()?.mediaUnlocked).toBe(true);

      // 2. Guest aciona mute local -> emite GUEST_MUTED
      client.sendEncrypted({
        type: 'GUEST_MUTED',
        payload: { muted: true, ts: Date.now() },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(hostReceivedMute).toBeDefined();
      expect(hostReceivedMute.payload.muted).toBe(true);
    });

    it('TAB_SWITCH sincroniza troca de aba ativa para o Guest', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-tab-01',
        'atendido-tab-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let tabSwitchReceived: any = null;
      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'TAB_SWITCH') tabSwitchReceived = msg;
        },
      });
      activeClients.push(client);
      await client.connect();

      // Host alterna aba para 'aba-midia-02'
      sessionController.switchTab('aba-midia-02');
      await new Promise((r) => setTimeout(r, 200));

      expect(tabSwitchReceived).toBeDefined();
      expect(tabSwitchReceived.abaId).toBe('aba-midia-02');
    });
  });

  describe('4. Reconexão Automática com Token Rotacionado (TTL 5 min)', () => {
    it('restabelece conexão criptográfica após queda abrupta da rede', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-reconnect-01',
        'atendido-rec-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();

      const primeiroReconnectToken = client.getReconnectToken();
      expect(primeiroReconnectToken).toBeDefined();

      // 1. Simula queda abrupta da rede terminando o socket
      (client.ws as any)?.terminate?.() || client.ws?.close();

      // Aguarda servidor registrar desconexão e transicionar para 'reconectando'
      await new Promise((r) => setTimeout(r, 300));
      expect(sessionController.getStatus()?.status).toBe('reconectando');

      // 2. Reconecta explicitamente com o token de reconexão
      const clientReconectado = new GuestWsClient({
        wsUrl,
        token: '', // Token inicial descartado
        reconnectToken: primeiroReconnectToken,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(clientReconectado);
      await clientReconectado.connect();

      expect(clientReconectado.getState()).toBe('connected');
      expect(sessionController.getStatus()?.status).toBe('conectado');

      // 3. Verifica que o token de reconexão foi rotacionado
      const segundoReconnectToken = clientReconectado.getReconnectToken();
      expect(segundoReconnectToken).toBeDefined();
      expect(segundoReconnectToken).not.toBe(primeiroReconnectToken);
    });
  });

  describe('5. Testes Adversariais e Ataques de Segurança', () => {
    it('derruba a conexão imediatamente se mensagem em claro for enviada pós-handshake', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-adv-01',
        'atendido-adv-01',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
      });
      activeClients.push(client);
      await client.connect();

      // Envia envelope em claro (não ENCRYPTED) violando a regra do protocolo
      const violacao = createEnvelope('DRAW_ADD', { fake: true } as any);
      client.ws?.send(JSON.stringify(violacao));

      await new Promise((r) => setTimeout(r, 300));

      // Conexão deve ser sumariamente encerrada pelo servidor
      expect(sessionController.getStatus()?.guestConnected).toBe(false);
    });

    it('bloqueia ações proibidas do Guest (ex.: Guest tentando emitir LOCK_SCREEN)', async () => {
      sessionController = new ServerSessionController();
      const sessionInfo = await sessionController.startSession(
        'sessao-adv-02',
        'atendido-adv-02',
        '127.0.0.1'
      );

      const parsedInvite = parseInviteUrl(sessionInfo.inviteUrl);
      const wsUrl = `ws://127.0.0.1:${sessionInfo.port}`;

      let erroRecebido: any = null;
      const client = new GuestWsClient({
        wsUrl,
        token: parsedInvite.token,
        hostPublicKey: parsedInvite.hostPublicKey,
        onMessage: (msg) => {
          if (msg.type === 'ERROR') erroRecebido = msg;
        },
      });
      activeClients.push(client);
      await client.connect();

      // Guest tenta forjar emissão de LOCK_SCREEN (ação privativa do Host)
      client.sendEncrypted({
        type: 'LOCK_SCREEN',
        locked: true,
      });

      await new Promise((r) => setTimeout(r, 300));

      expect(erroRecebido).toBeDefined();
      expect(erroRecebido.code).toBe('ACTION_BLOCKED');
      expect(erroRecebido.reason).toBe('FORBIDDEN_ACTION');
      // O Host NÃO deve ter seu estado alterado
      expect(sessionController.getStatus()?.screenLocked).toBe(false);
    });
  });
});
