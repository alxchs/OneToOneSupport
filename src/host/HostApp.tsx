import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { ListaAtendidosPage } from './pages/ListaAtendidosPage';
import { FormAtendidoPage } from './pages/FormAtendidoPage';
import { DetalheAtendidoPage } from './pages/DetalheAtendidoPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';
import { QuadroBrancoPage } from './pages/QuadroBrancoPage';
import { useHostStore } from './store/useHostStore';
import type { VersionInfoDTO, GuestEventDTO } from '../shared/ipc-contract';
import buildInfo from '../shared/build-info.json';

export const HostApp: React.FC = () => {
  const { view, mensagemAlerta, limparMensagens, carregarDicionario } = useHostStore();
  const [scaleFactor, setScaleFactor] = useState(1.5);
  const [appVersion, setAppVersion] = useState(buildInfo.stamp);
  const [versionInfo, setVersionInfo] = useState<VersionInfoDTO | null>(null);

  useEffect(() => {
    console.log(`[Version] Host: ${buildInfo.stamp}`);
    carregarDicionario();
    if (window.desktopAPI) {
      window.desktopAPI.getScaleFactor().then(setScaleFactor).catch(console.error);
      window.desktopAPI.getAppVersion().then(setAppVersion).catch(console.error);
      if (window.desktopAPI.getVersionInfo) {
        window.desktopAPI.getVersionInfo().then((info) => {
          setVersionInfo(info);
          if (info.guestOutdated) {
            console.warn('[Version] Guest desatualizado: rode npm run build');
          }
        }).catch(console.error);
      }
    }

    // Escuta eventos em tempo real enviados pelo Guest através do funil único no store (D17)
    if (window.desktopAPI?.serverSession) {
      const unsubGuest = window.desktopAPI.serverSession.onGuestEvent((event: GuestEventDTO) => {
        useHostStore.getState().aplicarEventoRemoto(event);
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
        id="host-footer"
        style={{
          padding: '1.25rem 2rem',
          backgroundColor: '#0c1322',
          borderTop: '1px solid #1e293b',
          fontSize: '0.8125rem',
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        <div>
          OneToOneSupport Host • Electron 30 • SQLite WAL • Target 3840x2160 @150% • Zero regra de negócio no Renderer
        </div>
        <div
          id="host-version-stamp"
          style={{ marginTop: '0.25rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          Build: {versionInfo?.hostStamp || appVersion}
        </div>
        {versionInfo?.guestOutdated && (
          <div
            id="aviso-guest-desatualizado"
            style={{
              marginTop: '0.5rem',
              color: '#f59e0b',
              fontWeight: 'bold',
              backgroundColor: '#451a03',
              border: '1px solid #b45309',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              display: 'inline-block',
            }}
          >
            ⚠️ Guest desatualizado: rode npm run build
          </div>
        )}
      </footer>
    </div>
  );
};
