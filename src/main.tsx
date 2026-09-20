import React from 'react';
import ReactDOM from 'react-dom/client';
import { HostApp } from './host/HostApp';
import './shared/ipc-contract'; // garante declaração global de Window.desktopAPI

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <HostApp />
    </React.StrictMode>
  );
}
