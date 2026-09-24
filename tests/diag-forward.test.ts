import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDiagEnabled, diagLog, diagServerLog, sanitizeDiagData } from '../src/shared/diag';
import { IPC_CHANNELS } from '../src/shared/ipc-contract';

describe('D1 — Encaminhamento de Diagnóstico e [DIAG-SERVER] / [DIAG-HOST]', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    if (typeof (global as any).window !== 'undefined') {
      delete (global as any).window;
    }
    vi.restoreAllMocks();
  });

  it('IPC_CHANNELS contém o canal canônico DIAG_FORWARD = diag:forward', () => {
    expect(IPC_CHANNELS.DIAG_FORWARD).toBe('diag:forward');
  });

  it('sanitizeDiagData mascara campos sensíveis e preserva dados seguros', () => {
    const raw = {
      segredoToken: '123456',
      clientSecret: 'secret-val',
      encryptionKey: 'key-abc',
      noncePayload: 'nonce-789',
      userPassword: 'pass',
      elementId: 'elem-1',
      tipo: 'DRAW_ADD',
      visiveis: 5,
    };
    const clean = sanitizeDiagData(raw);
    expect(clean.segredoToken).toBe('[REDACTED]');
    expect(clean.clientSecret).toBe('[REDACTED]');
    expect(clean.encryptionKey).toBe('[REDACTED]');
    expect(clean.noncePayload).toBe('[REDACTED]');
    expect(clean.userPassword).toBe('[REDACTED]');
    expect(clean.elementId).toBe('elem-1');
    expect(clean.tipo).toBe('DRAW_ADD');
    expect(clean.visiveis).toBe(5);
  });

  it('diagServerLog imprime no stdout com prefixo [DIAG-SERVER], timestamp e dados sanitizados', () => {
    process.env.ONETOONE_DIAG = '1';
    process.env.NODE_ENV = 'development';

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    diagServerLog('broadcastToGuest', {
      tipo: 'DRAW_ADD',
      abaId: 'default',
      authToken: 'token-secreto-123',
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const callArgs = consoleSpy.mock.calls[0];
    expect(callArgs[0]).toMatch(/^\[DIAG-SERVER\] \[\d{4}-\d{2}-\d{2}T.*\] \[broadcastToGuest\]/);
    const parsed = JSON.parse(callArgs[1]);
    expect(parsed.tipo).toBe('DRAW_ADD');
    expect(parsed.abaId).toBe('default');
    expect(parsed.authToken).toBe('[REDACTED]');
  });

  it('diagServerLog é estritamente ignorado em NODE_ENV=production ou sem ONETOONE_DIAG=1', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // 1. Sem flag
    delete process.env.ONETOONE_DIAG;
    process.env.NODE_ENV = 'development';
    diagServerLog('checkpoint1', { dado: 1 });
    expect(consoleSpy).not.toHaveBeenCalled();

    // 2. Em produção, mesmo com flag
    process.env.ONETOONE_DIAG = '1';
    process.env.NODE_ENV = 'production';
    diagServerLog('checkpoint2', { dado: 2 });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('isDiagEnabled valida flags e ambiente dev vs prod', () => {
    delete process.env.ONETOONE_DIAG;
    expect(isDiagEnabled()).toBe(false);
    process.env.ONETOONE_DIAG = '1';
    process.env.NODE_ENV = 'development';
    expect(isDiagEnabled()).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isDiagEnabled()).toBe(false);
  });

  it('diagLog encaminha dados sanitizados para window.__ONETOONE_DIAG_FORWARD__ no renderer', () => {
    process.env.ONETOONE_DIAG = '1';
    process.env.NODE_ENV = 'development';

    const mockForward = vi.fn();
    (global as any).window = {
      __ONETOONE_DIAG__: true,
      __ONETOONE_DIAG_FORWARD__: mockForward,
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    diagLog('finishShapeCreation', {
      tipo: 'rectangle',
      secretNonce: 'nonce-123',
      dist: 120,
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(mockForward).toHaveBeenCalledWith(
      'finishShapeCreation',
      expect.objectContaining({
        tipo: 'rectangle',
        dist: 120,
        secretNonce: '[REDACTED]',
      })
    );
  });

  it('diagLog suporta encaminhamento alternativo via window.desktopAPI.diagForward', () => {
    process.env.ONETOONE_DIAG = '1';
    process.env.NODE_ENV = 'development';

    const mockForwardApi = vi.fn();
    (global as any).window = {
      __ONETOONE_DIAG__: true,
      desktopAPI: {
        diagForward: mockForwardApi,
      },
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});

    diagLog('emitEvent', { tipo: 'DRAW_ADD', id: 'ev-1' });

    expect(mockForwardApi).toHaveBeenCalledTimes(1);
    expect(mockForwardApi).toHaveBeenCalledWith('emitEvent', { tipo: 'DRAW_ADD', id: 'ev-1' });
  });
});
