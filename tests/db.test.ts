import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { initDb, closeDb } from '../electron/db/connection';
import {
  createAtendido,
  updateAtendido,
  getAtendidoById,
} from '../electron/db/repositories/atendido.repo';
import {
  setConfig,
  getConfig,
} from '../electron/db/repositories/configuracao.repo';
import { Database as DatabaseType } from 'better-sqlite3';

describe('Fase 01 - Scaffolding e Banco de Dados (SQLite)', () => {
  let db: DatabaseType;

  beforeEach(() => {
    // Usar banco em memória para isolamento dos testes com migrações aplicadas
    db = initDb({ dbPath: ':memory:' });
  });

  afterAll(() => {
    closeDb();
  });

  describe('8. As 7 tabelas existem com as colunas exatas (Seção 9 do DOCUMENTO_MESTRE.md)', () => {
    it('deve conter exatamente as 7 tabelas de negócio e a tabela de controle de migrações', () => {
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[];
      const tableNames = rows.map((r) => r.name);

      const expectedTables = [
        'Abas',
        'Assets',
        'Atendidos',
        'ConfiguracaoGlobal',
        'Eventos',
        'Sessoes',
        'Sessoes_Revisoes',
        '_migrations',
      ];

      expect(tableNames.sort()).toEqual(expectedTables.sort());
    });

    it('tabela ConfiguracaoGlobal deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(ConfiguracaoGlobal)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'chave', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'valor', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'atualizado_em', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
    });

    it('tabela Atendidos deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Atendidos)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'nome', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'contato', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'email', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'notas', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'ativo', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'deletado_em', type: 'INTEGER', notnull: 0, pk: 0 },
        { name: 'criado_em', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'atualizado_em', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
    });

    it('tabela Sessoes deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Sessoes)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'atendido_id', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'titulo', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'status', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'iniciado_em', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'encerrado_em', type: 'INTEGER', notnull: 0, pk: 0 },
        { name: 'notas_host', type: 'TEXT', notnull: 0, pk: 0 },
      ]);
    });

    it('tabela Sessoes_Revisoes deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Sessoes_Revisoes)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'sessao_id', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'numero_versao', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'snapshot_evento_idx', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'titulo', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'criado_em', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'autor', type: 'TEXT', notnull: 1, pk: 0 },
      ]);
    });

    it('tabela Abas deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Abas)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'sessao_id', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'tipo', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'ordem', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'asset_id', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'titulo', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'criado_em', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
    });

    it('tabela Eventos deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Eventos)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'sessao_id', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'aba_id', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'tipo', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'payload', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'autor', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'criado_em', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
    });

    it('tabela Assets deve ter as colunas exatas da seção 9', () => {
      const cols = db.prepare('PRAGMA table_info(Assets)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      expect(cols.map((c) => ({ name: c.name, type: c.type.toUpperCase(), notnull: c.notnull, pk: c.pk }))).toEqual([
        { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
        { name: 'sessao_id', type: 'TEXT', notnull: 0, pk: 0 },
        { name: 'tipo', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'mime', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'tamanho', type: 'INTEGER', notnull: 1, pk: 0 },
        { name: 'hash_sha256', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'path', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'criado_em', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
    });
  });

  describe('Atendidos Repository - Regra Técnica #1 (NOT EXISTS / IS ?)', () => {
    it('1. deve criar um novo atendido com sucesso (insert novo)', () => {
      const result = createAtendido(
        {
          nome: 'Alexandre Chagas',
          contato: '+55 11 98888-7777',
          email: 'alexandre@example.com',
          notas: 'Paciente de teste',
        },
        db
      );

      expect(result.created).toBe(true);
      if (result.created) {
        expect(result.id).toBeDefined();
        const record = getAtendidoById(result.id, db);
        expect(record).not.toBeNull();
        expect(record?.nome).toBe('Alexandre Chagas');
        expect(record?.ativo).toBe(1);
        expect(record?.deletado_em).toBeNull();
      }
    });

    it('2. deve rejeitar duplicado exato retornando existingId', () => {
      const dados = {
        nome: 'Carlos Silva',
        contato: '11999991111',
        email: 'carlos@test.com',
        notas: 'Notas iniciais',
      };

      const primeiro = createAtendido(dados, db);
      expect(primeiro.created).toBe(true);

      const segundo = createAtendido(dados, db);
      expect(segundo.created).toBe(false);
      if (!segundo.created) {
        expect(segundo.reason).toBe('DUPLICATE');
        if (primeiro.created) {
          expect(segundo.existingId).toBe(primeiro.id);
        }
      }

      // Garantir que existe apenas 1 registro no banco
      const total = db
        .prepare('SELECT COUNT(*) as count FROM Atendidos WHERE nome = ?')
        .get(dados.nome) as { count: number };
      expect(total.count).toBe(1);
    });

    it('3. deve rejeitar duplicado com contato/email/notas NULL (o caso que = deixaria passar)', () => {
      const dadosComNull = {
        nome: 'Maria Nula',
        contato: null,
        email: null,
        notas: null,
      };

      const primeiro = createAtendido(dadosComNull, db);
      expect(primeiro.created).toBe(true);

      // Com '=' no SQL, NULL = NULL avalia como falso e permitiria duplicar.
      // Com 'IS ?', a igualdade de nulos é respeitada.
      const segundo = createAtendido(dadosComNull, db);
      expect(segundo.created).toBe(false);
      if (!segundo.created) {
        expect(segundo.reason).toBe('DUPLICATE');
        if (primeiro.created) {
          expect(segundo.existingId).toBe(primeiro.id);
        }
      }

      // Testar também com campos nulos parciais
      const dadosParciais = {
        nome: 'João Parcial',
        contato: '11988880000',
        email: null,
        notas: null,
      };
      const p1 = createAtendido(dadosParciais, db);
      expect(p1.created).toBe(true);

      const p2 = createAtendido(dadosParciais, db);
      expect(p2.created).toBe(false);
      if (!p2.created) {
        expect(p2.reason).toBe('DUPLICATE');
      }
    });

    it('4. deve permitir criação se houver diferença em pelo menos um único campo de negócio', () => {
      const base = {
        nome: 'Pessoa Base',
        contato: '11111111',
        email: 'base@test.com',
        notas: 'Nota base',
      };
      const rBase = createAtendido(base, db);
      expect(rBase.created).toBe(true);

      // Diferente no contato
      const rContato = createAtendido({ ...base, contato: '22222222' }, db);
      expect(rContato.created).toBe(true);

      // Diferente no email
      const rEmail = createAtendido({ ...base, email: 'outro@test.com' }, db);
      expect(rEmail.created).toBe(true);

      // Diferente nas notas
      const rNotas = createAtendido({ ...base, notas: 'Nota modificada' }, db);
      expect(rNotas.created).toBe(true);

      // Diferente no nome
      const rNome = createAtendido({ ...base, nome: 'Pessoa Outra' }, db);
      expect(rNome.created).toBe(true);
    });

    it('5. update que geraria duplicata com outro registro existente é rejeitado', () => {
      const atendidoA = createAtendido(
        {
          nome: 'Atendido A',
          contato: '1111',
          email: 'a@test.com',
          notas: 'Notas A',
        },
        db
      );
      expect(atendidoA.created).toBe(true);

      const atendidoB = createAtendido(
        {
          nome: 'Atendido B',
          contato: '2222',
          email: 'b@test.com',
          notas: 'Notas B',
        },
        db
      );
      expect(atendidoB.created).toBe(true);

      if (atendidoA.created && atendidoB.created) {
        // Tentar atualizar Atendido B para ficar com os exatos dados de Atendido A
        const updateResult = updateAtendido(
          atendidoB.id,
          {
            nome: 'Atendido A',
            contato: '1111',
            email: 'a@test.com',
            notas: 'Notas A',
          },
          db
        );

        expect(updateResult.updated).toBe(false);
        if (!updateResult.updated && updateResult.reason === 'DUPLICATE') {
          expect(updateResult.reason).toBe('DUPLICATE');
          expect(updateResult.existingId).toBe(atendidoA.id);
        }

        // Atualização para valores únicos deve ser permitida
        const updateOk = updateAtendido(
          atendidoB.id,
          {
            nome: 'Atendido B Atualizado',
          },
          db
        );
        expect(updateOk.updated).toBe(true);
      }
    });

    it('6. rodar createAtendido 1000x com os mesmos dados deixa exatamente 1 linha no banco', () => {
      const dadosStress = {
        nome: 'Stress Test User',
        contato: '999999999',
        email: 'stress@test.com',
        notas: '1000 iteracoes',
      };

      let sucessos = 0;
      let duplicatas = 0;

      for (let i = 0; i < 1000; i++) {
        const res = createAtendido(dadosStress, db);
        if (res.created) {
          sucessos++;
        } else if (res.reason === 'DUPLICATE') {
          duplicatas++;
        }
      }

      expect(sucessos).toBe(1);
      expect(duplicatas).toBe(999);

      const row = db
        .prepare('SELECT COUNT(*) as total FROM Atendidos WHERE nome = ?')
        .get(dadosStress.nome) as { total: number };
      expect(row.total).toBe(1);
    });
  });

  describe('ConfiguracaoGlobal Repository - Regra Técnica #1', () => {
    it('7. setConfig rejeita duplicata de valor e 1000x deixa exatamente 1 linha', () => {
      const chave = 'sistema.titulo';
      const valor = 'OneToOneSupport Host';

      const r1 = setConfig(chave, valor, db);
      expect(r1.success).toBe(true);
      if (r1.success) {
        expect(r1.action).toBe('created');
      }

      // Mesma chave e mesmo valor é duplicado
      const r2 = setConfig(chave, valor, db);
      expect(r2.success).toBe(false);
      if (!r2.success) {
        expect(r2.reason).toBe('DUPLICATE');
      }

      // Rodar 1000x com a mesma chave e mesmo valor
      const chaveStress = 'stress.config';
      const valorStress = 'valor_fixo';

      let sucessos = 0;
      let duplicatas = 0;

      for (let i = 0; i < 1000; i++) {
        const res = setConfig(chaveStress, valorStress, db);
        if (res.success) {
          sucessos++;
        } else if (res.reason === 'DUPLICATE') {
          duplicatas++;
        }
      }

      expect(sucessos).toBe(1);
      expect(duplicatas).toBe(999);

      const count = db
        .prepare('SELECT COUNT(*) as total FROM ConfiguracaoGlobal WHERE chave = ?')
        .get(chaveStress) as { total: number };
      expect(count.total).toBe(1);

      // Atualizar para valor diferente deve funcionar
      const rUpdate = setConfig(chave, 'Novo Titulo Modificado', db);
      expect(rUpdate.success).toBe(true);
      if (rUpdate.success) {
        expect(rUpdate.action).toBe('updated');
      }
      expect(getConfig(chave, db)).toBe('Novo Titulo Modificado');
    });
  });
});
