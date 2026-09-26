/*
  ATAQUE DO CHEFE (auditoria da Fase 08 / D16): a trava de "somente leitura" do quadro de sessão
  encerrada cobre o caminho local (store -> aplicarEventoQuadro). Este ataque testa o caminho REMOTO:
  sessão VIVA com Guest conectado + Host revendo o quadro de uma sessão ENCERRADA.

  Hipótese: HostApp.tsx aplica evento do Guest direto em tabState (useHostStore.setState) sem
  consultar quadroSomenteLeitura -> o traço novo do Guest aparece no quadro histórico em leitura.

  Prova: contagem de elementos renderizados + PIXELS DA TELA REAL (page.screenshot) antes e depois.
*/
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PROJ = path.resolve(__dirname, '..', '..', '..');
const puppeteer = require(path.join(PROJ, 'node_modules', 'puppeteer'));

const OUT = __dirname;
const PORT = 9800 + Math.floor(Math.random() * 100);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ataque-readonly-'));
const dbPath = path.join(tmpDir, 'ataque.db');
const userDataDir = path.join(tmpDir, 'userData');
fs.mkdirSync(userDataDir, { recursive: true });

const env = { ...process.env, NODE_ENV: 'production', ONETOONE_DB_PATH: dbPath };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.ONETOONE_DIAG;

const exe = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe');
const app = spawn(exe, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--force-device-scale-factor=1.5'], {
  cwd: PROJ,
  env,
  stdio: 'pipe',
});
let appLog = '';
app.stdout.on('data', (d) => (appLog += d));
app.stderr.on('data', (d) => (appLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { spawnSync } = require('child_process');
function contarEventos(sid) {
  const js = `const D=require('better-sqlite3');const db=new D(process.env.ONETOONE_DB_PATH);const r=db.prepare('SELECT COUNT(*) q FROM Eventos WHERE sessao_id = ?').get(${JSON.stringify(sid)});process.stdout.write(String(r?r.q:-1));db.close();`;
  const res = spawnSync(exe, ['-e', js], { cwd: PROJ, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ONETOONE_DB_PATH: dbPath }, encoding: 'utf8' });
  return res.status === 0 ? Number(res.stdout.trim()) : -1;
}

async function countScreenStrokePixels(target, clip) {
  const b64 = await target.screenshot({
    clip: {
      x: Math.max(0, Math.round(clip.left)),
      y: Math.max(0, Math.round(clip.top)),
      width: Math.max(1, Math.round(clip.width)),
      height: Math.max(1, Math.round(clip.height)),
    },
    encoding: 'base64',
  });
  return await target.evaluate(async (b) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let colored = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], bl = d[i + 2], a = d[i + 3];
          if (a < 50) continue;
          if (r > 240 && g > 240 && bl > 240) continue;
          if (Math.max(r, g, bl) - Math.min(r, g, bl) < 20) continue;
          colored++;
        }
        resolve(colored);
      };
      img.onerror = (e) => reject(new Error('decode fail'));
      img.src = 'data:image/png;base64,' + b;
    });
  }, b64);
}

