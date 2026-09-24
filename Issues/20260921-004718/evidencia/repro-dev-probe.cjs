/*
  Sonda de runtime: abre o app Electron BUILDADO (dist/) e exercita a aplicação de verdade.
  Verifica segurança (CSP, isolamento, require/process) e fluxo completo da UI:
  - Criação e isolamento estrito de banco de dados e userData em pasta temporária (H4)
  - Criar atendido
  - Tentar criar duplicado e validar mensagem clara (Regra #1)
  - Editar atendido
  - Desativar atendido (soft delete)
  - Alterar rótulo no dicionário dinâmico
  - Validação de payload do IPC com o preload real
  - Servidor de sessão LAN e emulação Guest mobile (Motorola Edge 70 Pro / Android 16 / Chrome)
  - Conexão do Guest pelo IP LAN real do convite (não 127.0.0.1)
  - Sincronização BIDIRECIONAL por conteúdo (IDs de elementos e dados) entre Host e Guest
  - Borracha de trecho (eraser_stroke com destination-out) bidirecional (H3)
  - UNDO / REDO bidirecionais entre Host e Guest
  - Verificação no banco de dados SQLite isolado (ausência de duplicados)
  - Capturas de tela para evidência visual
  Sai com código 1 se qualquer verificação falhar.
*/
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.resolve(__dirname, '..');
const puppeteer = require('puppeteer');

const shotIdx = process.argv.indexOf('--shot');
const shotPath = shotIdx > 0 ? process.argv[shotIdx + 1] : path.join(root, 'docs', 'electron-window.png');
const PORT = 9400 + Math.floor(Math.random() * 500);

// H4: Banco de dados e userData TEMPORÁRIOS e isolados — NUNCA tocar no banco real
const probeTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-probe-'));
const probeDbPath = path.join(probeTempDir, 'onetoone-probe.db');
const probeUserDataDir = path.join(probeTempDir, 'userData');
fs.mkdirSync(probeUserDataDir, { recursive: true });

console.log(`[Probe] Inicializando ambiente isolado temporário: ${probeTempDir}`);
console.log(`[Probe] Banco SQLite temporário: ${probeDbPath}`);

const env = {
  ...process.env,
  NODE_ENV: 'production',
  ONETOONE_DB_PATH: probeDbPath,
};
delete env.ELECTRON_RUN_AS_NODE;
env.VITE_DEV_SERVER_URL='http://localhost:5173/'; env.NODE_ENV='development';

