import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useHostStore } from '../store/useHostStore';
import {
  WhiteboardEngine,
  WhiteboardTool,
  CANONICAL_VIRTUAL_WIDTH,
  CANONICAL_VIRTUAL_HEIGHT,
} from '../../shared/canvas/engine';
import { getVisibleElements } from '../../shared/events/reducer';
import { PdfDocumentViewer } from '../../shared/pdf/pdf-loader';

const PALETA_CORES = [
  { id: 'color-slate', valor: '#0f172a', nome: 'Preto / Grafite' },
  { id: 'color-blue', valor: '#0284c7', nome: 'Azul Céu' },
  { id: 'color-green', valor: '#059669', nome: 'Verde Esmeralda' },
  { id: 'color-orange', valor: '#d97706', nome: 'Laranja Âmbar' },
  { id: 'color-purple', valor: '#7c3aed', nome: 'Roxo Violeta' },
  { id: 'color-white', valor: '#ffffff', nome: 'Branco Neve' },
];

const ESPESSURAS = [
  { id: 'stroke-width-2', valor: 2, label: '2px (Fino)' },
  { id: 'stroke-width-4', valor: 4, label: '4px (Médio)' },
  { id: 'stroke-width-8', valor: 8, label: '8px (Grosso)' },
  { id: 'stroke-width-16', valor: 16, label: '16px (Marcador)' },
];

