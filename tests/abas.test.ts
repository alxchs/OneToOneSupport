import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { AbaService } from '../electron/services/aba.service';
import { createAtendido } from '../electron/db/repositories/atendido.repo';
import { createSessao } from '../electron/db/repositories/sessao.repo';
import { appendEvento } from '../electron/db/repositories/evento.repo';
import {
  createAba,
  getAbaById,
  listAbasBySessao,
} from '../electron/db/repositories/aba.repo';

describe('M1 — Abas Multimodais, Persistência, Ordenação e Idempotência', () => {
  let db: DatabaseType;
  let abaService: AbaService;
  let sessaoId: string;

  beforeEach(() => {
    db = initDb({ dbPath: ':memory:' });
    abaService = new AbaService(db);

    const atendidoRes = createAtendido({ nome: 'Atendido Teste Abas' }, db);
    if (!atendidoRes.created) throw new Error('Falha ao criar atendido para teste');

    const sessaoRes = createSessao({ atendido_id: atendidoRes.id, titulo: 'Sessão Abas' }, Date.now(), db);
    if (!sessaoRes.created) throw new Error('Falha ao criar sessão para teste');
    sessaoId = sessaoRes.id;
  });

  afterAll(() => {
    closeDb();
  });

  it('cria abas de todos os tipos suportados (blank, image, pdf, video, audio)', () => {
    const tipos = ['blank', 'image', 'pdf', 'video', 'audio'] as const;

    for (let i = 0; i < tipos.length; i++) {
      const res = abaService.create({
        sessao_id: sessaoId,
        tipo: tipos[i],
        ordem: i,
        titulo: `Aba ${tipos[i]}`,
      });

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.tipo).toBe(tipos[i]);
      expect(res.data.ordem).toBe(i);
      expect(res.data.titulo).toBe(`Aba ${tipos[i]}`);
    }

    const listRes = abaService.listBySessao(sessaoId);
    expect(listRes.success).toBe(true);
    if (!listRes.success) return;
    expect(listRes.data).toHaveLength(5);
  });

  it('garante idempotência no INSERT via WHERE NOT EXISTS com IS (clique duplo rejeitado)', () => {
    const res1 = createAba(
      {
        sessao_id: sessaoId,
        tipo: 'blank',
        ordem: 0,
        asset_id: null,
        titulo: 'Aba Única',
      },
      Date.now(),
      db
    );

    expect(res1.created).toBe(true);

    // Tentativa idêntica imediata (simulando clique duplo)
    const res2 = createAba(
      {
        sessao_id: sessaoId,
        tipo: 'blank',
        ordem: 0,
        asset_id: null,
        titulo: 'Aba Única',
      },
      Date.now(),
      db
    );

    expect(res2.created).toBe(false);
    if (res2.created) return;
    expect(res2.reason).toBe('DUPLICATE');
    if (!res1.created) return;
    expect(res2.existingId).toBe(res1.id);

    // Contagem no banco deve ser exatamente 1
    const abas = listAbasBySessao(sessaoId, db);
    expect(abas).toHaveLength(1);
  });

  it('renomeia título de uma aba existente com sucesso', () => {
    const created = abaService.create({
      sessao_id: sessaoId,
      tipo: 'blank',
      ordem: 0,
      titulo: 'Título Original',
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const renameRes = abaService.rename({
      id: created.data.id,
      novoTitulo: 'Título Modificado',
    });
    expect(renameRes.success).toBe(true);
    if (!renameRes.success) return;
    expect(renameRes.data.titulo).toBe('Título Modificado');

    const fetched = getAbaById(created.data.id, db);
    expect(fetched?.titulo).toBe('Título Modificado');
  });

  it('reordena abas mantendo sequência estritamente contígua 0..N-1 sem buracos', () => {
    const a1 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 0, titulo: 'A1' });
    const a2 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 1, titulo: 'A2' });
    const a3 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 2, titulo: 'A3' });

    if (!a1.success || !a2.success || !a3.success) throw new Error('Falha ao criar abas');

    // Inverte a ordem: A3, A1, A2
    const reorderRes = abaService.reorder({
      sessaoId,
      abaIdsEmOrdem: [a3.data.id, a1.data.id, a2.data.id],
    });

    expect(reorderRes.success).toBe(true);
    if (!reorderRes.success) return;

    expect(reorderRes.data[0].id).toBe(a3.data.id);
    expect(reorderRes.data[0].ordem).toBe(0);

    expect(reorderRes.data[1].id).toBe(a1.data.id);
    expect(reorderRes.data[1].ordem).toBe(1);

    expect(reorderRes.data[2].id).toBe(a2.data.id);
    expect(reorderRes.data[2].ordem).toBe(2);
  });

  it('rejeita reordenação se a lista contiver IDs inválidos ou incompletos', () => {
    const a1 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 0, titulo: 'A1' });
    const a2 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 1, titulo: 'A2' });
    if (!a1.success || !a2.success) throw new Error('Falha ao criar abas');

    // Lista incompleta
    const resIncompleto = abaService.reorder({
      sessaoId,
      abaIdsEmOrdem: [a1.data.id],
    });
    expect(resIncompleto.success).toBe(false);

    // Lista com ID falso
    const resFalso = abaService.reorder({
      sessaoId,
      abaIdsEmOrdem: [a1.data.id, 'id-inexistente-123'],
    });
    expect(resFalso.success).toBe(false);
  });

  it('remove aba vazia e renumera automaticamente as abas restantes sem deixar buraco', () => {
    const a1 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 0, titulo: 'Primeira' });
    const a2 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 1, titulo: 'Segunda' });
    const a3 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 2, titulo: 'Terceira' });
    if (!a1.success || !a2.success || !a3.success) throw new Error('Falha ao criar abas');

    // Remove a aba do meio (a2)
    const delRes = abaService.delete(a2.data.id);
    expect(delRes.success).toBe(true);

    // As abas restantes (a1 e a3) devem ter ordens 0 e 1, contíguas
    const abasRestantes = listAbasBySessao(sessaoId, db);
    expect(abasRestantes).toHaveLength(2);

    expect(abasRestantes[0].id).toBe(a1.data.id);
    expect(abasRestantes[0].ordem).toBe(0);

    expect(abasRestantes[1].id).toBe(a3.data.id);
    expect(abasRestantes[1].ordem).toBe(1);
  });

  it('bloqueia estritamente a remoção de aba que já possui eventos no SQLite (HAS_EVENTS)', () => {
    const a1 = abaService.create({ sessao_id: sessaoId, tipo: 'blank', ordem: 0, titulo: 'Com Eventos' });
    if (!a1.success) throw new Error('Falha ao criar aba');

    // Insere um evento associado a esta aba
    appendEvento(
      {
        sessao_id: sessaoId,
        aba_id: a1.data.id,
        tipo: 'DRAW_ADD',
        payload: JSON.stringify({ elementId: 'elem-1', path: [] }),
        autor: 'host',
      },
      db
    );

    // Tentativa de remover a aba deve ser recusada
    const delRes = abaService.delete(a1.data.id);
    expect(delRes.success).toBe(false);
    if (delRes.success) return;
    expect(delRes.error).toBe('HAS_EVENTS');

    // A aba continua existindo no banco
    const abaAindaExiste = getAbaById(a1.data.id, db);
    expect(abaAindaExiste).not.toBeNull();
  });
});
