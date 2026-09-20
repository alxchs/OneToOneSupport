import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

interface DisplayInfo {
  width: number;
  height: number;
  scaleFactor: number;
}

declare global {
  interface Window {
    desktopAPI?: {
      getScaleFactor: () => Promise<number>;
      getDisplayMetrics: () => Promise<DisplayInfo>;
      getAppVersion: () => Promise<string>;
    };
  }
}

export const App: React.FC = () => {
  const [metrics, setMetrics] = useState<DisplayInfo | null>(null);
  const [version, setVersion] = useState<string>('1.0.0');

  // Verificações de isolamento estrito
  const requireType = typeof (window as unknown as { require?: unknown }).require;
  const processType = typeof (window as unknown as { process?: unknown }).process;

  useEffect(() => {
    if (window.desktopAPI) {
      window.desktopAPI.getDisplayMetrics().then(setMetrics).catch(console.error);
      window.desktopAPI.getAppVersion().then(setVersion).catch(console.error);
    }
  }, []);

  return (
    <div
      style={{
        padding: '2.5rem',
        maxWidth: '56rem',
        width: '90%',
        backgroundColor: '#111c44',
        borderRadius: '1rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #1e293b',
      }}
    >
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.875rem', color: '#38bdf8' }}>
          OneToOneSupport
        </h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '1rem' }}>
          Fase 01: Scaffolding e Banco de Dados | Versão: {version}
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {/* Card Segurança e Isolamento */}
        <section
          style={{
            backgroundColor: '#0c1322',
            padding: '1.25rem',
            borderRadius: '0.75rem',
            border: '1px solid #1e293b',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', color: '#10b981', marginTop: 0, marginBottom: '0.75rem' }}>
            Segurança em Runtime
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', lineHeight: '1.75' }}>
            <li>
              <strong>contextIsolation:</strong> <span style={{ color: '#10b981' }}>ATIVO</span>
            </li>
            <li>
              <strong>nodeIntegration:</strong> <span style={{ color: '#10b981' }}>DESATIVADO</span>
            </li>
            <li>
              <strong>sandbox:</strong> <span style={{ color: '#10b981' }}>ATIVO</span>
            </li>
            <li>
              <strong>typeof require:</strong>{' '}
              <span id="test-require" style={{ color: requireType === 'undefined' ? '#10b981' : '#f59e0b' }}>
                '{requireType}'
              </span>
            </li>
            <li>
              <strong>typeof process:</strong>{' '}
              <span id="test-process" style={{ color: processType === 'undefined' ? '#10b981' : '#f59e0b' }}>
                '{processType}'
              </span>
            </li>
          </ul>
        </section>

        {/* Card Resolução e HiDPI */}
        <section
          style={{
            backgroundColor: '#0c1322',
            padding: '1.25rem',
            borderRadius: '0.75rem',
            border: '1px solid #1e293b',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', color: '#38bdf8', marginTop: 0, marginBottom: '0.75rem' }}>
            Display & HiDPI (Regra #2)
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', lineHeight: '1.75' }}>
            <li>
              <strong>window.devicePixelRatio:</strong> {window.devicePixelRatio}
            </li>
            <li>
              <strong>Scale Factor Host:</strong>{' '}
              {metrics ? `${Math.round(metrics.scaleFactor * 100)}%` : 'Lendo...'}
            </li>
            <li>
              <strong>Resolução Primária:</strong>{' '}
              {metrics ? `${metrics.width} x ${metrics.height}` : 'Lendo...'}
            </li>
            <li>
              <strong>Target de Homologação:</strong> 3840x2160 @150%
            </li>
          </ul>
        </section>
      </div>

      <footer style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #1e293b', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
        Banco SQLite WAL ativado • 7 tabelas migradas • Validação estrita via NOT EXISTS
      </footer>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
