import { describe, it, expect } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '../src/shared/crypto/base64url';
import {
  buildInviteUrl,
  extractHostPublicKeyFromFragment,
  parseInviteUrl,
  verifyInviteUrlSecurity,
} from '../src/shared/crypto/invite';

describe('Fragmento do Convite e Codificação Base64url (Mestre §6, ADR-001, ADR-002)', () => {
  // Chave pública simulada de 32 bytes (X25519)
  const samplePk = new Uint8Array([
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
    0x55, 0xaa, 0x55, 0xaa, 0x11, 0x22, 0x33, 0x44,
    0x99, 0x88, 0x77, 0x66, 0xaa, 0xbb, 0xcc, 0xdd,
  ]);

  describe('Codificação e Decodificação Base64url (RFC 4648)', () => {
    it('codifica 32 bytes sem caracteres inseguros (+, /) e sem padding (=)', () => {
      const b64url = encodeBase64Url(samplePk);
      expect(b64url).not.toContain('+');
      expect(b64url).not.toContain('/');
      expect(b64url).not.toContain('=');
      expect(b64url).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(b64url.length).toBe(43); // 32 * 8 / 6 = 42.66 -> 43 caracteres sem padding
    });

    it('decodifica perfeitamente preservando todos os 32 bytes exatos (roundtrip)', () => {
      const b64url = encodeBase64Url(samplePk);
      const decoded = decodeBase64Url(b64url);
      expect(decoded.length).toBe(32);
      expect(decoded).toEqual(samplePk);
    });

    it('suporta decodificação com ou sem padding fornecido', () => {
      const b64url = encodeBase64Url(samplePk);
      const withPadding = b64url + '=';
      const decoded = decodeBase64Url(withPadding);
      expect(decoded).toEqual(samplePk);
    });
  });

  describe('Montagem e Extração de URL de Convite', () => {
    it('monta URL de convite válida com formato baseUrl/join/:token#:pk_h_base64url', () => {
      const url = buildInviteUrl({
        baseUrl: 'http://192.168.1.150:8080',
        token: 'token-sessao-xyz123',
        hostPublicKey: samplePk,
      });

      const pkBase64Url = encodeBase64Url(samplePk);
      expect(url).toBe(`http://192.168.1.150:8080/join/token-sessao-xyz123#${pkBase64Url}`);
    });

    it('monta URL com relay HTTPS', () => {
      const url = buildInviteUrl({
        baseUrl: 'https://relay.onetoonesupport.app',
        token: 'sess-abc',
        hostPublicKey: samplePk,
      });

      const pkBase64Url = encodeBase64Url(samplePk);
      expect(url).toBe(`https://relay.onetoonesupport.app/join/sess-abc#${pkBase64Url}`);
    });

    it('interpreta a URL com parseInviteUrl e extrai token e chave pública com sucesso', () => {
      const url = buildInviteUrl({
        baseUrl: 'http://192.168.1.55:9000',
        token: 'sessao-omega-77',
        hostPublicKey: samplePk,
      });

      const parsed = parseInviteUrl(url);
      expect(parsed.baseUrl).toBe('http://192.168.1.55:9000');
      expect(parsed.token).toBe('sessao-omega-77');
      expect(parsed.hostPublicKey).toEqual(samplePk);
    });

    it('extrai chave pública do hash direto com extractHostPublicKeyFromFragment', () => {
      const b64url = encodeBase64Url(samplePk);
      const keyFromHashWithPrefix = extractHostPublicKeyFromFragment(`#${b64url}`);
      const keyFromHashPlain = extractHostPublicKeyFromFragment(b64url);

      expect(keyFromHashWithPrefix).toEqual(samplePk);
      expect(keyFromHashPlain).toEqual(samplePk);
    });

    it('rejeita chave pública com tamanho inválido ao montar ou extrair convite', () => {
      const badKey = new Uint8Array(16); // 16 bytes em vez de 32
      expect(() => {
        buildInviteUrl({
          baseUrl: 'http://localhost:3000',
          token: 'token',
          hostPublicKey: badKey,
        });
      }).toThrowError(/32/);

      expect(() => {
        extractHostPublicKeyFromFragment(encodeBase64Url(badKey));
      }).toThrowError(/32/);
    });
  });

  describe('Garantia Crítica de Segurança: o # nunca vai ao servidor', () => {
    it('comprova que a chave pública (pk_h) NUNCA aparece em pathname ou search query', () => {
      const inviteUrl = buildInviteUrl({
        baseUrl: 'http://192.168.0.10:8080',
        token: 'sala-especialista-42',
        hostPublicKey: samplePk,
      });

      const urlObj = new URL(inviteUrl);
      const pkBase64Url = encodeBase64Url(samplePk);

      // 1. O pathname contém apenas a rota '/join/sala-especialista-42'
      expect(urlObj.pathname).toBe('/join/sala-especialista-42');
      expect(urlObj.pathname).not.toContain(pkBase64Url);

      // 2. A query search é vazia e não contém nenhum vestígio da chave pública
      expect(urlObj.search).toBe('');
      expect(urlObj.search).not.toContain(pkBase64Url);

      // 3. A chave pública está estritamente no hash fragment (#...)
      expect(urlObj.hash).toBe(`#${pkBase64Url}`);
      expect(urlObj.hash.slice(1)).toBe(pkBase64Url);

      // 4. Verificação com o verificador formal de segurança
      const securityCheck = verifyInviteUrlSecurity(inviteUrl);
      expect(securityCheck.isSecure).toBe(true);
      expect(securityCheck.hasFragment).toBe(true);
      expect(securityCheck.pkInPathOrQuery).toBe(false);
    });

    it('rejeita URLs manipuladas onde a chave foi indevidamente passada em query', () => {
      const pkBase64Url = encodeBase64Url(samplePk);
      const insecureUrl = `http://192.168.0.10:8080/join/token?pk=${pkBase64Url}#${pkBase64Url}`;
      const securityCheck = verifyInviteUrlSecurity(insecureUrl);
      expect(securityCheck.pkInPathOrQuery).toBe(true);
      expect(securityCheck.isSecure).toBe(false);
    });
  });
});
