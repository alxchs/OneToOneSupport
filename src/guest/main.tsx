import React from 'react';
import ReactDOM from 'react-dom/client';
import { JoinFlow } from './JoinFlow';
import './guest.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <JoinFlow />
    </React.StrictMode>
  );
}