async function main() {
  let browser = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
      break;
    } catch (e) {
      if (i % 5 === 4) console.log(`[Ataque] aguardando Electron (${i}) | log=${JSON.stringify(appLog.slice(-200))}`);
    }
  }
  if (!browser) { console.log('[Ataque] Electron nao subiu. LOG:', appLog); process.exit(3); }
  const page = (await browser.pages())[0];
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.reload();
  await sleep(1500);

  // 1. Atendido
  const nome = `Alvo Ataque ${Date.now().toString().slice(-4)}`;
  await page.waitForSelector('#btn-novo-atendido', { timeout: 10000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 10000 });
  await page.type('#input-nome', nome);
  await page.click('#btn-salvar-atendido');
  await page.waitForSelector('#input-busca-atendido', { timeout: 10000 });
  await sleep(600);

  await page.waitForSelector('[id^="btn-ver-detalhes-"]', { timeout: 10000 });
  await page.click('[id^="btn-ver-detalhes-"]');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 10000 });

  // 2. Sessão 1 (vai virar a sessão ENCERRADA que será revista em leitura)
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 10000 });
  await page.type('#input-titulo-sessao', 'Sessao Antiga (sera encerrada)');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#painel-sala-servidor', { timeout: 15000 });

  // desenha 1 traço na sessão antiga para ela ter conteúdo histórico
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 15000 });
  await sleep(800);
  let box = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  await page.click('#tool-pencil');
  await page.mouse.move(Math.round(box.left + 120), Math.round(box.top + 400));
  await page.mouse.down();
  await page.mouse.move(Math.round(box.left + 300), Math.round(box.top + 420));
  await page.mouse.up();
  await sleep(900);
  await page.click('#btn-voltar-sessao');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 10000 });
  await sleep(500);

  // 3. Encerra a sessão 1
  await page.waitForSelector('[id^="btn-encerrar-sessao-"]', { timeout: 10000 });
  const sessaoAntigaId = await page.evaluate(() => {
    const b = document.querySelector('[id^="btn-encerrar-sessao-"]');
    return b ? b.id.replace('btn-encerrar-sessao-', '') : null;
  });
  await page.click(`#btn-encerrar-sessao-${sessaoAntigaId}`);
  await sleep(1200);
  await page.waitForSelector(`#btn-rever-quadro-${sessaoAntigaId}`, { timeout: 10000 });
  console.log(`[Ataque] Sessão antiga encerrada: ${sessaoAntigaId}`);

  // 4. Sessão 2 VIVA, com servidor LAN e Guest conectado
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 10000 });
  await page.type('#input-titulo-sessao', 'Sessao Viva com Guest');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#painel-sala-servidor', { timeout: 15000 });
  await page.waitForSelector('#input-url-convite', { timeout: 10000 });
  const conviteUrl = await page.$eval('#input-url-convite', (el) => el.value);
  const sessaoVivaId = await page.evaluate(() => {
    const b = document.querySelector('[id^="btn-encerrar-sessao-"]');
    return b ? b.id.replace('btn-encerrar-sessao-', '') : null;
  });
  console.log(`[Ataque] Sessao viva: ${sessaoVivaId}`);
  console.log(`[Ataque] Convite da sessão viva: ${conviteUrl}`);

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const chromiumExe = candidates.find((p) => p && fs.existsSync(p));
  if (!chromiumExe) {
    console.log('[Ataque] SEM CHROMIUM — abortado');
    process.exit(2);
  }
  const guestBrowser = await puppeteer.launch({ executablePath: chromiumExe, headless: true });
  const guest = await guestBrowser.newPage();
  await guest.setViewport({ width: 412, height: 915, devicePixelRatio: 2.625, isMobile: true, hasTouch: true });
  await guest.setUserAgent('Mozilla/5.0 (Linux; Android 16; Motorola Edge 70 Pro Build/AP2A.240805.005) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36');
  await guest.goto(conviteUrl, { waitUntil: 'networkidle0', timeout: 20000 });
  await guest.waitForSelector('#guest-room-container', { timeout: 20000 });
  await guest.waitForSelector('#tool-guest-pencil', { timeout: 10000 });
  await guest.tap('#tool-guest-pencil');
  const gArea = await guest.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cdp = await guest.target().createCDPSession();
  console.log(`[Ataque] Area do quadro no Guest: ${JSON.stringify(gArea)}`);
  const guestDraw = async (fx, fy) => {
    const x = Math.round(gArea.left + gArea.width * fx);
    const y = Math.round(gArea.top + gArea.height * fy);
    console.log(`[Ataque] Guest desenha em (${x}, ${y})`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y: y + 45 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 110, y: y + 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1200);
  };

  guest.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[guest-console]', m.text().slice(0, 160)); });
  guest.on('pageerror', (e) => console.log('[guest-pageerror]', String(e).slice(0, 160)));
  // traços do guest na sessão VIVA (sanidade: o canal funciona e aceita mais de um traço)
  await guestDraw(0.15, 0.15);
  const guestIdsAntes = await guest.evaluate(() => Object.keys(window.__guestEngine?.getLastRenderedState()?.elements || {}));
  console.log(`[Ataque] Elementos no Guest após 1º traço: ${guestIdsAntes.length}`);
  await guestDraw(0.5, 0.25);
  const guestIds2 = await guest.evaluate(() => Object.keys(window.__guestEngine?.getLastRenderedState()?.elements || {}));
  console.log(`[Ataque] Elementos no Guest após 2º traço (host ainda fora do quadro em leitura): ${guestIds2.length}`);
  const ferramentaGuest = await guest.evaluate(() => ({
    pencilAtivo: document.getElementById('tool-guest-pencil')?.getAttribute('aria-pressed'),
    tela: document.body.innerText.slice(0, 160),
  }));
  console.log(`[Ataque] Estado do Guest: ${JSON.stringify(ferramentaGuest)}`);

  // 5. Host volta e abre o quadro da sessão ENCERRADA em somente leitura
  await page.waitForSelector(`#btn-rever-quadro-${sessaoAntigaId}`, { timeout: 10000 });
  await page.click(`#btn-rever-quadro-${sessaoAntigaId}`);
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 15000 });
  await sleep(1200);

  const leituraOk = await page.evaluate(() => ({
    badge: Boolean(document.getElementById('badge-somente-leitura')),
    aviso: Boolean(document.getElementById('aviso-modo-leitura')),
    semLapis: !document.getElementById('tool-pencil'),
  }));
  box = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const imgPrefix = process.env.ATAQUE_IMG_PREFIX || 'novo-20260926-';
  const idsAntes = await page.evaluate(() => Object.keys(window.__whiteboardEngine?.getLastRenderedState()?.elements || {}));
  const pxAntes = await countScreenStrokePixels(page, box);
  const outEvidencias = path.join(PROJ, 'docs', 'reviews', 'evidencias');
  fs.mkdirSync(outEvidencias, { recursive: true });
  await page.screenshot({ path: path.join(outEvidencias, `${imgPrefix}leitura-antes.png`) });
  console.log(`[Ataque] Modo leitura: ${JSON.stringify(leituraOk)} | elementos=${idsAntes.length} | pixels de tela=${pxAntes}`);

  // 6. O Guest (sessão VIVA) desenha enquanto o Host está no quadro histórico em leitura
  const guestAntes = await guest.evaluate(() => Object.keys(window.__guestEngine?.getLastRenderedState()?.elements || {}).length);
  const eventosVivaAntes = contarEventos(sessaoVivaId);
  const guestConectadoAntes = await guest.evaluate(() => document.body.innerText.slice(0, 120));
  await guestDraw(0.25, 0.5);
  await guestDraw(0.55, 0.7);
  await sleep(1500);
  const guestDepois = await guest.evaluate(() => Object.keys(window.__guestEngine?.getLastRenderedState()?.elements || {}).length);
  const eventosVivaDepois = contarEventos(sessaoVivaId);
  const eventosAntigaDepois = contarEventos(sessaoAntigaId);
  console.log(`[Ataque] CONTROLE -> Guest desenhou de verdade? elementos no Guest ${guestAntes} -> ${guestDepois}`);
  console.log(`[Ataque] CONTROLE -> eventos da sessao VIVA no SQLite: ${eventosVivaAntes} -> ${eventosVivaDepois} | eventos da sessao ENCERRADA: ${eventosAntigaDepois}`);
  console.log(`[Ataque] CONTROLE -> topo da tela do Guest: ${JSON.stringify(guestConectadoAntes)}`);

  const idsDepois = await page.evaluate(() => Object.keys(window.__whiteboardEngine?.getLastRenderedState()?.elements || {}));
  const pxDepois = await countScreenStrokePixels(page, box);
  await page.screenshot({ path: path.join(outEvidencias, `${imgPrefix}leitura-depois.png`) });

  const novos = idsDepois.filter((id) => !idsAntes.includes(id));
  console.log(`[Ataque] Depois do desenho do Guest: elementos=${idsDepois.length} (novos: ${novos.length}) | pixels de tela=${pxDepois} (delta ${pxDepois - pxAntes})`);

  const vazou = novos.length > 0 || pxDepois - pxAntes > 200;
  console.log(vazou
    ? `[RESULTADO] FALHA DA TRAVA: o quadro em SOMENTE LEITURA recebeu ${novos.length} elemento(s) de outra sessão; pixels na tela +${pxDepois - pxAntes}`
    : '[RESULTADO] Trava resistiu: nenhum elemento novo e sem pixels novos na tela.');

  await guestBrowser.close();
  await browser.disconnect();
  app.kill();
  await sleep(500);
  fs.writeFileSync(path.join(OUT, 'ataque-app.log'), appLog);
  process.exit(vazou ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[Ataque] ERRO:', e);
  fs.writeFileSync(path.join(OUT, 'ataque-app.log'), appLog);
  try { app.kill(); } catch {}
  process.exit(3);
});
