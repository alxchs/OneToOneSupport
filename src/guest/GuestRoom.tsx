import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GuestWsClient, GuestConnectionState } from './ws/client';
import {
  WhiteboardEngine,
  WhiteboardTool,
  CANONICAL_VIRTUAL_WIDTH,
  CANONICAL_VIRTUAL_HEIGHT,
} from '../shared/canvas/engine';
import {
  TabState,
  createInitialTabState,
  reduceEvent,
  getVisibleElements,
  WhiteboardEvent,
} from '../shared/events/reducer';
import { generateUUID } from '../shared/events/protocol';
import { diagLog } from '../shared/diag';
import { MediaSyncManager } from '../shared/media-sync';
import { PdfDocumentViewer } from '../shared/pdf/pdf-loader';
import buildInfo from '../shared/build-info.json';

export interface GuestRoomProps {
  wsClient: GuestWsClient;
  sessaoId: string;
  initialDictionary?: Record<string, string>;
  onSessionEnded?: () => void;
}

const PALETA_CORES_GUEST = [
  { id: 'cor-slate', valor: '#0f172a', nome: 'Preto / Grafite' },
  { id: 'cor-blue', valor: '#0284c7', nome: 'Azul Céu' },
  { id: 'cor-green', valor: '#059669', nome: 'Verde Esmeralda' },
  { id: 'cor-orange', valor: '#d97706', nome: 'Laranja Âmbar' },
  { id: 'cor-purple', valor: '#7c3aed', nome: 'Roxo Violeta' },
  { id: 'cor-white', valor: '#ffffff', nome: 'Branco Neve' },
];

const ESPESSURAS_GUEST = [
  { valor: 2, label: '2px' },
  { valor: 4, label: '4px' },
  { valor: 8, label: '8px' },
  { valor: 16, label: '16px' },
];