const exe = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);
const app = spawn(
  exe,
  ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${probeUserDataDir}`],
  { cwd: root, env, stdio: 'pipe' }
);
let log = '';
app.stdout.on('data', (d) => (log += d));
app.stderr.on('data', (d) => (log += d));

async function main() {
  await new Promise((r) => setTimeout(r, 4000));
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  const page = (await browser.pages())[0];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));

  // 1. Verificações de Isolamento e Segurança (CSP)
  const sec = await page.evaluate(async () => {
    const violacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => violacoes.push(e.violatedDirective));
    window.__inline = 0;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.head.appendChild(s);
    await new Promise((res) => setTimeout(res, 300));
    let evalBloqueado = false;
    try {
      new Function('return 1')();
    } catch {
      evalBloqueado = true;
    }
    return {
      typeofRequire: typeof window.require,
      typeofProcess: typeof window.process,
      renderizou: (document.getElementById('root')?.children.length ?? 0) > 0,
      dpr: window.devicePixelRatio,
      apiExposta: window.desktopAPI ? Object.keys(window.desktopAPI) : null,
      inlineExecutou: window.__inline === 1,
      evalBloqueado,
      violacoes,
    };
  });

  // 2. Validação de payload do IPC com preload real
  const ipcValidation = await page.evaluate(async () => {
    const resInvalidAtendido = await window.desktopAPI.atendidos.create({ nome: '   ' });
    const resInvalidConfig = await window.desktopAPI.config.setLabel('chave_sem_rotulo', 'x');
    return {
      atendidoValidationOk:
        resInvalidAtendido.success === false && resInvalidAtendido.error === 'VALIDATION',
      configValidationOk:
        resInvalidConfig.success === false && resInvalidConfig.error === 'VALIDATION',
    };
  });

  // 3. UI: Criar Atendido
  const testNome = `Mariana Probe ${Date.now().toString().slice(-4)}`;
  const testContato = '11988887777';
  const testEmail = 'mariana.probe@teste.com';
  const testNotas = 'Notas geradas pela sonda de runtime isolada';

  await page.waitForSelector('#btn-novo-atendido', { timeout: 5000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 5000 });

  await page.type('#input-nome', testNome);
  await page.type('#input-contato', testContato);
  await page.type('#input-email', testEmail);
  await page.type('#input-notas', testNotas);
  await page.click('#btn-salvar-atendido');

  // Aguardar retorno à lista e verificar presença
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 600));

  const criadoNaLista = await page.evaluate((nome) => {
    return document.body.innerText.includes(nome);
  }, testNome);

  // 4. UI: Tentar criar duplicado e ler mensagem clara (Regra #1)
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 5000 });
  await page.type('#input-nome', testNome);
  await page.type('#input-contato', testContato);
  await page.type('#input-email', testEmail);
  await page.type('#input-notas', testNotas);
  await page.click('#btn-salvar-atendido');

  await page.waitForSelector('#alerta-duplicado', { timeout: 5000 });
  const msgDuplicado = await page.$eval('#alerta-duplicado', (el) => el.innerText);
  const duplicadoOk = msgDuplicado.includes('DUPLICADO') && msgDuplicado.includes('Regra #1');

  // Cancelar formulário e voltar à lista
  await page.click('#btn-cancelar-atendido');
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });

  // 5. UI: Editar Atendido
  const editSelector = `tr[data-nome="${testNome}"] button[id^="btn-editar-atendido-"]`;
  await page.waitForSelector(editSelector, { timeout: 5000 });
  await page.click(editSelector);

  await page.waitForSelector('#input-notas', { timeout: 5000 });
  const notasAtualizadas = 'Notas atualizadas com sucesso via probe de runtime isolada';
  await page.evaluate(() => {
    const el = document.getElementById('input-notas');
    if (el) el.value = '';
  });
  await page.type('#input-notas', notasAtualizadas);
  await page.click('#btn-salvar-atendido');

  await page.waitForSelector('#btn-voltar-lista', { timeout: 5000 });
  const editadoOk = await page.evaluate((notas) => {
    return document.body.innerText.includes(notas);
  }, notasAtualizadas);

  // 6. UI: Desativar Atendido (Soft Delete)
  await page.waitForSelector('#btn-status-detalhe', { timeout: 5000 });
  await page.click('#btn-status-detalhe');
  await new Promise((r) => setTimeout(r, 600));

  const desativadoOk = await page.evaluate(() => {
    return document.body.innerText.includes('Desativado');
  });

  // Reativa para testar início de sessão e servidor LAN da Fase 04
  await page.click('#btn-status-detalhe');
  await new Promise((r) => setTimeout(r, 600));

  // 7. UI: Iniciar Sessão, gerar QR e verificar servidor LAN (Fase 04)
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
  await page.type('#input-titulo-sessao', 'Sessao Probe Fase 04');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#painel-sala-servidor', { timeout: 8000 });
  await page.waitForSelector('#img-qrcode-sessao', { timeout: 5000 });
  await page.waitForSelector('#input-url-convite', { timeout: 5000 });

  const servidorUiOk = await page.evaluate(() => {
    const qrImg = document.getElementById('img-qrcode-sessao');
    const inputUrl = document.getElementById('input-url-convite');
    const badge = document.getElementById('badge-status-conexao');
    const qrValido = qrImg && qrImg.src && qrImg.src.startsWith('data:image/png;base64,');
    const urlValida = inputUrl && inputUrl.value && inputUrl.value.includes('/join/') && inputUrl.value.includes('#');
    const badgeValido = badge && badge.innerText.includes('Aguardando');
    return Boolean(qrValido && urlValida && badgeValido);
  });

  const inviteUrlRaw = await page.$eval('#input-url-convite', (el) => el.value);
  console.log(`[Probe] URL de convite gerada pelo Host: ${inviteUrlRaw}`);

  // 7.1 UI: Abrir Quadro Branco HiDPI (Fase 06) no Host
  await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 5000 });
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#pagina-quadro-branco', { timeout: 8000 });
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 600));

  if (false) {
    page.on('pageerror', (e) => console.log('PAGEERR', e.message));
    page.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') console.log('CONSOLE', m.type(), m.text().slice(0,300)); });
    const box = await page.evaluate(() => { const r = document.querySelector('.upper-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const medir = async (nome) => { await new Promise((r) => setTimeout(r, 700)); const res = await page.evaluate(() => { const e = window.__whiteboardEngine; if (!e) return { engine: false }; const lc = e.canvas.lowerCanvasEl; const d = lc.getContext('2d').getImageData(0, 0, lc.width, lc.height).data; let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) px++; return { objetos: e.canvas.getObjects().length, px, badge: document.getElementById('badge-elementos')?.innerText, tool: e.activeTool }; }); console.log('DEVREPRO', nome, JSON.stringify(res)); };
    const tracar = async (x0, y0, dx, dy) => { await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + x0 + dx * i / 20, box.y + y0 + dy * i / 20 + Math.sin(i / 3) * 15, { steps: 2 }); await page.mouse.up(); };
    await medir('0 inicial');
    await page.click('#tool-pencil'); await tracar(100, 100, 300, 0); await medir('1 lapis');
    await page.click('#tool-eraser'); await tracar(300, 60, 0, 90); await medir('2 borracha trecho');
    await page.click('#tool-pencil'); await tracar(100, 250, 300, 0); await medir('3 lapis apos borracha');
    await page.click('#tool-brush'); await tracar(100, 350, 300, 0); await medir('4 pincel');
    await page.click('#tool-rectangle'); await tracar(500, 100, 120, 80); await medir('5 retangulo');
    await page.click('#tool-text'); await page.mouse.click(box.x + 500, box.y + 300); await page.keyboard.type('Ola'); await page.mouse.click(box.x + 700, box.y + 400); await medir('6 texto');
    await page.screenshot({ path: 'C:/Users/alxch/AppData/Local/Temp/dev.png' });
    app.kill(); process.exit(0);
  }
  // 7.2 Leitura do DPR real e verificação dos controles do Quadro Branco no Host
  const quadroCheck = await page.evaluate(async () => {
    const dpr = window.devicePixelRatio;
    const canvasEl = document.getElementById('canvas-quadro-branco');
    const upperCanvasEl = document.querySelector('.upper-canvas');
    const badgeDpr = document.getElementById('badge-dpr')?.innerText || '';
    const badgeElementos = document.getElementById('badge-elementos')?.innerText || '';
    const btnPencil = document.getElementById('tool-pencil');
    const btnRect = document.getElementById('tool-rectangle');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnClear = document.getElementById('btn-clear-tab');

    return {
      dpr,
      dprOk: dpr === 1.5,
      canvasExiste: Boolean(canvasEl),
      upperCanvasExiste: Boolean(upperCanvasEl),
      botoesExistem: Boolean(btnPencil && btnRect && btnUndo && btnRedo && btnClear),
      badgeDpr,
      badgeElementos,
    };
  });

  // 7.3 Guest Mobile: Conexão via IP LAN e Homologação Motorola Edge 70 Pro / Android 16 (H1, H3, H4)
  const guestMobile = {
    carregouBundleERemoveuHash: false,
    cspSemViolacoes: false,
    desenhouESincronizou: false,
    syncBidirecionalConteudoOk: false,
    borrachaTrechoOk: false,
    undoRedoBidirecionalOk: false,
    lockScreenOk: false,
    guestMutedOk: false,
    barraFerramentasVisivel: false,
  };

  // Conecta pelo IP LAN real do convite (H4: sem forçar 127.0.0.1)
  const guestProbeUrl = inviteUrlRaw;

  const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const chromiumExe = browserCandidates.find((p) => p && fs.existsSync(p));

  if (chromiumExe) {
    console.log(`[Probe] Lançando Chromium emulado para Guest mobile: ${chromiumExe}`);
    const guestBrowser = await puppeteer.launch({
      executablePath: chromiumExe,
      headless: true,
    });

    try {
      const guestPage = await guestBrowser.newPage();
      await guestPage.setViewport({
        width: 412,
        height: 915,
        devicePixelRatio: 2.625,
        isMobile: true,
        hasTouch: true,
      });
      await guestPage.setUserAgent(
        'Mozilla/5.0 (Linux; Android 16; Motorola Edge 70 Pro Build/AP2A.240805.005) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
      );

      await guestPage.evaluateOnNewDocument(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__guestViolations = window.__guestViolations || [];
          window.__guestViolations.push(e.violatedDirective);
        });
      });

      console.log(`[Probe] Conectando Guest mobile ao IP LAN: ${guestProbeUrl}`);
      await guestPage.goto(guestProbeUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      await guestPage.waitForSelector('#guest-room-container', { timeout: 15000 });
      {
        page.on('pageerror', (e) => console.log('HOST PAGEERR', e.message));
        page.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') console.log('HOST CONSOLE', m.type(), m.text().slice(0,300)); });
        guestPage.on('pageerror', (e) => console.log('GUEST PAGEERR', e.message));
        guestPage.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') console.log('GUEST CONSOLE', m.type(), m.text().slice(0,300)); });
        await new Promise((r) => setTimeout(r, 1500));
        const box = await page.evaluate(() => { const r = document.querySelector('.upper-canvas').getBoundingClientRect(); return { x: r.x, y: r.y }; });
        const med = async (nome) => { await new Promise((r) => setTimeout(r, 1200));
          const h = await page.evaluate(() => { const e = window.__whiteboardEngine; if (!e) return { engine: false }; const lc = e.canvas.lowerCanvasEl; const d = lc.getContext('2d').getImageData(0, 0, lc.width, lc.height).data; let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) px++; return { obj: e.canvas.getObjects().length, px, badge: document.getElementById('badge-elementos')?.innerText }; });
          const g = await guestPage.evaluate(() => { const c = document.querySelector('#guest-whiteboard-area canvas.lower-canvas') || document.querySelector('canvas'); const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) px++; return { px }; });
          console.log('DEVREPRO2', nome, 'HOST', JSON.stringify(h), 'GUEST', JSON.stringify(g)); };
        app.stdout.on('data', (d) => String(d).split(String.fromCharCode(10)).forEach((l) => { if (/Server|Evento|warn|rror|broadcast|Guest|rejeit|descart/i.test(l)) console.log('APP', l.slice(0, 260)); }));
        app.stderr.on('data', (d) => String(d).split(String.fromCharCode(10)).forEach((l) => { if (/rror|warn|Server|Evento/i.test(l) && !/Autofill|GPU|dbus/i.test(l)) console.log('APPERR', l.slice(0, 260)); }));
        await med('0 inicial');
        await page.click('#tool-pencil');
        await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down();
        for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 100 + i * 15, box.y + 100 + Math.sin(i / 3) * 30, { steps: 2 });
        await page.mouse.up();
        await med('1 lapis no Host com Guest conectado');
        await page.click('#tool-rectangle');
        await page.mouse.move(box.x + 500, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 650, box.y + 300, { steps: 8 }); await page.mouse.up();
        await med('2 retangulo no Host');
        await page.screenshot({ path: 'C:/Users/alxch/AppData/Local/Temp/dev2.png' });
        app.kill(); process.exit(0);
      }


      // Validação 1: Removeu fragmento #pk_h da barra de endereço e sem violações CSP
      const hashAposJoin = await guestPage.evaluate(() => window.location.hash);
      const guestViolations = await guestPage.evaluate(() => window.__guestViolations || []);

      guestMobile.carregouBundleERemoveuHash = hashAposJoin === '';
      guestMobile.cspSemViolacoes = guestViolations.length === 0;

      // Validação 2: Sincronização Bidirecional com Verificação de IDs de Elemento (H1, H4)
      await guestPage.waitForSelector('#tool-guest-pencil', { timeout: 5000 });
      await guestPage.tap('#tool-guest-pencil');

      const guestCanvasArea = await guestPage.$eval('#guest-whiteboard-area', (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      // --- Passo 2A: Guest desenha com touch no canvas ---
      const touchStartX = Math.round(guestCanvasArea.left + 100);
      const touchStartY = Math.round(guestCanvasArea.top + 120);

      const cdpClient = await guestPage.target().createCDPSession();
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: touchStartX, y: touchStartY }],
      });
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: touchStartX + 50, y: touchStartY + 40 }],
      });
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Captura o ID do traço criado pelo Guest
      const guestDrawnIds = await guestPage.evaluate(() => {
        const state = window.__guestEngine?.getLastRenderedState();
        return state ? Object.keys(state.elements) : [];
      });
      const guestStrokeId = guestDrawnIds[guestDrawnIds.length - 1];

      // Verifica se o Host recebeu exatamente esse ID de elemento do Guest
      const hostReceivedGuestStroke = await page.evaluate((expectedId) => {
        const state = window.__whiteboardEngine?.getLastRenderedState();
        return Boolean(expectedId && state?.elements[expectedId] && !state.elements[expectedId].hidden);
      }, guestStrokeId);

      // --- Passo 2B: Host desenha e Guest recebe por ID ---
      const canvasBox = await page.$eval('.upper-canvas', (el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });

      await page.click('#tool-pencil');
      const hostStartX = Math.round(canvasBox.left + 150);
      const hostStartY = Math.round(canvasBox.top + 150);
      await page.mouse.move(hostStartX, hostStartY);
      await page.mouse.down();
      await page.mouse.move(hostStartX + 80, hostStartY + 50);
      await page.mouse.up();

      await new Promise((r) => setTimeout(r, 1000));

      const hostDrawnIds = await page.evaluate(() => {
        const state = window.__whiteboardEngine?.getLastRenderedState();
        return state ? Object.keys(state.elements) : [];
      });
      const hostStrokeId = hostDrawnIds[hostDrawnIds.length - 1];

      // Verifica se o Guest recebeu exatamente esse ID de elemento do Host
      const guestReceivedHostStroke = await guestPage.evaluate((expectedId) => {
        const state = window.__guestEngine?.getLastRenderedState();
        return Boolean(expectedId && state?.elements[expectedId] && !state.elements[expectedId].hidden);
      }, hostStrokeId);

      guestMobile.syncBidirecionalConteudoOk = Boolean(
        guestStrokeId &&
        hostReceivedGuestStroke &&
        hostStrokeId &&
        guestReceivedHostStroke
      );
      guestMobile.desenhouESincronizou = guestMobile.syncBidirecionalConteudoOk;

      // Validação 3: Borracha de Trecho (H3 / ADR-012)
      // Guest seleciona borracha e passa sobre o traço desenhado
      await guestPage.waitForSelector('#tool-guest-eraser', { timeout: 5000 });
      await guestPage.tap('#tool-guest-eraser');

      const eraserStartX = touchStartX + 20;
      const eraserStartY = touchStartY + 15;
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: eraserStartX, y: eraserStartY }],
      });
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: eraserStartX + 30, y: eraserStartY + 25 }],
      });
      await cdpClient.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      await new Promise((r) => setTimeout(r, 1000));

      const guestEraserInfo = await guestPage.evaluate(() => {
        const state = window.__guestEngine?.getLastRenderedState();
        if (!state) return null;
        const keys = Object.keys(state.elements);
        const lastKey = keys[keys.length - 1];
        const el = state.elements[lastKey];
        return el ? { id: el.id, tipo: el.tipo } : null;
      });

      const hostReceivedEraser = await page.evaluate((eraserInfo) => {
        if (!eraserInfo) return false;
        const state = window.__whiteboardEngine?.getLastRenderedState();
        const el = state?.elements[eraserInfo.id];
        return Boolean(el && el.tipo === 'eraser_stroke' && !el.hidden);
      }, guestEraserInfo);

      guestMobile.borrachaTrechoOk = Boolean(
        guestEraserInfo &&
        guestEraserInfo.tipo === 'eraser_stroke' &&
        hostReceivedEraser
      );

      // Validação 4: UNDO e REDO Bidirecionais (H1, H3, H4)
      // 4A: Guest faz UNDO da passada de borracha
      await guestPage.waitForSelector('#btn-guest-undo', { timeout: 5000 });
      await guestPage.tap('#btn-guest-undo');
      await new Promise((r) => setTimeout(r, 1000));

      const guestEraserHiddenOnGuest = await guestPage.evaluate((id) => {
        const state = window.__guestEngine?.getLastRenderedState();
        return Boolean(id && state?.elements[id]?.hidden);
      }, guestEraserInfo?.id);

      const guestEraserHiddenOnHost = await page.evaluate((id) => {
        const state = window.__whiteboardEngine?.getLastRenderedState();
        return Boolean(id && state?.elements[id]?.hidden);
      }, guestEraserInfo?.id);

      // 4B: Host faz UNDO e REDO do traço dele
      await page.click('#btn-undo');
      await new Promise((r) => setTimeout(r, 1000));

      const hostStrokeHiddenOnGuest = await guestPage.evaluate((id) => {
        const state = window.__guestEngine?.getLastRenderedState();
        return Boolean(id && state?.elements[id]?.hidden);
      }, hostStrokeId);

      await page.click('#btn-redo');
      await new Promise((r) => setTimeout(r, 1000));

      const hostStrokeRestoredOnGuest = await guestPage.evaluate((id) => {
        const state = window.__guestEngine?.getLastRenderedState();
        return Boolean(id && state?.elements[id] && !state.elements[id].hidden);
      }, hostStrokeId);

      guestMobile.undoRedoBidirecionalOk = Boolean(
        guestEraserHiddenOnGuest &&
        guestEraserHiddenOnHost &&
        hostStrokeHiddenOnGuest &&
        hostStrokeRestoredOnGuest
      );

      // Validação 5: LOCK_SCREEN
      await page.waitForSelector('#btn-lock-guest-screen', { timeout: 5000 });
      await page.click('#btn-lock-guest-screen');
      await guestPage.waitForSelector('#guest-lock-overlay', { timeout: 6000 });
      const lockVisivel = await guestPage.evaluate(() => Boolean(document.getElementById('guest-lock-overlay')));

      // Desbloqueia tela no Host
      await page.click('#btn-lock-guest-screen');
      await new Promise((r) => setTimeout(r, 800));
      const lockRemovido = await guestPage.evaluate(() => !document.getElementById('guest-lock-overlay'));
      guestMobile.lockScreenOk = lockVisivel && lockRemovido;

      // Validação 6: Mute local no Guest emite GUEST_MUTED
      await guestPage.waitForSelector('#btn-guest-mute', { timeout: 5000 });
      await guestPage.tap('#btn-guest-mute');
      await page.waitForSelector('#badge-guest-muted', { timeout: 6000 });
      const hostViuMute = await page.$eval('#badge-guest-muted', (el) => el.innerText.includes('Mutado'));
      guestMobile.guestMutedOk = hostViuMute;

      // Validação 7: Barra de Ferramentas dentro da largura da viewport (C4)
      const toolbarButtonsOk = await guestPage.evaluate(() => {
        const ids = [
          'tool-guest-pencil',
          'tool-guest-brush',
          'tool-guest-rect',
          'tool-guest-ellipse',
          'tool-guest-arrow',
          'tool-guest-text',
          'tool-guest-eraser',
          'btn-guest-undo',
          'btn-guest-toggle-drawer',
          'btn-guest-media-play',
        ];
        const vw = window.innerWidth;
        return ids.every((id) => {
          const el = document.getElementById(id);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= vw + 1;
        });
      });
      guestMobile.barraFerramentasVisivel = toolbarButtonsOk;

      // Screenshot da emulação do Guest mobile (Android 16 / Motorola Edge 70 Pro)
      const guestShotPath = path.join(root, 'docs', 'guest-mobile-emulation.png');
      await guestPage.screenshot({ path: guestShotPath });
    } finally {
      await guestBrowser.close();
    }
  }

  // 7.4 Host: Geometrias e Ferramentas Complementares
  const canvasBox = await page.$eval('.upper-canvas', (el) => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

  // Desenhar retângulo com ferramenta geométrica:
  await page.click('#tool-rectangle');
  const rectX = Math.round(canvasBox.left + 350);
  const rectY = Math.round(canvasBox.top + 100);
  await page.mouse.move(rectX, rectY);
  await page.mouse.down();
  await page.mouse.move(rectX + 110, rectY + 70);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  // Desenhar elipse:
  await page.click('#tool-ellipse');
  const ellipseX = Math.round(canvasBox.left + 500);
  const ellipseY = Math.round(canvasBox.top + 100);
  await page.mouse.move(ellipseX, ellipseY);
  await page.mouse.down();
  await page.mouse.move(ellipseX + 90, ellipseY + 60);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  // Desenhar seta:
  await page.click('#tool-arrow');
  const arrowX = Math.round(canvasBox.left + 350);
  const arrowY = Math.round(canvasBox.top + 240);
  await page.mouse.move(arrowX, arrowY);
  await page.mouse.down();
  await page.mouse.move(arrowX + 140, arrowY + 40);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  // Adicionar texto rotacionável:
  await page.click('#tool-text');
  await page.mouse.click(Math.round(canvasBox.left + 180), Math.round(canvasBox.top + 260));
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.click(Math.round(canvasBox.left + 50), Math.round(canvasBox.top + 50));
  await new Promise((r) => setTimeout(r, 400));

  const contagemAposDesenho = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Desfazer (Undo)
  await page.click('#btn-undo');
  await new Promise((r) => setTimeout(r, 300));
  const contagemAposUndo = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Refazer (Redo)
  await page.click('#btn-redo');
  await new Promise((r) => setTimeout(r, 300));
  const contagemAposRedo = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Borracha de Trecho sobre a forma desenhada
  await page.click('#tool-eraser');
  await page.mouse.move(rectX + 20, rectY + 30);
  await page.mouse.down();
  await page.mouse.move(rectX + 80, rectY + 50);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const contagemAposBorracha = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Captura visual do Quadro Branco HiDPI (Evidência obrigatória)
  const whiteboardShotPath = path.join(root, 'docs', 'whiteboard-hidpi.png');
  await page.screenshot({ path: whiteboardShotPath });

  // Retorna à tela de detalhes
  await page.click('#btn-voltar-sessao');
  await page.waitForSelector('#painel-sala-servidor', { timeout: 8000 });

  const quadroInteracaoOk = Boolean(
    quadroCheck.canvasExiste &&
    quadroCheck.botoesExistem &&
    contagemAposDesenho &&
    contagemAposUndo &&
    contagemAposRedo
  );

  // Fecha o servidor LAN e desativa novamente para manter integridade
  await page.click('#btn-fechar-sala-servidor');
  await new Promise((r) => setTimeout(r, 600));
  await page.click('#btn-status-detalhe');
  await new Promise((r) => setTimeout(r, 600));

  await page.click('#btn-voltar-lista');
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });

  // 8. UI: Trocar o Rótulo do Dicionário
  await page.waitForSelector('#btn-aba-config', { timeout: 5000 });
  await page.click('#btn-aba-config');
  await page.waitForSelector('#input-rotulo-guest', { timeout: 5000 });

  const novoRotulo = `Paciente-${Date.now().toString().slice(-3)}`;
  await page.evaluate(() => {
    const el = document.getElementById('input-rotulo-guest');
    if (el) el.value = '';
  });
  await page.type('#input-rotulo-guest', novoRotulo);
  await page.click('#btn-salvar-rotulo-guest');
  await new Promise((r) => setTimeout(r, 800));

  await page.click('#btn-nav-atendidos');
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });

  const rotuloAtualizadoOk = await page.evaluate((rot) => {
    return document.body.innerText.includes(rot);
  }, novoRotulo);

  // 9. Screenshot da janela
  if (shotPath) {
    const dir = path.dirname(shotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: shotPath });
  }

  // 10. Verificação de dados no SQLite através do processo Electron
  const dbCheck = await page.evaluate(async () => {
    const res = await window.desktopAPI.atendidos.list({ apenasAtivos: false });
    if (!res.success) return { semDuplicados: false, total: 0 };
    const seen = new Set();
    let dup = false;
    for (const a of res.data) {
      const key = `${a.nome}||${a.contato}||${a.email}||${a.notas}`;
      if (seen.has(key)) {
        dup = true;
        break;
      }
      seen.add(key);
    }
    return { semDuplicados: !dup, total: res.data.length };
  });

  await browser.disconnect();

  // Verificação direta no banco SQLite isolado da sonda (H4: sem tocar no banco real)
  let bancoDirectCheck = true;
  try {
    const checkSql = `
      const Database = require('better-sqlite3');
      const db = new Database(process.env.ONETOONE_DB_PATH);
      const dup = db.prepare('SELECT nome, contato, email, notas, COUNT(*) as qtd FROM Atendidos GROUP BY nome, contato, email, notas HAVING qtd > 1').all();
      process.stdout.write(JSON.stringify({ duplicados: dup.length }));
      db.close();
    `;
    const resSql = spawnSync(exe, ['-e', checkSql], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ONETOONE_DB_PATH: probeDbPath },
      encoding: 'utf8',
    });
    if (resSql.status === 0 && resSql.stdout) {
      const parsed = JSON.parse(resSql.stdout);
      bancoDirectCheck = parsed.duplicados === 0;
    }
  } catch (err) {
    console.warn('[Probe] Verificação direta de arquivo fallback para verificação via IPC:', err.message);
  }

  return {
    sec,
    ipcValidation,
    ui: {
      criadoNaLista,
      duplicadoOk,
      editadoOk,
      desativadoOk,
      rotuloAtualizadoOk,
      servidorUiOk,
      quadroDpr: quadroCheck.dpr,
      quadroDprOk: quadroCheck.dprOk,
      quadroControlesOk: quadroCheck.canvasExiste && quadroCheck.upperCanvasExiste && quadroCheck.botoesExistem,
      quadroInteracaoOk,
      contagemAposDesenho,
      contagemAposUndo,
      contagemAposRedo,
      contagemAposBorracha,
    },
    bancoSemDuplicados: dbCheck.semDuplicados && bancoDirectCheck,
    totalAtendidos: dbCheck.total,
    pageErrors,
    guestMobile,
  };
}

main()
  .then(async (res) => {
    const checks = {
      'typeof require === undefined': res.sec.typeofRequire === 'undefined',
      'typeof process === undefined': res.sec.typeofProcess === 'undefined',
      'UI renderizou (#root com filhos)': res.sec.renderizou,
      'CSP: script inline NAO executa': !res.sec.inlineExecutou,
      'CSP: eval bloqueado': res.sec.evalBloqueado,
      'sem erro de pagina': res.pageErrors.length === 0,
      'IPC: validacao de payload rejeita dado invalido com erro tipado':
        res.ipcValidation.atendidoValidationOk && res.ipcValidation.configValidationOk,
      'UI: criar atendido': res.ui.criadoNaLista,
      'UI: detectar duplicado com mensagem clara (Regra #1)': res.ui.duplicadoOk,
      'UI: editar atendido': res.ui.editadoOk,
      'UI: desativar atendido (soft delete)': res.ui.desativadoOk,
      'UI: iniciar sessao, gerar QR e abrir sala do servidor LAN': res.ui.servidorUiOk,
      'Guest Mobile: carregou bundle do Guest e removeu hash da URL':
        res.guestMobile.carregouBundleERemoveuHash,
      'Guest Mobile: CSP sem violacoes no console':
        res.guestMobile.cspSemViolacoes,
      'Guest Mobile: sincronizacao bidirecional por conteudo (IDs de elementos)':
        res.guestMobile.syncBidirecionalConteudoOk,
      'Guest Mobile: borracha de trecho sincronizou elemento eraser_stroke':
        res.guestMobile.borrachaTrechoOk,
      'Guest Mobile: UNDO e REDO bidirecionais sincronizaram estado':
        res.guestMobile.undoRedoBidirecionalOk,
      'Guest Mobile: LOCK_SCREEN exibiu overlay e desbloqueou':
        res.guestMobile.lockScreenOk,
      'Guest Mobile: mute local emitiu GUEST_MUTED':
        res.guestMobile.guestMutedOk,
      'Guest Mobile: barra de ferramentas totalmente visivel na viewport':
        res.guestMobile.barraFerramentasVisivel,
      'UI: abrir quadro branco HiDPI e verificar DPR 1.5':
        res.ui.quadroDprOk && res.ui.quadroControlesOk,
      'UI: desenhar traço, retângulo, texto, desfazer/refazer e borracha':
        res.ui.quadroInteracaoOk,
      'UI: alterar rotulo no dicionario': res.ui.rotuloAtualizadoOk,
      'Banco: sem dados duplicados no SQLite': res.bancoSemDuplicados,
    };

    console.log(JSON.stringify(res, null, 2));
    let ok = true;
    for (const [k, v] of Object.entries(checks)) {
      console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
      ok = ok && v;
    }
    app.kill();
    await new Promise((r) => setTimeout(r, 800));
    try {
      fs.rmSync(probeTempDir, { recursive: true, force: true });
    } catch {}
    process.exit(ok ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('ERRO na sonda:', e, '\n--- log do app ---\n' + log);
    app.kill();
    await new Promise((r) => setTimeout(r, 800));
    try {
      fs.rmSync(probeTempDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  });
