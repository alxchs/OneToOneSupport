// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useHostStore } from '../src/host/store/useHostStore';
import { createInitialTabState, getVisibleElements } from '../src/shared/events/reducer';
import { ServerSessionController } from '../electron/server/index';
import type { GuestEventDTO } from '../src/shared/ipc-contract';

describe('D17 — Funil Único de Eventos Remotos do Guest e Identidade de Sessão', () => {
  beforeEach(() => {
    useHostStore.setState({
      quadroSomenteLeitura: false,
      activeSessaoId: 'sessao-viva-100',
      activeAbaId: 'default',
      tabState: createInitialTabState('default'),
      guestMuted: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('D17.2.3.1 — Descarta evento se quadroSomenteLeitura estiver ligado', () => {
    useHostStore.setState({ quadroSomenteLeitura: true });

    const eventoGuest = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-viva-100',
      abaId: 'default',
      payload: {
        id: 'stroke-guest-1',
        tipo: 'path',
        data: { path: 'M 0 0 L 10 10', stroke: '#0284c7' },
      },
      ts: Date.now(),
    };

    const aplicado = useHostStore.getState().aplicarEventoRemoto(eventoGuest);
    expect(aplicado).toBe(false);

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(0);
  });

  it('D17.2.3.2 — Descarta se sessaoId do evento ≠ activeSessaoId aberto na tela (sessão trocada)', () => {
    useHostStore.setState({
      activeSessaoId: 'sessao-encerrada-001',
      quadroSomenteLeitura: false,
    });

    const eventoOutraSessao = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-viva-999',
      abaId: 'default',
      payload: {
        id: 'stroke-guest-2',
        tipo: 'path',
        data: { path: 'M 10 10 L 20 20' },
      },
    };

    const aplicado = useHostStore.getState().aplicarEventoRemoto(eventoOutraSessao);
    expect(aplicado).toBe(false);

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(0);
  });

  it('D17.2.3.3 — Descarta se abaId do evento ≠ activeAbaId aberto na tela (aba trocada)', () => {
    useHostStore.setState({
      activeSessaoId: 'sessao-viva-100',
      activeAbaId: 'default',
    });

    const eventoOutraAba = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-viva-100',
      abaId: 'aba-exercicios-2',
      payload: {
        id: 'stroke-guest-3',
        tipo: 'path',
        data: {},
      },
    };

    const aplicado = useHostStore.getState().aplicarEventoRemoto(eventoOutraAba);
    expect(aplicado).toBe(false);

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(0);
  });

  it('D17.2.3.4 — Descarta evento sem sessaoId, com sessaoId vazio, nulo ou ausente', () => {
    const eventosInvalidos = [
      { type: 'DRAW_ADD', abaId: 'default', payload: {} },
      { type: 'DRAW_ADD', sessaoId: '', abaId: 'default', payload: {} },
      { type: 'DRAW_ADD', sessaoId: '   ', abaId: 'default', payload: {} },
      { type: 'DRAW_ADD', sessaoId: null, abaId: 'default', payload: {} },
      { type: 'DRAW_ADD', sessaoId: undefined, abaId: 'default', payload: {} },
      null,
      undefined,
      'string-invalida',
    ];

    for (const ev of eventosInvalidos) {
      const aplicado = useHostStore.getState().aplicarEventoRemoto(ev as unknown as GuestEventDTO);
      expect(aplicado).toBe(false);
    }

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(0);
  });

  it('D17.2.3.5 — Descarta evento com tipo fora da allowlist estrita do Guest (ADR-011)', () => {
    const tiposNaoPermitidos = [
      'CLEAR_TAB', // Exclusivo do Host
      'LOCK_SCREEN', // Exclusivo do Host
      'UNLOCK_MEDIA', // Exclusivo do Host
      'TAB_SWITCH', // Exclusivo do Host
      'SCREEN_LOCKED', // Exclusivo do Host
      'AUTH', // Transporte
      'HANDSHAKE_INIT', // Transporte
      'ENCRYPTED', // Transporte
      'COMANDO_MALICIOSO',
      '__proto__',
      'constructor',
    ];

    for (const tipo of tiposNaoPermitidos) {
      const ev = {
        type: tipo,
        sessaoId: 'sessao-viva-100',
        abaId: 'default',
        payload: {},
      };
      const aplicado = useHostStore.getState().aplicarEventoRemoto(ev);
      expect(aplicado).toBe(false);
    }

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(0);
  });

  it('D17.2.3.6 — Cada descarte registra diagnóstico e sessão continua recebendo normalmente', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    (window as any).__ONETOONE_DIAG__ = true;

    // 1. Envia evento com sessão trocada (deve descartar)
    const evInvalido = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-outra',
      abaId: 'default',
      payload: { id: 'inv-1', tipo: 'path', data: {} },
    };
    const descartado = useHostStore.getState().aplicarEventoRemoto(evInvalido);
    expect(descartado).toBe(false);

    // Confere que diagnóstico foi emitido
    const logChamadas = consoleSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(logChamadas).toContain('aplicarEventoRemoto_descarte');
    expect(logChamadas).toContain('SESSAO_DIVERGENTE');

    // 2. Logo em seguida, envia evento válido da sessão certa (Host continua recebendo normalmente)
    const evValido = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-viva-100',
      abaId: 'default',
      payload: {
        id: 'val-1',
        tipo: 'path',
        data: { path: 'M 0 0 L 50 50', stroke: '#0284c7' },
      },
    };
    const aceito = useHostStore.getState().aplicarEventoRemoto(evValido);
    expect(aceito).toBe(true);

    const visiveis = getVisibleElements(useHostStore.getState().tabState);
    expect(visiveis.length).toBe(1);
    expect(visiveis[0].id).toBe('val-1');

    delete (window as any).__ONETOONE_DIAG__;
  });

  it('D17.3 — Caminho feliz: sessão viva aberta, Guest desenha e Host aplica no tabState', () => {
    // 1. Guest envia DRAW_ADD
    const evAdd = {
      type: 'DRAW_ADD',
      sessaoId: 'sessao-viva-100',
      abaId: 'default',
      payload: JSON.stringify({
        id: 'guest-stroke-10',
        tipo: 'path',
        data: { path: 'M 10 10 L 20 20', stroke: '#22c55e' },
      }),
    };
    const resAdd = useHostStore.getState().aplicarEventoRemoto(evAdd);
    expect(resAdd).toBe(true);
    expect(getVisibleElements(useHostStore.getState().tabState).length).toBe(1);

    // 2. Guest envia GUEST_MUTED
    const evMute = {
      type: 'GUEST_MUTED',
      sessaoId: 'sessao-viva-100',
      abaId: 'default',
      payload: { muted: true },
    };
    const resMute = useHostStore.getState().aplicarEventoRemoto(evMute);
    expect(resMute).toBe(true);
    expect(useHostStore.getState().guestMuted).toBe(true);

    // 3. Guest envia UNDO
    const evUndo = {
      type: 'UNDO',
      sessaoId: 'sessao-viva-100',
      abaId: 'default',
      payload: {},
    };
    const resUndo = useHostStore.getState().aplicarEventoRemoto(evUndo);
    expect(resUndo).toBe(true);
    expect(getVisibleElements(useHostStore.getState().tabState).length).toBe(0);
  });

  it('D17.2.2 — Identidade de sessão da autoridade do Main sobrescreve spoofing do Guest', async () => {
    const controller = new ServerSessionController();
    let eventoRecebidoPeloHost: any = null;
    controller.onGuestEvent((ev) => {
      eventoRecebidoPeloHost = ev;
    });

    const anyController = controller as any;
    anyController.sessionManager = {
      sessaoId: 'sessao-autoridade-real-777',
      isScreenLocked: () => false,
    };

    const { EventoService } = await import('../electron/services/evento.service');
    vi.spyOn(EventoService.prototype, 'gravarEvento').mockReturnValue({ sucesso: true } as any);

    // Guest malicioso tenta enviar sessaoId de outra sessão
    anyController.handleGuestEvent({
      type: 'DRAW_ADD',
      sessaoId: 'sessao-vitima-hack-000',
      abaId: 'default',
      payload: {
        id: 'stroke-spoof-1',
        tipo: 'path',
        data: { stroke: '#0284c7' },
      },
    });

    expect(eventoRecebidoPeloHost).not.toBeNull();
    // O Main deve ter substituído pelo sessaoId da autoridade
    expect(eventoRecebidoPeloHost.sessaoId).toBe('sessao-autoridade-real-777');
    expect(eventoRecebidoPeloHost.sessaoId).not.toBe('sessao-vitima-hack-000');
  });
});