export const GuestRoom: React.FC<GuestRoomProps> = ({
  wsClient,
  sessaoId,
  initialDictionary,
  onSessionEnded,
}) => {
  const [dicionario] = useState<Record<string, string>>(initialDictionary || {
    'rotulo.host': 'Profissional',
    'rotulo.guest': 'Atendido',
    'rotulo.sessao': 'Sessão',
  });

  const [connState, setConnState] = useState<GuestConnectionState>(wsClient.getState());
  const [screenLocked, setScreenLocked] = useState<boolean>(false);
  const [mediaUnlocked, setMediaUnlocked] = useState<boolean>(false);
  const [isLocalMuted, setIsLocalMuted] = useState<boolean>(false);

  const [activeAbaId, setActiveAbaId] = useState<string>('default');
  const [activeAbaTipo, setActiveAbaTipo] = useState<string>('blank');
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [mediaToken, setMediaToken] = useState<string | null>(wsClient.getMediaToken());
  const [pdfPagina, setPdfPagina] = useState<number>(1);
  const [pdfTotalPaginas, setPdfTotalPaginas] = useState<number>(1);
  const [autoplayBloqueado, setAutoplayBloqueado] = useState<boolean>(false);

  const [tabStates, setTabStates] = useState<Record<string, TabState>>({
    default: createInitialTabState('default'),
  });

  const [ferramenta, setFerramenta] = useState<WhiteboardTool>('pencil');
  const [corAtual, setCorAtual] = useState<string>('#0284c7');
  const [espessuraAtual, setEspessuraAtual] = useState<number>(3);
  const [drawerFerramentas, setDrawerFerramentas] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WhiteboardEngine | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const mediaSyncRef = useRef<MediaSyncManager>(new MediaSyncManager());
  const pdfViewerRef = useRef<PdfDocumentViewer | null>(null);

  // Manipulador de eventos de mensagens cifradas recebidas do Host
  const handleHostMessage = useCallback(
    (msg: any) => {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'SESSION_READY': {
          if (msg.mediaToken && typeof msg.mediaToken === 'string') {
            setMediaToken(msg.mediaToken);
          }
          break;
        }

        case 'LOCK_SCREEN': {
          setScreenLocked(Boolean(msg.locked));
          break;
        }

        case 'UNLOCK_MEDIA': {
          setMediaUnlocked(Boolean(msg.unlocked));
          break;
        }

        case 'TAB_SWITCH': {
          const novaAbaId = msg.abaId || 'default';
          setActiveAbaId(novaAbaId);
          setActiveAbaTipo(msg.abaTipo || 'blank');
          setActiveAssetId(msg.assetId || null);
          setPdfPagina(1);
          setTabStates((prev) => {
            if (!prev[novaAbaId]) {
              return { ...prev, [novaAbaId]: createInitialTabState(novaAbaId) };
            }
            return prev;
          });
          break;
        }

        case 'PDF_PAGE': {
          const pag = typeof msg.pagina === 'number' ? msg.pagina : (msg.payload?.pagina || 1);
          setPdfPagina(pag);
          break;
        }

        case 'CLOCK_SYNC': {
          const rawPayload = msg.payload ?? msg;
          const t0 = typeof rawPayload.t0 === 'number' ? rawPayload.t0 : msg.t0;
          const t1 = typeof rawPayload.t1 === 'number' ? rawPayload.t1 : msg.t1;
          if (typeof t0 === 'number' && typeof t1 === 'number') {
            mediaSyncRef.current.processClockSync(t0, t1);
          }
          break;
        }

        case 'MEDIA_CONTROL':
        case 'PLAY':
        case 'PAUSE':
        case 'SEEK': {
          const rawPayload = msg.payload ?? msg;
          const mediaTime = typeof rawPayload.mediaTime === 'number' ? rawPayload.mediaTime : 0;
          const serverTs = typeof rawPayload.serverTs === 'number' ? rawPayload.serverTs : Date.now();
          const playing = Boolean(rawPayload.playing ?? (msg.type === 'PLAY'));

          mediaSyncRef.current.updateMediaState({ mediaTime, serverTs, playing });

          const mediaEl = mediaRef.current;
          if (mediaEl) {
            if (playing && mediaEl.paused) {
              mediaEl.play().catch(() => setAutoplayBloqueado(true));
            } else if (!playing && !mediaEl.paused) {
              mediaEl.pause();
            }
            const acao = mediaSyncRef.current.sincronizarPlayer(mediaEl.currentTime);
            if (acao.tipo === 'seek') {
              mediaEl.currentTime = acao.targetTime;
              mediaEl.playbackRate = 1.0;
            } else if (acao.tipo === 'rate') {
              mediaEl.playbackRate = acao.playbackRate;
            } else {
              mediaEl.playbackRate = 1.0;
            }
          }
          break;
        }

        case 'DRAW_ADD':
        case 'DRAW_HIDE':
        case 'CLEAR_TAB':
        case 'UNDO':
        case 'REDO': {
          const rawPayload = msg.payload ?? msg;
          const parsedPayload =
            typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
          const targetAba = msg.abaId || 'default';

          const ev: WhiteboardEvent = {
            id: msg.id || generateUUID(),
            sessao_id: sessaoId,
            aba_id: targetAba,
            tipo: msg.type,
            payload: parsedPayload || {},
            autor: msg.autor || 'host',
            criado_em: msg.ts || Date.now(),
          };

          setTabStates((prev) => {
            const currentTabState = prev[targetAba] || createInitialTabState(targetAba);
            const updated = reduceEvent(currentTabState, ev);
            diagLog('guestReceive', {
              tipo: msg.type,
              abaId: targetAba,
              visiveisDepois: getVisibleElements(updated).length,
              autor: msg.autor || 'host',
            });
            return { ...prev, [targetAba]: updated };
          });
          break;
        }

        case 'TAB_STATE': {
          const targetAba = msg.abaId || 'default';
          const incomingState = msg.state || msg.payload?.state;
          if (incomingState) {
            diagLog('guestReceive', {
              tipo: 'TAB_STATE',
              abaId: targetAba,
              elementos: incomingState.elementOrder?.length || 0,
            });
            setTabStates((prev) => ({
              ...prev,
              [targetAba]: incomingState,
            }));
          }
          break;
        }

        case 'SESSION_ENDED': {
          setConnState('closed');
          if (onSessionEnded) onSessionEnded();
          break;
        }

        default:
          break;
      }
    },
    [sessaoId, onSessionEnded]
  );

  // Inicializa conexão e listeners do WebSocket
  useEffect(() => {
    const handleState = (s: GuestConnectionState) => {
      setConnState(s);
    };

    wsClient.onStateChange = handleState;
    wsClient.onMessage = handleHostMessage;

    return () => {
      // Limpeza dos callbacks ao desmontar
      wsClient.onStateChange = undefined;
      wsClient.onMessage = undefined;
    };
  }, [wsClient, handleHostMessage]);

  // Inicializa o WhiteboardEngine no canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const displayWidth = Math.max(100, Math.floor(rect.width) || 412);
    const displayHeight = Math.max(100, Math.floor(rect.height) || 600);

    const engine = new WhiteboardEngine(canvasRef.current, {
      virtualWidth: CANONICAL_VIRTUAL_WIDTH,
      virtualHeight: CANONICAL_VIRTUAL_HEIGHT,
      autor: 'guest',
      sessaoId,
      abaId: activeAbaId,
      onEmitEvent: (evento) => {
        // Guest só desenha se o Host permitir (screenLocked === false)
        if (screenLocked) {
          return;
        }

        diagLog('guestSend', {
          tipo: evento.tipo,
          abaId: activeAbaId,
          autor: 'guest',
        });

        // Aplica localmente no reducer
        setTabStates((prev) => {
          const currentTab = prev[activeAbaId] || createInitialTabState(activeAbaId);
          const updated = reduceEvent(currentTab, evento);
          return { ...prev, [activeAbaId]: updated };
        });

        // Envia cifrado para o Host
        try {
          wsClient.sendEncrypted({
            type: evento.tipo,
            payload: evento.payload,
            abaId: activeAbaId,
            sessaoId,
            autor: 'guest',
            ts: Date.now(),
          });
        } catch (err) {
          console.error('[GuestRoom] Erro ao enviar evento de desenho:', err);
        }
      },
      onToolChange: (tool) => {
        setFerramenta(tool);
      },
    });

    engine.setDimensions(displayWidth, displayHeight);

    engine.setStrokeColor(corAtual);
    engine.setStrokeWidth(espessuraAtual);
    engine.setTool(ferramenta);

    engineRef.current = engine;
    if (typeof window !== 'undefined') {
      (window as any).__guestEngine = engine;
      (window as any).__guestActiveAbaId = activeAbaId;
      (window as any).__guestActiveAbaTipo = activeAbaTipo;
      (window as any).__guestPdfPagina = pdfPagina;
      (window as any).__guestWsClient = wsClient;
    }

    const currentTabState = tabStates[activeAbaId] || createInitialTabState(activeAbaId);
    engine.renderState(currentTabState);

    // Ajusta dimensões sob resize da janela/orientação mobile
    const handleResize = () => {
      if (containerRef.current && engineRef.current) {
        const bounds = containerRef.current.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          engineRef.current.setDimensions(Math.floor(bounds.width), Math.floor(bounds.height));
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (typeof window !== 'undefined') {
        delete (window as any).__guestEngine;
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [sessaoId, activeAbaId]);

  // Atualiza renderização quando o estado da aba mudar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__guestActiveAbaId = activeAbaId;
      (window as any).__guestActiveAbaTipo = activeAbaTipo;
      (window as any).__guestPdfPagina = pdfPagina;
    }
    if (engineRef.current) {
      const currentTabState = tabStates[activeAbaId] || createInitialTabState(activeAbaId);
      engineRef.current.renderState(currentTabState);
    }
  }, [tabStates, activeAbaId, activeAbaTipo, pdfPagina]);

  // Atualiza fundo da aba (imagem ou PDF) na engine do Guest
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (!activeAssetId || activeAbaTipo === 'blank') {
      engine.clearBackgroundImage();
      return;
    }

    const tokenParam = mediaToken ? `?token=${mediaToken}` : '';

    if (activeAbaTipo === 'image') {
      const url = `/midia/${activeAssetId}${tokenParam}`;
      engine.setBackgroundImage(url).catch((err) => {
        console.warn('[GuestRoom] Erro ao carregar imagem de fundo:', err);
      });
      return;
    }

    if (activeAbaTipo === 'pdf') {
      const url = `/midia/${activeAssetId}${tokenParam}`;
      const viewer = new PdfDocumentViewer();
      pdfViewerRef.current = viewer;
      viewer
        .load(url)
        .then((numPages) => {
          setPdfTotalPaginas(numPages);
          return viewer.renderPage(pdfPagina, CANONICAL_VIRTUAL_WIDTH);
        })
        .then((rendered) => {
          return engine.setBackgroundImage(rendered.canvas);
        })
        .catch((err) => {
          console.warn('[GuestRoom] Erro ao renderizar página de PDF:', err);
        });

      return () => {
        viewer.destroy();
      };
    }
  }, [activeAbaTipo, activeAssetId, pdfPagina, mediaToken]);

  // Aplica configurações de ferramenta na engine
  const mudarFerramenta = (t: WhiteboardTool) => {
    setFerramenta(t);
    if (engineRef.current) {
      engineRef.current.setTool(t);
    }
  };

  const mudarCor = (cor: string) => {
    setCorAtual(cor);
    if (engineRef.current) {
      engineRef.current.setStrokeColor(cor);
    }
  };

  const mudarEspessura = (esp: number) => {
    setEspessuraAtual(esp);
    if (engineRef.current) {
      engineRef.current.setStrokeWidth(esp);
    }
  };

  // Ação de Desfazer do Guest (desfaz sua própria última ação)
  const handleDesfazer = () => {
    if (screenLocked) return;
    diagLog('guestSend', { tipo: 'UNDO', abaId: activeAbaId, autor: 'guest' });
    const ev: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: sessaoId,
      aba_id: activeAbaId,
      tipo: 'UNDO',
      autor: 'guest',
      payload: {},
      criado_em: Date.now(),
    };

    setTabStates((prev) => {
      const currentTab = prev[activeAbaId] || createInitialTabState(activeAbaId);
      const updated = reduceEvent(currentTab, ev);
      return { ...prev, [activeAbaId]: updated };
    });

    try {
      wsClient.sendEncrypted({
        type: 'UNDO',
        payload: {},
        abaId: activeAbaId,
        sessaoId,
        autor: 'guest',
        ts: Date.now(),
      });
    } catch (err) {
      console.error('[GuestRoom] Erro ao enviar desfazer:', err);
    }
  };

  // Ação de Refazer do Guest (refaz sua própria última ação)
  const handleRefazer = () => {
    if (screenLocked) return;
    diagLog('guestSend', { tipo: 'REDO', abaId: activeAbaId, autor: 'guest' });
    const ev: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: sessaoId,
      aba_id: activeAbaId,
      tipo: 'REDO',
      autor: 'guest',
      payload: {},
      criado_em: Date.now(),
    };

    setTabStates((prev) => {
      const currentTab = prev[activeAbaId] || createInitialTabState(activeAbaId);
      const updated = reduceEvent(currentTab, ev);
      return { ...prev, [activeAbaId]: updated };
    });

    try {
      wsClient.sendEncrypted({
        type: 'REDO',
        payload: {},
        abaId: activeAbaId,
        sessaoId,
        autor: 'guest',
        ts: Date.now(),
      });
    } catch (err) {
      console.error('[GuestRoom] Erro ao enviar refazer:', err);
    }
  };

  // Alternar Mute Local do Guest
  const handleToggleMute = () => {
    const nextMuted = !isLocalMuted;
    setIsLocalMuted(nextMuted);

    // Mestre §11: Mute no Guest emite GUEST_MUTED só para notificar a UI do Host
    try {
      wsClient.sendEncrypted({
        type: 'GUEST_MUTED',
        payload: {
          muted: nextMuted,
          ts: Date.now(),
        },
      });
    } catch (err) {
      console.error('[GuestRoom] Erro ao emitir GUEST_MUTED:', err);
    }
  };

  // Controle de Mídia (Guest emite play/pause/seek somente se UNLOCK_MEDIA estiver ativo)
  const handleMediaAction = (action: 'PLAY' | 'PAUSE') => {
    if (!mediaUnlocked || screenLocked) return;

    try {
      wsClient.sendEncrypted({
        type: action,
        payload: {
          action,
          ts: Date.now(),
        },
      });
    } catch (err) {
      console.error('[GuestRoom] Erro ao emitir ação de mídia:', err);
    }
  };

  const rotuloHost = dicionario['rotulo.host'] || 'Profissional';
  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';

  return (
    <div
      id="guest-room-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100dvh',
        minHeight: '100dvh',
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Header Mobile com Safe Area Top e Status da Conexão */}
      <header
        className="safe-area-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          paddingBottom: '0.625rem',
          minHeight: '52px',
          boxSizing: 'border-box',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}>
              OneToOneSupport
            </span>
            <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
              {rotuloGuest} • Atendimento 1:1
            </span>
            <span
              id="guest-version-stamp"
              style={{
                fontSize: '0.625rem',
                color: '#64748b',
                fontFamily: 'monospace',
                marginTop: '1px',
              }}
            >
              {buildInfo.stamp}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Pílula de Status da Conexão */}
          {connState === 'connected' && (
            <span className="status-pill status-connected" id="guest-status-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }}></span>
              Conectado
            </span>
          )}
          {connState === 'reconnecting' && (
            <span className="status-pill status-reconnecting" id="guest-status-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
              Reconectando...
            </span>
          )}
          {connState === 'connecting' && (
            <span className="status-pill status-connecting" id="guest-status-badge">
              Conectando...
            </span>
          )}
          {(connState === 'closed' || connState === 'error') && (
            <span className="status-pill status-ended" id="guest-status-badge">
              Desconectado
            </span>
          )}

          {/* Botão de Microfone / Mute Local (Alvo de Toque >= 48px) */}
          <button
            id="btn-guest-mute"
            onClick={handleToggleMute}
            className={`touch-target-48 touch-btn ${isLocalMuted ? 'touch-btn-active' : ''}`}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              backgroundColor: isLocalMuted ? '#451a03' : '#1e293b',
              borderColor: isLocalMuted ? '#b45309' : '#334155',
              color: isLocalMuted ? '#fef3c7' : '#f8fafc',
            }}
            aria-label={isLocalMuted ? 'Desmutar áudio' : 'Mutar áudio'}
            title={isLocalMuted ? 'Microfone Mutado' : 'Microfone Aberto'}
          >
            {isLocalMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Indicador de Página do PDF sincronizada pelo Host (M5) */}
      {activeAbaTipo === 'pdf' && (
        <div
          id="guest-pdf-page-indicator"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.375rem',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#38bdf8',
          }}
        >
          📄 Página {pdfPagina} de {pdfTotalPaginas} (Sincronizada pelo {rotuloHost})
        </div>
      )}

      {/* 2. Área Central: Quadro Branco Fabric.js ou Mídia Sincronizada */}
      <main
        ref={containerRef}
        id="guest-whiteboard-area"
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          width: '100%',
          backgroundColor: '#ffffff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Banner de Fallback de Autoplay Bloqueado no Mobile (M7) */}
        {autoplayBloqueado && (
          <div
            id="banner-autoplay-bloqueado"
            style={{
              position: 'absolute',
              top: 12,
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              id="btn-desbloquear-autoplay"
              type="button"
              onClick={() => {
                if (mediaRef.current) {
                  mediaRef.current
                    .play()
                    .then(() => setAutoplayBloqueado(false))
                    .catch(() => {});
                }
              }}
              style={{
                minHeight: '48px',
                minWidth: '48px',
                padding: '0.6rem 1.25rem',
                backgroundColor: '#0284c7',
                border: '1px solid #38bdf8',
                borderRadius: '9999px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.875rem',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                cursor: 'pointer',
              }}
            >
              ▶ Toque para iniciar reprodução
            </button>
          </div>
        )}

        {activeAbaTipo === 'video' && activeAssetId ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#000000',
            }}
          >
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              id="guest-video-player"
              playsInline
              controls={mediaUnlocked && !screenLocked}
              src={`/midia/${activeAssetId}${mediaToken ? `?token=${mediaToken}` : ''}`}
              onPlay={() => {
                if (mediaUnlocked && !screenLocked) handleMediaAction('PLAY');
              }}
              onPause={() => {
                if (mediaUnlocked && !screenLocked) handleMediaAction('PAUSE');
              }}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <>
            {activeAbaTipo === 'audio' && activeAssetId && (
              <div
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  zIndex: 10,
                }}
              >
                <audio
                  ref={mediaRef as React.RefObject<HTMLAudioElement>}
                  id="guest-audio-player"
                  controls={mediaUnlocked && !screenLocked}
                  src={`/midia/${activeAssetId}${mediaToken ? `?token=${mediaToken}` : ''}`}
                  onPlay={() => {
                    if (mediaUnlocked && !screenLocked) handleMediaAction('PLAY');
                  }}
                  onPause={() => {
                    if (mediaUnlocked && !screenLocked) handleMediaAction('PAUSE');
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <canvas
              ref={canvasRef}
              id="guest-canvas"
              className="whiteboard-canvas-mobile"
            />
          </>
        )}

        {/* 3. Overlay Claro de Bloqueio de Tela (LOCK_SCREEN) */}
        {screenLocked && (
          <div
            id="guest-lock-overlay"
            className="lock-screen-overlay"
          >
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.875rem',
                padding: '1.5rem',
                maxWidth: '22rem',
                width: '90%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: '#451a03',
                  border: '1px solid #b45309',
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>

              <span style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc' }}>
                Tela Bloqueada
              </span>

              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
                A interação foi temporariamente pausada pelo {rotuloHost}. Aguarde a liberação.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 4. Barra de Ferramentas Inferior Mobile (Alvos de Toque >= 48px) */}
      <footer
        className="safe-area-footer"
        style={{
          borderTop: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          paddingTop: '0.5rem',
          boxSizing: 'border-box',
          zIndex: 20,
        }}
      >
        {/* Gaveta rápida de Cores e Espessuras */}
        {drawerFerramentas && (
          <div
            id="drawer-opcoes-ferramenta"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#111e38',
              gap: '0.75rem',
              overflowX: 'auto',
            }}
          >
            {/* Paleta de Cores Segura (Sem Vermelho) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {PALETA_CORES_GUEST.map((c) => (
                <button
                  key={c.id}
                  onClick={() => mudarCor(c.valor)}
                  className="touch-target-48"
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: '50%',
                    backgroundColor: c.valor,
                    border: corAtual === c.valor ? '2px solid #38bdf8' : '1px solid #475569',
                    cursor: 'pointer',
                    boxShadow: corAtual === c.valor ? '0 0 0 2px #0284c7' : 'none',
                  }}
                  aria-label={c.nome}
                  title={c.nome}
                />
              ))}
            </div>

            {/* Espessuras de Traço */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {ESPESSURAS_GUEST.map((esp) => (
                <button
                  key={`esp-${esp.valor}`}
                  onClick={() => mudarEspessura(esp.valor)}
                  className="touch-btn"
                  style={{
                    minWidth: 40,
                    height: 36,
                    minHeight: 36,
                    padding: '0 0.5rem',
                    fontSize: '0.75rem',
                    backgroundColor: espessuraAtual === esp.valor ? '#0284c7' : '#1e293b',
                    borderColor: espessuraAtual === esp.valor ? '#38bdf8' : '#334155',
                    color: '#ffffff',
                  }}
                >
                  {esp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Linha Principal de Botões de Ferramentas (Alvos >= 48px, dividida em dois grupos para caber em 412px) */}
        <div
          id="guest-toolbar"
          className="guest-toolbar-container"
        >
          {/* Grupo 1: Ferramentas de Desenho Vetorial */}
          <div className="guest-toolbar-group">
            {/* Lápis */}
            <button
              id="tool-guest-pencil"
              onClick={() => mudarFerramenta('pencil')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'pencil' ? 'touch-btn-active' : ''}`}
              aria-label="Lápis"
              title="Lápis"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </button>

            {/* Pincel */}
            <button
              id="tool-guest-brush"
              onClick={() => mudarFerramenta('brush')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'brush' ? 'touch-btn-active' : ''}`}
              aria-label="Pincel"
              title="Pincel"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 6.99l9.02 9.02 1.58-1.58a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"></path>
                <path d="M9 8c-2 3-4 3.5-7 4l8 8c.5-3 1-5 4-7"></path>
                <path d="M14.5 17.5 4.5 15"></path>
              </svg>
            </button>

            {/* Retângulo */}
            <button
              id="tool-guest-rect"
              onClick={() => mudarFerramenta('rectangle')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'rectangle' ? 'touch-btn-active' : ''}`}
              aria-label="Retângulo"
              title="Retângulo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            </button>

            {/* Elipse */}
            <button
              id="tool-guest-ellipse"
              onClick={() => mudarFerramenta('ellipse')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'ellipse' ? 'touch-btn-active' : ''}`}
              aria-label="Elipse"
              title="Elipse"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
            </button>

            {/* Linha / Seta */}
            <button
              id="tool-guest-arrow"
              onClick={() => mudarFerramenta('arrow')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'arrow' ? 'touch-btn-active' : ''}`}
              aria-label="Seta"
              title="Seta"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>

            {/* Texto */}
            <button
              id="tool-guest-text"
              onClick={() => mudarFerramenta('text')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'text' ? 'touch-btn-active' : ''}`}
              aria-label="Texto"
              title="Texto"
            >
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>T</span>
            </button>
          </div>

          {/* Grupo 2: Ações, Borracha, Desfazer, Configurações e Mídia */}
          <div className="guest-toolbar-group">
            {/* Borracha Lógica (DRAW_HIDE) */}
            <button
              id="tool-guest-eraser"
              onClick={() => mudarFerramenta('eraser')}
              disabled={screenLocked}
              className={`touch-btn ${ferramenta === 'eraser' ? 'touch-btn-active' : ''}`}
              aria-label="Borracha"
              title="Borracha"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
                <path d="M22 21H7"></path>
                <path d="m5 11 9 9"></path>
              </svg>
            </button>

            {/* Desfazer (Ação do Guest) */}
            <button
              id="btn-guest-undo"
              onClick={handleDesfazer}
              disabled={screenLocked}
              className="touch-btn"
              aria-label="Desfazer"
              title="Desfazer ação anterior"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"></path>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
              </svg>
            </button>

            {/* Refazer (Ação do Guest) */}
            <button
              id="btn-guest-redo"
              onClick={handleRefazer}
              disabled={screenLocked}
              className="touch-btn"
              aria-label="Refazer"
              title="Refazer ação desfeita"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6"></path>
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
              </svg>
            </button>

            {/* Alternar Drawer de Cores / Traço */}
            <button
              id="btn-guest-toggle-drawer"
              onClick={() => setDrawerFerramentas(!drawerFerramentas)}
              className="touch-btn"
              style={{
                backgroundColor: '#1e293b',
                border: `2px solid ${corAtual}`,
              }}
              aria-label="Cores e espessuras"
              title="Ajustar cores e espessura"
            >
              <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: corAtual }} />
            </button>

            {/* Botões de Mídia (Desabilitados até UNLOCK_MEDIA emitido pelo Host) */}
            <button
              id="btn-guest-media-play"
              onClick={() => handleMediaAction('PLAY')}
              disabled={!mediaUnlocked || screenLocked}
              className="touch-btn"
              style={{
                backgroundColor: mediaUnlocked ? '#064e3b' : '#1e293b',
                borderColor: mediaUnlocked ? '#059669' : '#334155',
                color: mediaUnlocked ? '#34d399' : '#64748b',
              }}
              aria-label={mediaUnlocked ? 'Reproduzir mídia' : 'Mídia bloqueada pelo anfitrião'}
              title={mediaUnlocked ? 'Reproduzir Mídia' : 'Controle de Mídia Bloqueado'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
