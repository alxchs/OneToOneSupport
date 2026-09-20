import { createServer } from 'vite';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function startDev() {
  console.log('[Dev] Compilando processo principal do Electron...');
  execSync('npx tsc -p tsconfig.electron.json', { cwd: projectRoot, stdio: 'inherit' });

  console.log('[Dev] Iniciando Vite dev server...');
  const server = await createServer({
    configFile: path.join(projectRoot, 'vite.config.ts'),
    server: { port: 5173 },
  });
  await server.listen();

  const devUrl = server.resolvedUrls?.local?.[0] || 'http://localhost:5173/';
  console.log(`[Dev] Vite dev server ouvindo em: ${devUrl}`);

  // Localizar executável do Electron
  let electronExe = 'npx electron';
  const winElectron = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (process.platform === 'win32' && winElectron) {
    electronExe = winElectron;
  }

  console.log('[Dev] Iniciando Electron...');
  const electronProcess = spawn(electronExe, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devUrl,
      NODE_ENV: 'development',
    },
  });

  electronProcess.on('close', async (code) => {
    console.log(`[Dev] Electron encerrado com código ${code}`);
    await server.close();
    process.exit(code ?? 0);
  });
}

startDev().catch((err) => {
  console.error('[Dev] Erro fatal:', err);
  process.exit(1);
});
