import React from 'react';
import ReactDOM from 'react-dom/client';
import { HostApp } from './host/HostApp';
import './shared/ipc-contract'; // garante declaração global de Window.desktopAPI
import { installGlobalErrorForwarding } from './shared/diag';

// Encaminha exceções não tratadas para o terminal (mesmo canal de D1), antes de qualquer outra coisa
installGlobalErrorForwarding('host');

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <HostApp />
    </React.StrictMode>
  );
}
