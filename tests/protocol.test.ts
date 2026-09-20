import { describe, it, expect } from 'vitest';
import {
  createProtocolEnvelope,
  generateUUID,
  isAuthEnvelope,
  isEncryptedEnvelope,
  isHandshakeInitEnvelope,
  isProtocolEnvelope,
  MAX_MESSAGE_SIZE_BYTES,
  parseProtocolMessage,
  ProtocolMessage,
  validateProtocolEnvelope,
} from '../src/shared/events/protocol';

describe('Protocolo WebSocket v1 - Envelope e Validação Runtime', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validTs = 1731000000000;

  describe('Estrutura Básica do Envelope v1', () => {
    it('cria envelope v1 válido com createProtocolEnvelope', () => {
      const msg = createProtocolEnvelope('AUTH', { token: 'token-teste-123' }, validUuid, validTs);
      expect(msg.v).toBe(1);
      expect(msg.id).toBe(validUuid);
      expect(msg.ts).toBe(validTs);
      expect(msg.type).toBe('AUTH');
      expect(msg.payload).toEqual({ token: 'token-teste-123' });
      expect(isProtocolEnvelope(msg)).toBe(true);
    });

    it('gera UUID v4 válido automaticamente quando id não é fornecido', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      const msg = createProtocolEnvelope('CLEAR_TAB', { tabId: 'tab-1' });
      expect(msg.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('União discriminada de todos os tipos (§16 + extensões)', () => {
    it('valida mensagem AUTH (Guest -> Host)', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'AUTH',
        payload: { token: 'token-convite-xyz' },
      };
      const res = validateProtocolEnvelope(msg);
      expect(res.ok).toBe(true);
      expect(isAuthEnvelope(msg)).toBe(true);
    });

    it('valida mensagem HANDSHAKE_INIT (Guest -> Host)', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'HANDSHAKE_INIT',
        payload: { clientPublicKey: 'pk_base64url_do_guest_32_bytes_xyz' },
      };
      const res = validateProtocolEnvelope(msg);
      expect(res.ok).toBe(true);
      expect(isHandshakeInitEnvelope(msg)).toBe(true);
    });

    it('valida mensagem ENCRYPTED (Ambos com ChaCha20-Poly1305)', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'ENCRYPTED',
        payload: {
          nonce: 'nonce12bytesbase64',
          ciphertext: 'ciphertextcomtagpoly1305',
        },
      };
      const res = validateProtocolEnvelope(msg);
      expect(res.ok).toBe(true);
      expect(isEncryptedEnvelope(msg)).toBe(true);
    });

    it('valida mensagem DRAW_ADD', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'DRAW_ADD',
        payload: {
          tabId: 'tab-whiteboard',
          elementId: 'elem-001',
          data: { type: 'path', path: [['M', 0, 0], ['L', 10, 10]] },
        },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem DRAW_HIDE (borracha lógica)', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'DRAW_HIDE',
        payload: { tabId: 'tab-whiteboard', elementId: 'elem-001' },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem CLEAR_TAB', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'CLEAR_TAB',
        payload: { tabId: 'tab-whiteboard' },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem LOCK_SCREEN', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'LOCK_SCREEN',
        payload: { locked: true, reason: 'Aguarde o especialista' },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem UNLOCK_MEDIA', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'UNLOCK_MEDIA',
        payload: { enabled: true, mediaTypes: ['video', 'audio'] },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem TAB_SWITCH', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'TAB_SWITCH',
        payload: { tabId: 'tab-pdf-page-2' },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem GUEST_MUTED', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'GUEST_MUTED',
        payload: { muted: true },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagens individuais PLAY, PAUSE e SEEK', () => {
      const playMsg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'PLAY',
        payload: { tabId: 'tab-video-1', currentTime: 14.5 },
      };
      const pauseMsg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'PAUSE',
        payload: { tabId: 'tab-video-1', currentTime: 14.5 },
      };
      const seekMsg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'SEEK',
        payload: { tabId: 'tab-video-1', currentTime: 42.0 },
      };

      expect(validateProtocolEnvelope(playMsg).ok).toBe(true);
      expect(validateProtocolEnvelope(pauseMsg).ok).toBe(true);
      expect(validateProtocolEnvelope(seekMsg).ok).toBe(true);
    });

    it('valida mensagem agregada MEDIA_CONTROL', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'MEDIA_CONTROL',
        payload: { action: 'SEEK', tabId: 'tab-video-1', currentTime: 30 },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem RECONNECT', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'RECONNECT',
        payload: { token: 'token-prev-123', lastSeenSeq: 42 },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });

    it('valida mensagem ERROR', () => {
      const msg: ProtocolMessage = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'ERROR',
        payload: { code: 'UNAUTHORIZED', message: 'Token inválido', fatal: true },
      };
      expect(validateProtocolEnvelope(msg).ok).toBe(true);
    });
  });

  describe('Rejeição em Runtime de Dados Inválidos, Maliciosos ou Excessivos', () => {
    it('rejeita payload de tamanho excessivo (> 1MB) antes de JSON.parse', () => {
      const hugeString = 'a'.repeat(MAX_MESSAGE_SIZE_BYTES + 10);
      const res = parseProtocolMessage(hugeString);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('MESSAGE_TOO_LARGE');
      }
    });

    it('rejeita JSON mal formatado', () => {
      const res = parseProtocolMessage('{ "v": 1, id: malformado');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('JSON_PARSE_ERROR');
      }
    });

    it('rejeita tentativa de poluição de protótipo (__proto__)', () => {
      const maliciousJson = JSON.parse('{"v":1,"id":"' + validUuid + '","ts":1000,"type":"AUTH","payload":{"token":"t"},"__proto__":{"polluted":true}}');
      const res = validateProtocolEnvelope(maliciousJson);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('SECURITY_VIOLATION');
      }
    });

    it('rejeita tentativa de poluição com constructor no payload', () => {
      const malicious = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'AUTH',
        payload: {
          token: 'token',
          constructor: { prototype: { hack: true } },
        },
      };
      const res = validateProtocolEnvelope(malicious);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('SECURITY_VIOLATION');
      }
    });

    it('rejeita versão de protocolo diferente de 1', () => {
      const invalidVersion = {
        v: 2,
        id: validUuid,
        ts: validTs,
        type: 'AUTH',
        payload: { token: 'token' },
      };
      const res = validateProtocolEnvelope(invalidVersion);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('UNSUPPORTED_VERSION');
      }
    });

    it('rejeita ID não UUID', () => {
      const invalidId = {
        v: 1,
        id: 'id-invalido-curto',
        ts: validTs,
        type: 'AUTH',
        payload: { token: 'token' },
      };
      const res = validateProtocolEnvelope(invalidId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_ID');
      }
    });

    it('rejeita timestamp negativo, zero ou infinito', () => {
      const badTs1 = { v: 1, id: validUuid, ts: 0, type: 'AUTH', payload: { token: 't' } };
      const badTs2 = { v: 1, id: validUuid, ts: -50, type: 'AUTH', payload: { token: 't' } };
      const badTs3 = { v: 1, id: validUuid, ts: Infinity, type: 'AUTH', payload: { token: 't' } };

      expect(validateProtocolEnvelope(badTs1).ok).toBe(false);
      expect(validateProtocolEnvelope(badTs2).ok).toBe(false);
      expect(validateProtocolEnvelope(badTs3).ok).toBe(false);
    });

    it('rejeita tipo de mensagem desconhecido', () => {
      const unknown = {
        v: 1,
        id: validUuid,
        ts: validTs,
        type: 'INJECT_SQL_COMMAND',
        payload: {},
      };
      const res = validateProtocolEnvelope(unknown);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('UNKNOWN_TYPE');
      }
    });

    it('rejeita payloads que violem tipos específicos', () => {
      // AUTH sem token
      expect(validateProtocolEnvelope({ v: 1, id: validUuid, ts: validTs, type: 'AUTH', payload: {} }).ok).toBe(false);
      // ENCRYPTED com nonce vazio
      expect(validateProtocolEnvelope({ v: 1, id: validUuid, ts: validTs, type: 'ENCRYPTED', payload: { nonce: '', ciphertext: 'abc' } }).ok).toBe(false);
      // DRAW_ADD com tabId vazio
      expect(validateProtocolEnvelope({ v: 1, id: validUuid, ts: validTs, type: 'DRAW_ADD', payload: { tabId: '', elementId: 'e', data: {} } }).ok).toBe(false);
      // PLAY com currentTime negativo
      expect(validateProtocolEnvelope({ v: 1, id: validUuid, ts: validTs, type: 'PLAY', payload: { tabId: 'tab', currentTime: -1 } }).ok).toBe(false);
    });
  });
});
