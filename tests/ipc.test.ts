import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initDb, closeDb } from '../electron/db/connection';
import {
  handleAtendidoCreate,
  handleAtendidoUpdate,
  handleAtendidoGet,
  handleAtendidoSoftDelete,
  handleAtendidoPurge,
} from '../electron/ipc/atendido.ipc';
import {
  handleSessaoCreate,
  handleSessaoEncerrar,
} from '../electron/ipc/sessao.ipc';
import {
  handleConfigSetLabel,
  handleConfigSet,
} from '../electron/ipc/config.ipc';
import { handleCanvasForceRepaint } from '../electron/ipc/canvas.ipc';

describe('IPC Handlers: Validação de Payload no Main e Erros Tipados', () => {
  beforeEach(() => {
    initDb({ dbPath: ':memory:' });
  });

  afterAll(() => {
    closeDb();
  });

  describe('Atendido IPC: Validações de Entrada e Erros Tipados', () => {
    it('rejeita payload nulo ou não-objeto com VALIDATION', async () => {
      const resNull = await handleAtendidoCreate(null);
      expect(resNull.success).toBe(false);
      if (resNull.success) return;
      expect(resNull.error).toBe('VALIDATION');

      const resString = await handleAtendidoCreate('invalido');
      expect(resString.success).toBe(false);
      if (resString.success) return;
      expect(resString.error).toBe('VALIDATION');
    });

    it('rejeita criação sem nome ou com nome vazio com VALIDATION', async () => {
      const resSemNome = await handleAtendidoCreate({ contato: '119999' });
      expect(resSemNome.success).toBe(false);
      if (resSemNome.success) return;
      expect(resSemNome.error).toBe('VALIDATION');
      expect(resSemNome.message).toContain('nome é obrigatório');

      const resNomeEspacos = await handleAtendidoCreate({ nome: '   ' });
      expect(resNomeEspacos.success).toBe(false);
      if (resNomeEspacos.success) return;
      expect(resNomeEspacos.error).toBe('VALIDATION');
    });

    it('rejeita contato ou email com tipos inválidos com VALIDATION', async () => {
      const resContatoInvalido = await handleAtendidoCreate({
        nome: 'João',
        contato: 12345 as unknown as string,
      });
      expect(resContatoInvalido.success).toBe(false);
      if (resContatoInvalido.success) return;
      expect(resContatoInvalido.error).toBe('VALIDATION');

      const resEmailInvalido = await handleAtendidoCreate({
        nome: 'João',
        email: true as unknown as string,
      });
      expect(resEmailInvalido.success).toBe(false);
      if (resEmailInvalido.success) return;
      expect(resEmailInvalido.error).toBe('VALIDATION');
    });

    it('rejeita update sem id ou com dados vazios com VALIDATION', async () => {
      const resSemId = await handleAtendidoUpdate({ dados: { nome: 'Novo' } });
      expect(resSemId.success).toBe(false);
      if (resSemId.success) return;
      expect(resSemId.error).toBe('VALIDATION');

      const resSemDados = await handleAtendidoUpdate({ id: 'uuid-123' });
      expect(resSemDados.success).toBe(false);
      if (resSemDados.success) return;
      expect(resSemDados.error).toBe('VALIDATION');
    });

    it('rejeita operações sem id com VALIDATION', async () => {
      const g = await handleAtendidoGet({});
      expect(g.success).toBe(false);
      if (g.success) return;
      expect(g.error).toBe('VALIDATION');

      const s = await handleAtendidoSoftDelete({});
      expect(s.success).toBe(false);
      if (s.success) return;
      expect(s.error).toBe('VALIDATION');

      const p = await handleAtendidoPurge({ id: '   ' });
      expect(p.success).toBe(false);
      if (p.success) return;
      expect(p.error).toBe('VALIDATION');
    });

    it('retorna erro tipado DUPLICATE na tentativa de criação duplicada', async () => {
      const c1 = await handleAtendidoCreate({ nome: 'Duplicado IPC', contato: '111' });
      expect(c1.success).toBe(true);
      if (!c1.success) return;

      const c2 = await handleAtendidoCreate({ nome: 'Duplicado IPC', contato: '111' });
      expect(c2.success).toBe(false);
      if (c2.success) return;
      expect(c2.error).toBe('DUPLICATE');
      expect(c2.existingId).toBe(c1.data.id);
    });
  });

  describe('Sessão IPC: Validações de Entrada e Erros Tipados', () => {
    it('rejeita início de sessão sem atendido_id com VALIDATION', async () => {
      const res = await handleSessaoCreate({ titulo: 'Sem Atendido' });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('atendido_id');
    });

    it('rejeita encerramento de sessão sem id com VALIDATION', async () => {
      const res = await handleSessaoEncerrar({});
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('ID da sessão');
    });
  });

  describe('Config IPC: Validações de Entrada e Erros Tipados', () => {
    it('rejeita chave sem prefixo rotulo. com VALIDATION', async () => {
      const res = await handleConfigSetLabel({ chave: 'host_label', valor: 'Profissional' });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('rotulo.');
    });

    it('rejeita valor de rótulo vazio com VALIDATION', async () => {
      const res = await handleConfigSetLabel({ chave: 'rotulo.host', valor: '   ' });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
    });

    it('rejeita config set sem chave com VALIDATION', async () => {
      const res = await handleConfigSet({ chave: '', valor: '123' });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
    });

    it('retorna erro DUPLICATE ao definir mesmo rótulo repetidamente', async () => {
      const r1 = await handleConfigSetLabel({ chave: 'rotulo.sessao', valor: 'Encontro' });
      expect(r1.success).toBe(true);

      const r2 = await handleConfigSetLabel({ chave: 'rotulo.sessao', valor: 'Encontro' });
      expect(r2.success).toBe(false);
      if (r2.success) return;
      expect(r2.error).toBe('DUPLICATE');
    });
  });

  describe('Canvas IPC: Force Repaint (D7)', () => {
    it('executa handleCanvasForceRepaint com sucesso e sem erro de schema', async () => {
      const res = await handleCanvasForceRepaint();
      expect(res.success).toBe(true);
      if (res.success) {
        expect(typeof res.data.repainted).toBe('boolean');
      }
    });
  });
});
