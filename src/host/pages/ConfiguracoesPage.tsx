import React, { useState, useEffect } from 'react';
import { useHostStore } from '../store/useHostStore';

export const ConfiguracoesPage: React.FC = () => {
  const { dicionario, carregarDicionario, salvarRotulo, carregando } = useHostStore();

  const [rotuloHost, setRotuloHost] = useState('');
  const [rotuloGuest, setRotuloGuest] = useState('');
  const [rotuloSessao, setRotuloSessao] = useState('');

  useEffect(() => {
    carregarDicionario();
  }, [carregarDicionario]);

  useEffect(() => {
    setRotuloHost(dicionario['rotulo.host'] || 'Profissional');
    setRotuloGuest(dicionario['rotulo.guest'] || 'Atendido');
    setRotuloSessao(dicionario['rotulo.sessao'] || 'Sessão');
  }, [dicionario]);

  const handleSalvarHost = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarRotulo('rotulo.host', rotuloHost.trim());
  };

  const handleSalvarGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarRotulo('rotulo.guest', rotuloGuest.trim());
  };

  const handleSalvarSessao = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarRotulo('rotulo.sessao', rotuloSessao.trim());
  };

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <div
        style={{
          backgroundColor: '#111c44',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
          padding: '2rem',
        }}
      >
        <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#38bdf8', fontWeight: 700 }}>
            Dicionário Dinâmico (White-Label)
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Personalize a nomenclatura da plataforma de acordo com sua profissão (ex.: Psicólogo/Paciente,
            Professor/Aluno, Mentor/Mentorado). Persistido na tabela <code>ConfiguracaoGlobal</code> com validação
            estrita de duplicidade (Regra #1).
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Rótulo Host */}
          <form
            onSubmit={handleSalvarHost}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              backgroundColor: '#0c1322',
              padding: '1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #1e293b',
            }}
          >
            <label
              htmlFor="input-rotulo-host"
              style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}
            >
              Rótulo do Operador Host (Chave: <code>rotulo.host</code>)
            </label>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Define como o profissional é chamado no sistema. Padrão: "Profissional" ou "Host".
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <input
                id="input-rotulo-host"
                type="text"
                value={rotuloHost}
                onChange={(e) => setRotuloHost(e.target.value)}
                placeholder="Ex.: Terapeuta, Consultor, Psicólogo..."
                style={{
                  flex: 1,
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.9375rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#111c44',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                }}
              />
              <button
                type="submit"
                id="btn-salvar-rotulo-host"
                disabled={carregando}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Salvar
              </button>
            </div>
          </form>

          {/* Rótulo Guest */}
          <form
            onSubmit={handleSalvarGuest}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              backgroundColor: '#0c1322',
              padding: '1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #1e293b',
            }}
          >
            <label
              htmlFor="input-rotulo-guest"
              style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}
            >
              Rótulo da Pessoa Atendida (Chave: <code>rotulo.guest</code>)
            </label>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Define como a pessoa atendida é identificada na interface. Padrão: "Atendido" ou "Paciente".
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <input
                id="input-rotulo-guest"
                type="text"
                value={rotuloGuest}
                onChange={(e) => setRotuloGuest(e.target.value)}
                placeholder="Ex.: Paciente, Aluno, Mentorado, Cliente..."
                style={{
                  flex: 1,
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.9375rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#111c44',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                }}
              />
              <button
                type="submit"
                id="btn-salvar-rotulo-guest"
                disabled={carregando}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Salvar
              </button>
            </div>
          </form>

          {/* Rótulo Sessão */}
          <form
            onSubmit={handleSalvarSessao}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              backgroundColor: '#0c1322',
              padding: '1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #1e293b',
            }}
          >
            <label
              htmlFor="input-rotulo-sessao"
              style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}
            >
              Rótulo do Atendimento (Chave: <code>rotulo.sessao</code>)
            </label>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Define o termo para cada encontro/sessão. Padrão: "Sessão" ou "Consulta".
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <input
                id="input-rotulo-sessao"
                type="text"
                value={rotuloSessao}
                onChange={(e) => setRotuloSessao(e.target.value)}
                placeholder="Ex.: Consulta, Aula, Encontro, Atendimento..."
                style={{
                  flex: 1,
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.9375rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#111c44',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                }}
              />
              <button
                type="submit"
                id="btn-salvar-rotulo-sessao"
                disabled={carregando}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
