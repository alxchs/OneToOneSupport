/*
  ATAQUE DO CHEFE 2 e 3 (auditoria da Fase 08):
   A2 (D15): o executor provou "seleção não arrasta" com page.mouse. Aqui o ataque é por TOQUE
             (Input.dispatchTouchEvent com emulação de touch ligada), que é outro caminho do Fabric.
   A3 (D16): o V4 da sonda tentou desenhar em modo leitura com o MOUSE. Aqui, por TOQUE.
  Prova: geometria do objeto (left/top/scale/angle) + contagem de eventos no SQLite + captura de tela.
*/
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PROJ = path.resolve(__dirname, '..', '..', '..');
const puppeteer = require(path.join(PROJ, 'node_modules', 'puppeteer'));

const OUT = __dirname;
const PORT = 9700 + Math.floor(Math.random() * 90);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ataque-toque-'));
const dbPath = path.join(tmpDir, 'ataque.db');
const userDataDir = path.join(tmpDir, 'userData');
fs.mkdirSync(userDataDir, { recursive: true });

const env = { ...process.env, NODE_ENV: 'production', ONETOONE_DB_PATH: dbPath };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.ONETOONE_DIAG;

const exe = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe');
const app = spawn(exe, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--force-device-scale-factor=1.5'], { cwd: PROJ, env, stdio: 'pipe' });
let appLog = '';
app.stdout.on('data', (d) => (appLog += d));
app.stderr.on('data', (d) => (appLog += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function contarEventos(sid) {
  const js = `const D=require('better-sqlite3');const db=new D(process.env.ONETOONE_DB_PATH);const r=db.prepare('SELECT COUNT(*) q FROM Eventos WHERE sessao_id = ?').get(${JSON.stringify(sid)});process.stdout.write(String(r?r.q:-1));db.close();`;
  const res = spawnSync(exe, ['-e', js], { cwd: PROJ, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ONETOONE_DB_PATH: dbPath }, encoding: 'utf8' });
  return res.status === 0 ? Number(res.stdout.trim()) : -1;
}

const geo = (page) => page.evaluate(() => {
  const e = window.__whiteboardEngine;
  const objs = e?.canvas?.getObjects?.() || [];
  return objs.map((o) => ({
    type: o.type,
    left: Math.round(o.left * 100) / 100,
    top: Math.round(o.top * 100) / 100,
    scaleX: o.scaleX,
    angle: o.angle,
    selectable: o.selectable,
    lockMovementX: o.lockMovementX,
    hasControls: o.hasControls,
  }));
});

async function main() {
  let browser = null;
  for (let i = 0; i < 20 && !browser; i++) {
    await sleep(1500);
    try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch {}
  }
  if (!browser) { console.log('[Ataque] Electron nao subiu:', appLog.slice(-400)); process.exit(3); }
  const page = (await browser.pages())[0];
  await page.reload();
  await sleep(1500);

  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const toque = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(x0 + ((x1 - x0) * i) / 6), y: Math.round(y0 + ((y1 - y0) * i) / 6) }],
      });
      await sleep(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  };

  // setup: atendido + sessão + quadro
  const nome = `Alvo Toque ${Date.now().toString().slice(-4)}`;
  await page.waitForSelector('#btn-novo-atendido', { timeout: 10000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 10000 });
  await page.type('#input-nome', nome);
  await page.click('#btn-salvar-atendido');
  await page.waitForSelector('[id^="btn-ver-detalhes-"]', { timeout: 10000 });
  await sleep(500);
  await page.click('[id^="btn-ver-detalhes-"]');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 10000 });
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 10000 });
  await page.type('#input-titulo-sessao', 'Sessao Ataque Toque');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#painel-sala-servidor', { timeout: 15000 });
  const sessaoId = await page.evaluate(() => {
    const b = document.querySelector('[id^="btn-encerrar-sessao-"]');
    return b ? b.id.replace('btn-encerrar-sessao-', '') : null;
  });
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 15000 });
  await sleep(800);

  const box = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const px = (fx, fy) => [Math.round(box.left + box.width * fx), Math.round(box.top + box.height * fy)];

  // desenha um retângulo com o mouse (ferramenta rectangle)
  await page.click('#tool-rectangle');
  let [ax, ay] = px(0.25, 0.25);
  let [bx, by] = px(0.5, 0.5);
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move(bx, by, { steps: 8 });
  await page.mouse.up();
  await sleep(900);

  // --- A2: seleciona por TOQUE e tenta arrastar por TOQUE ---
  await page.click('#tool-select');
  const [cx, cy] = px(0.375, 0.375); // centro do retângulo
  await toque(cx, cy, cx, cy); // toque simples para selecionar
  const geoAntes = await geo(page);
  const eventosAntes = contarEventos(sessaoId);
  const [dx, dy] = px(0.7, 0.7);
  await toque(cx, cy, dx, dy); // arrasto por toque
  await sleep(800);
  const geoDepois = await geo(page);
  const eventosDepois = contarEventos(sessaoId);
  const moveu = JSON.stringify(geoAntes) !== JSON.stringify(geoDepois);
  console.log(`[A2] geometria antes:  ${JSON.stringify(geoAntes)}`);
  console.log(`[A2] geometria depois: ${JSON.stringify(geoDepois)}`);
  console.log(`[A2] eventos SQLite: ${eventosAntes} -> ${eventosDepois}`);
  console.log(`[A2] ${moveu ? 'FALHA: o toque MOVEU/alterou o objeto em modo selecao' : 'OK: arraste por toque nao alterou o objeto'}`);
  await page.screenshot({ path: path.join(OUT, 'a2-toque-selecao.png') });

  // --- A3: modo somente leitura, desenho por TOQUE ---
  await page.click('#btn-voltar-sessao');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 10000 });
  await page.click(`#btn-encerrar-sessao-${sessaoId}`);
  await sleep(1200);
  await page.waitForSelector(`#btn-rever-quadro-${sessaoId}`, { timeout: 10000 });
  await page.click(`#btn-rever-quadro-${sessaoId}`);
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 15000 });
  await sleep(1200);

  const elemAntes = await page.evaluate(() => Object.keys(window.__whiteboardEngine?.getLastRenderedState()?.elements || {}).length);
  const evAntes = contarEventos(sessaoId);
  const [tx, ty] = px(0.2, 0.7);
  const [ux, uy] = px(0.8, 0.85);
  await toque(tx, ty, ux, uy);
  await toque(tx, ty, ux, ty); // segunda tentativa horizontal
  await sleep(1000);
  const elemDepois = await page.evaluate(() => Object.keys(window.__whiteboardEngine?.getLastRenderedState()?.elements || {}).length);
  const evDepois = contarEventos(sessaoId);
  const geoLeitura = await geo(page);
  console.log(`[A3] elementos: ${elemAntes} -> ${elemDepois} | eventos SQLite: ${evAntes} -> ${evDepois}`);
  console.log(`[A3] objetos no modo leitura: ${JSON.stringify(geoLeitura)}`);
  console.log(`[A3] ${elemDepois > elemAntes || evDepois > evAntes ? 'FALHA: toque desenhou/gravou em modo leitura' : 'OK: toque nao desenhou nem gravou em modo leitura'}`);
  await page.screenshot({ path: path.join(OUT, 'a3-toque-leitura.png') });

  await browser.disconnect();
  app.kill();
  await sleep(400);
  fs.writeFileSync(path.join(OUT, 'ataque-toque-app.log'), appLog);
  process.exit(0);
}

main().catch((e) => {
  console.error('[Ataque] ERRO:', e);
  fs.writeFileSync(path.join(OUT, 'ataque-toque-app.log'), appLog);
  try { app.kill(); } catch {}
  process.exit(3);
});
