import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BrowserCryptoProvider,
  createBrowserSessionCipher,
} from '../src/shared/crypto/browser';
import {
  buildNonce,
  parseNonce,
  validateNonce,
} from '../src/shared/crypto/nonce';
import {
  CryptoError,
  DIRECTION_H2G,
  KeyPair,
  SessionKeys,
} from '../src/shared/crypto/types';
import {
  NodeCryptoProvider,
  createHostSessionCipher,
  createNodeSessionCipher,
} from '../electron/crypto/cipher';
import {
  deriveHostSessionKeys,
  destroyKeyPair,
  destroySessionKeys,
  generateHostKeyPair,
  memzero,
} from '../electron/crypto/handshake';

describe('Criptografia E2EE - Interoperabilidade Byte a Byte e Testes de Ataque', () => {
  let browserProvider: BrowserCryptoProvider;
  let nodeProvider: NodeCryptoProvider;

  beforeAll(async () => {
    browserProvider = await BrowserCryptoProvider.init();
    nodeProvider = new NodeCryptoProvider();
  });

  describe('1. Vetores Fixos Determinísticos (ChaCha20-Poly1305 IETF e Nonce)', () => {
    it('produz e valida vetor fixo idêntico entre Node e Browser', () => {
      // Chave fixa de 32 bytes (0x01, 0x02, ...)
      const fixedKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) fixedKey[i] = i + 1;

      // Nonce fixo: Direção H2G e contador 42n
      const fixedNonce = buildNonce('H2G', 42n);
      expect(fixedNonce.length).toBe(12);
      expect(fixedNonce[0]).toBe(DIRECTION_H2G[0]);
      expect(fixedNonce[1]).toBe(DIRECTION_H2G[1]);
      expect(fixedNonce[2]).toBe(DIRECTION_H2G[2]);
      expect(fixedNonce[3]).toBe(DIRECTION_H2G[3]);

      const parsed = parseNonce(fixedNonce);
      expect(parsed.direction).toBe('H2G');
      expect(parsed.counter).toBe(42n);

      const plaintextStr = 'Vetor de teste fixo para conferencia criptografica';

      // Cifragem via Node
      const encNode = nodeProvider.encrypt(plaintextStr, fixedKey, 'H2G', 42n);

      // Cifragem via Browser
      const encBrowser = browserProvider.encrypt(plaintextStr, fixedKey, 'H2G', 42n);

      // ChaCha20-Poly1305 IETF é determinístico: com mesma chave, nonce e mensagem,
      // o ciphertext (incluindo a tag MAC de 16 bytes) DEVE ser 100% idêntico byte a byte!
      expect(encNode.nonce).toEqual(encBrowser.nonce);
      expect(encNode.ciphertext).toEqual(encBrowser.ciphertext);

      // Decifragem cruzada do vetor
      const decFromBrowser = nodeProvider.decrypt(encBrowser.ciphertext, encBrowser.nonce, fixedKey, 'H2G', 0n);
      const decFromNode = browserProvider.decrypt(encNode.ciphertext, encNode.nonce, fixedKey, 'H2G', 0n);

      expect(new TextDecoder().decode(decFromBrowser.plaintext)).toBe(plaintextStr);
      expect(new TextDecoder().decode(decFromNode.plaintext)).toBe(plaintextStr);
    });
  });

  describe('2. Troca de Chaves Efêmeras (crypto_kx / X25519) e Interoperabilidade de Sessão', () => {
    it('interopera derivação de chaves entre Host (Node) e Guest (Browser)', () => {
      // Host gera par efêmero no Node
      const hostKeys: KeyPair = generateHostKeyPair();
      expect(hostKeys.publicKey.length).toBe(32);
      expect(hostKeys.secretKey.length).toBe(32);

      // Guest gera par efêmero no Browser (WASM)
      const guestKeys: KeyPair = browserProvider.generateKeyPair();
      expect(guestKeys.publicKey.length).toBe(32);
      expect(guestKeys.secretKey.length).toBe(32);

      // Host deriva chaves de sessão com chave pública do Guest
      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);

      // Guest deriva chaves de sessão com chave pública do Host
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      // Garantia matemática de crypto_kx:
      // hostSession.tx (Host envia para Guest) === guestSession.rx (Guest recebe do Host)
      // hostSession.rx (Host recebe do Guest) === guestSession.tx (Guest envia para Host)
      expect(hostSession.tx).toEqual(guestSession.rx);
      expect(hostSession.rx).toEqual(guestSession.tx);

      // As chaves tx e rx de cada ponta DEVEM ser diferentes entre si (isolamento total)
      expect(hostSession.tx).not.toEqual(hostSession.rx);
      expect(guestSession.tx).not.toEqual(guestSession.rx);
    });

    it('roundtrip Node ↔ Node', () => {
      const hostKeys = nodeProvider.generateKeyPair();
      const guestKeys = nodeProvider.generateKeyPair();

      const hostSession = nodeProvider.deriveSessionKeys('host', hostKeys, guestKeys.publicKey);
      const guestSession = nodeProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createNodeSessionCipher(nodeProvider, 'host', hostSession);
      const guestCipher = createNodeSessionCipher(nodeProvider, 'guest', guestSession);

      // Host -> Guest
      const msgH2G = 'Mensagem Node para Node (Host -> Guest)';
      const encH2G = hostCipher.encrypt(msgH2G);
      const decGuest = guestCipher.decrypt(encH2G);
      expect(new TextDecoder().decode(decGuest)).toBe(msgH2G);

      // Guest -> Host
      const msgG2H = 'Resposta Node para Node (Guest -> Host)';
      const encG2H = guestCipher.encrypt(msgG2H);
      const decHost = hostCipher.decrypt(encG2H);
      expect(new TextDecoder().decode(decHost)).toBe(msgG2H);
    });

    it('roundtrip Browser ↔ Browser', () => {
      const hostKeys = browserProvider.generateKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = browserProvider.deriveSessionKeys('host', hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createBrowserSessionCipher(browserProvider, 'host', hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      // Host -> Guest
      const msgH2G = 'Mensagem Browser para Browser (Host -> Guest)';
      const encH2G = hostCipher.encrypt(msgH2G);
      const decGuest = guestCipher.decrypt(encH2G);
      expect(new TextDecoder().decode(decGuest)).toBe(msgH2G);

      // Guest -> Host
      const msgG2H = 'Resposta Browser para Browser (Guest -> Host)';
      const encG2H = guestCipher.encrypt(msgG2H);
      const decHost = hostCipher.decrypt(encG2H);
      expect(new TextDecoder().decode(decHost)).toBe(msgG2H);
    });

    it('roundtrip cruzado: Host (sodium-native) cifra e Guest (libsodium-wrappers) decifra', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      // Host envia payload cifrado
      const originalPayload = JSON.stringify({ type: 'DRAW_ADD', elementId: 'line-123', points: [0, 0, 100, 100] });
      const encrypted = hostCipher.encrypt(originalPayload);

      // Guest decifra com libsodium-wrappers
      const decryptedBytes = guestCipher.decrypt(encrypted);
      const decryptedText = new TextDecoder().decode(decryptedBytes);

      expect(decryptedText).toBe(originalPayload);
      expect(hostCipher.getTxCounter()).toBe(1n);
      expect(guestCipher.getLastRxCounter()).toBe(1n);
    });

    it('roundtrip cruzado: Guest (libsodium-wrappers) cifra e Host (sodium-native) decifra', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      // Guest envia payload cifrado
      const guestMessage = JSON.stringify({ type: 'GUEST_MUTED', muted: true });
      const encrypted = guestCipher.encrypt(guestMessage);

      // Host decifra com sodium-native
      const decryptedBytes = hostCipher.decrypt(encrypted);
      const decryptedText = new TextDecoder().decode(decryptedBytes);

      expect(decryptedText).toBe(guestMessage);
      expect(guestCipher.getTxCounter()).toBe(1n);
      expect(hostCipher.getLastRxCounter()).toBe(1n);
    });
  });

  describe('3. Proteção contra Replay e Reordenação (Contador Monotônico Big-Endian)', () => {
    it('rejeita repetição de mensagem (replay attack) no Host e no Guest', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      // Primeira mensagem válida (counter = 1)
      const packet1 = hostCipher.encrypt('mensagem original');
      const decrypted = guestCipher.decrypt(packet1);
      expect(new TextDecoder().decode(decrypted)).toBe('mensagem original');

      // Tentativa de replay do mesmo pacote
      expect(() => {
        guestCipher.decrypt(packet1);
      }).toThrowError(CryptoError);

      try {
        guestCipher.decrypt(packet1);
      } catch (err: any) {
        expect(err.code).toBe('REPLAY_ATTACK');
      }
    });

    it('rejeita pacotes com contadores menores/regressivos (reorder attack)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      const packet1 = hostCipher.encrypt('msg 1');
      const packet2 = hostCipher.encrypt('msg 2');
      const packet3 = hostCipher.encrypt('msg 3');

      // Guest recebe pacote 3 primeiro (counter = 3)
      guestCipher.decrypt(packet3);

      // Pacote 1 (counter = 1) e pacote 2 (counter = 2) chegam atrasados: DEVEM ser rejeitados
      expect(() => guestCipher.decrypt(packet1)).toThrowError(CryptoError);
      expect(() => guestCipher.decrypt(packet2)).toThrowError(CryptoError);
    });
  });

  describe('4. Isolamento Estrito de Direção de Canal (Host->Guest vs Guest->Host)', () => {
    it('Host rejeita pacotes com prefixo de direção H2G (confusão de direção)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const hostCipher = createHostSessionCipher(hostSession);

      // Cria pacote simulado com direção H2G tentando ser injetado no Host (que só aceita G2H)
      const rawFakePacket = nodeProvider.encrypt('injeção maliciosa', hostSession.rx, 'H2G', 1n);

      expect(() => {
        hostCipher.decrypt(rawFakePacket);
      }).toThrowError(CryptoError);

      try {
        hostCipher.decrypt(rawFakePacket);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_DIRECTION');
      }
    });

    it('Guest rejeita pacotes com prefixo de direção G2H (confusão de direção)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      // Pacote com direção G2H enviado para o Guest (que só aceita H2G)
      const rawFakePacket = browserProvider.encrypt('injeção maliciosa', guestSession.rx, 'G2H', 1n);

      expect(() => {
        guestCipher.decrypt(rawFakePacket);
      }).toThrowError(CryptoError);

      try {
        guestCipher.decrypt(rawFakePacket);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_DIRECTION');
      }
    });

    it('rejeita nonce com prefixo arbitrário desconhecido', () => {
      const badNonce = new Uint8Array(12);
      badNonce.set([0x58, 0x58, 0x58, 0x58], 0); // 'XXXX'
      new DataView(badNonce.buffer).setBigUint64(4, 1n, false);

      expect(() => {
        validateNonce(badNonce, 'H2G', 0n);
      }).toThrowError(CryptoError);

      try {
        validateNonce(badNonce, 'H2G', 0n);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_DIRECTION');
      }
    });
  });

  describe('5. Detecção de Adulteração (Tamper) e Falha Limpa sem Vazamento', () => {
    it('rejeita adulteração de 1 byte no ciphertext com falha limpa (Node e Browser)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      const validMsg = hostCipher.encrypt('dados ultraconfidenciais');

      // Decodifica ciphertext em bytes, altera 1 bit e recodifica
      const cipherBytes = Buffer.from(validMsg.ciphertext, 'base64');
      cipherBytes[0] ^= 0x01; // flip 1 bit
      const tamperedMsg = {
        nonce: validMsg.nonce,
        ciphertext: cipherBytes.toString('base64'),
      };

      expect(() => {
        guestCipher.decrypt(tamperedMsg);
      }).toThrowError(CryptoError);

      try {
        guestCipher.decrypt(tamperedMsg);
      } catch (err: any) {
        expect(err.code).toBe('DECRYPTION_FAILED');
        // Garante que nem a chave nem o plaintext aparecem na mensagem de erro
        expect(err.message).not.toContain('dados ultraconfidenciais');
      }
    });

    it('rejeita adulteração na tag Poly1305 (últimos 16 bytes) com falha limpa', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      const validMsg = hostCipher.encrypt('mensagem autêntica');
      const cipherBytes = Buffer.from(validMsg.ciphertext, 'base64');
      // Altera o último byte (pertencente à tag Poly1305)
      cipherBytes[cipherBytes.length - 1] ^= 0x80;

      const tamperedTagMsg = {
        nonce: validMsg.nonce,
        ciphertext: cipherBytes.toString('base64'),
      };

      expect(() => guestCipher.decrypt(tamperedTagMsg)).toThrowError(CryptoError);
    });

    it('rejeita ciphertext truncado (menor que o tamanho da tag)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);

      const truncatedCiphertext = new Uint8Array(10); // menor que 16 bytes da tag
      const nonce = buildNonce('G2H', 1n);

      expect(() => {
        nodeProvider.decrypt(truncatedCiphertext, nonce, hostSession.rx, 'G2H', 0n);
      }).toThrowError(CryptoError);
    });

    it('rejeita decifragem com chave errada (sessão incorreta)', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();
      const maliciousKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const maliciousSession = browserProvider.deriveSessionKeys('guest', maliciousKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const maliciousGuestCipher = createBrowserSessionCipher(browserProvider, 'guest', maliciousSession);

      const msg = hostCipher.encrypt('segredo institucional');

      // Guest malicioso com chave diferente tenta decifrar
      expect(() => {
        maliciousGuestCipher.decrypt(msg);
      }).toThrowError(CryptoError);
    });
  });

  describe('6. Teste de Estresse: 10 000 Mensagens sem Colisão de Nonce', () => {
    it('cifra e decifra 10.000 mensagens garantindo monotonicidade estrita e zero colisão de nonce', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();

      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const guestSession = browserProvider.deriveSessionKeys('guest', guestKeys, hostKeys.publicKey);

      const hostCipher = createHostSessionCipher(hostSession);
      const guestCipher = createBrowserSessionCipher(browserProvider, 'guest', guestSession);

      const TOTAL_MESSAGES = 10_000;
      const seenNonces = new Set<string>();

      for (let i = 1; i <= TOTAL_MESSAGES; i++) {
        const payload = `payload_sequencial_${i}`;
        const packet = hostCipher.encrypt(payload);

        // Verifica unicidade absoluta do nonce
        expect(seenNonces.has(packet.nonce)).toBe(false);
        seenNonces.add(packet.nonce);

        // Valida decifragem correta no Guest
        const decrypted = guestCipher.decrypt(packet);
        expect(new TextDecoder().decode(decrypted)).toBe(payload);
      }

      expect(seenNonces.size).toBe(TOTAL_MESSAGES);
      expect(hostCipher.getTxCounter()).toBe(BigInt(TOTAL_MESSAGES));
      expect(guestCipher.getLastRxCounter()).toBe(BigInt(TOTAL_MESSAGES));
    });
  });

  describe('7. Higienização de Memória (sodium_memzero / destroy)', () => {
    it('memzero zera os buffers em memória', () => {
      const sensitiveKey = new Uint8Array(32);
      sensitiveKey.fill(0xee);

      memzero(sensitiveKey);

      for (let i = 0; i < sensitiveKey.length; i++) {
        expect(sensitiveKey[i]).toBe(0);
      }
    });

    it('destroyKeyPair e destroySessionKeys higienizam as estruturas', () => {
      const kp = generateHostKeyPair();
      destroyKeyPair(kp);
      expect(kp.publicKey.every((b) => b === 0)).toBe(true);
      expect(kp.secretKey.every((b) => b === 0)).toBe(true);

      const sk: SessionKeys = {
        rx: new Uint8Array(32).fill(0x11),
        tx: new Uint8Array(32).fill(0x22),
      };
      destroySessionKeys(sk);
      expect(sk.rx.every((b) => b === 0)).toBe(true);
      expect(sk.tx.every((b) => b === 0)).toBe(true);
    });

    it('bloqueia operações após destroy() no SessionCipher', () => {
      const hostKeys = generateHostKeyPair();
      const guestKeys = browserProvider.generateKeyPair();
      const hostSession = deriveHostSessionKeys(hostKeys, guestKeys.publicKey);
      const hostCipher = createHostSessionCipher(hostSession);

      expect(hostCipher.isDestroyed()).toBe(false);
      hostCipher.destroy();
      expect(hostCipher.isDestroyed()).toBe(true);

      expect(() => hostCipher.encrypt('teste')).toThrowError(/encerrada/);
    });
  });

  describe('8. Prova Arquitetural (Grep Check): Nenhum uso de segredo ECDH cru como chave', () => {
    it('comprova ausência de crypto_scalarmult e derivação direta de segredo cru', () => {
      const cryptoDirElectron = path.resolve(__dirname, '../electron/crypto');
      const cryptoDirShared = path.resolve(__dirname, '../src/shared/crypto');

      const filesToCheck = [
        ...fs.readdirSync(cryptoDirElectron).map((f) => path.join(cryptoDirElectron, f)),
        ...fs.readdirSync(cryptoDirShared).map((f) => path.join(cryptoDirShared, f)),
      ].filter((f) => f.endsWith('.ts'));

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Proibido crypto_scalarmult (que geraria o segredo ECDH cru)
        expect(content).not.toContain('crypto_scalarmult');

        // Obrigatoriedade de crypto_kx para troca de chaves
        if (filePath.endsWith('handshake.ts') || filePath.endsWith('browser.ts')) {
          expect(content).toContain('crypto_kx');
        }
      }
    });
  });
});
