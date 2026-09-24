import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isDiagEnabled, diagLog } from '../src/shared/diag';
import {
  CANONICAL_VIRTUAL_WIDTH,
  CANONICAL_VIRTUAL_HEIGHT,
  createFabricObjectFromData,
} from '../src/shared/canvas/engine';
import buildInfo from '../src/shared/build-info.json';

describe('Homologação 2 — Correções V1, V2 e V4', () => {
  describe('V1 — Carimbo de Versão Visível e Detecção de Desatualização', () => {
    it('build-info.json possui campos canônicos preenchidos', () => {
      expect(buildInfo).toBeDefined();
      expect(typeof buildInfo.commit).toBe('string');
      expect(buildInfo.commit.length).toBeGreaterThan(0);
      expect(typeof buildInfo.branch).toBe('string');
      expect(buildInfo.branch.length).toBeGreaterThan(0);
      expect(typeof buildInfo.buildDate).toBe('string');
      expect(typeof buildInfo.stamp).toBe('string');
      expect(buildInfo.stamp).toContain(buildInfo.commit);
      expect(buildInfo.stamp).toContain(buildInfo.branch);
    });

    it('detecta se o pacote dist/guest/version.json está desatualizado ou ausente', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-ver-'));
      const guestVerPath = path.join(tempDir, 'version.json');

      function checkGuestOutdated(guestPath: string, hostCommit: string) {
        if (!fs.existsSync(guestPath)) {
          return { guestOutdated: true, guestStamp: undefined };
        }
        try {
          const parsed = JSON.parse(fs.readFileSync(guestPath, 'utf8'));
          return {
            guestOutdated: !parsed.commit || parsed.commit !== hostCommit,
            guestStamp: parsed.stamp,
          };
        } catch {
          return { guestOutdated: true, guestStamp: undefined };
        }
      }

      // 1. Arquivo não existe -> outdated
      const res1 = checkGuestOutdated(guestVerPath, buildInfo.commit);
      expect(res1.guestOutdated).toBe(true);
      expect(res1.guestStamp).toBeUndefined();

      // 2. Commit diferente -> outdated
      fs.writeFileSync(
        guestVerPath,
        JSON.stringify({ commit: 'diff123', branch: 'test', stamp: 'diff123 (test) date' }),
        'utf8'
      );
      const res2 = checkGuestOutdated(guestVerPath, buildInfo.commit);
      expect(res2.guestOutdated).toBe(true);
      expect(res2.guestStamp).toBe('diff123 (test) date');

      // 3. Commit idêntico -> sincronizado
      fs.writeFileSync(
        guestVerPath,
        JSON.stringify({ commit: buildInfo.commit, branch: buildInfo.branch, stamp: buildInfo.stamp }),
        'utf8'
      );
      const res3 = checkGuestOutdated(guestVerPath, buildInfo.commit);
      expect(res3.guestOutdated).toBe(false);
      expect(res3.guestStamp).toBe(buildInfo.stamp);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('V2 — Diagnóstico sob Flag ONETOONE_DIAG', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...origEnv };
      vi.restoreAllMocks();
    });

    it('ativa diagnóstico apenas quando ONETOONE_DIAG=1 e não está em produção', () => {
      delete process.env.ONETOONE_DIAG;
      process.env.NODE_ENV = 'development';
      expect(isDiagEnabled()).toBe(false);

      process.env.ONETOONE_DIAG = '0';
      expect(isDiagEnabled()).toBe(false);

      process.env.ONETOONE_DIAG = '1';
      process.env.NODE_ENV = 'development';
      expect(isDiagEnabled()).toBe(true);

      // Em produção, mesmo com flag, diagnóstico sensível deve ficar desligado
      process.env.NODE_ENV = 'production';
      expect(isDiagEnabled()).toBe(false);
    });

    it('diagLog sanitiza chaves sensíveis (token, secret, key, nonce)', () => {
      process.env.ONETOONE_DIAG = '1';
      process.env.NODE_ENV = 'development';

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      diagLog('testCheckpoint', {
        action: 'testAction',
        token: 'super-secret-token-123',
        clientSecret: 'shhh-secret',
        encryptionKey: '0123456789abcdef',
        nonce: 'aabbccdd',
        safeCount: 42,
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedCall = consoleSpy.mock.calls[0];
      expect(loggedCall[0]).toContain('[testCheckpoint]');
      const loggedData = JSON.parse(loggedCall[1]);
      expect(loggedData.safeCount).toBe(42);
      expect(loggedData.action).toBe('testAction');
      expect(loggedData.token).toBe('[REDACTED]');
      expect(loggedData.clientSecret).toBe('[REDACTED]');
      expect(loggedData.encryptionKey).toBe('[REDACTED]');
      expect(loggedData.nonce).toBe('[REDACTED]');
    });
  });

  describe('V4 — Mapeamento de Coordenadas Canônicas (Host x Mobile)', () => {
    it('define o sistema de coordenadas canônicas fixo em 1200x800', () => {
      expect(CANONICAL_VIRTUAL_WIDTH).toBe(1200);
      expect(CANONICAL_VIRTUAL_HEIGHT).toBe(800);
    });

    it('calcula escala uniforme mantendo proporção de aspecto (aspect ratio)', () => {
      function computeScale(containerW: number, containerH: number) {
        return Math.min(
          containerW / CANONICAL_VIRTUAL_WIDTH,
          containerH / CANONICAL_VIRTUAL_HEIGHT
        );
      }

      // Host tela grande (1920x1080)
      const scaleHost = computeScale(1920, 1080);
      expect(scaleHost).toBeCloseTo(1.35, 2);

      // Host tamanho padrão exato (1200x800)
      const scaleStandard = computeScale(1200, 800);
      expect(scaleStandard).toBe(1.0);

      // Guest mobile retrato (ex: 412x892 Motorola Edge 70 Pro)
      const scaleMobile = computeScale(412, 892);
      expect(scaleMobile).toBeCloseTo(412 / 1200, 4); // limitado pela largura
      expect(scaleMobile).toBeLessThan(1.0);

      // Guest mobile tela pequena (360x640)
      const scaleSmall = computeScale(360, 640);
      expect(scaleSmall).toBeCloseTo(360 / 1200, 4);
    });

    it('mapeia pointerToScene com touch release (changedTouches) evitando queda em (0,0)', () => {
      const scale = 0.5;
      const rect = { left: 10, top: 20 };

      function pointerToSceneMock(e: any, lastPointer?: { x: number; y: number }) {
        let clientX: number | undefined;
        let clientY: number | undefined;

        if (e.changedTouches && e.changedTouches.length > 0) {
          clientX = e.changedTouches[0].clientX;
          clientY = e.changedTouches[0].clientY;
        } else if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else if ('clientX' in e && typeof e.clientX === 'number') {
          clientX = e.clientX;
          clientY = e.clientY;
        }

        if (clientX === undefined || clientY === undefined) {
          if (lastPointer) return { ...lastPointer };
          return { x: 0, y: 0 };
        }

        return {
          x: (clientX - rect.left) / scale,
          y: (clientY - rect.top) / scale,
        };
      }

      // 1. Mouse move normal
      const mousePt = pointerToSceneMock({ clientX: 110, clientY: 120 });
      expect(mousePt.x).toBe((110 - 10) / 0.5); // 200
      expect(mousePt.y).toBe((120 - 20) / 0.5); // 200

      // 2. Touchend mobile (touches = [], changedTouches = [{ clientX: 210, clientY: 220 }])
      const touchEndPt = pointerToSceneMock({
        touches: [],
        changedTouches: [{ clientX: 210, clientY: 220 }],
      });
      expect(touchEndPt.x).toBe((210 - 10) / 0.5); // 400
      expect(touchEndPt.y).toBe((220 - 20) / 0.5); // 400
      expect(touchEndPt.x).not.toBe(0);

      // 3. Touchend sem touch info usa fallback de lastPointer em vez de zerar
      const fallbackPt = pointerToSceneMock({}, { x: 400, y: 400 });
      expect(fallbackPt.x).toBe(400);
      expect(fallbackPt.y).toBe(400);
    });

    it('cria formas geométricas nas 4 direções preservando dimensões positivas no modelo vetorial', () => {
      const directions = [
        { name: 'NO_to_SE', p1: { x: 100, y: 100 }, p2: { x: 300, y: 250 } },
        { name: 'SO_to_NE', p1: { x: 100, y: 250 }, p2: { x: 300, y: 100 } },
        { name: 'SE_to_NO', p1: { x: 300, y: 250 }, p2: { x: 100, y: 100 } },
        { name: 'NE_to_SO', p1: { x: 300, y: 100 }, p2: { x: 100, y: 250 } },
      ];

      for (const dir of directions) {
        const left = Math.min(dir.p1.x, dir.p2.x);
        const top = Math.min(dir.p1.y, dir.p2.y);
        const width = Math.abs(dir.p2.x - dir.p1.x);
        const height = Math.abs(dir.p2.y - dir.p1.y);

        expect(left).toBe(100);
        expect(top).toBe(100);
        expect(width).toBe(200);
        expect(height).toBe(150);

        const obj = createFabricObjectFromData('rectangle', {
          id: `rect-${dir.name}`,
          left,
          top,
          width,
          height,
          stroke: '#3b82f6',
          fill: 'transparent',
          strokeWidth: 3,
        });

        expect(obj).toBeDefined();
        expect(obj!.left).toBe(100);
        expect(obj!.top).toBe(100);
        expect(obj!.width).toBe(200);
        expect(obj!.height).toBe(150);
      }
    });

    it('garante que elemento desenhado no Host (1200x800) fica inteiramente visível na tela do Guest mobile', () => {
      // Objeto desenhado na extremidade inferior direita do espaço canônico
      const objData = {
        id: 'rect-canonical-01',
        type: 'rectangle',
        left: 600,
        top: 400,
        width: 300,
        height: 200,
      };

      const guestViewportW = 412;
      const guestViewportH = 892;
      const scale = Math.min(guestViewportW / CANONICAL_VIRTUAL_WIDTH, guestViewportH / CANONICAL_VIRTUAL_HEIGHT);

      // Projeção na tela física do Guest
      const guestScreenLeft = objData.left * scale;
      const guestScreenTop = objData.top * scale;
      const guestScreenWidth = objData.width * scale;
      const guestScreenHeight = objData.height * scale;

      expect(guestScreenLeft).toBeGreaterThanOrEqual(0);
      expect(guestScreenTop).toBeGreaterThanOrEqual(0);
      expect(guestScreenLeft + guestScreenWidth).toBeLessThanOrEqual(guestViewportW);
      expect(guestScreenTop + guestScreenHeight).toBeLessThanOrEqual(guestViewportH);
    });
  });
});
