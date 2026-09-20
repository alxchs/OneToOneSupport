import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../../electron/db/connection';
import { createAtendido } from '../../electron/db/repositories/atendido.repo';
import { createSessao } from '../../electron/db/repositories/sessao.repo';
import {
  EventoService,
  isValidId,
} from '../../electron/services/evento.service';
import { handleEventoGravar, handleEventoObterEstado } from '../../electron/ipc/evento.ipc';
import { ServerSessionController } from '../../electron/server/index';
import { createInitialTabState } from '../../src/shared/events/reducer';

describe('Correções do Lote 2 - C1, C2 e C3 (Adversarial e Regras de Segurança)', () => {
  let db: DatabaseType;
  let tempBaseDir: string;
  let snapshotsDir: string;
  let sessaoId: string;
  let atendidoId: string;
  let eventoService: EventoService;

  const ATTACK_VECTORS = [
    '../x',
    'x/../../../y',
    '..\\..\\y',
    'C:\\x',
    '/etc/x',
    'aba\0maliciosa',
    'a'.repeat(10000),
    '',
    null as unknown as string,
    undefined as unknown as string,
    123 as unknown as string,
    {} as unknown as string,
  ];

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-lote2-'));
    snapshotsDir = path.join(tempBaseDir, 'snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });

    db = initDb({ dbPath: ':memory:' });

    const atendidoRes = createAtendido(
      { nome: 'Paciente Auditoria Lote 2', contato: '11999990002' },
      db
    );
    atendidoId = (atendidoRes as { id: string }).id;

    const sessaoRes = createSessao({ atendido_id: atendidoId, titulo: 'Sessao Lote 2' }, Date.now(), db);
    if (!sessaoRes.created) {
      throw new Error('Falha ao criar sessão de teste');
    }
    sessaoId = sessaoRes.id;

    eventoService = new EventoService({
      db,
      snapshotsDir,
      defaultSnapshotInterval: 5,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch {
        // Ignora lock
      }
    }
  });

  describe('C1: Defesa contra Path Traversal em Snapshot por abaId / sessaoId', () => {
    it('validador de identificadores aceita apenas [A-Za-z0-9_-]{1,64}', () => {
      expect(isValidId('aba-principal')).toBe(true);
      expect(isValidId('aba_123')).toBe(true);
      expect(isValidId('sessao-01-uuid')).toBe(true);
      expect(isValidId('default')).toBe(true);
      expect(isValidId('A'.repeat(64))).toBe(true);

      expect(isValidId('../x')).toBe(false);
      expect(isValidId('x/../../../y')).toBe(false);
      expect(isValidId('..\\..\\y')).toBe(false);
      expect(isValidId('C:\\x')).toBe(false);
      expect(isValidId('/etc/x')).toBe(false);
      expect(isValidId('aba\0maliciosa')).toBe(false);
      expect(isValidId('a'.repeat(65))).toBe(false);
      expect(isValidId('')).toBe(false);
      expect(isValidId(null)).toBe(false);
      expect(isValidId(undefined)).toBe(false);
      expect(isValidId(12345)).toBe(false);
      expect(isValidId({})).toBe(false);
    });

    it('rejeita gravação de snapshot e NÃO cria arquivos fora da pasta de snapshots para todos os vetores de ataque', () => {
      const state = createInitialTabState('default');

      for (const vector of ATTACK_VECTORS) {
        // Lista arquivos antes no diretório pai
        const filesBefore = fs.readdirSync(tempBaseDir);

        // 1. Vetor em abaId
        expect(() => {
          eventoService.salvarSnapshotEmDisco(sessaoId, vector, 1, state);
        }).toThrow();

        // 2. Vetor em sessaoId
        expect(() => {
          eventoService.salvarSnapshotEmDisco(vector, 'default', 1, state);
        }).toThrow();

        // Lista arquivos depois no diretório pai: NENHUM arquivo pode ter sido criado fora de snapshots/
        const filesAfter = fs.readdirSync(tempBaseDir);
        expect(filesAfter).toEqual(filesBefore);
        expect(fs.existsSync(path.join(tempBaseDir, 'y_1.json'))).toBe(false);
        expect(fs.existsSync(path.join(tempBaseDir, 'y.json'))).toBe(false);
        expect(fs.existsSync(path.join(tempBaseDir, 'x.json'))).toBe(false);
      }
    });

    it('obterUltimoSnapshot, gerarSnapshotAba e reconstruirEstadoAba rejeitam vetores de path traversal', () => {
      for (const vector of ATTACK_VECTORS) {
        expect(eventoService.obterUltimoSnapshot(sessaoId, vector)).toBeNull();
        expect(eventoService.obterUltimoSnapshot(vector, 'default')).toBeNull();

        expect(() => eventoService.gerarSnapshotAba(sessaoId, vector)).toThrow();
        expect(() => eventoService.gerarSnapshotAba(vector, 'default')).toThrow();

        expect(() => eventoService.reconstruirEstadoAba(sessaoId, vector)).toThrow();
        expect(() => eventoService.reconstruirEstadoAba(vector, 'default')).toThrow();
      }
    });

    it('gravarEvento rejeita sessao_id e aba_id inválidos com erro tipado e sem persistir', () => {
      // 1. sessao_id é obrigatório: todos os 12 vetores devem ser rejeitados
      for (const vector of ATTACK_VECTORS) {
        const resSessao = eventoService.gravarEvento({
          sessao_id: vector,
          aba_id: 'default',
          tipo: 'DRAW_ADD',
          payload: '{"id":"test-sessao"}',
          autor: 'host',
        });
        expect(resSessao.sucesso).toBe(false);
        expect(resSessao.motivo).toBe('SESSAO_ID_INVALIDO');
      }

      // 2. aba_id inválido (traversal, caminhos absolutos, byte nulo, vazio, gigante, não-string)
      const INVALID_ABA_VECTORS = ATTACK_VECTORS.filter((v) => v !== null && v !== undefined);
      for (const vector of INVALID_ABA_VECTORS) {
        const resAba = eventoService.gravarEvento({
          sessao_id: sessaoId,
          aba_id: vector,
          tipo: 'DRAW_ADD',
          payload: '{"id":"test-aba"}',
          autor: 'host',
        });
        expect(resAba.sucesso).toBe(false);
        expect(resAba.motivo).toBe('ABA_ID_INVALIDO');
      }
    });

    it('IPC handleEventoGravar e handleEventoObterEstado rejeitam sessao_id e aba_id maliciosos', async () => {
      // 1. sessao_id malicioso
      for (const vector of ATTACK_VECTORS) {
        const resIpcSessao = await handleEventoGravar(
          {
            sessao_id: vector,
            aba_id: 'default',
            tipo: 'DRAW_ADD',
            payload: { id: 'p1' },
            autor: 'host',
          },
          eventoService
        );
        expect(resIpcSessao.success).toBe(false);
        if (!resIpcSessao.success) {
          expect(resIpcSessao.error).toBe('VALIDATION');
        }

        const resIpcObterSessao = await handleEventoObterEstado(
          {
            sessao_id: vector,
            aba_id: 'default',
          },
          eventoService
        );
        expect(resIpcObterSessao.success).toBe(false);
        if (!resIpcObterSessao.success) {
          expect(resIpcObterSessao.error).toBe('VALIDATION');
        }
      }

      // 2. aba_id malicioso
      const INVALID_ABA_VECTORS = ATTACK_VECTORS.filter((v) => v !== null && v !== undefined);
      for (const vector of INVALID_ABA_VECTORS) {
        const resIpcGravarAba = await handleEventoGravar(
          {
            sessao_id: sessaoId,
            aba_id: vector,
            tipo: 'DRAW_ADD',
            payload: { id: 'p1' },
            autor: 'host',
          },
          eventoService
        );
        expect(resIpcGravarAba.success).toBe(false);
        if (!resIpcGravarAba.success) {
          expect(resIpcGravarAba.error).toBe('VALIDATION');
        }

        const resIpcObter = await handleEventoObterEstado(
          {
            sessao_id: sessaoId,
            aba_id: vector,
          },
          eventoService
        );
        expect(resIpcObter.success).toBe(false);
        if (!resIpcObter.success) {
          expect(resIpcObter.error).toBe('VALIDATION');
        }
      }
    });
  });

  describe('C2: Autoridade Estrita (Lista de Permissão) e Bloqueio de Ações', () => {
    const INVALID_AUTHORS = [
      'convidado',
      '',
      'guest ',
      ' Guest',
      'Guest',
      'GUEST',
      'GuestX',
      'host ',
      ' Host',
      'HOST',
      'admin',
      'root',
      null as unknown as string,
      undefined as unknown as string,
      123 as unknown as string,
      {} as unknown as string,
    ];

    const EXCLUSIVE_ACTIONS = [
      'CLEAR_TAB',
      'LOCK_SCREEN',
      'UNLOCK_MEDIA',
      'TAB_SWITCH',
      'SCREEN_LOCKED',
    ];

    it('rejeita qualquer autor que não seja exatamente "host" ou "guest" com AUTOR_INVALIDO para todas as ações', () => {
      for (const auth of INVALID_AUTHORS) {
        for (const action of EXCLUSIVE_ACTIONS) {
          const res = eventoService.validarAutorEPermissao(action, auth);
          expect(res.permitido).toBe(false);
          expect(res.motivo).toBe('AUTOR_INVALIDO');

          const gravarRes = eventoService.gravarEvento({
            sessao_id: sessaoId,
            aba_id: 'default',
            tipo: action,
            payload: '{}',
            autor: auth,
          });
          expect(gravarRes.sucesso).toBe(false);
          expect(gravarRes.motivo).toBe('AUTOR_INVALIDO');
        }

        // Também rejeita DRAW_ADD para autores inválidos
        const resDraw = eventoService.validarAutorEPermissao('DRAW_ADD', auth);
        expect(resDraw.permitido).toBe(false);
        expect(resDraw.motivo).toBe('AUTOR_INVALIDO');
      }
    });

    it('rejeita tipo de evento desconhecido com TIPO_INVALIDO para Host e Guest', () => {
      const UNKNOWN_TYPES = ['HACK_EXEC', 'DROP_TABLE', 'INJECT', 'UNKNOWN_ACTION', '', ' '];

      for (const badType of UNKNOWN_TYPES) {
        expect(eventoService.validarAutorEPermissao(badType, 'host')).toEqual({
          permitido: false,
          motivo: 'TIPO_INVALIDO',
        });
        expect(eventoService.validarAutorEPermissao(badType, 'guest')).toEqual({
          permitido: false,
          motivo: 'TIPO_INVALIDO',
        });
      }
    });

    it('Guest é estritamente proibido de executar ações exclusivas (CLEAR_TAB, LOCK_SCREEN, UNLOCK_MEDIA, TAB_SWITCH, SCREEN_LOCKED)', () => {
      for (const action of EXCLUSIVE_ACTIONS) {
        const res = eventoService.validarAutorEPermissao(action, 'guest', false);
        expect(res.permitido).toBe(false);
        expect(res.motivo).toBe('FORBIDDEN_ACTION_GUEST');

        const resGravar = eventoService.gravarEvento({
          sessao_id: sessaoId,
          aba_id: 'default',
          tipo: action,
          payload: '{}',
          autor: 'guest',
        });
        expect(resGravar.sucesso).toBe(false);
        expect(resGravar.motivo).toBe('FORBIDDEN_ACTION_GUEST');
      }
    });

    it('Guest com tela bloqueada (screenLocked === true) é rejeitado com SCREEN_LOCKED para qualquer evento', () => {
      const resDraw = eventoService.validarAutorEPermissao('DRAW_ADD', 'guest', true);
      expect(resDraw.permitido).toBe(false);
      expect(resDraw.motivo).toBe('SCREEN_LOCKED');

      const resHide = eventoService.validarAutorEPermissao('DRAW_HIDE', 'guest', true);
      expect(resHide.permitido).toBe(false);
      expect(resHide.motivo).toBe('SCREEN_LOCKED');

      const resGravar = eventoService.gravarEvento(
        {
          sessao_id: sessaoId,
          aba_id: 'default',
          tipo: 'DRAW_ADD',
          payload: '{"id":"blocked-drawing"}',
          autor: 'guest',
        },
        true // screenLocked
      );
      expect(resGravar.sucesso).toBe(false);
      expect(resGravar.motivo).toBe('SCREEN_LOCKED');
    });

    it('IPC handleEventoGravar rejeita autores fora da lista de permissão', async () => {
      for (const auth of INVALID_AUTHORS) {
        const res = await handleEventoGravar(
          {
            sessao_id: sessaoId,
            aba_id: 'default',
            tipo: 'DRAW_ADD',
            payload: { id: 'test' },
            autor: auth,
          },
          eventoService
        );
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error).toBe('VALIDATION');
        }
      }
    });
  });

  describe('C3: Descarte de Evento Rejeitado pelo Servidor (handleGuestEvent)', () => {
    it('descarta evento do Guest com abaId malicioso e NÃO repassa ao Host', () => {
      const controller = new ServerSessionController();
      const hostListener = vi.fn();
      controller.onGuestEvent(hostListener);

      const anyController = controller as any;

      // Guest envia evento com path traversal no payload
      anyController.handleGuestEvent({
        type: 'DRAW_ADD',
        payload: {
          abaId: 'x/../../../y',
          data: { path: 'M 0 0' },
        },
      });

      expect(hostListener).not.toHaveBeenCalled();

      // Guest envia evento com path traversal no envelope
      anyController.handleGuestEvent({
        type: 'DRAW_ADD',
        abaId: '../../etc/passwd',
        payload: { data: 'hack' },
      });

      expect(hostListener).not.toHaveBeenCalled();
    });

    it('descarta evento do Guest rejeitado por gravarEvento (ex.: CLEAR_TAB) e NÃO repassa ao Host', () => {
      const controller = new ServerSessionController();
      const hostListener = vi.fn();
      controller.onGuestEvent(hostListener);

      const anyController = controller as any;

      // Guest tenta CLEAR_TAB (gravarEvento retorna sucesso: false com FORBIDDEN_ACTION_GUEST)
      anyController.handleGuestEvent({
        type: 'CLEAR_TAB',
        payload: { abaId: 'default' },
      });

      expect(hostListener).not.toHaveBeenCalled();
    });

    it('repassa evento com sucesso ao Host se for válido e aprovado', () => {
      const controller = new ServerSessionController();
      const hostListener = vi.fn();
      controller.onGuestEvent(hostListener);

      const anyController = controller as any;

      // Configura sessionManager simulado com sessão válida
      anyController.sessionManager = {
        sessaoId,
        isScreenLocked: () => false,
      };

      anyController.handleGuestEvent({
        type: 'DRAW_ADD',
        payload: {
          abaId: 'default',
          id: 'valid-element-1',
          data: { stroke: '#0284c7' },
        },
      });

      expect(hostListener).toHaveBeenCalledTimes(1);
      expect(hostListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DRAW_ADD',
        })
      );
    });
  });

  describe('C4: Barra de Ferramentas Mobile (Alvos de Toque >= 48px e Viewport 412px)', () => {
    it('garante que a estrutura da barra de ferramentas suporta todos os 10 botões com alvos >= 48px', () => {
      const guestCssPath = path.resolve(__dirname, '../../src/guest/guest.css');
      const cssContent = fs.readFileSync(guestCssPath, 'utf8');

      // Verifica classes mobile-first no CSS
      expect(cssContent).toContain('.touch-btn');
      expect(cssContent).toContain('min-width: 48px');
      expect(cssContent).toContain('min-height: 48px');
      expect(cssContent).toContain('.guest-toolbar-container');
      expect(cssContent).toContain('flex-wrap: wrap');
      expect(cssContent).toContain('.guest-toolbar-group');

      const guestRoomPath = path.resolve(__dirname, '../../src/guest/GuestRoom.tsx');
      const roomContent = fs.readFileSync(guestRoomPath, 'utf8');

      const expectedButtonIds = [
        'tool-guest-pencil',
        'tool-guest-brush',
        'tool-guest-rect',
        'tool-guest-ellipse',
        'tool-guest-arrow',
        'tool-guest-text',
        'tool-guest-eraser',
        'btn-guest-undo',
        'btn-guest-toggle-drawer',
        'btn-guest-media-play',
      ];

      for (const btnId of expectedButtonIds) {
        expect(roomContent).toContain(`id="${btnId}"`);
      }
    });
  });

  describe('C5: Registro de Divergência (ADR-010) e Fonte Única da CSP do Guest', () => {
    it('DRAW_HIDE aceita elementId, targetId e id de forma retrocompatível no reducer', async () => {
      const { reduceEvent } = await import('../../src/shared/events/reducer');

      let state = createInitialTabState('aba-divergencia');
      state = reduceEvent(state, {
        id: 'add-1',
        tipo: 'DRAW_ADD',
        payload: { id: 'elem-alvo-1', data: {} },
        autor: 'host',
        criado_em: 1,
      });
      state = reduceEvent(state, {
        id: 'add-2',
        tipo: 'DRAW_ADD',
        payload: { id: 'elem-alvo-2', data: {} },
        autor: 'host',
        criado_em: 2,
      });

      expect(state.elements['elem-alvo-1'].hidden).toBe(false);
      expect(state.elements['elem-alvo-2'].hidden).toBe(false);

      // 1. DRAW_HIDE usando targetId (canônico Fase 05)
      state = reduceEvent(state, {
        id: 'hide-1',
        tipo: 'DRAW_HIDE',
        payload: { targetId: 'elem-alvo-1' },
        autor: 'host',
        criado_em: 3,
      });
      expect(state.elements['elem-alvo-1'].hidden).toBe(true);

      // 2. DRAW_HIDE usando elementId (divergência documentada no ADR-010)
      state = reduceEvent(state, {
        id: 'hide-2',
        tipo: 'DRAW_HIDE',
        payload: { elementId: 'elem-alvo-2' },
        autor: 'guest',
        criado_em: 4,
      });
      expect(state.elements['elem-alvo-2'].hidden).toBe(true);

      // 3. ADR-010 existe no repositório
      const adr10Path = path.resolve(__dirname, '../../docs/ADR/010-drawhide-elementid.md');
      expect(fs.existsSync(adr10Path)).toBe(true);
      const adrContent = fs.readFileSync(adr10Path, 'utf8');
      expect(adrContent).toContain('ADR-010');
      expect(adrContent).toContain('DRAW_HIDE');
      expect(adrContent).toContain('elementId');
    });

    it('fonte única GUEST_CSP coincide exatamente entre cabeçalho HTTP e HTML final', async () => {
      const { GUEST_CSP } = await import('../../src/shared/csp');
      const { createExpressApp } = await import('../../electron/server/http');
      const { SessionManager } = await import('../../electron/server/session-manager');

      // 1. Verifica que a constante GUEST_CSP contém wasm-unsafe-eval e diretivas estritas
      expect(GUEST_CSP).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(GUEST_CSP).toContain("object-src 'none'");
      expect(GUEST_CSP).toContain("default-src 'self'");

      // 2. Verifica o cabeçalho HTTP do Express
      const sessionManager = new SessionManager({ sessaoId, atendidoId });
      const app = createExpressApp(sessionManager);

      let expressCspHeader = '';
      const req = {} as any;
      const res = {
        setHeader: (name: string, value: string) => {
          if (name.toLowerCase() === 'content-security-policy') {
            expressCspHeader = value;
          }
        },
        status: () => ({ json: () => {} }),
      } as any;
      const next = vi.fn();

      // Executa o middleware de segurança do Express
      const middlewares = (app as any)._router.stack.filter((layer: any) => layer.name === '<anonymous>');
      for (const m of middlewares) {
        m.handle(req, res, next);
      }

      expect(expressCspHeader).toBe(GUEST_CSP);

      // 3. Verifica o HTML de origem (guest.html)
      const guestHtmlPath = path.resolve(__dirname, '../../guest.html');
      expect(fs.existsSync(guestHtmlPath)).toBe(true);
      const guestHtmlContent = fs.readFileSync(guestHtmlPath, 'utf8');
      const metaMatch = guestHtmlContent.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
      expect(metaMatch).not.toBeNull();
      const metaCsp = metaMatch ? metaMatch[1] : '';
      expect(metaCsp).toBe(GUEST_CSP);

      // 4. Se existir o build em dist/guest/guest.html, verifica a coincidência exata
      const distGuestPath = path.resolve(__dirname, '../../dist/guest/guest.html');
      if (fs.existsSync(distGuestPath)) {
        const distHtml = fs.readFileSync(distGuestPath, 'utf8');
        const distMetaMatch = distHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
        expect(distMetaMatch).not.toBeNull();
        const distMetaCsp = distMetaMatch ? distMetaMatch[1] : '';
        expect(distMetaCsp).toBe(GUEST_CSP);
        expect(expressCspHeader).toBe(distMetaCsp);
      }
    });
  });
});
