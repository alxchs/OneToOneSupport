import React, { useEffect } from 'react';
import { useHostStore } from '../store/useHostStore';

export const ListaAtendidosPage: React.FC = () => {
  const {
    atendidos,
    filtroBusca,
    apenasAtivos,
    dicionario,
    carregando,
    setFiltroBusca,
    setApenasAtivos,
    carregarAtendidos,
    abrirFormularioCriacao,
    abrirFormularioEdicao,
    selecionarAtendido,
    desativarAtendido,
    reativarAtendido,
    purgarAtendido,
  } = useHostStore();

  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';

  useEffect(() => {
    carregarAtendidos();
  }, [carregarAtendidos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Barra de Ações Superior */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          backgroundColor: '#111c44',
          padding: '1.25rem 1.5rem',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', flex: 1 }}>
          <input
            id="input-busca-atendido"
            type="text"
            placeholder={`Buscar ${rotuloGuest.toLowerCase()} por nome, contato ou email...`}
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            style={{
              padding: '0.625rem 1rem',
              fontSize: '0.9375rem',
              borderRadius: '0.5rem',
              backgroundColor: '#0c1322',
              border: '1px solid #334155',
              color: '#f8fafc',
              minWidth: '18rem',
              flex: '1 1 18rem',
              outline: 'none',
            }}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: '#94a3b8',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              id="check-apenas-ativos"
              type="checkbox"
              checked={apenasAtivos}
              onChange={(e) => setApenasAtivos(e.target.checked)}
              style={{ width: '1.125rem', height: '1.125rem', cursor: 'pointer' }}
            />
            Exibir somente ativos
          </label>
        </div>

        <button
          id="btn-novo-atendido"
          onClick={abrirFormularioCriacao}
          style={{
            padding: '0.625rem 1.25rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            borderRadius: '0.5rem',
            backgroundColor: '#0284c7',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
          }}
        >
          <span>+</span> Novo {rotuloGuest}
        </button>
      </div>

      {/* Lista / Tabela */}
      <div
        style={{
          backgroundColor: '#111c44',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.125rem', color: '#f8fafc', fontWeight: 600 }}>
            {rotuloGuest}s Cadastrados ({atendidos.length})
          </h2>
          {carregando && <span style={{ fontSize: '0.875rem', color: '#38bdf8' }}>Carregando dados...</span>}
        </div>

        {atendidos.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ margin: 0, fontSize: '1rem' }}>
              Nenhum {rotuloGuest.toLowerCase()} encontrado com os filtros atuais.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#0c1322', color: '#94a3b8', fontSize: '0.8125rem' }}>
                  <th style={{ padding: '0.875rem 1.5rem' }}>Nome</th>
                  <th style={{ padding: '0.875rem 1rem' }}>Contato</th>
                  <th style={{ padding: '0.875rem 1rem' }}>Email</th>
                  <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.875rem 1.5rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {atendidos.map((atendido, idx) => {
                  const isAtivo = atendido.ativo === 1;
                  return (
                    <tr
                      key={atendido.id}
                      id={`item-atendido-${atendido.id}`}
                      data-nome={atendido.nome}
                      style={{
                        borderTop: '1px solid #1e293b',
                        backgroundColor: idx % 2 === 0 ? '#111c44' : '#0e1738',
                        opacity: isAtivo ? 1 : 0.65,
                      }}
                    >
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#f8fafc' }}>
                        <div>{atendido.nome}</div>
                        {atendido.notas && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {atendido.notas.length > 50 ? `${atendido.notas.slice(0, 50)}...` : atendido.notas}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1rem', color: '#cbd5e1', fontSize: '0.875rem' }}>
                        {atendido.contato || '—'}
                      </td>
                      <td style={{ padding: '1rem 1rem', color: '#cbd5e1', fontSize: '0.875rem' }}>
                        {atendido.email || '—'}
                      </td>
                      <td style={{ padding: '1rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.25rem 0.625rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: isAtivo ? '#064e3b' : '#334155',
                            color: isAtivo ? '#34d399' : '#94a3b8',
                          }}
                        >
                          {isAtivo ? 'Ativo' : 'Desativado'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            id={`btn-ver-detalhes-${atendido.id}`}
                            onClick={() => selecionarAtendido(atendido.id)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.8125rem',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              color: '#38bdf8',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                            }}
                          >
                            Sessões
                          </button>
                          <button
                            id={`btn-editar-atendido-${atendido.id}`}
                            onClick={() => abrirFormularioEdicao(atendido)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.8125rem',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              color: '#f8fafc',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                            }}
                          >
                            Editar
                          </button>
                          {isAtivo ? (
                            <button
                              id={`btn-desativar-atendido-${atendido.id}`}
                              onClick={() => desativarAtendido(atendido.id)}
                              style={{
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.8125rem',
                                backgroundColor: '#451a03',
                                border: '1px solid #b45309',
                                color: '#fef3c7',
                                borderRadius: '0.375rem',
                                cursor: 'pointer',
                              }}
                            >
                              Desativar
                            </button>
                          ) : (
                            <>
                              <button
                                id={`btn-reativar-atendido-${atendido.id}`}
                                onClick={() => reativarAtendido(atendido.id)}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  fontSize: '0.8125rem',
                                  backgroundColor: '#064e3b',
                                  border: '1px solid #059669',
                                  color: '#34d399',
                                  borderRadius: '0.375rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Reativar
                              </button>
                              <button
                                id={`btn-purgar-atendido-${atendido.id}`}
                                onClick={() => purgarAtendido(atendido.id)}
                                title="Purga física só se sessões encerradas há > 10 anos"
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  fontSize: '0.8125rem',
                                  backgroundColor: '#1c1917',
                                  border: '1px solid #78716c',
                                  color: '#d6d3d1',
                                  borderRadius: '0.375rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Purgar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