export const QuadroBrancoPage: React.FC = () => {
  const {
    activeSessaoId,
    activeAbaId,
    abas,
    pdfPagina,
    tabState,
    quadroSomenteLeitura,
    selectedAtendido,
    dicionario,
    activeServerSession,
    guestMuted,
    setView,
    aplicarEventoQuadro,
    desfazerQuadro,
    refazerQuadro,
    limparQuadro,
    bloquearTelaGuest,
    liberarMidiaGuest,
    carregarAbas,
    criarAba,
    removerAba,
    mudarPaginaPdf,
    trocarAba,
  } = useHostStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WhiteboardEngine | null>(null);

  const [ferramenta, setFerramenta] = useState<WhiteboardTool>('pencil');
  const [corAtual, setCorAtual] = useState<string>('#0284c7');
  const [espessuraAtual, setEspessuraAtual] = useState<number>(3);
  const [dprReal, setDprReal] = useState<number>(1.5);
  const [exportando, setExportando] = useState<boolean>(false);
  const [menuNovaAbaAberto, setMenuNovaAbaAberto] = useState<boolean>(false);
  const [totalPaginasPdf, setTotalPaginasPdf] = useState<number>(1);
  const pdfViewerRef = useRef<PdfDocumentViewer | null>(null);

  const currentAba = abas.find((a) => a.id === activeAbaId);

  useEffect(() => {
    if (activeSessaoId) {
      carregarAbas(activeSessaoId);
    }
  }, [activeSessaoId]);

  const handleCriarAbaEmBranco = async () => {
    setMenuNovaAbaAberto(false);
    await criarAba({
      titulo: `Quadro ${abas.length + 1}`,
      tipo: 'blank',
    });
  };

  const handleImportarAssetParaAba = async (
    e: React.ChangeEvent<HTMLInputElement>,
    tipo: 'image' | 'pdf' | 'video' | 'audio'
  ) => {
    setMenuNovaAbaAberto(false);
    const file = e.target.files?.[0];
    if (!file || !activeSessaoId || !window.desktopAPI?.assets) return;

    try {
      const filePath = (file as any).path || file.name;
      const res = await window.desktopAPI.assets.import({
        sessaoId: activeSessaoId,
        sourcePath: filePath,
        originalName: file.name,
      });

      if (res.success && res.data) {
        await criarAba({
          titulo: file.name,
          tipo,
          asset_id: res.data.id,
        });
      } else {
        alert((!res.success && res.error) ? res.error : 'Falha ao importar arquivo.');
      }
    } catch (err: unknown) {
      console.error('[QuadroBranco] Erro ao importar asset:', err);
    }
    e.target.value = '';
  };

  const handleHostMediaPlay = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (activeServerSession && window.desktopAPI?.serverSession) {
      window.desktopAPI.serverSession.broadcastToGuest({
        type: 'PLAY',
        payload: { mediaTime: e.currentTarget.currentTime, serverTs: Date.now(), playing: true },
        mediaTime: e.currentTarget.currentTime,
        serverTs: Date.now(),
        playing: true,
        ts: Date.now(),
      });
    }
  };

  const handleHostMediaPause = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (activeServerSession && window.desktopAPI?.serverSession) {
      window.desktopAPI.serverSession.broadcastToGuest({
        type: 'PAUSE',
        payload: { mediaTime: e.currentTarget.currentTime, serverTs: Date.now(), playing: false },
        mediaTime: e.currentTarget.currentTime,
        serverTs: Date.now(),
        playing: false,
        ts: Date.now(),
      });
    }
  };

  const handleHostMediaSeeked = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (activeServerSession && window.desktopAPI?.serverSession) {
      window.desktopAPI.serverSession.broadcastToGuest({
        type: 'SEEK',
        payload: { mediaTime: e.currentTarget.currentTime, serverTs: Date.now(), playing: !e.currentTarget.paused },
        mediaTime: e.currentTarget.currentTime,
        serverTs: Date.now(),
        playing: !e.currentTarget.paused,
        ts: Date.now(),
      });
    }
  };

  // Inicializa o WhiteboardEngine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    setDprReal(dpr);

    const rect = containerRef.current.getBoundingClientRect();
    const displayWidth = Math.floor(rect.width) || CANONICAL_VIRTUAL_WIDTH;
    const displayHeight = Math.floor(rect.height) || CANONICAL_VIRTUAL_HEIGHT;

    const engine = new WhiteboardEngine(canvasRef.current, {
      virtualWidth: CANONICAL_VIRTUAL_WIDTH,
      virtualHeight: CANONICAL_VIRTUAL_HEIGHT,
      autor: 'host',
      sessaoId: activeSessaoId || 'sessao-ativa',
      abaId: activeAbaId || 'default',
      somenteLeitura: quadroSomenteLeitura,
      onEmitEvent: (evento) => {
        aplicarEventoQuadro(evento);
      },
      onToolChange: (tool) => {
        setFerramenta(tool);
      },
    });

    engine.setDimensions(displayWidth, displayHeight);

    if (quadroSomenteLeitura) {
      engine.setTool('select');
      setFerramenta('select');
    } else {
      engine.setStrokeColor(corAtual);
      engine.setStrokeWidth(espessuraAtual);
      engine.setTool(ferramenta);
    }

    engineRef.current = engine;
    if (typeof window !== 'undefined') {
      (window as any).__whiteboardEngine = engine;
    }

    // Renderiza o estado inicial acumulado da aba
    engine.renderState(tabState);

    // Ajusta dimensões sob resize do container
    const handleResize = () => {
      if (containerRef.current && engineRef.current) {
        const bounds = containerRef.current.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          engineRef.current.setDimensions(Math.floor(bounds.width), Math.floor(bounds.height));
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (typeof window !== 'undefined') {
        delete (window as any).__whiteboardEngine;
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [activeSessaoId, activeAbaId, quadroSomenteLeitura]);

  // Sincroniza renderização com projeções do Reducer
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.renderState(tabState);
    }
  }, [tabState]);

  // Carrega fundo da aba ativa (imagem ou PDF)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (!currentAba || currentAba.tipo === 'blank') {
      engine.clearBackgroundImage();
      return;
    }

    if (currentAba.tipo === 'image' && currentAba.asset_id && activeServerSession) {
      const mediaUrl = `http://127.0.0.1:${activeServerSession.port}/midia/${currentAba.asset_id}?token=${activeServerSession.mediaToken || ''}`;
      engine.setBackgroundImage(mediaUrl).catch((err) => {
        console.warn('[QuadroBranco] Erro ao aplicar imagem de fundo:', err);
      });
      return;
    }

    if (currentAba.tipo === 'pdf' && currentAba.asset_id && activeServerSession) {
      const mediaUrl = `http://127.0.0.1:${activeServerSession.port}/midia/${currentAba.asset_id}?token=${activeServerSession.mediaToken || ''}`;
      const viewer = new PdfDocumentViewer();
      pdfViewerRef.current = viewer;
      viewer
        .load(mediaUrl)
        .then((numPages) => {
          setTotalPaginasPdf(numPages);
          return viewer.renderPage(pdfPagina, CANONICAL_VIRTUAL_WIDTH);
        })
        .then((rendered) => {
          return engine.setBackgroundImage(rendered.canvas);
        })
        .catch((err) => {
          console.warn('[QuadroBranco] Erro ao carregar página de PDF:', err);
        });

      return () => {
        viewer.destroy();
      };
    }
  }, [currentAba?.id, currentAba?.tipo, currentAba?.asset_id, pdfPagina, activeServerSession?.port, activeServerSession?.mediaToken]);

  // Manipuladores de ferramentas
  const selecionarFerramenta = useCallback((tool: WhiteboardTool) => {
    setFerramenta(tool);
    if (engineRef.current) {
      engineRef.current.setTool(tool);
    }
  }, []);

  const alterarCor = useCallback((cor: string) => {
    setCorAtual(cor);
    if (engineRef.current) {
      engineRef.current.setStrokeColor(cor);
    }
  }, []);

  const alterarEspessura = useCallback((width: number) => {
    setEspessuraAtual(width);
    if (engineRef.current) {
      engineRef.current.setStrokeWidth(width);
    }
  }, []);

  const handleExportarImagem = () => {
    if (!engineRef.current) return;
    setExportando(true);
    try {
      const dataUrl = engineRef.current.toDataURL({ multiplier: dprReal });
      const link = document.createElement('a');
      link.download = `quadro-sessao-${activeSessaoId || 'export'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[Quadro] Erro ao exportar imagem:', err);
    } finally {
      setTimeout(() => setExportando(false), 500);
    }
  };

  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';
  const rotuloSessao = dicionario['rotulo.sessao'] || 'Sessão';
  const elementosVisiveis = getVisibleElements(tabState);

  return (
    <div
      id="pagina-quadro-branco"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        minHeight: '650px',
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        gap: '0.75rem',
      }}
    >
      {/* Barra Superior de Contexto e Navegação */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#111c44',
          borderRadius: '0.5rem',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            id="btn-voltar-sessao"
            onClick={() => setView('detalhes')}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            ← Voltar para Detalhes
          </button>

          <div>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
              Quadro Branco Multimodal HiDPI
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#64748b', marginLeft: '0.75rem' }}>
              {selectedAtendido?.nome ? `${rotuloGuest}: ${selectedAtendido.nome}` : ''}
              {activeSessaoId ? ` • ${rotuloSessao}: ${activeSessaoId.slice(0, 8)}...` : ''}
            </span>
          </div>
        </div>

        {/* Badges de Status e Exportação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {quadroSomenteLeitura && (
            <span
              id="badge-somente-leitura"
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: '#1e293b',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
              }}
            >
              Somente leitura — sessão encerrada
            </span>
          )}

          {!quadroSomenteLeitura && (
            <>
              <span
                id="badge-status-sala"
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor:
                    activeServerSession?.status === 'conectado'
                      ? '#064e3b'
                      : activeServerSession
                      ? '#0c4a6e'
                      : '#334155',
                  color:
                    activeServerSession?.status === 'conectado'
                      ? '#34d399'
                      : activeServerSession
                      ? '#38bdf8'
                      : '#94a3b8',
                }}
              >
                {activeServerSession?.status === 'conectado'
                  ? 'Convidado Conectado (E2EE)'
                  : activeServerSession
                  ? 'Sala LAN Ativa'
                  : 'Local (Sem Conexão)'}
              </span>

              {/* Controles de Sessão Remota do Convidado */}
              {activeServerSession && (
                <>
                  <button
                    id="btn-lock-guest-screen"
                    type="button"
                    onClick={() => bloquearTelaGuest(!activeServerSession.screenLocked)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      backgroundColor: activeServerSession.screenLocked ? '#064e3b' : '#451a03',
                      border: `1px solid ${activeServerSession.screenLocked ? '#059669' : '#b45309'}`,
                      color: activeServerSession.screenLocked ? '#34d399' : '#fef3c7',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    {activeServerSession.screenLocked ? 'Desbloquear Convidado' : 'Bloquear Convidado'}
                  </button>

                  <button
                    id="btn-unlock-guest-media"
                    type="button"
                    onClick={() => liberarMidiaGuest(!activeServerSession.mediaUnlocked)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      backgroundColor: activeServerSession.mediaUnlocked ? '#451a03' : '#064e3b',
                      border: `1px solid ${activeServerSession.mediaUnlocked ? '#b45309' : '#059669'}`,
                      color: activeServerSession.mediaUnlocked ? '#fef3c7' : '#34d399',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    {activeServerSession.mediaUnlocked ? 'Bloquear Mídia' : 'Liberar Mídia'}
                  </button>

                  {guestMuted && (
                    <span
                      id="badge-guest-muted"
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: '#451a03',
                        border: '1px solid #b45309',
                        color: '#fef3c7',
                      }}
                    >
                      Convidado Mutado
                    </span>
                  )}
                </>
              )}
            </>
          )}

          <span
            id="badge-dpr"
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#38bdf8',
            }}
          >
            DPR: {dprReal.toFixed(2)}x (HiDPI 4K)
          </span>

          <button
            id="btn-exportar-imagem"
            onClick={handleExportarImagem}
            disabled={exportando}
            style={{
              padding: '0.4rem 0.875rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              backgroundColor: '#0369a1',
              border: '1px solid #0284c7',
              color: '#ffffff',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            {exportando ? 'Exportando...' : 'Exportar PNG HiDPI'}
          </button>
        </div>
      </div>

      {/* Barra de Abas Multimodais (M1) */}
      <div
        id="abas-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 1rem',
          backgroundColor: '#0c1322',
          borderBottom: '1px solid #1e293b',
          overflowX: 'auto',
          minHeight: '44px',
        }}
      >
        {abas.length === 0 ? (
          <div
            id="tab-default"
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}
          >
            ✏️ Quadro Branco
          </div>
        ) : (
          abas.map((aba) => {
            const isAtiva = aba.id === activeAbaId;
            const icone =
              aba.tipo === 'image'
                ? '🖼️'
                : aba.tipo === 'pdf'
                ? '📄'
                : aba.tipo === 'video'
                ? '🎬'
                : aba.tipo === 'audio'
                ? '🎵'
                : '✏️';
            return (
              <div
                key={aba.id}
                id={`tab-${aba.id}`}
                onClick={() => trocarAba(aba.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0.75rem',
                  backgroundColor: isAtiva ? '#0284c7' : '#1e293b',
                  color: isAtiva ? '#ffffff' : '#94a3b8',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: isAtiva ? 600 : 500,
                  cursor: 'pointer',
                  border: isAtiva ? '1px solid #38bdf8' : '1px solid #334155',
                }}
              >
                <span>{icone}</span>
                <span>{aba.titulo}</span>
                {!quadroSomenteLeitura && (
                  <button
                    type="button"
                    title="Remover aba"
                    onClick={(e) => {
                      e.stopPropagation();
                      removerAba(aba.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isAtiva ? '#f1f5f9' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      padding: '0 0.125rem',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}

        {!quadroSomenteLeitura && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              id="btn-nova-aba"
              type="button"
              onClick={() => setMenuNovaAbaAberto(!menuNovaAbaAberto)}
              style={{
                padding: '0.375rem 0.625rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px dashed #38bdf8',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              + Nova Aba
            </button>
            {menuNovaAbaAberto && (
              <div
                id="menu-nova-aba"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.25rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.375rem',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '150px',
                }}
              >
                <button
                  id="btn-aba-quadro"
                  type="button"
                  onClick={handleCriarAbaEmBranco}
                  style={{
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                  }}
                >
                  ✏️ Quadro Branco
                </button>
                <label
                  id="btn-aba-imagem"
                  style={{
                    padding: '0.5rem 0.75rem',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    display: 'block',
                  }}
                >
                  🖼️ Imagem
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImportarAssetParaAba(e, 'image')}
                  />
                </label>
                <label
                  id="btn-aba-pdf"
                  style={{
                    padding: '0.5rem 0.75rem',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    display: 'block',
                  }}
                >
                  📄 Documento PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImportarAssetParaAba(e, 'pdf')}
                  />
                </label>
                <label
                  id="btn-aba-video"
                  style={{
                    padding: '0.5rem 0.75rem',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    display: 'block',
                  }}
                >
                  🎬 Vídeo
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImportarAssetParaAba(e, 'video')}
                  />
                </label>
                <label
                  id="btn-aba-audio"
                  style={{
                    padding: '0.5rem 0.75rem',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    display: 'block',
                  }}
                >
                  🎵 Áudio
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/ogg"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImportarAssetParaAba(e, 'audio')}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Paginação do PDF (M5) */}
      {currentAba?.tipo === 'pdf' && (
        <div
          id="pdf-page-controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '0.375rem 1rem',
            backgroundColor: '#0c1322',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <button
            id="btn-pdf-prev-page"
            type="button"
            disabled={pdfPagina <= 1}
            onClick={() => mudarPaginaPdf(pdfPagina - 1)}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              backgroundColor: pdfPagina <= 1 ? '#1e293b' : '#0369a1',
              color: pdfPagina <= 1 ? '#64748b' : '#ffffff',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              cursor: pdfPagina <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ◀ Página Anterior
          </button>
          <span id="label-pdf-page" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8' }}>
            Página {pdfPagina} de {totalPaginasPdf}
          </span>
          <button
            id="btn-pdf-next-page"
            type="button"
            disabled={pdfPagina >= totalPaginasPdf}
            onClick={() => mudarPaginaPdf(pdfPagina + 1)}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              backgroundColor: pdfPagina >= totalPaginasPdf ? '#1e293b' : '#0369a1',
              color: pdfPagina >= totalPaginasPdf ? '#64748b' : '#ffffff',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              cursor: pdfPagina >= totalPaginasPdf ? 'not-allowed' : 'pointer',
            }}
          >
            Próxima Página ▶
          </button>
        </div>
      )}

      {/* Barra de Ferramentas Vetoriais e Controles do Quadro */}
      {quadroSomenteLeitura ? (
        <div
          id="whiteboard-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.625rem 1rem',
            backgroundColor: '#0c1322',
            borderRadius: '0.5rem',
            border: '1px solid #1e293b',
          }}
        >
          <div
            id="aviso-modo-leitura"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#94a3b8',
              fontSize: '0.875rem',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.375rem',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                fontWeight: 600,
                fontSize: '0.8125rem',
                border: '1px solid #334155',
              }}
            >
              Somente leitura — sessão encerrada
            </span>
            <span>
              O histórico desta sessão é permanente e imutável. As ferramentas de desenho e edição estão desabilitadas.
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Para salvar o quadro, utilize o botão "Exportar PNG HiDPI".
          </span>
        </div>
      ) : (
        <div
          id="whiteboard-toolbar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.625rem 1rem',
            backgroundColor: '#0c1322',
            borderRadius: '0.5rem',
            border: '1px solid #1e293b',
          }}
        >
          {/* Grupo 1: Ferramentas Interativas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              id="tool-select"
              type="button"
              onClick={() => selecionarFerramenta('select')}
              title="Selecionar e Mover Objeto"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'select' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'select' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'select' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ↖ Seleção
            </button>

            <button
              id="tool-pencil"
              type="button"
              onClick={() => selecionarFerramenta('pencil')}
              title="Lápis Traço Fino"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'pencil' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'pencil' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'pencil' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ✏ Lápis
            </button>

            <button
              id="tool-brush"
              type="button"
              onClick={() => selecionarFerramenta('brush')}
              title="Pincel Marcador"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'brush' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'brush' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'brush' ? '#ffffff' : '#cbd5e1',
              }}
            >
              🖌 Pincel
            </button>

            <button
              id="tool-rectangle"
              type="button"
              onClick={() => selecionarFerramenta('rectangle')}
              title="Retângulo"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'rectangle' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'rectangle' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'rectangle' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ▭ Retângulo
            </button>

            <button
              id="tool-ellipse"
              type="button"
              onClick={() => selecionarFerramenta('ellipse')}
              title="Elipse / Círculo"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'ellipse' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'ellipse' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'ellipse' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ◯ Elipse
            </button>

            <button
              id="tool-line"
              type="button"
              onClick={() => selecionarFerramenta('line')}
              title="Linha Reta"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'line' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'line' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'line' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ― Linha
            </button>

            <button
              id="tool-arrow"
              type="button"
              onClick={() => selecionarFerramenta('arrow')}
              title="Seta Indicativa"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'arrow' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'arrow' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'arrow' ? '#ffffff' : '#cbd5e1',
              }}
            >
              ➔ Seta
            </button>

            <button
              id="tool-text"
              type="button"
              onClick={() => selecionarFerramenta('text')}
              title="Texto Rotacionável"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'text' ? '#0284c7' : '#1e293b',
                border: `1px solid ${ferramenta === 'text' ? '#38bdf8' : '#334155'}`,
                color: ferramenta === 'text' ? '#ffffff' : '#cbd5e1',
              }}
            >
              T Texto
            </button>

            <button
              id="tool-eraser"
              type="button"
              onClick={() => selecionarFerramenta('eraser')}
              title="Borracha de Trecho (Apaga o traço por onde passa)"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'eraser' ? '#451a03' : '#1e293b',
                border: `1px solid ${ferramenta === 'eraser' ? '#d97706' : '#334155'}`,
                color: ferramenta === 'eraser' ? '#fef3c7' : '#cbd5e1',
              }}
            >
              ⌫ Borracha (Trecho)
            </button>

            <button
              id="tool-object-eraser"
              type="button"
              onClick={() => selecionarFerramenta('object_eraser')}
              title="Borracha de Objeto (Oculta o elemento inteiro ao clicar)"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                cursor: 'pointer',
                backgroundColor: ferramenta === 'object_eraser' ? '#451a03' : '#1e293b',
                border: `1px solid ${ferramenta === 'object_eraser' ? '#d97706' : '#334155'}`,
                color: ferramenta === 'object_eraser' ? '#fef3c7' : '#cbd5e1',
              }}
            >
              ✕ Borracha (Objeto)
            </button>
          </div>

          {/* Grupo 2: Paleta e Espessuras */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Seletor de Espessuras */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '0.25rem' }}>Traço:</span>
              {ESPESSURAS.map((esp) => (
                <button
                  key={esp.id}
                  id={esp.id}
                  type="button"
                  onClick={() => alterarEspessura(esp.valor)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    backgroundColor: espessuraAtual === esp.valor ? '#0284c7' : '#1e293b',
                    border: `1px solid ${espessuraAtual === esp.valor ? '#38bdf8' : '#334155'}`,
                    color: '#f8fafc',
                  }}
                >
                  {esp.valor}px
                </button>
              ))}
            </div>

            {/* Seletor de Cores (Paleta Limpa sem Vermelho) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '0.25rem' }}>Cor:</span>
              {PALETA_CORES.map((cor) => {
                const selecionada = corAtual.toLowerCase() === cor.valor.toLowerCase();
                return (
                  <button
                    key={cor.id}
                    id={cor.id}
                    type="button"
                    onClick={() => alterarCor(cor.valor)}
                    title={cor.nome}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '9999px',
                      backgroundColor: cor.valor,
                      border: selecionada ? '2px solid #38bdf8' : '1px solid #475569',
                      boxShadow: selecionada ? '0 0 0 2px #0c1322' : 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>

            {/* Grupo 3: Desfazer / Refazer / Limpar Tela */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <button
                id="btn-undo"
                type="button"
                onClick={desfazerQuadro}
                title="Desfazer Última Ação do Host"
                style={{
                  padding: '0.4rem 0.65rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                ↩ Desfazer
              </button>

              <button
                id="btn-redo"
                type="button"
                onClick={refazerQuadro}
                title="Refazer Ação Desfeita"
                style={{
                  padding: '0.4rem 0.65rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                ↪ Refazer
              </button>

              <button
                id="btn-clear-tab"
                type="button"
                onClick={limparQuadro}
                title="Limpar Tela (Oculta todos os elementos visíveis)"
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  backgroundColor: '#78350f',
                  border: '1px solid #d97706',
                  color: '#fef3c7',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                🗑 Limpar Tela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Área Central: Canvas HiDPI com fundo branco estático ou Mídia (Vídeo/Áudio) */}
      <div
        ref={containerRef}
        id="container-quadro-branco"
        style={{
          flex: 1,
          backgroundColor: '#0c1322',
          borderRadius: '0.5rem',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
          userSelect: 'none',
          padding: '0.5rem',
        }}
      >
        {currentAba?.tipo === 'video' && currentAba.asset_id && activeServerSession ? (
          <div style={{ maxWidth: '90%', maxHeight: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video
              id="host-video-player"
              controls
              playsInline
              src={`http://127.0.0.1:${activeServerSession.port}/midia/${currentAba.asset_id}?token=${activeServerSession.mediaToken || ''}`}
              onPlay={handleHostMediaPlay}
              onPause={handleHostMediaPause}
              onSeeked={handleHostMediaSeeked}
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
            />
          </div>
        ) : (
          <>
            {currentAba?.tipo === 'audio' && currentAba.asset_id && activeServerSession && (
              <div style={{ marginBottom: '0.5rem', width: '100%', maxWidth: '600px', display: 'flex', justifyContent: 'center' }}>
                <audio
                  id="host-audio-player"
                  controls
                  src={`http://127.0.0.1:${activeServerSession.port}/midia/${currentAba.asset_id}?token=${activeServerSession.mediaToken || ''}`}
                  onPlay={handleHostMediaPlay}
                  onPause={handleHostMediaPause}
                  onSeeked={handleHostMediaSeeked}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div
              style={{
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <canvas id="canvas-quadro-branco" ref={canvasRef} />
            </div>
          </>
        )}
      </div>

      {/* Barra de Rodapé: Informações Técnicas e de Resolução */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.4rem 0.75rem',
          fontSize: '0.75rem',
          color: '#64748b',
          backgroundColor: '#0c1322',
          borderRadius: '0.375rem',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span id="badge-elementos">
            Elementos Visíveis: <strong style={{ color: '#f8fafc' }}>{elementosVisiveis.length}</strong>
          </span>
          <span id="badge-ferramenta">
            Ferramenta: <strong style={{ color: '#38bdf8' }}>{quadroSomenteLeitura ? 'SOMENTE LEITURA' : ferramenta.toUpperCase()}</strong>
          </span>
        </div>

        <div>
          <span>
            Fabric.js 6.x • Retina Scaling Ativo • Prevenção Estrita de Dupla Escala (ADR-003)
          </span>
        </div>
      </div>
    </div>
  );
};
