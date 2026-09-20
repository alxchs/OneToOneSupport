import React, { useState } from 'react';
import { useHostStore } from '../store/useHostStore';

export const FormAtendidoPage: React.FC = () => {
  const {
    formMode,
    selectedAtendido,
    dicionario,
    carregando,
    erroDuplicado,
    setView,
    salvarAtendido,
  } = useHostStore();

  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';

  const [nome, setNome] = useState(formMode === 'edit' && selectedAtendido ? selectedAtendido.nome : '');
  const [contato, setContato] = useState(
    formMode === 'edit' && selectedAtendido && selectedAtendido.contato ? selectedAtendido.contato : ''
  );
  const [email, setEmail] = useState(
    formMode === 'edit' && selectedAtendido && selectedAtendido.email ? selectedAtendido.email : ''
  );
  const [notas, setNotas] = useState(
    formMode === 'edit' && selectedAtendido && selectedAtendido.notas ? selectedAtendido.notas : ''
  );
  const [validacaoLocal, setValidacaoLocal] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setValidacaoLocal('O nome é obrigatório.');
      return;
    }
    setValidacaoLocal(null);

    await salvarAtendido({
      nome: nome.trim(),
      contato: contato.trim() ? contato.trim() : null,
      email: email.trim() ? email.trim() : null,
      notas: notas.trim() ? notas.trim() : null,
    });
  };

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', width: '100%' }}>
      <div
        style={{
          backgroundColor: '#111c44',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        }}
      >
        <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#38bdf8', fontWeight: 700 }}>
            {formMode === 'create' ? `Novo ${rotuloGuest}` : `Editar ${rotuloGuest}`}
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Preencha os dados do {rotuloGuest.toLowerCase()}. Regra Técnica #1: inserções e atualizações são
            validadas atomicamente contra duplicatas no SQLite.
          </p>
        </header>

        {/* Alerta de Duplicidade */}
        {erroDuplicado && (
          <div
            id="alerta-duplicado"
            style={{
              marginBottom: '1.5rem',
              padding: '1rem 1.25rem',
              backgroundColor: '#451a03',
              border: '1px solid #b45309',
              borderRadius: '0.5rem',
              color: '#fef3c7',
              fontSize: '0.9375rem',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ display: 'block', color: '#f59e0b', marginBottom: '0.25rem' }}>
              ⚠️ Registro Duplicado Detectado
            </strong>
            {erroDuplicado}
          </div>
        )}

        {/* Validação de campo */}
        {validacaoLocal && (
          <div
            id="alerta-validacao"
            style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#291500',
              border: '1px solid #ea580c',
              borderRadius: '0.5rem',
              color: '#fed7aa',
              fontSize: '0.875rem',
            }}
          >
            {validacaoLocal}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label
              htmlFor="input-nome"
              style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1', fontWeight: 600 }}
            >
              Nome Completo *
            </label>
            <input
              id="input-nome"
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Maria Souza"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '0.9375rem',
                borderRadius: '0.5rem',
                backgroundColor: '#0c1322',
                border: '1px solid #334155',
                color: '#f8fafc',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label
                htmlFor="input-contato"
                style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}
              >
                Contato (WhatsApp / Tel)
              </label>
              <input
                id="input-contato"
                type="text"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="Ex.: (11) 98765-4321"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  borderRadius: '0.5rem',
                  backgroundColor: '#0c1322',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="input-email"
                style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}
              >
                Email
              </label>
              <input
                id="input-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex.: maria@exemplo.com"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  borderRadius: '0.5rem',
                  backgroundColor: '#0c1322',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="input-notas"
              style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}
            >
              Observações / Notas Cadastrais
            </label>
            <textarea
              id="input-notas"
              rows={4}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Histórico, anotações de perfil, objetivos do atendimento..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '0.9375rem',
                borderRadius: '0.5rem',
                backgroundColor: '#0c1322',
                border: '1px solid #334155',
                color: '#f8fafc',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button
              type="button"
              id="btn-cancelar-atendido"
              onClick={() => setView('lista')}
              disabled={carregando}
              style={{
                padding: '0.75rem 1.25rem',
                fontSize: '0.9375rem',
                borderRadius: '0.5rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              id="btn-salvar-atendido"
              disabled={carregando}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                borderRadius: '0.5rem',
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                opacity: carregando ? 0.7 : 1,
              }}
            >
              {carregando ? 'Salvando...' : 'Salvar Cadastro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
