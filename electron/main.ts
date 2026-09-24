import { app, BrowserWindow, screen, ipcMain, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initDb } from './db/connection';
import { registerIpcHandlers } from './ipc/router';
import { IPC_CHANNELS, VersionInfoDTO } from '../src/shared/ipc-contract';
import buildInfo from '../src/shared/build-info.json';
import { isDiagEnabled } from '../src/shared/diag';
import {
  applyPreReadyExperiments,
  isExperimentActive,
  printActiveExperiments,
} from './experiments';

// D10: Aplicar switches de linha de comando dos experimentos antes de app.whenReady()
applyPreReadyExperiments();

export function getVersionInfo(): VersionInfoDTO {
  const candidatePaths = [
    path.resolve(__dirname, '../../dist/guest/version.json'),
    path.resolve(__dirname, '../guest/version.json'),
    path.resolve(process.cwd(), 'dist/guest/version.json'),
  ];
  let guestCommit: string | null = null;
  let guestStamp: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        guestCommit = parsed.commit;
        guestStamp = parsed.stamp;
        break;
      } catch {}
    }
  }
  const guestOutdated = !guestCommit || guestCommit !== buildInfo.commit;
  return {
    hostStamp: buildInfo.stamp,
    guestStamp: guestStamp || undefined,
    guestOutdated,
  };
}

function createWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
  const { width: workWidth, height: workHeight } = primaryDisplay.workArea;
  const scaleFactor = primaryDisplay.scaleFactor;

  console.log(
    `[Main] Monitor primário detectado: ${screenWidth}x${screenHeight} @ ${Math.round(
      scaleFactor * 100
    )}% scale factor (Área útil de trabalho: ${workWidth}x${workHeight})`
  );

  // Dimensionamento proporcional à área útil do display (evita pixels fixos que quebram em 4K @150%)
  const initialWidth = Math.max(960, Math.round(workWidth * 0.85));
  const initialHeight = Math.max(640, Math.round(workHeight * 0.85));

  // Aplicar CSP via header HTTP (relaxada para Fast Refresh no dev com VITE_DEV_SERVER_URL; estrita no build)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: http://localhost:*;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  const preloadPath = path.join(__dirname, 'preload.js');
  const isNothrottle = isExperimentActive('nothrottle');

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: Math.round(workWidth * 0.4),
    minHeight: Math.round(workHeight * 0.4),
    center: true,
    show: false,
    backgroundColor: '#0f172a', // Slate escuro elegante (sem vermelho)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      devTools: true,
      ...(isNothrottle ? { backgroundThrottling: false } : {}),
    },
  });

  // D10: Diagnóstico de visibilidade da janela (só sob ONETOONE_DIAG=1)
  if (isDiagEnabled()) {
    const logJanelaEvento = (ev: string) => {
      const ts = new Date().toISOString();
      const isVisible = typeof win.isVisible === 'function' ? win.isVisible() : undefined;
      const isMinimized = typeof win.isMinimized === 'function' ? win.isMinimized() : undefined;
      const isFocused = typeof win.isFocused === 'function' ? win.isFocused() : undefined;
      console.log(
        `[DIAG-HOST] [${ts}] [janela_evento]`,
        JSON.stringify({
          evento: ev,
          isVisible,
          isMinimized,
          isFocused,
        })
      );
    };

    win.on('show', () => logJanelaEvento('show'));
    win.on('hide', () => logJanelaEvento('hide'));
    win.on('minimize', () => logJanelaEvento('minimize'));
    win.on('restore', () => logJanelaEvento('restore'));
    win.on('focus', () => logJanelaEvento('focus'));
    win.on('blur', () => logJanelaEvento('blur'));
  }

  // Bloqueio rigoroso de navegação e novas janelas (window.open)
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Segurança] Bloqueada tentativa de window.open para: ${url}`);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer && navigationUrl.startsWith(devServer)) {
      return;
    }
    if (navigationUrl.startsWith('file://')) {
      return;
    }
    event.preventDefault();
    console.warn(`[Segurança] Bloqueada tentativa de navegação externa para: ${navigationUrl}`);
  });

  // Exibir janela apenas quando pronta para evitar flashes
  win.once('ready-to-show', () => {
    win.show();
  });

  // Carregar Renderer (Vite dev server ou build empacotado)
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    const candidateRendererDist = path.join(__dirname, '../renderer/index.html');
    const candidateRootHtml = path.resolve(__dirname, '../../index.html');

    if (fs.existsSync(candidateRendererDist)) {
      win.loadFile(candidateRendererDist);
    } else if (fs.existsSync(candidateRootHtml)) {
      win.loadFile(candidateRootHtml);
    } else {
      // Fallback mínimo inline seguro
      win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>OneToOneSupport</title><style>body{background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head><body><div style="text-align:center"><h1>OneToOneSupport</h1><p>Electron Shell Seguro Inicializado</p></div></body></html>'
        )}`
      );
    }
  }

  return win;
}

// Configurar handlers de IPC do Preload
ipcMain.handle(IPC_CHANNELS.DESKTOP_GET_SCALE_FACTOR, () => {
  const primary = screen.getPrimaryDisplay();
  return primary.scaleFactor;
});

ipcMain.handle(IPC_CHANNELS.DESKTOP_GET_DISPLAY_METRICS, () => {
  const primary = screen.getPrimaryDisplay();
  return {
    width: primary.bounds.width,
    height: primary.bounds.height,
    scaleFactor: primary.scaleFactor,
  };
});

ipcMain.handle(IPC_CHANNELS.DESKTOP_GET_APP_VERSION, () => {
  return buildInfo.stamp;
});

ipcMain.handle(IPC_CHANNELS.DESKTOP_GET_VERSION_INFO, () => {
  return getVersionInfo();
});

app.whenReady().then(() => {
  printActiveExperiments();
  console.log(`[Version] ${buildInfo.stamp}`);
  const vInfo = getVersionInfo();
  if (vInfo.guestOutdated) {
    console.warn('[Version] Guest desatualizado: rode npm run build');
  }

  // Inicializar banco de dados do Host
  try {
    initDb();
    console.log('[Main] Banco de dados SQLite inicializado com sucesso.');
  } catch (err) {
    console.error('[Main] Falha ao inicializar o banco de dados:', err);
  }

  // Registrar rotas de IPC de domínio
  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
