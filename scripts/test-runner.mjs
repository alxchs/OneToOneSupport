import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Localizar binário do Electron
let electronPath;
const winElectron = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const unixElectron = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron');

if (process.platform === 'win32' && fs.existsSync(winElectron)) {
  electronPath = winElectron;
} else if (fs.existsSync(unixElectron)) {
  electronPath = unixElectron;
} else {
  // Fallback para require('electron')
  try {
    const electronPkg = await import('electron');
    electronPath = electronPkg.default || electronPkg;
  } catch {
    console.error('[Test-Runner] Binário do Electron não encontrado em node_modules/electron');
    process.exit(1);
  }
}

const vitestMjs = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
if (!fs.existsSync(vitestMjs)) {
  console.error('[Test-Runner] vitest.mjs não encontrado em:', vitestMjs);
  process.exit(1);
}

const userArgs = process.argv.slice(2);
const finalArgs = userArgs.length > 0 ? userArgs : ['run'];

console.log(`[Test-Runner] Executando vitest sob ABI do Electron (${electronPath}) com ELECTRON_RUN_AS_NODE=1...`);

const child = spawn(electronPath, [vitestMjs, ...finalArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
