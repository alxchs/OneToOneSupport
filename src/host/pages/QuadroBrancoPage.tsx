import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useHostStore } from '../store/useHostStore';
import { WhiteboardEngine, WhiteboardTool } from '../../shared/canvas/engine';
import { getVisibleElements } from '../../shared/events/reducer';

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
    tabState,
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
  } = useHostStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WhiteboardEngine | null>(null);

  const [ferramenta, setFerramenta] = useState<WhiteboardTool>('pencil');
  const [corAtual, setCorAtual] = useState<string>('#0284c7');
  const [espessuraAtual, setEspessuraAtual] = useState<number>(3);
  const [dprReal, setDprReal] = useState<number>(1.5);
  const [exportando, setExportando] = useState<boolean>(false);

  // Inicializa o WhiteboardEngine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    setDprReal(dpr);

    const rect = containerRef.current.getBoundingClientRect();
    const initWidth = Math.max(900, Math.floor(rect.width) || 1200);
    const initHeight = Math.max(600, Math.floor(rect.height) || 750);

    const engine = new WhiteboardEngine(canvasRef.current, {
      virtualWidth: initWidth,
      virtualHeight: initHeight,
      autor: 'host',
      sessaoId: activeSessaoId || 'sessao-ativa',
      abaId: activeAbaId || 'default',
      onEmitEvent: (evento) => {
        aplicarEventoQuadro(evento);
      },
      onToolChange: (tool) => {
        setFerramenta(tool);
      },
    });

    engine.setStrokeColor(corAtual);
    engine.setStrokeWidth(espessuraAtual);
    engine.setTool(ferramenta);

    engineRef.current = engine;

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
      engine.dispose();
      engineRef.current = null;
    };
  }, [activeSessaoId, activeAbaId]);

  // Sincroniza renderização com projeções do Reducer
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.renderState(tabState);
    }
  }, [tabState]);

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

      {/* Barra de Ferramentas Vetoriais e Controles do Quadro */}
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
            title="Borracha (DRAW_HIDE - Ocultação Lógica)"
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
            ⌫ Borracha
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

      {/* Área Central: Canvas HiDPI com fundo branco estático */}
      <div
        ref={containerRef}
        id="container-quadro-branco"
        style={{
          flex: 1,
          backgroundColor: '#0c1322',
          borderRadius: '0.5rem',
          border: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
          userSelect: 'none',
          padding: '0.5rem',
        }}
      >
        <div
          style={{
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <canvas id="canvas-quadro-branco" ref={canvasRef} />
        </div>
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
            Ferramenta: <strong style={{ color: '#38bdf8' }}>{ferramenta.toUpperCase()}</strong>
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
