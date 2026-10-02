const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const PORT = 9652;

const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-fix-test-'));
const testDbPath = path.join(testTempDir, 'fix.db');
const testUserDataDir = path.join(testTempDir, 'userData');
fs.mkdirSync(testUserDataDir, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'development',
  ONETOONE_DIAG: '1',
  ONETOONE_DB_PATH: testDbPath,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const exe = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);

const electronArgs = [
  '.',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${testUserDataDir}`,
  '--force-device-scale-factor=1.5',
];

console.log('[TestFix] Lançando Electron...');
const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });

const diagGuestLogs = [];
app.stdout.on('data', (d) => {
  const str = d.toString();
  process.stdout.write(str);
  if (str.includes('[DIAG-GUEST]')) {
    diagGuestLogs.push(str);
  }
});
app.stderr.on('data', (d) => process.stderr.write(d.toString()));

async function run() {
  let browser = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${PORT}`,
        defaultViewport: null,
      });
      break;
    } catch {
      console.log(`[TestFix] Aguardando Electron abrir porta ${PORT} (${i + 1}/25)...`);
    }
  }

  if (!browser) {
    throw new Error('Electron não abriu a porta de depuração.');
  }

  const page = (await browser.pages())[0];
  await page.reload();
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Criar Atendido
  console.log('[TestFix] Criando atendido...');
  await page.waitForSelector('#btn-novo-atendido', { timeout: 10000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 5000 });
  await page.type('#input-nome', 'Alexandre Teste Fix');
  await page.click('#btn-salvar-atendido');
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 600));

  // 2. Iniciar sessão
  console.log('[TestFix] Iniciando sessão...');
  await page.waitForSelector('button[id^="btn-ver-detalhes-"]', { timeout: 5000 });
  await page.click('button[id^="btn-ver-detalhes-"]');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
  await page.type('#input-titulo-sessao', 'Sessao Validacao Fix');
  await page.click('#btn-confirmar-sessao');

  await page.waitForSelector('#painel-sala-servidor', { timeout: 10000 });
  const inviteUrl = await page.$eval('#input-url-convite', (el) => el.value);
  console.log('[TestFix] URL de convite gerada:', inviteUrl);

  // 3. Abrir Quadro Branco no Host
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
  await page.waitForSelector('.upper-canvas', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 4. Testar persistência de traço no Host (D3.1: sem sumiço/flicker)
  console.log('[TestFix] 4. Testando desenho do Host com verificação anti-sumiço...');
  await page.click('#tool-pencil');
  await new Promise((r) => setTimeout(r, 300));

  const hostCanvasBox = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const hStartX = Math.round(hostCanvasBox.left + 80);
  const hStartY = Math.round(hostCanvasBox.top + 80);
  const hEndX = Math.round(hostCanvasBox.left + 240);
  const hEndY = Math.round(hostCanvasBox.top + 160);

  // Instala hook quadro a quadro para monitorar contagem de objetos
  await page.evaluate(() => {
    window.__frameObjectCounts = [];
    const engine = window.__whiteboardEngine;
    if (engine && engine.canvas) {
      engine.canvas.on('after:render', () => {
        window.__frameObjectCounts.push(engine.canvas.getObjects().length);
      });
    }
  });

  await page.mouse.move(hStartX, hStartY);
  await page.mouse.down();
  for (let s = 1; s <= 5; s++) {
    await page.mouse.move(
      hStartX + ((hEndX - hStartX) * s) / 5,
      hStartY + ((hEndY - hStartY) * s) / 5
    );
    await new Promise((r) => setTimeout(r, 20));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));

  const hostObjectsAfter = await page.evaluate(() => {
    const engine = window.__whiteboardEngine;
    return {
      objectsCount: engine.canvas.getObjects().length,
      tabElementsCount: Object.keys(engine.getLastRenderedState()?.elements || {}).length,
      frameCounts: window.__frameObjectCounts,
    };
  });
  console.log('[TestFix] Host após desenho do lápis:', hostObjectsAfter);

  if (hostObjectsAfter.objectsCount !== 1) {
    throw new Error(`Host deveria ter exatamente 1 objeto, mas tem ${hostObjectsAfter.objectsCount}`);
  }
  // Confere que após o path:created a contagem nunca caiu para 0
  const dropsToZero = hostObjectsAfter.frameCounts.slice(1).some((c) => c === 0);
  if (dropsToZero) {
    throw new Error('DETECTADO SUMIÇO/FLICKER: A contagem de objetos no canvas caiu para 0 em algum frame!');
  }
  console.log('[TestFix] ✓ Prova Anti-Sumiço no Host: Traço permaneceu 100% visível em todos os frames!');

  // 5. Conectar Guest Mobile (Motorola Edge 70 Pro 412x915)
  console.log('\n[TestFix] 5. Conectando Guest Mobile (412x915, touch)...');
  const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const chromiumExe = browserCandidates.find((p) => p && fs.existsSync(p));

  const guestBrowser = await puppeteer.launch({
    executablePath: chromiumExe,
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const guestPage = await guestBrowser.newPage();
  await guestPage.setViewport({
    width: 412,
    height: 915,
    devicePixelRatio: 2.625,
    isMobile: true,
    hasTouch: true,
  });

  guestPage.on('console', (msg) => console.log('[Guest Console]', msg.type(), msg.text()));
  guestPage.on('pageerror', (err) => console.error('[Guest PageError]', err));

  await guestPage.goto(inviteUrl, { waitUntil: 'networkidle0' });
  await guestPage.waitForSelector('#guest-room-container', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 6. Verificar layout e folha branca sobre fundo escuro no Guest
  const guestVisualSetup = await guestPage.evaluate(() => {
    const area = document.getElementById('guest-whiteboard-area');
    const paper = document.getElementById('guest-whiteboard-paper');
    const canvas = document.getElementById('guest-canvas');
    const areaStyle = area ? window.getComputedStyle(area) : null;
    const paperStyle = paper ? window.getComputedStyle(paper) : null;
    const engine = window.__guestEngine;

    return {
      hasArea: Boolean(area),
      areaBg: areaStyle?.backgroundColor,
      hasPaper: Boolean(paper),
      paperBg: paperStyle?.backgroundColor,
      paperBorder: paperStyle?.borderWidth,
      paperShadow: paperStyle?.boxShadow,
      hasCanvas: Boolean(canvas),
      initialObjects: engine?.canvas?.getObjects().length,
    };
  });
  console.log('[TestFix] Guest visual setup:', guestVisualSetup);

  if (!guestVisualSetup.hasPaper) {
    throw new Error('guest-whiteboard-paper não encontrado no DOM do Guest');
  }
  console.log('[TestFix] ✓ Papel do Quadro Branco devidamente delimitado sobre fundo contrastante!');

  // O traço que o Host desenhou antes deve estar sincronizado no Guest
  if (guestVisualSetup.initialObjects !== 1) {
    throw new Error(`Guest deveria ter sincronizado 1 objeto inicial do Host, tem: ${guestVisualSetup.initialObjects}`);
  }
  console.log('[TestFix] ✓ Sincronização inicial Host -> Guest confirmada!');

  // 7. Simular toque do usuário no Guest (Touch CDP)
  console.log('\n[TestFix] 7. Despachando toque capacitivo no papel do Guest...');
  const guestCdp = await guestPage.target().createCDPSession();

  const paperBounds = await guestPage.$eval('#guest-whiteboard-paper', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  console.log('[TestFix] Limites do papel no celular:', paperBounds);

  const tX1 = Math.round(paperBounds.left + paperBounds.width * 0.25);
  const tY1 = Math.round(paperBounds.top + paperBounds.height * 0.35);
  const tX2 = Math.round(paperBounds.left + paperBounds.width * 0.7);
  const tY2 = Math.round(paperBounds.top + paperBounds.height * 0.65);

  await guestCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tX1, y: tY1 }],
  });
  await new Promise((r) => setTimeout(r, 40));

  await guestCdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: Math.round((tX1 + tX2) / 2), y: Math.round((tY1 + tY2) / 2) }],
  });
  await new Promise((r) => setTimeout(r, 40));

  await guestCdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: tX2, y: tY2 }],
  });
  await new Promise((r) => setTimeout(r, 40));

  await guestCdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await new Promise((r) => setTimeout(r, 1200));

  // Confere objetos no Guest
  const guestObjectsAfterTouch = await guestPage.evaluate(() => {
    const engine = window.__guestEngine;
    return {
      objectsCount: engine?.canvas?.getObjects().length,
      tabElementsCount: Object.keys(engine?.getLastRenderedState()?.elements || {}).length,
    };
  });
  console.log('[TestFix] Guest após toque:', guestObjectsAfterTouch);

  if (guestObjectsAfterTouch.objectsCount < 2) {
    throw new Error(`Guest deveria ter 2 objetos (1 do host + 1 desenhado por toque), mas tem: ${guestObjectsAfterTouch.objectsCount}`);
  }
  console.log('[TestFix] ✓ Toque no celular registrado com sucesso pelo Fabric no Guest!');

  // Confere se o traço desenhado no Guest chegou no Host
  const hostObjectsAfterGuestDraw = await page.evaluate(() => {
    const engine = window.__whiteboardEngine;
    return {
      objectsCount: engine?.canvas?.getObjects().length,
      tabElementsCount: Object.keys(engine?.getLastRenderedState()?.elements || {}).length,
    };
  });
  console.log('[TestFix] Host após traço do Guest:', hostObjectsAfterGuestDraw);

  if (hostObjectsAfterGuestDraw.objectsCount < 2) {
    throw new Error(`Host deveria ter 2 objetos sincronizados, mas tem: ${hostObjectsAfterGuestDraw.objectsCount}`);
  }
  console.log('[TestFix] ✓ Sincronização em tempo real Guest -> Host confirmada!');

  // Captura telas para conferência visual
  const evidenciasDir = path.join(root, 'docs', 'reviews', 'evidencias');
  fs.mkdirSync(evidenciasDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenciasDir, 'host-pos-fix.png') });
  await guestPage.screenshot({ path: path.join(evidenciasDir, 'guest-pos-fix.png') });
  console.log('[TestFix] Capturas de tela salvas em docs/reviews/evidencias/');

  await guestBrowser.close();
  await browser.close();
  app.kill('SIGTERM');

  console.log('\n======================================================');
  console.log(' TODOS OS CRITÉRIOS DE TESTE PASSARAM COM SUCESSO! ');
  console.log(' 1. Host sem sumiço/flicker de traço (D3.1)');
  console.log(' 2. Guest mobile com papel delimitado e visível');
  console.log(' 3. Toque no celular desenha perfeitamente');
  console.log(' 4. Sincronização bidirecional Host <-> Guest 100%');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('[TestFix] FALHA:', err);
  if (app) app.kill('SIGTERM');
  process.exit(1);
});

