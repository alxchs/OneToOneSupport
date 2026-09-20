-- Migration 002: Imutabilidade estrita (Append-Only) e indexação da tabela Eventos (Mestre §4, §8, §9)

-- Índice composto para recuperação cronológica otimizada de eventos por sessão
CREATE INDEX IF NOT EXISTS idx_eventos_sessao_criado_em ON Eventos(sessao_id, criado_em);

-- Trigger que bloqueia e aborta qualquer tentativa de UPDATE na tabela Eventos
CREATE TRIGGER IF NOT EXISTS trg_eventos_prevent_update
BEFORE UPDATE ON Eventos
BEGIN
  SELECT RAISE(ABORT, 'Eventos e append-only: UPDATE proibido');
END;

-- Trigger que bloqueia e aborta qualquer tentativa de DELETE na tabela Eventos
CREATE TRIGGER IF NOT EXISTS trg_eventos_prevent_delete
BEFORE DELETE ON Eventos
BEGIN
  SELECT RAISE(ABORT, 'Eventos e append-only: DELETE proibido');
END;
