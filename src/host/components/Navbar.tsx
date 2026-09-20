import React from 'react';
import { useHostStore, HostView } from '../store/useHostStore';

interface NavbarProps {
  appVersion: string;
  scaleFactor: number;
}

export const Navbar: React.FC<NavbarProps> = ({ appVersion, scaleFactor }) => {
  const { view, setView, dicionario } = useHostStore();

  const rotuloHost = dicionario['rotulo.host'] || 'Profissional';
  const rotuloGuest = dicionario['rotulo.guest'] || 'Atendido';

  const navItems: { id: HostView; label: string; testId: string }[] = [
    { id: 'lista', label: `${rotuloGuest}s`, testId: 'btn-nav-atendidos' },
    { id: 'configuracoes', label: 'Configurações & Dicionário', testId: 'btn-aba-config' },
  ];

  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.25rem 2rem',
        backgroundColor: '#0c1322',
        borderBottom: '1px solid #1e293b',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#38bdf8',
              letterSpacing: '-0.025em',
            }}
          >
            OneToOneSupport
          </h1>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Painel do {rotuloHost} • Host Shell v{appVersion} • {Math.round(scaleFactor * 100)}% Scale
          </span>
        </div>

        <nav style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
          {navItems.map((item) => {
            const ativo = view === item.id || (item.id === 'lista' && (view === 'form' || view === 'detalhes'));
            return (
              <button
                key={item.id}
                id={item.testId}
                onClick={() => setView(item.id)}
                style={{
                  padding: '0.625rem 1.125rem',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  borderRadius: '0.5rem',
                  border: '1px solid',
                  borderColor: ativo ? '#0284c7' : '#334155',
                  backgroundColor: ativo ? '#0369a1' : '#1e293b',
                  color: ativo ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.8125rem',
          color: '#94a3b8',
        }}
      >
        <span
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: '#064e3b',
            color: '#34d399',
            borderRadius: '9999px',
            fontWeight: 600,
          }}
        >
          ● SQLite WAL Ativo
        </span>
        <span
          style={{
            padding: '0.375rem 0.75rem',
            backgroundColor: '#1e293b',
            borderRadius: '9999px',
            border: '1px solid #334155',
          }}
        >
          Regra #1 NOT EXISTS
        </span>
      </div>
    </header>
  );
};
