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
import { EventoService } from '../services/evento.service';
import { diagLog, diagServerLog } from '../../src/shared/diag';

function logServerDrop(motivo: string, extra?: Record<string, unknown>): void {
  diagLog('serverDrop', { motivo, ...extra });
  diagServerLog('serverDrop', { motivo, ...extra });
  diagServerLog('descarte', { motivo, ...extra });
}

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
  lastClockSyncTs?: number;
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
        logServerDrop('MENSAGEM_BINARIA_REJEITADA', { stage: conn.stage });
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
        logServerDrop('RATE_LIMIT_EXCEDIDO', { stage: conn.stage, msgsNoSegundo: conn.messageTimestamps.length });
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
        logServerDrop('TAMANHO_MAXIMO_EXCEDIDO', { stage: conn.stage, tamanhoBytes: dataStr.length });
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
        logServerDrop('ENVELOPE_INVALIDO', { stage: conn.stage });
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
          logServerDrop('TIPO_INVALIDO_AWAITING_AUTH', { tipo: envelope.type, stage: conn.stage });
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        if (envelope.type === 'AUTH') {
          const authPayload = envelope.payload as { token?: string };
          if (!authPayload || typeof authPayload.token !== 'string') {
            logServerDrop('PAYLOAD_AUTH_INVALIDO', { stage: conn.stage });
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          const authRes = sessionManager.authenticateInitialJoin(authPayload.token, conn.id);
          if (!authRes.valid) {
            logServerDrop('FALHA_AUTENTICACAO_TOKEN', { codigo: authRes.code });
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
            logServerDrop('PAYLOAD_RECONNECT_INVALIDO', { stage: conn.stage });
            conn.stage = 'TERMINATED';
            ws.terminate();
            connections.delete(conn.id);
            return;
          }

          const recRes = sessionManager.authenticateReconnect(reconnectPayload.token, conn.id);
          if (!recRes.valid) {
            logServerDrop('FALHA_RECONEXAO_TOKEN', { codigo: recRes.code });
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
          logServerDrop('TIPO_INVALIDO_AWAITING_HANDSHAKE', { tipo: envelope.type, stage: conn.stage });
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const hsPayload = envelope.payload as { clientPublicKey?: string };
        if (!hsPayload || typeof hsPayload.clientPublicKey !== 'string') {
          logServerDrop('PAYLOAD_HANDSHAKE_INVALIDO', { stage: conn.stage });
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
            mediaToken: sessionManager.getMediaToken(),
            serverTs: Date.now(),
          });

          const encrypted = cipher.encrypt(sessionReadyPayload);
          const responseEnvelope = createEnvelope('ENCRYPTED', encrypted);
          ws.send(JSON.stringify(responseEnvelope));

          // Sincronização inicial do estado da aba ativa no quadro branco para o Guest conectado
          try {
            const eventoService = new EventoService();
            const initialTabState = eventoService.reconstruirEstadoAba(sessionManager.sessaoId, 'default');
            if (initialTabState && initialTabState.elementOrder.length > 0) {
              const tabStatePayload = JSON.stringify({
                type: 'TAB_STATE',
                abaId: 'default',
                state: initialTabState,
                sessaoId: sessionManager.sessaoId,
                ts: Date.now(),
              });
              const encryptedState = cipher.encrypt(tabStatePayload);
              ws.send(JSON.stringify(createEnvelope('ENCRYPTED', encryptedState)));
            }
          } catch (err) {
            console.warn('[WsServer] Aviso ao sincronizar estado inicial da aba no handshake:', err);
          }
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
          logServerDrop('ENVELOPE_NAO_CIFRADO_POS_HANDSHAKE', { tipo: envelope.type, stage: conn.stage });
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const cipher = sessionManager.getCipher();
        if (!cipher) {
          logServerDrop('CIFRA_AUSENTE_NO_ESTADO_ENCRYPTED', { stage: conn.stage });
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
          logServerDrop('FALHA_DECIFRAGEM', { stage: conn.stage });
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
          logServerDrop('JSON_DECIFRADO_INVALIDO');
          conn.stage = 'TERMINATED';
          ws.terminate();
          connections.delete(conn.id);
          sessionManager.handleGuestDisconnect(conn.id);
          return;
        }

        const innerType = innerMessage.type as ProtocolMessageType;
        if (!innerType) {
          logServerDrop('MENSAGEM_SEM_CAMPO_TYPE');
          return;
        }

        diagServerLog('guestEventReceived', {
          tipo: innerType,
          abaId: innerMessage.abaId,
        });

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

        // Tratamento de CLOCK_SYNC com rate limit estrito de 1 msg/seg por conexão (M6)
        if (innerType === 'CLOCK_SYNC') {
          const now = Date.now();
          if (conn.lastClockSyncTs && now - conn.lastClockSyncTs < 1000) {
            logServerDrop('CLOCK_SYNC_RATE_LIMIT', { connId: conn.id });
            return; // Excedente descartado sem derrubar a conexão (M6)
          }
          conn.lastClockSyncTs = now;
          const rawPayload = (innerMessage.payload && typeof innerMessage.payload === 'object')
            ? (innerMessage.payload as Record<string, unknown>)
            : innerMessage;
          const t0 = typeof rawPayload.t0 === 'number'
            ? rawPayload.t0
            : (typeof innerMessage.t0 === 'number' ? innerMessage.t0 : now);
          const clockSyncReply = cipher.encrypt(
            JSON.stringify({
              type: 'CLOCK_SYNC',
              payload: { t0, t1: now },
              t0,
              t1: now,
            })
          );
          ws.send(JSON.stringify(createEnvelope('ENCRYPTED', clockSyncReply)));
          return;
        }

        // Validação da Matriz de Autoridade do Host
        const actionCheck = sessionManager.canGuestExecute(innerType);
        diagServerLog('autoridade', {
          tipo: innerType,
          permitido: actionCheck.allowed,
          motivo: actionCheck.reason,
        });
        if (!actionCheck.allowed) {
          logServerDrop('ACAO_GUEST_BLOQUEADA', { tipo: innerType, razao: actionCheck.reason });
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
            const innerEnvelope: ProtocolEnvelope & { abaId?: string } = createEnvelope(innerType, actualPayload as unknown as never);
            if (innerMessage.abaId && typeof innerMessage.abaId === 'string') {
              innerEnvelope.abaId = innerMessage.abaId;
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
      logServerDrop('ENVIO_GUEST_FALHOU_SEM_CONEXAO_CIFRADA', { tipo: innerEvent?.type as string });
      return false;
    }

    // Procura a conexão ativa no estado ENCRYPTED
    let sent = false;
    for (const conn of connections.values()) {
      if (conn.stage === 'ENCRYPTED' && conn.ws.readyState === WebSocket.OPEN) {
        try {
          const encryptedPayload = cipher.encrypt(JSON.stringify(innerEvent));
          const envelope = createEnvelope('ENCRYPTED', encryptedPayload);
          conn.ws.send(JSON.stringify(envelope), (err) => {
            if (!err) {
              diagServerLog('chegada no Guest', {
                transporte: 'tcp_flushed',
                tipo: innerEvent?.type,
                connId: conn.id,
              });
              diagServerLog('chegadaNoGuest', {
                transporte: 'tcp_flushed',
                tipo: innerEvent?.type,
                connId: conn.id,
              });
            } else {
              logServerDrop('FALHA_ENVIO_SOCKET', { erro: err.message });
            }
          });
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
