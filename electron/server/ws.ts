import { WebSocketServer, WebSocket, RawData } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';
import { SessionManager } from './session-manager';
import {
  createEnvelope,
  validateEnvelope,
  MAX_MESSAGE_SIZE_BYTES,
  ProtocolEnvelope,
  EncryptedPayload,
  ProtocolMessageType,
} from '../../src/shared/events/protocol';
import { CryptoError } from '../../src/shared/crypto/types';

export type WsConnectionStage =
  | 'AWAITING_AUTH'
  | 'AWAITING_HANDSHAKE'
  | 'ENCRYPTED'
  | 'TERMINATED';

export interface WsServerOptions {
  server: http.Server;
  sessionManager: SessionManager;
  handshakeTimeoutMs?: number; // Padrão: 10 segundos
  heartbeatIntervalMs?: number; // Padrão: 10 segundos
  maxMessagesPerSecond?: number; // Padrão: 100 msgs/seg
  onGuestEvent?: (event: ProtocolEnvelope) => void;
}

export interface WsServerHandle {
  wss: WebSocketServer;
  sendEncryptedToGuest: (innerEvent: Record<string, unknown>) => boolean;
  close: () => Promise<void>;
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  stage: WsConnectionStage;
  isAlive: boolean;
  handshakeTimer?: NodeJS.Timeout;
  messageTimestamps: number[];
}

/**
 * Servidor WebSocket puro com enforce estrito do fluxo criptográfico:
 * AUTH (claro) -> HANDSHAKE_INIT (claro) -> tudo o mais ENCRYPTED.
 * Mensagens em claro ou fora de ordem pós-handshake derrubam a conexão imediatamente.
 */
