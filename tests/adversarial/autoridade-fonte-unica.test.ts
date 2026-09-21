import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../electron/server/session-manager';
import { EventoService } from '../../electron/services/evento.service';
import {
  TODOS_TIPOS_CONHECIDOS,
  ACOES_EXCLUSIVAS_HOST,
  ACOES_INTERATIVAS_GUEST,
  ACOES_MIDIA_GUEST,
  ACOES_LOCAIS_GUEST,
  canGuestExecuteAction,
  validarAutorEPermissaoCompartilhada,
} from '../../src/shared/autoridade';
import { encodeBase64Url } from '../../src/shared/crypto/base64url';

/**
 * Testes Adversariais RT6: Fonte Única de Verdade para Autoridade e Integridade de Sessão
 * Fonte: docs/ADR/011-fonte-unica-autoridade.md e Ordem de Correção do Red Team.
 */
describe('RT6: Fonte Única de Verdade para Autoridade (SessionManager vs EventoService)', () => {
  const INVALID_TYPES = [
    'ARBITRARY_ACTION_TYPE',
    'HACK_EXEC',
    'DROP_TABLE',
    'INJECT_ACTION',
    '',
    ' ',
    '\0',
    '   DRAW_ADD',
    'DRAW_ADD ',
    'draw_add',
    'DrawAdd',
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    null as unknown as string,
    undefined as unknown as string,
    12345 as unknown as string,
    {} as unknown as string,
    [] as unknown as string,
  ];

  it('afirma que SessionManager e EventoService dão EXATAMENTE o mesmo veredito para o Guest em todos os tipos conhecidos e combinações de estado', () => {
    const sm = new SessionManager({
      sessaoId: 'sessao-sync-test',
      atendidoId: 'atendido-sync',
    });
    const eventoService = new EventoService();

    const estados = [
      { screenLocked: false, mediaUnlocked: false },
      { screenLocked: false, mediaUnlocked: true },
      { screenLocked: true, mediaUnlocked: false },
      { screenLocked: true, mediaUnlocked: true },
    ];

    for (const estado of estados) {
      sm.setScreenLocked(estado.screenLocked);
      sm.setMediaUnlocked(estado.mediaUnlocked);

      for (const tipo of TODOS_TIPOS_CONHECIDOS) {
        const smRes = sm.canGuestExecute(tipo);
        const esRes = eventoService.validarAutorEPermissao(
          tipo,
          'guest',
          estado.screenLocked,
          estado.mediaUnlocked
        );

        // Garantia inegociável de sincronia: o veredito de permissão para o Guest DEVE ser idêntico
        expect(
          smRes.allowed,
          `Divergência detectada para o tipo '${tipo}' sob screenLocked=${estado.screenLocked}, mediaUnlocked=${estado.mediaUnlocked}`
        ).toBe(esRes.permitido);

        // Validação adicional direta contra o módulo de autoridade
        const directCan = canGuestExecuteAction(tipo, estado);
        const directVal = validarAutorEPermissaoCompartilhada(tipo, 'guest', estado);
        expect(directCan.allowed).toBe(directVal.permitido);
        expect(smRes.allowed).toBe(directCan.allowed);
      }
    }
  });

  it('afirma que tipos desconhecidos, inválidos e vetores de prototype pollution são sumariamente barrados por ambas as checagens', () => {
    const sm = new SessionManager({
      sessaoId: 'sessao-sync-invalid',
      atendidoId: 'atendido-sync-inv',
    });
    const eventoService = new EventoService();

    for (const badType of INVALID_TYPES) {
      const smRes = sm.canGuestExecute(badType);
      expect(smRes.allowed).toBe(false);
      expect(smRes.reason).toBe('FORBIDDEN_ACTION');

      const esRes = eventoService.validarAutorEPermissao(badType, 'guest', false);
      expect(esRes.permitido).toBe(false);

      // Ambas concordam no bloqueio ao Guest
      expect(smRes.allowed).toBe(esRes.permitido);
    }
  });

  it('Guest é estritamente proibido de emitir qualquer ação exclusiva do Host em qualquer estado', () => {
    const sm = new SessionManager({ sessaoId: 'sessao-host-only', atendidoId: 'a-ho' });
    const eventoService = new EventoService();

    for (const action of ACOES_EXCLUSIVAS_HOST) {
      // Teste com tela liberada
      sm.setScreenLocked(false);
      sm.setMediaUnlocked(true);
      const resSm = sm.canGuestExecute(action);
      const resEs = eventoService.validarAutorEPermissao(action, 'guest', false, true);

      expect(resSm.allowed).toBe(false);
      expect(resSm.reason).toBe('FORBIDDEN_ACTION');
      expect(resEs.permitido).toBe(false);
      expect(resEs.motivo).toBe('FORBIDDEN_ACTION_GUEST');

      // Teste com tela bloqueada
      sm.setScreenLocked(true);
      const resSmLocked = sm.canGuestExecute(action);
      expect(resSmLocked.allowed).toBe(false);
      expect(resSmLocked.reason).toBe('FORBIDDEN_ACTION');
    }
  });

  it('GUEST_MUTED permanece autorizado ao Guest mesmo sob screenLocked === true (privacidade local)', () => {
    const sm = new SessionManager({ sessaoId: 'sessao-mute-test', atendidoId: 'a-mute' });
    const eventoService = new EventoService();

    sm.setScreenLocked(true);
    for (const act of ACOES_LOCAIS_GUEST) {
      expect(sm.canGuestExecute(act).allowed).toBe(true);
      const esRes = eventoService.validarAutorEPermissao(act, 'guest', true);
      expect(esRes.permitido).toBe(true);
    }
  });

  it('Ações de mídia (PLAY, PAUSE, SEEK, MEDIA_CONTROL) exigem mediaUnlocked === true e screenLocked === false', () => {
    const sm = new SessionManager({ sessaoId: 'sessao-media-rules', atendidoId: 'a-mr' });

    for (const mediaAction of ACOES_MIDIA_GUEST) {
      // 1. Bloqueado com tela bloqueada (independente de mediaUnlocked)
      sm.setScreenLocked(true);
      sm.setMediaUnlocked(true);
      expect(sm.canGuestExecute(mediaAction)).toEqual({
        allowed: false,
        reason: 'SCREEN_LOCKED',
      });

      // 2. Bloqueado com mídia bloqueada
      sm.setScreenLocked(false);
      sm.setMediaUnlocked(false);
      expect(sm.canGuestExecute(mediaAction)).toEqual({
        allowed: false,
        reason: 'MEDIA_LOCKED',
      });

      // 3. Permitido quando destravado
      sm.setScreenLocked(false);
      sm.setMediaUnlocked(true);
      expect(sm.canGuestExecute(mediaAction)).toEqual({
        allowed: true,
      });
    }
  });

  it('Ações interativas do quadro branco (DRAW_ADD, DRAW_HIDE, UNDO, REDO) são bloqueadas sob screenLocked === true', () => {
    const sm = new SessionManager({ sessaoId: 'sessao-interactive-rules', atendidoId: 'a-ir' });

    for (const act of ACOES_INTERATIVAS_GUEST) {
      sm.setScreenLocked(true);
      expect(sm.canGuestExecute(act)).toEqual({
        allowed: false,
        reason: 'SCREEN_LOCKED',
      });

      sm.setScreenLocked(false);
      expect(sm.canGuestExecute(act)).toEqual({
        allowed: true,
      });
    }
  });

  it('RT2 Ataque de Desconexões Repetidas: N desconexões espúrias em sequência NUNCA estendem o TTL de reconexão', () => {
    let fakeClock = 10_000;
    const sm = new SessionManager({
      sessaoId: 'sessao-attack-n-probes',
      atendidoId: 'atendido-probes',
      clock: () => fakeClock,
      reconnectTokenTtlMs: 300_000, // 5 min
    });

    // Handshake inicial em t = 10.000 (expiração em t = 310.000)
    sm.authenticateInitialJoin(sm.getGuestToken(), 'legit-conn');
    sm.completeHandshake(encodeBase64Url(new Uint8Array(32).fill(7)));
    const recToken = sm.getReconnectToken()!;

    // Conexão legítima cai em t = 10.000
    sm.handleGuestDisconnect('legit-conn');

    // Atacante dispara 50 desconexões espúrias com relógio avançando gradualmente
    for (let i = 1; i <= 50; i++) {
      fakeClock += 5_000; // avança 5s a cada tentativa
      sm.handleGuestDisconnect(`attacker-probe-${i}`);
      sm.handleGuestDisconnect('unknown-socket');
      sm.handleGuestDisconnect('');
      sm.handleGuestDisconnect();
    }

    // fakeClock está em 10.000 + (50 * 5.000) = 260.000 ms (< 310.000 ms)
    // Dentro da janela original de 5 minutos, o token ainda deve ser válido
    const validReconnect = sm.authenticateReconnect(recToken, 'legit-reconnect-conn');
    expect(validReconnect.valid).toBe(true);

    // Conexão cai novamente
    sm.handleGuestDisconnect('legit-reconnect-conn');

    // Agora o tempo avança além da janela original (t = 310.001 ms)
    fakeClock = 310_001;

    // NENHUMA das 50 desconexões espúrias conseguiu empurrar a data de expiração!
    const expiredReconnect = sm.authenticateReconnect(recToken, 'late-reconnect-attempt');
    expect(expiredReconnect.valid).toBe(false);
    expect(expiredReconnect.code).toBe('TOKEN_EXPIRED');
  });

  it('RT1 Ataque de Probe em Sala Vazia: desconexões não-autenticadas não geram transição de estado nem disparam listeners', () => {
    const sm = new SessionManager({
      sessaoId: 'sessao-empty-probes',
      atendidoId: 'atendido-empty',
    });

    let stateNotifications = 0;
    sm.onStateChange(() => {
      stateNotifications++;
    });

    expect(sm.getState()).toBe('aguardando_guest');

    // Scanners de portas varrem e desconectam
    sm.handleGuestDisconnect('scanner-1');
    sm.handleGuestDisconnect('scanner-2');
    sm.handleGuestDisconnect('unauth-probe');
    sm.handleGuestDisconnect();

    expect(sm.getState()).toBe('aguardando_guest');
    expect(sm.isGuestConnected()).toBe(false);
    expect(stateNotifications).toBe(0);
  });
});
