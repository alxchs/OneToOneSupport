import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao, encerrarSessao } from '../electron/db/repositories/sessao.repo';
import { countEventosBySessao } from '../electron/db/repositories/evento.repo';
import { EventoService } from '../electron/services/evento.service';
import { getVisibleElements } from '../src/shared/events/reducer';

describe('D16.2 — Imutabilidade de Sessão Encerrada no Backend (EventoService e SQLite)', () => {
  let db: DatabaseType;
  let tempDir: string;
  let sessaoId: string;
  let atendidoId: string;
  let eventoService: EventoService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-test-d16-'));
    db = initDb({ dbPath: ':memory:' });

    const atendidoRes = createAtendido(
      { nome: 'Paciente D16 Teste', contato: '11988887777' },
      db
    );
    atendidoId = (atendidoRes as { id: string }).id;

    const sessaoRes = createSessao({ atendido_id: atendidoId, titulo: 'Sessão Histórica' }, Date.now(), db);
    if (!sessaoRes.created) {
      throw new Error('Falha ao criar sessão de teste');
    }
    sessaoId = sessaoRes.id;

    eventoService = new EventoService({
      db,
      snapshotsDir: tempDir,
      defaultSnapshotInterval: 200,
    });
  });

  afterEach(() => {
    try {
      closeDb();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('permite gravação de eventos enquanto a sessão está ativa', () => {
    const res = eventoService.gravarEvento({
      sessao_id: sessaoId,
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      payload: JSON.stringify({
        id: 'forma-01',
        tipo: 'rect',
        data: { left: 10, top: 10, width: 50, height: 50 },
      }),
    });

    expect(res.sucesso).toBe(true);
    expect(res.evento).toBeDefined();

    const count = countEventosBySessao(sessaoId, db);
    expect(count).toBe(1);
  });

  it('rejeita estritamente qualquer tentativa de gravar evento após a sessão ser encerrada', () => {
    // 1. Grava 3 eventos válidos na sessão ativa
    for (let i = 1; i <= 3; i++) {
      const res = eventoService.gravarEvento({
        sessao_id: sessaoId,
        aba_id: 'default',
        tipo: 'DRAW_ADD',
        autor: 'host',
        payload: JSON.stringify({
          id: `elem-${i}`,
          tipo: 'pencil',
          data: { path: `M 0 ${i} L 10 ${i}` },
        }),
      });
      expect(res.sucesso).toBe(true);
    }

    const contagemAntes = countEventosBySessao(sessaoId, db);
    expect(contagemAntes).toBe(3);

    // 2. Encerra a sessão
    const encRes = encerrarSessao(sessaoId, 'Notas de encerramento', Date.now(), db);
    expect(encRes.encerrada).toBe(true);

    // 3. Tenta gravar novo evento após encerramento (Host ou atacante)
    const tentativaPos = eventoService.gravarEvento({
      sessao_id: sessaoId,
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      payload: JSON.stringify({
        id: 'elem-invasor',
        tipo: 'pencil',
        data: { path: 'M 99 99 L 100 100' },
      }),
    });

    expect(tentativaPos.sucesso).toBe(false);
    expect(tentativaPos.motivo).toBe('SESSAO_ENCERRADA');

    // 4. Garante que a contagem de eventos no SQLite NÃO mudou (permanece exatamente 3)
    const contagemDepois = countEventosBySessao(sessaoId, db);
    expect(contagemDepois).toBe(3);
  });

  it('reconstruirEstadoAba reconstrói fielmente o estado do quadro da sessão encerrada', () => {
    // 1. Desenha elementos
    eventoService.gravarEvento({
      sessao_id: sessaoId,
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      payload: JSON.stringify({
        id: 'rect-final',
        tipo: 'rect',
        data: { left: 100, top: 100, width: 200, height: 150 },
      }),
    });
    eventoService.gravarEvento({
      sessao_id: sessaoId,
      aba_id: 'default',
      tipo: 'DRAW_ADD',
      autor: 'host',
      payload: JSON.stringify({
        id: 'text-final',
        tipo: 'text',
        data: { left: 150, top: 180, text: 'Conclusão da Sessão' },
      }),
    });

    // 2. Encerra a sessão
    encerrarSessao(sessaoId, null, Date.now(), db);

    // 3. Carrega o estado da aba via reconstruirEstadoAba (usado por obterEstadoAba)
    const estado = eventoService.reconstruirEstadoAba(sessaoId, 'default');
    const visiveis = getVisibleElements(estado);

    expect(visiveis.length).toBe(2);
    expect(visiveis.map((v) => v.id)).toEqual(['rect-final', 'text-final']);
  });
});