export function createWebSocketServer(options: WsServerOptions): WsServerHandle {
  const {
    server,
    sessionManager,
    handshakeTimeoutMs = 10_000,
    heartbeatIntervalMs = 10_000,
    maxMessagesPerSecond = 100,
    onGuestEvent,
  } = options;

  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_MESSAGE_SIZE_BYTES, // 1 MB (Mestre §16 e ADR-002)
  });

  const connections = new Map<string, ClientConnection>();

  // Intervalo de Heartbeat (Ping/Pong)
  const heartbeatInterval = setInterval(() => {
    for (const [id, conn] of connections.entries()) {
      if (!conn.isAlive) {
        conn.ws.terminate();
        connections.delete(id);
        sessionManager.handleGuestDisconnect(id);
        continue;
      }
      conn.isAlive = false;
      conn.ws.ping();
    }
  }, heartbeatIntervalMs);

  wss.on('connection', (ws: WebSocket) => {
    const connId = crypto.randomUUID();
    const conn: ClientConnection = {
      id: connId,
      ws,
      stage: 'AWAITING_AUTH',
      isAlive: true,
      messageTimestamps: [],
    };

    connections.set(connId, conn);

    // Timeout de Handshake: conexão deve completar AUTH e HANDSHAKE_INIT em até handshakeTimeoutMs
    conn.handshakeTimer = setTimeout(() => {
      if (conn.stage !== 'ENCRYPTED') {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(connId);
        sessionManager.handleGuestDisconnect(connId);
      }
    }, handshakeTimeoutMs);

    ws.on('pong', () => {
      conn.isAlive = true;
    });

    ws.on('message', (raw: RawData, isBinary: boolean) => {
      // 1. Mensagens binárias diretas são rejeitadas (o protocolo v1 usa envelopes JSON)
      if (isBinary) {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(connId);
        sessionManager.handleGuestDisconnect(connId);
        return;
      }

      const now = Date.now();

      // 2. Rate Limiting por conexão (janela deslizante de 1 segundo)
      conn.messageTimestamps = conn.messageTimestamps.filter((ts) => now - ts < 1000);
      if (conn.messageTimestamps.length >= maxMessagesPerSecond) {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(connId);
        sessionManager.handleGuestDisconnect(connId);
        return;
      }
      conn.messageTimestamps.push(now);

      // 3. Validação do tamanho da carga útil
      const dataStr = raw.toString();
      if (dataStr.length > MAX_MESSAGE_SIZE_BYTES) {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(connId);
        sessionManager.handleGuestDisconnect(connId);
        return;
      }

      // 4. Parsing e validação estrutural do Envelope v1
      let envelope: ProtocolEnvelope;
      try {
        const parsed = JSON.parse(dataStr);
        envelope = validateEnvelope(parsed);
      } catch {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(connId);
        sessionManager.handleGuestDisconnect(connId);
        return;
      }

      // 5. Máquina de Estados Estrita do Protocolo (Fluxo de Transporte)
      handleIncomingEnvelope(conn, envelope);
    });

    ws.on('close', () => {
      if (conn.handshakeTimer) {
        clearTimeout(conn.handshakeTimer);
      }
      conn.stage = 'TERMINATED';
      connections.delete(connId);
      sessionManager.handleGuestDisconnect(connId);
    });

    ws.on('error', () => {
      if (conn.handshakeTimer) {
        clearTimeout(conn.handshakeTimer);
      }
      conn.stage = 'TERMINATED';
      ws.terminate();
      connections.delete(connId);
      sessionManager.handleGuestDisconnect(connId);
    });
  });

  function handleIncomingEnvelope(conn: ClientConnection, envelope: ProtocolEnvelope): void {
    const ws = conn.ws;

    switch (conn.stage) {
      case 'AWAITING_AUTH': {
        // Apenas AUTH ou RECONNECT são permitidos nesta etapa
        if (envelope.type !== 'AUTH' && envelope.type !== 'RECONNECT') {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        if (envelope.type === 'AUTH') {
          const authPayload = envelope.payload as { token?: string };
          if (!authPayload || typeof authPayload.token !== 'string') {
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          const authRes = sessionManager.authenticateInitialJoin(authPayload.token, conn.id);
          if (!authRes.valid) {
            const errEnvelope = createEnvelope('ERROR', {
              code: authRes.code || 'AUTH_FAILED',
              message: authRes.message || 'Falha na autenticação do convite.',
              fatal: true,
            });
            try {
              ws.send(JSON.stringify(errEnvelope));
            } catch {
              // Ignore send error on closing
            }
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          conn.stage = 'AWAITING_HANDSHAKE';
          return;
        }

        if (envelope.type === 'RECONNECT') {
          const reconnectPayload = envelope.payload as { token?: string };
          if (!reconnectPayload || typeof reconnectPayload.token !== 'string') {
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          const recRes = sessionManager.authenticateReconnect(reconnectPayload.token, conn.id);
          if (!recRes.valid) {
            const errEnvelope = createEnvelope('ERROR', {
              code: recRes.code || 'AUTH_FAILED',
              message: recRes.message || 'Falha na reconexão.',
              fatal: true,
            });
            try {
              ws.send(JSON.stringify(errEnvelope));
            } catch {
              // Ignore send error on closing
            }
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          conn.stage = 'AWAITING_HANDSHAKE';
          return;
        }
        break;
      }

      case 'AWAITING_HANDSHAKE': {
        // Apenas HANDSHAKE_INIT é permitido nesta etapa
        if (envelope.type !== 'HANDSHAKE_INIT') {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const hsPayload = envelope.payload as { clientPublicKey?: string };
        if (!hsPayload || typeof hsPayload.clientPublicKey !== 'string') {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          return;
        }

        try {
          const { reconnectToken } = sessionManager.completeHandshake(hsPayload.clientPublicKey);
          if (conn.handshakeTimer) {
            clearTimeout(conn.handshakeTimer);
            conn.handshakeTimer = undefined;
          }
          conn.stage = 'ENCRYPTED';

          // Host responde imediatamente com confirmação cifrada SESSION_READY contendo o reconnect_token
          const cipher = sessionManager.getCipher();
          if (!cipher) {
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          const sessionReadyPayload = JSON.stringify({
            type: 'SESSION_READY',
            sessaoId: sessionManager.sessaoId,
            reconnectToken,
            serverTs: Date.now(),
          });

          const encrypted = cipher.encrypt(sessionReadyPayload);
          const responseEnvelope = createEnvelope('ENCRYPTED', encrypted);
          ws.send(JSON.stringify(responseEnvelope));
        } catch {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
        }
        return;
      }

      case 'ENCRYPTED': {
        // REGRA CRÍTICA: Qualquer mensagem em claro ou fora de ordem pós-handshake derruba a conexão
        if (envelope.type !== 'ENCRYPTED') {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const cipher = sessionManager.getCipher();
        if (!cipher) {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        let decryptedBytes: Uint8Array;
        try {
          const encPayload = envelope.payload as EncryptedPayload;
          decryptedBytes = cipher.decrypt(encPayload);
        } catch (err: unknown) {
          // Adulteração, replay, reordenação ou nonce inválido: falha limpa sem vazar segredos
          if (err instanceof CryptoError) {
            // Em caso de adulteração ou replay grave, derruba a conexão imediatamente
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            sessionManager.handleGuestDisconnect(conn.id);
            return;
          }
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        // Parse da mensagem interna decifrada
        let innerMessage: Record<string, unknown>;
        try {
          const text = new TextDecoder('utf-8').decode(decryptedBytes);
          innerMessage = JSON.parse(text);
        } catch {
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const innerType = innerMessage.type as ProtocolMessageType;
        if (!innerType) {
          return;
        }

        // Suporte especial para medição de latência de eco cifrado (Echo Request)
        if (innerType === ('ECHO_PING' as unknown as ProtocolMessageType)) {
          const echoReply = cipher.encrypt(
            JSON.stringify({
              type: 'ECHO_PONG',
              echoId: innerMessage.echoId,
              clientTs: innerMessage.clientTs,
              serverTs: Date.now(),
            })
          );
          ws.send(JSON.stringify(createEnvelope('ENCRYPTED', echoReply)));
          return;
        }

        // Validação da Matriz de Autoridade do Host
        const actionCheck = sessionManager.canGuestExecute(innerType);
        if (!actionCheck.allowed) {
          // Rejeita ação não autorizada com erro cifrado
          const errorMsg = cipher.encrypt(
            JSON.stringify({
              type: 'ERROR',
              code: 'ACTION_BLOCKED',
              reason: actionCheck.reason,
            })
          );
          ws.send(JSON.stringify(createEnvelope('ENCRYPTED', errorMsg)));
          return;
        }

        // Se for evento de controle de mídia, aplica o relógio mestre do servidor
        if (
          innerType === 'PLAY' ||
          innerType === 'PAUSE' ||
          innerType === 'SEEK' ||
          innerType === 'MEDIA_CONTROL'
        ) {
          innerMessage = sessionManager.stampMediaEvent(innerMessage);
        }

        // Notifica o receptor do Host / Event Sourcing
        if (onGuestEvent) {
          try {
            const actualPayload =
              innerMessage.payload !== undefined && innerMessage.payload !== null
                ? innerMessage.payload
                : innerMessage;
            const innerEnvelope = createEnvelope(innerType, actualPayload as unknown as never);
            if (innerMessage.abaId) {
              (innerEnvelope as any).abaId = innerMessage.abaId;
            }
            onGuestEvent(innerEnvelope);
          } catch (err) {
            console.error('[WsServer] Erro ao despachar evento decifrado do Guest:', err);
          }
        }

        break;
      }

      default: {
        conn.stage = 'TERMINATED';
        ws.terminate();
        connections.delete(conn.id);
        break;
      }
    }
  }

  function sendEncryptedToGuest(innerEvent: Record<string, unknown>): boolean {
    const cipher = sessionManager.getCipher();
    if (!cipher || !sessionManager.isGuestConnected()) {
      return false;
    }

    // Procura a conexão ativa no estado ENCRYPTED
    let sent = false;
    for (const conn of connections.values()) {
      if (conn.stage === 'ENCRYPTED' && conn.ws.readyState === WebSocket.OPEN) {
        try {
          const encryptedPayload = cipher.encrypt(JSON.stringify(innerEvent));
          const envelope = createEnvelope('ENCRYPTED', encryptedPayload);
          conn.ws.send(JSON.stringify(envelope));
          sent = true;
        } catch (err) {
          console.error('[WsServer] Falha ao cifrar/enviar evento para o Guest:', err);
        }
      }
    }
    return sent;
  }

  return {
    wss,
    sendEncryptedToGuest,
    close: async () => {
      clearInterval(heartbeatInterval);
      for (const conn of connections.values()) {
        if (conn.handshakeTimer) {
          clearTimeout(conn.handshakeTimer);
        }
        conn.ws.terminate();
      }
      connections.clear();

      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}
