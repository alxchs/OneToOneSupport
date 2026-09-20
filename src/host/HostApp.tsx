import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { ListaAtendidosPage } from './pages/ListaAtendidosPage';
import { FormAtendidoPage } from './pages/FormAtendidoPage';
import { DetalheAtendidoPage } from './pages/DetalheAtendidoPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';
import { QuadroBrancoPage } from './pages/QuadroBrancoPage';
import { useHostStore } from './store/useHostStore';
import { reduceEvent, WhiteboardEvent } from '../shared/events/reducer';

export const HostApp: React.FC = () => {
  const { view, mensagemAlerta, limparMensagens, carregarDicionario } = useHostStore();
  const [scaleFactor, setScaleFactor] = useState(1.5);
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    carregarDicionario();
    if (window.desktopAPI) {
      window.desktopAPI.getScaleFactor().then(setScaleFactor).catch(console.error);
      window.desktopAPI.getAppVersion().then(setAppVersion).catch(console.error);
    }

    // Escuta eventos em tempo real enviados pelo Guest
    if (window.desktopAPI?.serverSession) {
      const unsubGuest = window.desktopAPI.serverSession.onGuestEvent((event: any) => {
        if (!event || !event.type) return;

        if (event.type === 'GUEST_MUTED') {
          const rawPayload = event.payload;
          const parsedPayload =
            typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
          const isMuted = Boolean(parsedPayload?.muted ?? event.muted);
          useHostStore.setState({ guestMuted: isMuted });
          return;
        }

        if (
          event.type === 'DRAW_ADD' ||
          event.type === 'DRAW_HIDE' ||
          event.type === 'CLEAR_TAB'
        ) {
          const rawPayload = event.payload;
          const parsedPayload =
            typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
          const ev: WhiteboardEvent = {
            id: event.id || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `ev-${Date.now()}`),
            sessao_id: useHostStore.getState().activeSessaoId || undefined,
            aba_id: event.abaId || 'default',
            tipo: event.type,
            payload: parsedPayload,
            autor: 'guest',
            criado_em: event.ts || Date.now(),
          };
          const nextState = reduceEvent(useHostStore.getState().tabState, ev);
          useHostStore.setState({ tabState: nextState });
        }
      });

      return () => {
        unsubGuest();
      };
    }
  }, [carregarDicionario]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <Navbar appVersion={appVersion} scaleFactor={scaleFactor} />

      <main style={{ flex: 1, padding: '2rem', maxWidth: '80rem', width: '95%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Banner de Feedback Global */}
        {mensagemAlerta && (
          <div
            id="banner-alerta-global"
            style={{
              marginBottom: '1.5rem',
              padding: '1rem 1.25rem',
              borderRadius: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: mensagemAlerta.tipo === 'alerta' ? '#451a03' : '#064e3b',
              border: `1px solid ${mensagemAlerta.tipo === 'alerta' ? '#b45309' : '#059669'}`,
              color: mensagemAlerta.tipo === 'alerta' ? '#fef3c7' : '#d1fae5',
            }}
          >
            <span>{mensagemAlerta.texto}</span>
            <button
              onClick={limparMensagens}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '0 0.5rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {view === 'lista' && <ListaAtendidosPage />}
        {view === 'form' && <FormAtendidoPage />}
        {view === 'detalhes' && <DetalheAtendidoPage />}
        {view === 'configuracoes' && <ConfiguracoesPage />}
        {view === 'quadro' && <QuadroBrancoPage />}
      </main>

      <footer
        style={{
          padding: '1.25rem 2rem',
          backgroundColor: '#0c1322',
          borderTop: '1px solid #1e293b',
          fontSize: '0.8125rem',
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        <span>
          OneToOneSupport Host • Electron 30 • SQLite WAL • Target 3840x2160 @150% • Zero regra de negócio no Renderer
        </span>
      </footer>
    </div>
  );
};
