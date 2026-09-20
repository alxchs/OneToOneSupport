-- Migration 001: Esquema inicial do banco de dados (7 tabelas da seção 9 do DOCUMENTO_MESTRE.md)

CREATE TABLE IF NOT EXISTS ConfiguracaoGlobal (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS Atendidos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  contato TEXT,
  email TEXT,
  notas TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  deletado_em INTEGER,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS Sessoes (
  id TEXT PRIMARY KEY,
  atendido_id TEXT NOT NULL,
  titulo TEXT,
  status TEXT NOT NULL,
  iniciado_em INTEGER NOT NULL,
  encerrado_em INTEGER,
  notas_host TEXT,
  FOREIGN KEY(atendido_id) REFERENCES Atendidos(id)
);

CREATE TABLE IF NOT EXISTS Sessoes_Revisoes (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  numero_versao INTEGER NOT NULL,
  snapshot_evento_idx INTEGER NOT NULL,
  titulo TEXT,
  criado_em INTEGER NOT NULL,
  autor TEXT NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);

CREATE TABLE IF NOT EXISTS Abas (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  asset_id TEXT,
  titulo TEXT,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);

CREATE TABLE IF NOT EXISTS Eventos (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  aba_id TEXT,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  autor TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);

CREATE TABLE IF NOT EXISTS Assets (
  id TEXT PRIMARY KEY,
  sessao_id TEXT,
  tipo TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  hash_sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);

-- Índices em colunas de Foreign Key e consulta para desempenho (sem restrições UNIQUE substitutivas)
CREATE INDEX IF NOT EXISTS idx_sessoes_atendido_id ON Sessoes(atendido_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_revisoes_sessao_id ON Sessoes_Revisoes(sessao_id);
CREATE INDEX IF NOT EXISTS idx_abas_sessao_id ON Abas(sessao_id);
CREATE INDEX IF NOT EXISTS idx_eventos_sessao_id ON Eventos(sessao_id);
CREATE INDEX IF NOT EXISTS idx_assets_sessao_id ON Assets(sessao_id);
