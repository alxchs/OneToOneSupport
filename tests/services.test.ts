import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Database as DatabaseType } from 'better-sqlite3';
import { initDb, closeDb } from '../electron/db/connection';
import { AtendidoService, TEN_YEARS_MS } from '../electron/services/atendido.service';
import { SessaoService } from '../electron/services/sessao.service';
import { ConfigService } from '../electron/services/config.service';

describe('Domain Services - Regras de Negócio e Persistência', () => {
  let db: DatabaseType;
  let simulatedTime: number;
  const clock = () => simulatedTime;

  let atendidoService: AtendidoService;
  let sessaoService: SessaoService;
  let configService: ConfigService;

  beforeEach(() => {
    simulatedTime = 1700000000000; // Tempo base simulado
    db = initDb({ dbPath: ':memory:' });
    atendidoService = new AtendidoService(clock, db);
    sessaoService = new SessaoService(clock, db);
    configService = new ConfigService(db);
  });

  afterAll(() => {
    closeDb();
  });

  describe('AtendidoService: CRUD, Soft Delete e Duplicidade', () => {
    it('deve criar um atendido com sucesso e listar apenas ativos por padrão', () => {
      const res = atendidoService.create({
        nome: 'Lucas Silva',
        contato: '11988887777',
        email: 'lucas@teste.com',
        notas: 'Primeira consulta',
      });

      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.data.nome).toBe('Lucas Silva');
      expect(res.data.ativo).toBe(1);
      expect(res.data.deletado_em).toBeNull();

      const listRes = atendidoService.list();
      expect(listRes.success).toBe(true);
      if (!listRes.success) return;
      expect(listRes.data).toHaveLength(1);
      expect(listRes.data[0].id).toBe(res.data.id);
    });

    it('deve rejeitar criação duplicada com código DUPLICATE e existingId', () => {
      const res1 = atendidoService.create({
        nome: 'Ana Paula',
        contato: '21999991111',
        email: 'ana@teste.com',
        notas: null,
      });
      expect(res1.success).toBe(true);
      if (!res1.success) return;

      const res2 = atendidoService.create({
        nome: 'Ana Paula',
        contato: '21999991111',
        email: 'ana@teste.com',
        notas: null,
      });

      expect(res2.success).toBe(false);
      if (res2.success) return;
      expect(res2.error).toBe('DUPLICATE');
      expect(res2.existingId).toBe(res1.data.id);
    });

    it('deve realizar soft delete marcando ativo=0 e registrando deletado_em', () => {
      const created = atendidoService.create({ nome: 'Marcos Souza' });
      expect(created.success).toBe(true);
      if (!created.success) return;

      simulatedTime += 1000;
      const delRes = atendidoService.softDelete(created.data.id);
      expect(delRes.success).toBe(true);

      // Não aparece na listagem padrão de ativos
      const listAtivos = atendidoService.list({ apenasAtivos: true });
      expect(listAtivos.success && listAtivos.data).toHaveLength(0);

      // Aparece ao incluir inativos
      const listTodos = atendidoService.list({ apenasAtivos: false });
      expect(listTodos.success && listTodos.data).toHaveLength(1);

      const record = atendidoService.getById(created.data.id);
      expect(record.success).toBe(true);
      if (!record.success) return;
      expect(record.data.ativo).toBe(0);
      expect(record.data.deletado_em).toBe(simulatedTime);
    });

    it('deve reativar atendido marcando ativo=1 e deletado_em=NULL', () => {
      const created = atendidoService.create({ nome: 'Fernanda Lima' });
      if (!created.success) return;

      atendidoService.softDelete(created.data.id);
      simulatedTime += 2000;

      const reactivateRes = atendidoService.reactivate(created.data.id);
      expect(reactivateRes.success).toBe(true);

      const record = atendidoService.getById(created.data.id);
      expect(record.success).toBe(true);
      if (!record.success) return;
      expect(record.data.ativo).toBe(1);
      expect(record.data.deletado_em).toBeNull();
    });

    it('update que colide com outro atendido existente é rejeitado com DUPLICATE', () => {
      const p1 = atendidoService.create({ nome: 'Pessoa Um', email: 'um@teste.com' });
      const p2 = atendidoService.create({ nome: 'Pessoa Dois', email: 'dois@teste.com' });
      if (!p1.success || !p2.success) return;

      const updRes = atendidoService.update(p2.data.id, {
        nome: 'Pessoa Um',
        email: 'um@teste.com',
      });

      expect(updRes.success).toBe(false);
      if (updRes.success) return;
      expect(updRes.error).toBe('DUPLICATE');
      expect(updRes.existingId).toBe(p1.data.id);
    });
  });

  describe('AtendidoService: Purga Física de 10 Anos com Relógio Injetável', () => {
    it('não permite purga de atendido ativo (deve estar desativado)', () => {
      const c = atendidoService.create({ nome: 'Ativo Não Purgavel' });
      if (!c.success) return;

      const res = atendidoService.purgar(c.data.id);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('desativado');
    });

    it('não permite purga se houver sessão ativa em andamento', () => {
      const c = atendidoService.create({ nome: 'Com Sessao Ativa' });
      if (!c.success) return;

      sessaoService.create({ atendido_id: c.data.id, titulo: 'Sessão 1' });
      atendidoService.softDelete(c.data.id);

      const res = atendidoService.purgar(c.data.id);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('ativa');
    });

    it('não permite purga se última sessão foi encerrada há MENOS de 10 anos', () => {
      const c = atendidoService.create({ nome: 'Historico Recente' });
      if (!c.success) return;

      const s = sessaoService.create({ atendido_id: c.data.id });
      if (!s.success) return;

      simulatedTime += 3600000; // 1 hora depois encerra a sessão
      sessaoService.encerrar(s.data.id);
      atendidoService.softDelete(c.data.id);

      // Avançar relógio em 9 anos
      simulatedTime += 9 * 365 * 24 * 60 * 60 * 1000;

      const res = atendidoService.purgar(c.data.id);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
      expect(res.message).toContain('10 anos');
    });

    it('PERMITE purga física quando todas as sessões foram encerradas há MAIS de 10 anos', () => {
      const c = atendidoService.create({ nome: 'Historico Antigo' });
      if (!c.success) return;

      const s = sessaoService.create({ atendido_id: c.data.id });
      if (!s.success) return;

      sessaoService.encerrar(s.data.id);
      atendidoService.softDelete(c.data.id);

      // Avançar relógio em 10 anos + 1 segundo
      simulatedTime += TEN_YEARS_MS + 1000;

      const res = atendidoService.purgar(c.data.id);
      expect(res.success).toBe(true);

      // Registro físico foi removido do SQLite
      const getRes = atendidoService.getById(c.data.id);
      expect(getRes.success).toBe(false);
      if (getRes.success) return;
      expect(getRes.error).toBe('NOT_FOUND');
    });

    it('PERMITE purga de atendido sem sessões após 10 anos de inatividade', () => {
      const c = atendidoService.create({ nome: 'Sem Sessao 10 Anos' });
      if (!c.success) return;

      atendidoService.softDelete(c.data.id);

      // Avançar relógio em 10 anos + 1 segundo
      simulatedTime += TEN_YEARS_MS + 1000;

      const res = atendidoService.purgar(c.data.id);
      expect(res.success).toBe(true);

      const check = atendidoService.getById(c.data.id);
      expect(check.success).toBe(false);
      if (check.success) return;
      expect(check.error).toBe('NOT_FOUND');
    });
  });

  describe('SessaoService: Ciclo de Vida da Sessão e Integridade de FK', () => {
    it('cria sessão com status ativa vinculada ao atendido', () => {
      const c = atendidoService.create({ nome: 'Carlos Cliente' });
      if (!c.success) return;

      const s = sessaoService.create({
        atendido_id: c.data.id,
        titulo: 'Primeiro Encontro',
        notas_host: 'Preparação do canvas',
      });

      expect(s.success).toBe(true);
      if (!s.success) return;
      expect(s.data.atendido_id).toBe(c.data.id);
      expect(s.data.status).toBe('ativa');
      expect(s.data.encerrado_em).toBeNull();
      expect(s.data.iniciado_em).toBe(simulatedTime);
    });

    it('rejeita criação de sessão para atendido inexistente (sem sessões órfãs)', () => {
      const s = sessaoService.create({ atendido_id: 'uuid-inexistente-123' });
      expect(s.success).toBe(false);
      if (s.success) return;
      expect(s.error).toBe('NOT_FOUND');
    });

    it('rejeita criação de sessão para atendido inativo (soft deleted)', () => {
      const c = atendidoService.create({ nome: 'Cliente Desativado' });
      if (!c.success) return;
      atendidoService.softDelete(c.data.id);

      const s = sessaoService.create({ atendido_id: c.data.id });
      expect(s.success).toBe(false);
      if (s.success) return;
      expect(s.error).toBe('VALIDATION');
      expect(s.message).toContain('inativo');
    });

    it('encerra sessão ativa marcando status=encerrada e encerrado_em', () => {
      const c = atendidoService.create({ nome: 'Sessao Encerramento' });
      if (!c.success) return;
      const s = sessaoService.create({ atendido_id: c.data.id });
      if (!s.success) return;

      simulatedTime += 1800000; // 30 min depois
      const endRes = sessaoService.encerrar(s.data.id, 'Atendimento concluído com sucesso');
      expect(endRes.success).toBe(true);
      if (!endRes.success) return;
      expect(endRes.data.status).toBe('encerrada');
      expect(endRes.data.encerrado_em).toBe(simulatedTime);
      expect(endRes.data.notas_host).toBe('Atendimento concluído com sucesso');

      // Tentar encerrar de novo é rejeitado
      const endRes2 = sessaoService.encerrar(s.data.id);
      expect(endRes2.success).toBe(false);
      if (endRes2.success) return;
      expect(endRes2.error).toBe('VALIDATION');
    });

    it('lista sessões de um atendido em ordem cronológica decrescente', () => {
      const c = atendidoService.create({ nome: 'Múltiplas Sessões' });
      if (!c.success) return;

      simulatedTime = 1000;
      const s1 = sessaoService.create({ atendido_id: c.data.id, titulo: 'Sessão 1' });
      simulatedTime = 2000;
      const s2 = sessaoService.create({ atendido_id: c.data.id, titulo: 'Sessão 2' });

      if (!s1.success || !s2.success) return;

      const list = sessaoService.listByAtendido(c.data.id);
      expect(list.success).toBe(true);
      if (!list.success) return;
      expect(list.data).toHaveLength(2);
      expect(list.data[0].id).toBe(s2.data.id); // Mais recente primeiro
      expect(list.data[1].id).toBe(s1.data.id);
    });
  });

  describe('ConfigService: Dicionário Dinâmico e Regra Técnica #1', () => {
    it('retorna os valores padrão quando não há configurações no banco', () => {
      const dict = configService.getDictionary();
      expect(dict.success).toBe(true);
      if (!dict.success) return;
      expect(dict.data['rotulo.host']).toBe('Profissional');
      expect(dict.data['rotulo.guest']).toBe('Atendido');
      expect(dict.data['rotulo.sessao']).toBe('Sessão');
    });

    it('permite alterar rótulo do dicionário e reflete no getDictionary', () => {
      const setRes = configService.setLabel('rotulo.guest', 'Paciente');
      expect(setRes.success).toBe(true);

      const dict = configService.getDictionary();
      expect(dict.success).toBe(true);
      if (!dict.success) return;
      expect(dict.data['rotulo.guest']).toBe('Paciente');
      expect(dict.data['rotulo.host']).toBe('Profissional'); // mantém padrão
    });

    it('rejeita alteração de rótulo para o mesmo valor com DUPLICATE (Regra #1)', () => {
      configService.setLabel('rotulo.sessao', 'Consulta');

      const dupRes = configService.setLabel('rotulo.sessao', 'Consulta');
      expect(dupRes.success).toBe(false);
      if (dupRes.success) return;
      expect(dupRes.error).toBe('DUPLICATE');
    });

    it('rejeita chave de rótulo que não inicia com rotulo.', () => {
      const res = configService.setLabel('chave_invalida', 'Valor');
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
    });

    it('rejeita valor de rótulo em branco', () => {
      const res = configService.setLabel('rotulo.host', '   ');
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error).toBe('VALIDATION');
    });
  });
});
