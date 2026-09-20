import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function verify() {
  console.log('[Verify-UI] Iniciando Electron com --remote-debugging-port=9222...');
  const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

  const electronProcess = spawn(electronExe, ['.', '--remote-debugging-port=9222'], {
    cwd: projectRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  electronProcess.stdout.on('data', (d) => {
    const s = d.toString().trim();
    if (s) console.log(`[Electron Stdout] ${s}`);
  });
  electronProcess.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s) console.error(`[Electron Stderr] ${s}`);
  });

  // Aguardar 3 segundos para inicializar
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('[Verify-UI] Conectando ao Electron via Chrome DevTools Protocol...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });

  const pages = await browser.pages();
  console.log(`[Verify-UI] Páginas abertas no Electron: ${pages.length}`);

  const page = pages[0] || (await browser.newPage());

  page.on('console', (msg) => console.log(`[Renderer Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => console.error(`[Renderer PageError] ${err}`));

  // Avaliar typeof require e typeof process no contexto do renderer
  const evalResults = await page.evaluate(() => {
    return {
      typeofRequire: typeof (window).require,
      typeofProcess: typeof (window).process,
      title: document.title,
      bodyText: document.body.innerText,
      devicePixelRatio: window.devicePixelRatio,
    };
  });

  console.log('\n================ RESULTADOS DA VERIFICAÇÃO EM RUNTIME ================');
  console.log('• typeof require:', evalResults.typeofRequire);
  console.log('• typeof process:', evalResults.typeofProcess);
  console.log('• document.title:', evalResults.title);
  console.log('• devicePixelRatio:', evalResults.devicePixelRatio);
  console.log('\n--- Texto Renderizado na Janela ---');
  console.log(evalResults.bodyText);
  console.log('=====================================================================\n');

  // Capturar screenshot
  const screenshotPath = path.join(projectRoot, 'docs', 'electron-window.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`[Verify-UI] Screenshot salvo em: ${screenshotPath}`);

  await browser.disconnect();
  electronProcess.kill('SIGINT');
  console.log('[Verify-UI] Electron encerrado normalmente.');
}

verify().catch((err) => {
  console.error('[Verify-UI] Erro:', err);
  process.exit(1);
});
