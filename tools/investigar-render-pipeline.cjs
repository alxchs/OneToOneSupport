/*
  tools/investigar-render-pipeline.cjs
  Investigação dos requisitos D6.2, D6.3 e D6.4:
  - D6.2: Ciclo de vida do WhiteboardEngine sob StrictMode e integridade do DOM do Fabric.
  - D6.3: Reprodução com múltiplos traços cursivos rápidos via Windows SendInput real (Modo DEV e Modo Produção).
  - D6.4: Experimento de aceleração gráfica por hardware vs --disable-gpu.
*/

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { createServer } = require('vite');

const root = path.resolve(__dirname, '..');
const exe = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);

const outDir = path.join(root, 'docs', 'reviews', 'evidencia-d6');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function runDevStrictModeAndCursiveStrokes() {
  console.log('\n===============================================================');
  console.log('--- TESTE 1: MODO DEV REAL (Vite + StrictMode) + D6.2 + D6.3 ---');
  console.log('===============================================================');

  const PORT = 9500 + Math.floor(Math.random() * 200);
  const VITE_PORT = 5180 + Math.floor(Math.random() * 50);

  const probeTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-d6-dev-'));
  const probeDbPath = path.join(probeTempDir, 'onetoone-dev.db');
  const probeUserDataDir = path.join(probeTempDir, 'userData');
  fs.mkdirSync(probeUserDataDir, { recursive: true });

  console.log('[D6-Dev] Iniciando Vite dev server na porta', VITE_PORT);
  const viteServer = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { port: VITE_PORT },
  });
  await viteServer.listen();
  const devUrl = `http://localhost:${VITE_PORT}/`;
  console.log('[D6-Dev] Vite dev server ouvindo em:', devUrl);

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ONETOONE_DIAG: '1',
    ONETOONE_DB_PATH: probeDbPath,
    VITE_DEV_SERVER_URL: devUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronArgs = [
    '.',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${probeUserDataDir}`,
    '--force-device-scale-factor=1.5',
  ];

  console.log('[D6-Dev] Lançando Electron com ONETOONE_DIAG=1 e CDP porta', PORT);
  const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });

  let electronStdout = '';
  app.stdout.on('data', (d) => {
    const s = d.toString();
    electronStdout += s;
    process.stdout.write(s);
  });
  app.stderr.on('data', (d) => {
    const s = d.toString();
    electronStdout += s;
    process.stderr.write(s);
  });

  try {
    await new Promise((r) => setTimeout(r, 4500));
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null,
    });
    const page = (await browser.pages())[0];

    await page.waitForSelector('#input-busca-atendido', { timeout: 8000 });

    // Criar atendido rápido
    const testNome = `Atendido D6 ${Date.now().toString().slice(-4)}`;
    await page.click('#btn-novo-atendido');
    await page.waitForSelector('#input-nome', { timeout: 5000 });
    await page.type('#input-nome', testNome);
    await page.type('#input-contato', '11999990000');
    await page.click('#btn-salvar-atendido');
    await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 600));

    // Abrir detalhes do atendido
    const detailSelector = `tr[data-nome="${testNome}"] button[id^="btn-ver-detalhes-"]`;
    await page.waitForSelector(detailSelector, { timeout: 5000 });
    await page.click(detailSelector);

    // Iniciar sessão
    await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
    await page.click('#btn-abrir-nova-sessao');
    await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
    await page.type('#input-titulo-sessao', 'Sessao D6 Investigacao');
    await page.click('#btn-confirmar-sessao');

    // Abrir Quadro Branco
    await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 8000 });
    console.log('[D6-Dev] Clicando em Abrir Quadro Branco...');
    await page.click('#btn-abrir-quadro-servidor');
    await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1200));

    // --- D6.2: INSPECIONAR CICLO DE VIDA E ESTRUTURA DO DOM ---
    const domInspection = await page.evaluate(() => {
      const container = document.getElementById('container-quadro-branco');
      const canvasContainers = container ? container.querySelectorAll('.canvas-container') : [];
      const upperCanvases = container ? container.querySelectorAll('.upper-canvas') : [];
      const lowerCanvases = container ? container.querySelectorAll('.lower-canvas') : [];
      const rawCanvases = container ? container.querySelectorAll('canvas') : [];
      const engine = window.__whiteboardEngine;

      return {
        hasContainer: !!container,
        canvasContainersCount: canvasContainers.length,
        upperCanvasesCount: upperCanvases.length,
        lowerCanvasesCount: lowerCanvases.length,
        totalCanvasesInContainer: rawCanvases.length,
        engineDefined: !!engine,
        engineInstanciaId: engine ? engine.instanciaId : null,
        lowerCanvasId: engine?.canvas?.lowerCanvasEl?.id,
        isLowerCanvasElementSameAsDOM: engine?.canvas?.lowerCanvasEl === document.getElementById('canvas-quadro-branco'),
        isUpperCanvasElementAttached: !!engine?.canvas?.upperCanvasEl?.parentNode,
      };
    });

    console.log('[D6.2 RESULT] Inspeção do DOM e WhiteboardEngine no modo DEV:');
    console.log(JSON.stringify(domInspection, null, 2));

    // Analisar logs de engine_lifecycle no stdout
    const lifecycleMatches = [...electronStdout.matchAll(/\[engine_lifecycle\]\s*(\{.*?\})/g)].map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return m[1];
      }
    });
    console.log('[D6.2 RESULT] Eventos engine_lifecycle capturados no terminal:');
    console.log(JSON.stringify(lifecycleMatches, null, 2));

    // --- D6.3: DESENHO DE 5 TRAÇOS CURSIVOS RÁPIDOS COM SENDINPUT REAL ---
    console.log('\n[D6.3] Preparando desenho de 5 traços cursivos via Windows SendInput...');
    await page.click('#tool-pencil');
    await new Promise((r) => setTimeout(r, 300));

    const canvasArea = await page.evaluate(() => {
      const el = document.querySelector('.upper-canvas') || document.getElementById('canvas-quadro-branco');
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    });

    const clientBaseX = canvasArea.left + 80;
    const clientBaseY = canvasArea.top + 100;
    console.log(`[D6.3] Posição base para os traços: client(${clientBaseX}, ${clientBaseY})`);

    const cursiveScript = path.join(root, 'tools', 'drag-cursive-sendinput.ps1');
    const sendInputRes = spawnSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        cursiveScript,
        '-ProcessId',
        String(app.pid || 0),
        '-WindowTitle',
        'OneToOneSupport',
        '-ClientBaseX',
        String(clientBaseX),
        '-ClientBaseY',
        String(clientBaseY),
        '-StrokeCount',
        '5',
        '-DelayBetweenStrokesMs',
        '60',
        '-StepsPerStroke',
        '30',
        '-DelayPerStepMs',
        '8',
      ],
      { stdio: 'inherit' }
    );

    // Aguardar após SendInput
    await new Promise((r) => setTimeout(r, 1000));

    // Executa também sequência rápida de traços cursivos via page.mouse para garantir entrada direta
    console.log('[D6.3] Executando sequência de 5 traços cursivos rápidos via page.mouse...');
    for (let s = 0; s < 5; s++) {
      const sX = clientBaseX + s * 50;
      const sY = clientBaseY + (s % 2) * 20;
      await page.mouse.move(sX, sY);
      await page.mouse.down();
      for (let step = 1; step <= 25; step++) {
        const t = step / 25;
        const curX = sX + Math.round(t * 60);
        const curY = sY + Math.round(Math.sin(t * Math.PI * 4) * 28);
        await page.mouse.move(curX, curY);
        await new Promise((r) => setTimeout(r, 8));
      }
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 60));
    }

    // Aguardar 1.5s após término de todos os traços
    await new Promise((r) => setTimeout(r, 1500));

    // Medição de pixels e estado pós-traços
    const postDrawMeasurement = await page.evaluate(() => {
      const engine = window.__whiteboardEngine;
      const lowerEl = engine?.canvas?.lowerCanvasEl;
      let nonZeroPixels = 0;
      if (lowerEl) {
        const ctx = lowerEl.getContext('2d');
        const data = ctx.getImageData(0, 0, lowerEl.width, lowerEl.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) nonZeroPixels++;
        }
      }
      const badgeElem = document.getElementById('badge-elementos')?.innerText || '';

      return {
        badgeElementos: badgeElem,
        objetosNoFabric: engine?.canvas?.getObjects()?.length || 0,
        pixelsNoCanvas: nonZeroPixels,
        canvasWidth: lowerEl?.width,
        canvasHeight: lowerEl?.height,
      };
    });

    console.log('[D6.3 RESULT] Medição após 5 traços cursivos rápidos em MODO DEV:');
    console.log(JSON.stringify(postDrawMeasurement, null, 2));

    // Captura screenshot
    const shotPathDev = path.join(outDir, 'd6-dev-cursive-strokes.png');
    await page.screenshot({ path: shotPathDev });
    console.log('[D6.3] Screenshot salvo em:', shotPathDev);

    await browser.disconnect();
    app.kill('SIGTERM');
    await viteServer.close();

    return {
      modo: 'dev',
      domInspection,
      lifecycleMatches,
      postDrawMeasurement,
      stdout: electronStdout,
    };
  } catch (err) {
    console.error('[D6-Dev] Erro durante o teste:', err);
    try {
      app.kill('SIGKILL');
    } catch {}
    try {
      await viteServer.close();
    } catch {}
    throw err;
  }
}

async function runProductionCursiveStrokes(disableGpu = false) {
  const label = disableGpu ? 'PRODUÇÃO COM --disable-gpu (D6.4)' : 'PRODUÇÃO PADRÃO COM GPU (D6.3)';
  console.log('\n===============================================================');
  console.log(`--- TESTE: MODO ${label} ---`);
  console.log('===============================================================');

  const PORT = 9700 + Math.floor(Math.random() * 200);

  const probeTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-d6-prod-'));
  const probeDbPath = path.join(probeTempDir, 'onetoone-prod.db');
  const probeUserDataDir = path.join(probeTempDir, 'userData');
  fs.mkdirSync(probeUserDataDir, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ONETOONE_DIAG: '1', // Testando sob flag de diagnóstico para observar checkpoints
    ONETOONE_DB_PATH: probeDbPath,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;

  const electronArgs = [
    '.',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${probeUserDataDir}`,
    '--force-device-scale-factor=1.5',
  ];

  if (disableGpu) {
    electronArgs.push('--disable-gpu');
  }

  console.log(`[D6-Prod] Lançando Electron (${disableGpu ? '--disable-gpu' : 'GPU normal'}), porta CDP ${PORT}`);
  const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });

  let electronStdout = '';
  app.stdout.on('data', (d) => {
    const s = d.toString();
    electronStdout += s;
    process.stdout.write(s);
  });
  app.stderr.on('data', (d) => {
    const s = d.toString();
    electronStdout += s;
    process.stderr.write(s);
  });

  try {
    await new Promise((r) => setTimeout(r, 4500));
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: null,
    });
    const page = (await browser.pages())[0];

    await page.waitForSelector('#input-busca-atendido', { timeout: 8000 });

    // Criar atendido
    const prodNome = disableGpu ? `Atendido GPU Off ${Date.now().toString().slice(-4)}` : `Atendido Prod ${Date.now().toString().slice(-4)}`;
    await page.click('#btn-novo-atendido');
    await page.waitForSelector('#input-nome', { timeout: 5000 });
    await page.type('#input-nome', prodNome);
    await page.type('#input-contato', '11988887777');
    await page.click('#btn-salvar-atendido');
    await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 600));

    // Abrir detalhes do atendido
    const detailSelector = `tr[data-nome="${prodNome}"] button[id^="btn-ver-detalhes-"]`;
    await page.waitForSelector(detailSelector, { timeout: 5000 });
    await page.click(detailSelector);

    // Iniciar sessão
    await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
    await page.click('#btn-abrir-nova-sessao');
    await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
    await page.type('#input-titulo-sessao', 'Sessao D6 Prod');
    await page.click('#btn-confirmar-sessao');

    // Abrir Quadro Branco
    await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 8000 });
    await page.click('#btn-abrir-quadro-servidor');
    await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 1200));

    await page.click('#tool-pencil');
    await new Promise((r) => setTimeout(r, 300));

    const canvasArea = await page.evaluate(() => {
      const el = document.querySelector('.upper-canvas') || document.getElementById('canvas-quadro-branco');
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    });

    const clientBaseX = canvasArea.left + 80;
    const clientBaseY = canvasArea.top + 100;

    const cursiveScript = path.join(root, 'tools', 'drag-cursive-sendinput.ps1');
    const sendInputRes = spawnSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        cursiveScript,
        '-ProcessId',
        String(app.pid || 0),
        '-WindowTitle',
        'OneToOneSupport',
        '-ClientBaseX',
        String(clientBaseX),
        '-ClientBaseY',
        String(clientBaseY),
        '-StrokeCount',
        '5',
        '-DelayBetweenStrokesMs',
        '60',
        '-StepsPerStroke',
        '30',
        '-DelayPerStepMs',
        '8',
      ],
      { stdio: 'inherit' }
    );

    // Aguardar após SendInput
    await new Promise((r) => setTimeout(r, 1000));

    // Executa também sequência rápida de traços cursivos via page.mouse
    console.log(`[D6.3] Executando sequência de 5 traços cursivos rápidos via page.mouse em ${label}...`);
    for (let s = 0; s < 5; s++) {
      const sX = clientBaseX + s * 50;
      const sY = clientBaseY + (s % 2) * 20;
      await page.mouse.move(sX, sY);
      await page.mouse.down();
      for (let step = 1; step <= 25; step++) {
        const t = step / 25;
        const curX = sX + Math.round(t * 60);
        const curY = sY + Math.round(Math.sin(t * Math.PI * 4) * 28);
        await page.mouse.move(curX, curY);
        await new Promise((r) => setTimeout(r, 8));
      }
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 60));
    }

    await new Promise((r) => setTimeout(r, 1500));

    const postDrawMeasurement = await page.evaluate(() => {
      const engine = window.__whiteboardEngine;
      const lowerEl = engine?.canvas?.lowerCanvasEl;
      let nonZeroPixels = 0;
      if (lowerEl) {
        const ctx = lowerEl.getContext('2d');
        const data = ctx.getImageData(0, 0, lowerEl.width, lowerEl.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) nonZeroPixels++;
        }
      }
      const badgeElem = document.getElementById('badge-elementos')?.innerText || '';

      return {
        badgeElementos: badgeElem,
        objetosNoFabric: engine?.canvas?.getObjects()?.length || 0,
        pixelsNoCanvas: nonZeroPixels,
        canvasWidth: lowerEl?.width,
        canvasHeight: lowerEl?.height,
      };
    });

    console.log(`[D6 RESULT] Medição após 5 traços cursivos em ${label}:`);
    console.log(JSON.stringify(postDrawMeasurement, null, 2));

    const fileName = disableGpu ? 'd6-prod-disable-gpu.png' : 'd6-prod-gpu.png';
    const shotPath = path.join(outDir, fileName);
    await page.screenshot({ path: shotPath });
    console.log('[D6] Screenshot salvo em:', shotPath);

    await browser.disconnect();
    app.kill('SIGTERM');

    return {
      modo: disableGpu ? 'prod-disable-gpu' : 'prod-gpu',
      postDrawMeasurement,
      stdout: electronStdout,
    };
  } catch (err) {
    console.error(`[D6] Erro durante o teste ${label}:`, err);
    try {
      app.kill('SIGKILL');
    } catch {}
    throw err;
  }
}

async function main() {
  console.log('[D6 Investigação] Iniciando bateria completa de testes de pipeline de renderização...');
  const results = {};

  // 1. D6.2 e D6.3 em Modo DEV com StrictMode
  results.dev = await runDevStrictModeAndCursiveStrokes();

  // 2. D6.3 em Modo Produção com GPU normal
  results.prodGpu = await runProductionCursiveStrokes(false);

  // 3. D6.4 em Modo Produção com --disable-gpu
  results.prodNoGpu = await runProductionCursiveStrokes(true);

  const resultsFile = path.join(outDir, 'resultados-d6.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log('\n[D6 Conclusão] Todos os experimentos foram executados.');
  console.log('[D6 Conclusão] Resultados consolidados salvos em:', resultsFile);
}

main().catch((err) => {
  console.error('[D6 Fatal Error]:', err);
  process.exit(1);
});
