import React, { useState, useEffect } from 'react';
import { useHostStore } from '../store/useHostStore';

export const DetalheAtendidoPage: React.FC = () => {
  const {
    selectedAtendido,
    sessoes,
    dicionario,
    carregando,
    activeServerSession,
    setView,
    abrirFormularioEdicao,
    desativarAtendido,
    reativarAtendido,
    purgarAtendido,
    criarSessao,
    encerrarSessao,
    iniciarServidorSessao,
    encerrarServidorSessao,
    selecionarIpServidor,
    carregarStatusServidor,
    abrirQuadroSessao,
  } = useHostStore();

  const [mostrarFormSessao, setMostrarFormSessao] = useState(false);
  const [tituloSessao, setTituloSessao] = useState('');
  const [notasSessao, setNotasSessao] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    carregarStatusServidor();
    if (window.desktopAPI?.serverSession?.onStatusChange) {
      const unsub = window.desktopAPI.serverSession.onStatusChange((status) => {
        useHostStore.setState({ activeServerSession: status });
      });
      return unsub;
    }
  }, [carregarStatusServidor]);

  const copiarLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  if (!selectedAtendido) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
        <p>Nenhum atendido selecionado.</p>
        <button
          onClick={() => setView('lista')}
          style={{
            marginTop: '1rem',
            padding: '0.625rem 1.25rem',
            backgroundColor: '#0284c7',
            border: 'none',
            color: '#fff',
            borderRadius: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Voltar para Lista
        </button>
      </div>
    );
  }

  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';
  const rotuloSessao = dicionario['rotulo.sessao'] || 'Sessão';
  const isAtivo = selectedAtendido.ativo === 1;

  const handleCriarSessao = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await criarSessao({
      atendido_id: selectedAtendido.id,
      titulo: tituloSessao.trim() ? tituloSessao.trim() : null,
      notas_host: notasSessao.trim() ? notasSessao.trim() : null,
    });
    if (ok) {
      setTituloSessao('');
      setNotasSessao('');
      setMostrarFormSessao(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Botão Voltar */}
      <div>
        <button
          id="btn-voltar-lista"
          onClick={() => setView('lista')}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#94a3b8',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          ← Voltar para {rotuloGuest}s
        </button>
      </div>

      {/* Card do Atendido */}
      <div
        style={{
          backgroundColor: '#111c44',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#f8fafc', fontWeight: 700 }}>
                {selectedAtendido.nome}
              </h2>
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
            </div>
            <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.8125rem' }}>
              ID: {selectedAtendido.id} • Cadastrado em:{' '}
              {new Date(selectedAtendido.criado_em).toLocaleDateString()}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              id="btn-editar-detalhe"
              onClick={() => abrirFormularioEdicao(selectedAtendido)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Editar Dados
            </button>
            {isAtivo ? (
              <button
                id="btn-status-detalhe"
                onClick={() => desativarAtendido(selectedAtendido.id)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
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
                  id="btn-status-detalhe"
                  onClick={() => reativarAtendido(selectedAtendido.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
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
                  id="btn-purgar-detalhe"
                  onClick={() => purgarAtendido(selectedAtendido.id)}
                  title="Purga física só se sessões encerradas há > 10 anos"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#1c1917',
                    border: '1px solid #78716c',
                    color: '#d6d3d1',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                >
                  Purgar Registro
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #1e293b' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contato
            </span>
            <p style={{ margin: '0.25rem 0 0 0', color: '#e2e8f0', fontSize: '0.9375rem' }}>
              {selectedAtendido.contato || 'Não informado'}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email
            </span>
            <p style={{ margin: '0.25rem 0 0 0', color: '#e2e8f0', fontSize: '0.9375rem' }}>
              {selectedAtendido.email || 'Não informado'}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Última Atualização
            </span>
            <p style={{ margin: '0.25rem 0 0 0', color: '#e2e8f0', fontSize: '0.9375rem' }}>
              {new Date(selectedAtendido.atualizado_em).toLocaleString()}
            </p>
          </div>
        </div>

        {selectedAtendido.notas && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #1e293b' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notas
            </span>
            <p style={{ margin: '0.25rem 0 0 0', color: '#cbd5e1', fontSize: '0.9375rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {selectedAtendido.notas}
            </p>
          </div>
        )}
      </div>

      {/* Seção de Sessões */}
      <div
        style={{
          backgroundColor: '#111c44',
          borderRadius: '0.75rem',
          border: '1px solid #1e293b',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: 600 }}>
              Histórico de {rotuloSessao}s ({sessoes.length})
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.8125rem' }}>
              Gerencie atendimentos em andamento e encerrados para este cadastro.
            </p>
          </div>

          {isAtivo && !mostrarFormSessao && (
            <button
              id="btn-abrir-nova-sessao"
              onClick={() => setMostrarFormSessao(true)}
              style={{
                padding: '0.5rem 1.125rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#fff',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              + Iniciar Nova {rotuloSessao}
            </button>
          )}
        </div>

        {/* Formulário Inline de Início de Sessão */}
        {mostrarFormSessao && (
          <form
            onSubmit={handleCriarSessao}
            style={{
              backgroundColor: '#0c1322',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#38bdf8' }}>
              Iniciar Nova {rotuloSessao}
            </h4>

            <div>
              <label
                htmlFor="input-titulo-sessao"
                style={{ display: 'block', fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '0.375rem' }}
              >
                Título ou Objetivo da {rotuloSessao} (Opcional)
              </label>
              <input
                id="input-titulo-sessao"
                type="text"
                value={tituloSessao}
                onChange={(e) => setTituloSessao(e.target.value)}
                placeholder="Ex.: Alinhamento inicial / Exercício diagnóstico"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#111c44',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="input-notas-sessao"
                style={{ display: 'block', fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '0.375rem' }}
              >
                Notas Iniciais do Host (Privado)
              </label>
              <textarea
                id="input-notas-sessao"
                rows={2}
                value={notasSessao}
                onChange={(e) => setNotasSessao(e.target.value)}
                placeholder="Observações preparatórias para o atendimento..."
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#111c44',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                id="btn-cancelar-sessao"
                onClick={() => setMostrarFormSessao(false)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8125rem',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                id="btn-confirmar-sessao"
                disabled={carregando}
                style={{
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                Confirmar Início
              </button>
            </div>
          </form>
        )}

        {/* Lista de Sessões */}
        {sessoes.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9375rem', textAlign: 'center', padding: '2rem 0' }}>
            Nenhuma {rotuloSessao.toLowerCase()} registrada até o momento.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessoes.map((s) => {
              const ativa = s.status === 'ativa';
              return (
                <div
                  key={s.id}
                  id={`item-sessao-${s.id}`}
                  style={{
                    backgroundColor: '#0c1322',
                    borderRadius: '0.5rem',
                    border: '1px solid #1e293b',
                    padding: '1.25rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: '1 1 15rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>
                        {s.titulo || `${rotuloSessao} sem título`}
                      </span>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: ativa ? '#075985' : '#334155',
                          color: ativa ? '#38bdf8' : '#94a3b8',
                        }}
                      >
                        {ativa ? 'Em Andamento' : 'Encerrada'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.375rem' }}>
                      Iniciada: {new Date(s.iniciado_em).toLocaleString()}
                      {s.encerrado_em && ` • Encerrada: ${new Date(s.encerrado_em).toLocaleString()}`}
                    </div>

                    {s.notas_host && (
                      <div style={{ fontSize: '0.8125rem', color: '#cbd5e1', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        "{s.notas_host}"
                      </div>
                    )}
                  </div>

                  {ativa && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        id={`btn-abrir-quadro-${s.id}`}
                        onClick={() => abrirQuadroSessao(s.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          backgroundColor: '#059669',
                          border: '1px solid #10b981',
                          color: '#ffffff',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                        }}
                      >
                        Abrir Quadro Branco
                      </button>
                      {(!activeServerSession || activeServerSession.sessaoId !== s.id) && (
                        <button
                          id={`btn-iniciar-servidor-${s.id}`}
                          onClick={() => iniciarServidorSessao(s.id, selectedAtendido.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            backgroundColor: '#0284c7',
                            border: '1px solid #0369a1',
                            color: '#ffffff',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                          }}
                        >
                          Abrir Sala (Servidor LAN)
                        </button>
                      )}
                      <button
                        id={`btn-encerrar-sessao-${s.id}`}
                        onClick={() => encerrarSessao(s.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          backgroundColor: '#451a03',
                          border: '1px solid #b45309',
                          color: '#fef3c7',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                        }}
                      >
                        Encerrar {rotuloSessao}
                      </button>
                    </div>
                  )}

                  {!ativa && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        id={`btn-rever-quadro-${s.id}`}
                        onClick={() => abrirQuadroSessao(s.id, { somenteLeitura: true })}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          color: '#f8fafc',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                        }}
                      >
                        Ver quadro (somente leitura)
                      </button>
                    </div>
                  )}

                  {/* Painel da Sala de Atendimento / Servidor Ativo */}
                  {ativa && activeServerSession && activeServerSession.sessaoId === s.id && (
                    <div
                      id="painel-sala-servidor"
                      style={{
                        width: '100%',
                        marginTop: '1rem',
                        padding: '1.25rem',
                        backgroundColor: '#111c44',
                        border: '1px solid #0284c7',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}>
                            Sala de Atendimento 1:1
                          </span>
                          <span
                            id="badge-status-conexao"
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor:
                                activeServerSession.status === 'conectado'
                                  ? '#064e3b'
                                  : activeServerSession.status === 'reconectando'
                                  ? '#451a03'
                                  : '#0c4a6e',
                              color:
                                activeServerSession.status === 'conectado'
                                  ? '#34d399'
                                  : activeServerSession.status === 'reconectando'
                                  ? '#fef3c7'
                                  : '#38bdf8',
                            }}
                          >
                            {activeServerSession.status === 'conectado'
                              ? 'Convidado Conectado (E2EE Ativo)'
                              : activeServerSession.status === 'reconectando'
                              ? 'Reconectando Convidado...'
                              : 'Aguardando Convidado...'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                            Porta Local: {activeServerSession.port}
                          </span>
                          <button
                            id="btn-abrir-quadro-servidor"
                            type="button"
                            onClick={() => abrirQuadroSessao(s.id)}
                            style={{
                              padding: '0.25rem 0.625rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: '#059669',
                              border: '1px solid #10b981',
                              color: '#ffffff',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                            }}
                          >
                            Abrir Quadro Branco
                          </button>
                          <button
                            id="btn-fechar-sala-servidor"
                            type="button"
                            onClick={() => encerrarServidorSessao()}
                            style={{
                              padding: '0.25rem 0.625rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              color: '#cbd5e1',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                            }}
                          >
                            Fechar Sala LAN
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
                        {/* Imagem do QR Code */}
                        {activeServerSession.qrDataUrl && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <img
                              id="img-qrcode-sessao"
                              src={activeServerSession.qrDataUrl}
                              alt="QR Code do Convite"
                              style={{
                                width: '130px',
                                height: '130px',
                                backgroundColor: '#ffffff',
                                padding: '6px',
                                borderRadius: '0.375rem',
                                border: '1px solid #334155',
                              }}
                            />
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Escanear no celular</span>
                          </div>
                        )}

                        {/* Dados de Conexão: Link e Seletor de IP */}
                        <div style={{ flex: '1 1 18rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div>
                            <label
                              htmlFor="input-url-convite"
                              style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                            >
                              Link de Convite para o {rotuloGuest}
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                id="input-url-convite"
                                type="text"
                                readOnly
                                value={activeServerSession.inviteUrl}
                                style={{
                                  flex: 1,
                                  padding: '0.5rem 0.75rem',
                                  fontSize: '0.8125rem',
                                  backgroundColor: '#0c1322',
                                  border: '1px solid #334155',
                                  borderRadius: '0.375rem',
                                  color: '#38bdf8',
                                  fontFamily: 'monospace',
                                }}
                              />
                              <button
                                id="btn-copiar-link-convite"
                                type="button"
                                onClick={() => copiarLink(activeServerSession.inviteUrl)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.8125rem',
                                  fontWeight: 600,
                                  backgroundColor: copiado ? '#064e3b' : '#1e293b',
                                  border: '1px solid #334155',
                                  color: copiado ? '#34d399' : '#f8fafc',
                                  borderRadius: '0.375rem',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {copiado ? 'Copiado!' : 'Copiar Link'}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor="select-ip-lan"
                              style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                            >
                              Interface de Rede (IP LAN)
                            </label>
                            <select
                              id="select-ip-lan"
                              value={activeServerSession.selectedIp}
                              onChange={(e) => selecionarIpServidor(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.8125rem',
                                backgroundColor: '#0c1322',
                                border: '1px solid #334155',
                                borderRadius: '0.375rem',
                                color: '#f8fafc',
                              }}
                            >
                              {activeServerSession.availableIps.map((iface) => (
                                <option key={iface.ip} value={iface.ip}>
                                  {iface.name} ({iface.ip}){iface.isDefault ? ' - Padrão' : ''}
                                </option>
                              ))}
                              {activeServerSession.availableIps.length === 0 && (
                                <option value="127.0.0.1">Loopback (127.0.0.1)</option>
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
