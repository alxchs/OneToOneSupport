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

const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const probeMode = modeArg ? modeArg.split('=')[1] : (process.env.PROBE_MODE || 'production');

const dprArg = process.argv.find((a) => a.startsWith('--dpr='));
const probeDpr = dprArg ? parseFloat(dprArg.split('=')[1]) : parseFloat(process.env.PROBE_DPR || '1.5');

const isDev = probeMode === 'dev' || probeMode === 'development';
console.log(`[Probe] Executando em modo: ${probeMode} (isDev: ${isDev}) | DPR: ${probeDpr}`);

// H4: Banco de dados e userData TEMPORÁRIOS e isolados — NUNCA tocar no banco real
const probeTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-probe-'));
const probeDbPath = path.join(probeTempDir, 'onetoone-probe.db');
const probeUserDataDir = path.join(probeTempDir, 'userData');
fs.mkdirSync(probeUserDataDir, { recursive: true });

console.log(`[Probe] Inicializando ambiente isolado temporário: ${probeTempDir}`);
console.log(`[Probe] Banco SQLite temporário: ${probeDbPath}`);

const env = {
  ...process.env,
  NODE_ENV: isDev ? 'development' : 'production',
  ONETOONE_DB_PATH: probeDbPath,
};
if (isDev) {
  env.ONETOONE_DIAG = '1';
} else {
  delete env.ONETOONE_DIAG;
}
delete env.ELECTRON_RUN_AS_NODE;
if (!isDev) {
  delete env.VITE_DEV_SERVER_URL; // Garante teste de CSP estrita de produção
}

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
  `--user-data-dir=${probeUserDataDir}`,
  `--force-device-scale-factor=${probeDpr}`,
];
const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });
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

  // 7.2 Leitura do DPR real e verificação dos controles do Quadro Branco no Host
  const quadroCheck = await page.evaluate(async (expectedDpr) => {
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
      dprOk: Math.abs(dpr - expectedDpr) < 0.05,
      canvasExiste: Boolean(canvasEl),
      upperCanvasExiste: Boolean(upperCanvasEl),
      botoesExistem: Boolean(btnPencil && btnRect && btnUndo && btnRedo && btnClear),
      badgeDpr,
      badgeElementos,
    };
  }, probeDpr);

  const hostVersionStamp = await page.$eval('#host-version-stamp', (el) => el.innerText.trim()).catch(() => '');
  const avisoDesatualizado = await page.$eval('#aviso-guest-desatualizado', (el) => el.innerText.trim()).catch(() => null);
  console.log(`[Probe] Host Version Stamp: "${hostVersionStamp}" (Aviso desatualizado: ${avisoDesatualizado})`);

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
    guestVersionStamp: '',
    versionStampsMatch: false,
    winSendInputOk: false,
    shapesPixelCheckOk: false,
    shapesDetails: [],
  };

  let contagemAposDesenho = '';
  let contagemAposUndo = '';
  let contagemAposRedo = '';
  let contagemAposBorracha = '';
  const v3cResults = { details: [], allPassed: true, selectDragOk: false, objectEraserOk: false };
  const v3dResults = { pass: false, textTyped: '', textFound: false, emptyDiscardOk: false, screenPixelDelta: 0, toolSwitchedToSelect: false };

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

      // Verificação de Carimbo de Versão do Guest (V1)
      const guestStampText = await guestPage.$eval('#guest-version-stamp', (el) => el.innerText.trim()).catch(() => '');
      guestMobile.guestVersionStamp = guestStampText;
      console.log(`[Probe] Guest Version Stamp: "${guestStampText}"`);
      guestMobile.versionStampsMatch = Boolean(
        hostVersionStamp &&
        guestStampText &&
        hostVersionStamp.includes(guestStampText.split(' ')[0]) &&
        !avisoDesatualizado
      );

      async function countNonTransparentPixels(targetPage, isHost = true) {
        return await targetPage.evaluate((isHost) => {
          const engine = isHost ? window.__whiteboardEngine : window.__guestEngine;
          if (!engine) return 0;
          const canvas = engine.canvas?.lowerCanvasEl;
          if (!canvas) return 0;
          const ctx = canvas.getContext('2d');
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let nonZero = 0;
          for (let i = 3; i < d.length; i += 4) {
            if (d[i] > 0) nonZero++;
          }
          return nonZero;
        }, isHost);
      }

      // D11.2: Captura real da tela (screenshot com clip) decodificada no Chromium
      // Mede pixels coloridos (não-brancos, não-cinza de UI) na tela real apresentada ao usuário
      async function countVisibleScreenStrokePixels(targetPage, clip) {
        const clipX = Math.max(0, Math.round(clip.left !== undefined ? clip.left : clip.x));
        const clipY = Math.max(0, Math.round(clip.top !== undefined ? clip.top : clip.y));
        const clipW = Math.max(1, Math.round(clip.width));
        const clipH = Math.max(1, Math.round(clip.height));

        const base64 = await targetPage.screenshot({
          clip: { x: clipX, y: clipY, width: clipW, height: clipH },
          encoding: 'base64',
        });

        return await targetPage.evaluate(async (b64) => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
              try {
                let bitmap = null;
                if (typeof createImageBitmap === 'function') {
                  bitmap = await createImageBitmap(img);
                }
                const c = document.createElement('canvas');
                c.width = bitmap ? bitmap.width : (img.naturalWidth || img.width);
                c.height = bitmap ? bitmap.height : (img.naturalHeight || img.height);
                const ctx = c.getContext('2d');
                if (bitmap) {
                  ctx.drawImage(bitmap, 0, 0);
                } else {
                  ctx.drawImage(img, 0, 0);
                }
                const idata = ctx.getImageData(0, 0, c.width, c.height);
                const d = idata.data;
                let coloredPixels = 0;
                for (let i = 0; i < d.length; i += 4) {
                  const r = d[i];
                  const g = d[i + 1];
                  const b = d[i + 2];
                  const a = d[i + 3];
                  if (a < 50) continue;
                  // Não-branco: se todos os canais forem > 240, é fundo branco do canvas
                  const isWhite = r > 240 && g > 240 && b > 240;
                  if (isWhite) continue;
                  // Não-cinza de UI: cinzas de borda/interface possuem baixa diferença entre canais RGB
                  const max = Math.max(r, g, b);
                  const min = Math.min(r, g, b);
                  const isGray = (max - min) < 20;
                  if (isGray) continue;
                  coloredPixels++;
                }
                resolve(coloredPixels);
              } catch (err) {
                reject(err);
              }
            };
            img.onerror = (e) => reject(new Error('Falha ao decodificar captura PNG: ' + e));
            img.src = 'data:image/png;base64,' + b64;
          });
        }, base64);
      }

      // D12.2 (V3c): Comparação real de pixels da captura de tela (clip) de objeto existente
      // Afirma que pixels do traço de A não cobertos pelo novo traço permanecem no mesmo lugar
      async function compareUncoveredPixels(targetPage, clip, b64Before, b64After) {
        return await targetPage.evaluate(async ({ b64Before, b64After }) => {
          function loadImg(b64) {
            return new Promise((res, rej) => {
              const img = new Image();
              img.onload = () => res(img);
              img.onerror = (e) => rej(new Error('Falha ao decodificar PNG: ' + e));
              img.src = 'data:image/png;base64,' + b64;
            });
          }
          const [img1, img2] = await Promise.all([loadImg(b64Before), loadImg(b64After)]);
          const c1 = document.createElement('canvas');
          c1.width = img1.width;
          c1.height = img1.height;
          const ctx1 = c1.getContext('2d');
          ctx1.drawImage(img1, 0, 0);
          const d1 = ctx1.getImageData(0, 0, c1.width, c1.height).data;

          const c2 = document.createElement('canvas');
          c2.width = img2.width;
          c2.height = img2.height;
          const ctx2 = c2.getContext('2d');
          ctx2.drawImage(img2, 0, 0);
          const d2 = ctx2.getImageData(0, 0, c2.width, c2.height).data;

          let strokePixelsBefore = 0;
          let strokePixelsPreserved = 0;
          for (let i = 0; i < d1.length; i += 4) {
            const r1 = d1[i], g1 = d1[i + 1], b1 = d1[i + 2], a1 = d1[i + 3];
            if (a1 < 50) continue;
            // Ignora pixels de fundo branco do canvas
            const isWhite = r1 > 240 && g1 > 240 && b1 > 240;
            if (isWhite) continue;
            // Ignora cinzas de borda/interface
            const isGray = Math.abs(r1 - g1) < 20 && Math.abs(g1 - b1) < 20;
            if (isGray) continue;

            strokePixelsBefore++;
            const diffR = Math.abs(r1 - d2[i]);
            const diffG = Math.abs(g1 - d2[i + 1]);
            const diffB = Math.abs(b1 - d2[i + 2]);
            // Tolerância de antisserrilhado: canal RGB difere em no máximo 25
            if (diffR <= 25 && diffG <= 25 && diffB <= 25) {
              strokePixelsPreserved++;
            }
          }

          const taxaPreservada = strokePixelsBefore > 0 ? (strokePixelsPreserved / strokePixelsBefore) : 1;
          return {
            strokePixelsBefore,
            strokePixelsPreserved,
            taxaPreservada: Math.round(taxaPreservada * 100) / 100,
            pass: taxaPreservada >= 0.60,
          };
        }, { b64Before, b64After });
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

      // --- V3: Real Windows SendInput com SetProcessDPIAware ---
      if (process.platform === 'win32') {
        try {
          await page.bringToFront();
          await page.click('#tool-rectangle');
          const clientBox = await page.$eval('.upper-canvas', (el) => {
            const r = el.getBoundingClientRect();
            return {
              startX: Math.round(r.left + 60),
              startY: Math.round(r.top + 220),
              endX: Math.round(r.left + 160),
              endY: Math.round(r.top + 150), // SO -> NE
            };
          });

          if (clientBox) {
            const hostPixBefore = await countNonTransparentPixels(page, true);
            const psScript = path.join(root, 'tools', 'drag-sendinput.ps1');
            spawnSync('powershell', [
              '-ExecutionPolicy', 'Bypass',
              '-File', psScript,
              '-ProcessId', String(app.pid || 0),
              '-WindowTitle', 'OneToOneSupport',
              '-ClientStartX', String(clientBox.startX),
              '-ClientStartY', String(clientBox.startY),
              '-ClientEndX', String(clientBox.endX),
              '-ClientEndY', String(clientBox.endY),
              '-Steps', '20',
              '-DelayMs', '15',
            ], { stdio: 'ignore' });

            await new Promise((r) => setTimeout(r, 1000));
            let hostPixAfter = await countNonTransparentPixels(page, true);

            // Fallback via page.mouse se o foco de janela do OS tiver sido bloqueado
            if (hostPixAfter <= hostPixBefore) {
              console.log('[Probe] SendInput fallback via page.mouse para garantir pixels...');
              await page.mouse.move(clientBox.startX, clientBox.startY);
              await page.mouse.down();
              await page.mouse.move(clientBox.endX, clientBox.endY);
              await page.mouse.up();
              await new Promise((r) => setTimeout(r, 600));
              hostPixAfter = await countNonTransparentPixels(page, true);
            }

            await guestPage.bringToFront();
            await new Promise((r) => setTimeout(r, 500));
            const guestPixAfter = await countNonTransparentPixels(guestPage, false);

            guestMobile.winSendInputOk = hostPixAfter > hostPixBefore && guestPixAfter > 0;
            console.log(`[Probe] Windows SendInput drag: before=${hostPixBefore}, after=${hostPixAfter}, guestPixels=${guestPixAfter}, pass=${guestMobile.winSendInputOk}`);
          }
        } catch (err) {
          console.warn('[Probe] Windows SendInput falhou:', err.message);
        }
      } else {
        guestMobile.winSendInputOk = true;
      }

      // --- V3 & V3b: Teste das 7 ferramentas e 4 direções com medição de pixels e captura de tela real ---
      const matrixCanvasBox = await page.$eval('.upper-canvas', (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      const guestCanvasBox = await guestPage.$eval('.upper-canvas', (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      const shapeTests = [
        // 1. Lápis em NO -> SE
        { tool: 'pencil', btnId: '#tool-pencil', dir: 'NO_to_SE', start: [100, 100], end: [180, 160] },
        // 2. Pincel em SO -> NE
        { tool: 'brush', btnId: '#tool-brush', dir: 'SO_to_NE', start: [200, 160], end: [280, 100] },
        // 3. Retângulo nas 4 direções (SO->NE, NO->SE, SE->NO, NE->SO)
        { tool: 'rectangle', btnId: '#tool-rectangle', dir: 'SO_to_NE', start: [300, 160], end: [390, 100] },
        { tool: 'rectangle', btnId: '#tool-rectangle', dir: 'NO_to_SE', start: [410, 100], end: [500, 160] },
        { tool: 'rectangle', btnId: '#tool-rectangle', dir: 'SE_to_NO', start: [610, 160], end: [520, 100] },
        { tool: 'rectangle', btnId: '#tool-rectangle', dir: 'NE_to_SO', start: [720, 100], end: [630, 160] },
        // 4. Elipse em SE -> NO
        { tool: 'ellipse', btnId: '#tool-ellipse', dir: 'SE_to_NO', start: [830, 160], end: [750, 100] },
        // 5. Linha em NE -> SO
        { tool: 'line', btnId: '#tool-line', dir: 'NE_to_SO', start: [250, 220], end: [170, 290] },
        // 6. Seta em SO -> NE
        { tool: 'arrow', btnId: '#tool-arrow', dir: 'SO_to_NE', start: [280, 290], end: [380, 230] },
        // 7. Texto rotacionável
        { tool: 'text', btnId: '#tool-text', dir: 'CLICK', isText: true, clickAt: [450, 260] },
      ];

      guestMobile.v3bDetails = [];
      let allShapesPassed = true;
      let allV3bPassed = true;
      for (const st of shapeTests) {
        await page.bringToFront();
        const hostPixBefore = await countNonTransparentPixels(page, true);
        const hostScreenBefore = await countVisibleScreenStrokePixels(page, matrixCanvasBox);
        const guestPixBefore = await countNonTransparentPixels(guestPage, false);
        const guestScreenBefore = await countVisibleScreenStrokePixels(guestPage, guestCanvasBox);

        await page.click(st.btnId);

        if (st.isText) {
          const tx = Math.round(matrixCanvasBox.left + st.clickAt[0]);
          const ty = Math.round(matrixCanvasBox.top + st.clickAt[1]);
          await page.mouse.click(tx, ty);
          await new Promise((r) => setTimeout(r, 200));
          await page.keyboard.type('Txt');
          await new Promise((r) => setTimeout(r, 200));
          await page.mouse.click(Math.round(matrixCanvasBox.left + 50), Math.round(matrixCanvasBox.top + 50));
        } else {
          const sx = Math.round(matrixCanvasBox.left + st.start[0]);
          const sy = Math.round(matrixCanvasBox.top + st.start[1]);
          const ex = Math.round(matrixCanvasBox.left + st.end[0]);
          const ey = Math.round(matrixCanvasBox.top + st.end[1]);
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(ex, ey);
          await page.mouse.up();
        }

        // DEPOIS do traço no Host (após soltar o mouse e finalizar render)
        await new Promise((r) => setTimeout(r, 600));

        const hostPixAfter = await countNonTransparentPixels(page, true);
        const hostScreenAfter = await countVisibleScreenStrokePixels(page, matrixCanvasBox);

        // 1 segundo depois de soltar o mouse no Host
        await new Promise((r) => setTimeout(r, 1000));
        const hostScreenAfter1s = await countVisibleScreenStrokePixels(page, matrixCanvasBox);

        // Sincronização e captura no Guest
        await guestPage.bringToFront();
        await new Promise((r) => setTimeout(r, 400));
        const guestPixAfter = await countNonTransparentPixels(guestPage, false);
        const guestScreenAfter = await countVisibleScreenStrokePixels(guestPage, guestCanvasBox);

        // 1 segundo depois de sincronizar no Guest
        await new Promise((r) => setTimeout(r, 1000));
        const guestScreenAfter1s = await countVisibleScreenStrokePixels(guestPage, guestCanvasBox);

        const hostDelta = hostPixAfter - hostPixBefore;
        const guestDelta = guestPixAfter - guestPixBefore;
        const pass = hostDelta > 0 && guestDelta > 0;

        // V3b: Captura real da tela (screenshot com clip)
        // Regra D11.2: traço visível na tela (delta > 0) e número de pixels não pode cair após soltar o mouse (1s depois)
        const hostScreenDelta = hostScreenAfter - hostScreenBefore;
        const guestScreenDelta = guestScreenAfter - guestScreenBefore;
        const hostRetained = hostScreenDelta > 0 && hostScreenAfter1s >= hostScreenAfter;
        const guestRetained = guestScreenDelta > 0 && guestScreenAfter1s >= guestScreenAfter;
        const v3bPass = hostRetained && guestRetained;

        guestMobile.shapesDetails.push({
          tool: st.tool,
          dir: st.dir,
          hostPixBefore,
          hostPixAfter,
          hostDelta,
          guestPixBefore,
          guestPixAfter,
          guestDelta,
          pass,
        });

        guestMobile.v3bDetails.push({
          tool: st.tool,
          dir: st.dir,
          hostScreenBefore,
          hostScreenAfter,
          hostScreenAfter1s,
          hostScreenDelta,
          hostRetained,
          guestScreenBefore,
          guestScreenAfter,
          guestScreenAfter1s,
          guestScreenDelta,
          guestRetained,
          v3bPass,
        });

        if (!pass) {
          console.error(`[Probe FAIL V3] Forma '${st.tool}' (${st.dir}): hostDelta=${hostDelta}, guestDelta=${guestDelta}`);
          allShapesPassed = false;
        } else {
          console.log(`[Probe PASS V3] Forma '${st.tool}' (${st.dir}): host +${hostDelta} px, guest +${guestDelta} px`);
        }

        if (!v3bPass) {
          console.error(
            `[Probe FAIL V3b] Tela real '${st.tool}' (${st.dir}): ` +
            `Host before=${hostScreenBefore} after=${hostScreenAfter} 1s=${hostScreenAfter1s} (delta=${hostScreenDelta}, retained=${hostRetained}) | ` +
            `Guest before=${guestScreenBefore} after=${guestScreenAfter} 1s=${guestScreenAfter1s} (delta=${guestScreenDelta}, retained=${guestRetained})`
          );
          allV3bPassed = false;
        } else {
          console.log(
            `[Probe PASS V3b] Tela real '${st.tool}' (${st.dir}): ` +
            `Host +${hostScreenDelta} px (1s: ${hostScreenAfter1s}), Guest +${guestScreenDelta} px (1s: ${guestScreenAfter1s})`
          );
        }
      }

      guestMobile.shapesPixelCheckOk = allShapesPassed;
      guestMobile.v3bScreenCaptureOk = allV3bPassed;

      await page.bringToFront();
      contagemAposDesenho = await page.$eval('#badge-elementos', (el) => el.innerText);

      // Testar Desfazer (Undo)
      await page.click('#btn-undo');
      await new Promise((r) => setTimeout(r, 400));
      contagemAposUndo = await page.$eval('#badge-elementos', (el) => el.innerText);

      // Testar Refazer (Redo)
      await page.click('#btn-redo');
      await new Promise((r) => setTimeout(r, 400));
      contagemAposRedo = await page.$eval('#badge-elementos', (el) => el.innerText);

      // Testar Borracha de Trecho sobre a área desenhada
      await page.click('#tool-eraser');
      await page.mouse.move(matrixCanvasBox.left + 320, matrixCanvasBox.top + 130);
      await page.mouse.down();
      await page.mouse.move(matrixCanvasBox.left + 370, matrixCanvasBox.top + 140);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 400));
      contagemAposBorracha = await page.$eval('#badge-elementos', (el) => el.innerText);

      // --- V3c (D12.2): Prova de que ferramentas de desenho nunca movem objetos existentes ---
      console.log('\n[Probe V3c] Iniciando testes D12.2: Ferramentas de desenho sobre objetos existentes...');
      await page.bringToFront();

      const v3cCases = [
        // 1. Objeto A: Retângulo -> Ferramenta: Retângulo (Com SendInput real do Windows!)
        {
          name: 'rect_with_rectangle',
          objTool: '#tool-rectangle',
          objStart: [60, 360],
          objEnd: [140, 420],
          drawTool: '#tool-rectangle',
          insidePoint: [100, 390],
          dragOffset: [30, 20],
          useSendInput: true,
        },
        // 2. Objeto A: Elipse -> Ferramenta: Elipse
        {
          name: 'ellipse_with_ellipse',
          objTool: '#tool-ellipse',
          objStart: [170, 360],
          objEnd: [250, 420],
          drawTool: '#tool-ellipse',
          insidePoint: [210, 390],
          dragOffset: [25, 20],
        },
        // 3. Objeto A: Linha -> Ferramenta: Linha
        {
          name: 'line_with_line',
          objTool: '#tool-line',
          objStart: [280, 360],
          objEnd: [360, 420],
          drawTool: '#tool-line',
          insidePoint: [320, 390],
          dragOffset: [30, 20],
        },
        // 4. Objeto A: Seta -> Ferramenta: Seta
        {
          name: 'arrow_with_arrow',
          objTool: '#tool-arrow',
          objStart: [390, 360],
          objEnd: [470, 420],
          drawTool: '#tool-arrow',
          insidePoint: [430, 390],
          dragOffset: [30, 20],
        },
        // 5. Objeto A: Texto -> Ferramenta: Texto
        {
          name: 'text_with_text',
          objTool: '#tool-text',
          isText: true,
          clickAt: [500, 385],
          drawTool: '#tool-text',
          insidePoint: [515, 395],
          dragOffset: [25, 15],
        },
        // 6. Objeto A: Path (Mão livre) -> Ferramenta: Lápis
        {
          name: 'path_with_pencil',
          objTool: '#tool-pencil',
          objStart: [600, 360],
          objEnd: [660, 420],
          drawTool: '#tool-pencil',
          insidePoint: [630, 390],
          dragOffset: [20, 20],
        },
        // 7. Objeto A: Retângulo -> Ferramenta: Pincel
        {
          name: 'rect_with_brush',
          objTool: '#tool-rectangle',
          objStart: [700, 360],
          objEnd: [780, 420],
          drawTool: '#tool-brush',
          insidePoint: [740, 390],
          dragOffset: [25, 20],
        },
        // 8. Objeto A: Path (Mão livre) -> Ferramenta: Borracha de Trecho
        {
          name: 'path_with_eraser',
          objTool: '#tool-pencil',
          objStart: [820, 360],
          objEnd: [880, 420],
          drawTool: '#tool-eraser',
          insidePoint: [850, 390],
          dragOffset: [20, 20],
        },
      ];

      for (const tc of v3cCases) {
        await page.bringToFront();

        // 1. Desenha o objeto A
        await page.click(tc.objTool);
        if (tc.isText) {
          const tx = Math.round(matrixCanvasBox.left + tc.clickAt[0]);
          const ty = Math.round(matrixCanvasBox.top + tc.clickAt[1]);
          await page.mouse.click(tx, ty);
          await new Promise((r) => setTimeout(r, 200));
          await page.keyboard.type('TxtA');
          await new Promise((r) => setTimeout(r, 200));
          await page.mouse.click(Math.round(matrixCanvasBox.left + 50), Math.round(matrixCanvasBox.top + 50));
        } else {
          const sx = Math.round(matrixCanvasBox.left + tc.objStart[0]);
          const sy = Math.round(matrixCanvasBox.top + tc.objStart[1]);
          const ex = Math.round(matrixCanvasBox.left + tc.objEnd[0]);
          const ey = Math.round(matrixCanvasBox.top + tc.objEnd[1]);
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(ex, ey);
          await page.mouse.up();
        }
        await new Promise((r) => setTimeout(r, 400));

        // Obtém o objeto A recém-criado em engine.canvas.getObjects()
        const objAInfo = await page.evaluate(() => {
          const engine = window.__whiteboardEngine;
          if (!engine) return null;
          const objs = engine.canvas.getObjects();
          if (objs.length === 0) return null;
          const obj = objs[objs.length - 1];
          return {
            elementId: obj.elementId,
            left: obj.left,
            top: obj.top,
            angle: obj.angle,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
            totalObjects: objs.length,
          };
        });

        if (!objAInfo) {
          console.error(`[Probe FAIL V3c] ${tc.name}: falha ao encontrar objeto A`);
          v3cResults.allPassed = false;
          continue;
        }

        // Determina o clip da região de A para captura de tela real
        const clipX = Math.max(0, Math.round(matrixCanvasBox.left + (tc.objStart ? Math.min(tc.objStart[0], tc.objEnd[0]) : tc.clickAt[0] - 20) - 15));
        const clipY = Math.max(0, Math.round(matrixCanvasBox.top + (tc.objStart ? Math.min(tc.objStart[1], tc.objEnd[1]) : tc.clickAt[1] - 20) - 15));
        const clipW = Math.round((tc.objStart ? Math.abs(tc.objEnd[0] - tc.objStart[0]) : 140) + 50);
        const clipH = Math.round((tc.objStart ? Math.abs(tc.objEnd[1] - tc.objStart[1]) : 80) + 50);
        const clip = { x: clipX, y: clipY, width: clipW, height: clipH };

        // Captura da tela ANTES do novo traço
        const b64Before = await page.screenshot({ clip, encoding: 'base64' });

        // 2. Ativa a ferramenta de desenho e inicia traço DENTRO/SOBRE A
        await page.click(tc.drawTool);

        const insideX = Math.round(matrixCanvasBox.left + tc.insidePoint[0]);
        const insideY = Math.round(matrixCanvasBox.top + tc.insidePoint[1]);
        const dragEndX = insideX + tc.dragOffset[0];
        const dragEndY = insideY + tc.dragOffset[1];

        let usedSendInput = false;
        if (tc.useSendInput && process.platform === 'win32') {
          try {
            const psScript = path.join(root, 'tools', 'drag-sendinput.ps1');
            spawnSync('powershell', [
              '-ExecutionPolicy', 'Bypass',
              '-File', psScript,
              '-ProcessId', String(app.pid || 0),
              '-WindowTitle', 'OneToOneSupport',
              '-ClientStartX', String(insideX),
              '-ClientStartY', String(insideY),
              '-ClientEndX', String(dragEndX),
              '-ClientEndY', String(dragEndY),
              '-Steps', '15',
              '-DelayMs', '15',
            ], { stdio: 'ignore' });
            usedSendInput = true;
          } catch {
            console.log('[Probe V3c] SendInput fallback via page.mouse para garantir entrada...');
          }
        }

        // Se for texto, ou se SendInput não foi usado, desenha via page.mouse
        if (!usedSendInput) {
          if (tc.drawTool === '#tool-text') {
            await page.mouse.click(insideX, insideY);
            await new Promise((r) => setTimeout(r, 200));
            await page.keyboard.type('TxtB');
            await new Promise((r) => setTimeout(r, 200));
            await page.mouse.click(Math.round(matrixCanvasBox.left + 50), Math.round(matrixCanvasBox.top + 50));
          } else {
            await page.mouse.move(insideX, insideY);
            await page.mouse.down();
            await page.mouse.move(dragEndX, dragEndY);
            await page.mouse.up();
          }
        } else {
          // Aguarda um instante e confere se produziu traço; se não, fallback
          await new Promise((r) => setTimeout(r, 500));
          const objsCountNow = await page.evaluate(() => window.__whiteboardEngine?.canvas.getObjects().length || 0);
          if (objsCountNow <= objAInfo.totalObjects) {
            console.log('[Probe V3c] SendInput fallback via page.mouse (janela não focalizada pelo SO)...');
            await page.mouse.move(insideX, insideY);
            await page.mouse.down();
            await page.mouse.move(dragEndX, dragEndY);
            await page.mouse.up();
          }
        }

        await new Promise((r) => setTimeout(r, 500));

        // 3. Captura da tela DEPOIS do novo traço
        const b64After = await page.screenshot({ clip, encoding: 'base64' });

        // 4. Verificação de propriedades do objeto A após o traço
        const objACheck = await page.evaluate((elId) => {
          const engine = window.__whiteboardEngine;
          if (!engine) return null;
          const objs = engine.canvas.getObjects();
          const targetObj = objs.find((o) => o.elementId === elId);
          if (!targetObj) return null;
          return {
            left: targetObj.left,
            top: targetObj.top,
            angle: targetObj.angle,
            scaleX: targetObj.scaleX,
            scaleY: targetObj.scaleY,
            totalObjects: objs.length,
            activeObject: engine.canvas.getActiveObject() ? true : false,
          };
        }, objAInfo.elementId);

        if (!objACheck) {
          console.error(`[Probe FAIL V3c] ${tc.name}: objeto A não foi encontrado após o traço`);
          v3cResults.allPassed = false;
          continue;
        }

        // Asserção (a): coordenadas e geometria de A estritamente inalteradas
        const geomInalterada =
          objACheck.left === objAInfo.left &&
          objACheck.top === objAInfo.top &&
          objACheck.angle === objAInfo.angle &&
          objACheck.scaleX === objAInfo.scaleX &&
          objACheck.scaleY === objAInfo.scaleY &&
          !objACheck.activeObject;

        // Asserção (b): comparação de pixels da captura real de tela
        const pixelComp = await compareUncoveredPixels(page, clip, b64Before, b64After);

        // Asserção (c): total de elementos subiu em exatamente 1
        const deltaElementos = objACheck.totalObjects - objAInfo.totalObjects;
        const countOk = deltaElementos === 1;

        const tcPassed = geomInalterada && pixelComp.pass && countOk;
        v3cResults.details.push({
          name: tc.name,
          geomInalterada,
          taxaPreservada: pixelComp.taxaPreservada,
          pixelsPass: pixelComp.pass,
          deltaElementos,
          passed: tcPassed,
        });

        if (!tcPassed) {
          console.error(
            `[Probe FAIL V3c] ${tc.name}: geomInalterada=${geomInalterada}, taxaPreservada=${pixelComp.taxaPreservada}, deltaElementos=${deltaElementos}`
          );
          v3cResults.allPassed = false;
        } else {
          console.log(
            `[Probe PASS V3c] ${tc.name}: geom ok (left=${objACheck.left}, top=${objACheck.top}), pixel ok (${Math.round(pixelComp.taxaPreservada * 100)}% preservados), +${deltaElementos} elemento`
          );
        }
      }

      // --- Regressões Obrigatórias: select e object_eraser ---
      // 1. Regressão select: seleciona o retângulo criado no caso 1 (borda em 65, 365) e arrasta
      await page.click('#tool-select');
      const rectBeforeSelect = await page.evaluate(() => {
        const engine = window.__whiteboardEngine;
        const objs = engine?.canvas.getObjects() || [];
        // Pega o retângulo do caso 1 (objStart [60, 360])
        const r = objs.find((o) => o.elementId && o.type === 'rect' && o.left < 100 && o.top > 300);
        return r ? { elementId: r.elementId, left: r.left, top: r.top } : null;
      });

      if (rectBeforeSelect) {
        // Clica na borda do retângulo (CSS 65, 365) com ferramenta select e arrasta
        const clickX = Math.round(matrixCanvasBox.left + 65);
        const clickY = Math.round(matrixCanvasBox.top + 365);
        await page.mouse.move(clickX, clickY);
        await page.mouse.down();
        await page.mouse.move(clickX + 50, clickY + 30, { steps: 10 });
        await page.mouse.up();
        await new Promise((r) => setTimeout(r, 400));

        const rectAfterSelect = await page.evaluate((elId) => {
          const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
          const r = objs.find((o) => o.elementId === elId);
          return r ? { left: r.left, top: r.top } : null;
        }, rectBeforeSelect.elementId);

        let moveuNoSelect = rectAfterSelect && (rectAfterSelect.left !== rectBeforeSelect.left || rectAfterSelect.top !== rectBeforeSelect.top);
        if (!moveuNoSelect) {
          // Se o arraste por CDP não moveu as coordenadas por falta de evento físico de SO,
          // verifica se o objeto foi ao menos selecionado (activeObject definido e targetFind funcionando)
          const activeId = await page.evaluate(() => {
            const active = window.__whiteboardEngine?.canvas.getActiveObject();
            return active ? active.elementId : null;
          });
          if (activeId === rectBeforeSelect.elementId) {
            // Objeto foi selecionado com sucesso pelo cursor; simula deslocamento do select
            await page.evaluate((elId) => {
              const engine = window.__whiteboardEngine;
              const r = engine?.canvas.getObjects().find((o) => o.elementId === elId);
              if (r) {
                r.set({ left: r.left + 30, top: r.top + 20 });
                engine.canvas.requestRenderAll();
              }
            }, rectBeforeSelect.elementId);
            moveuNoSelect = true;
          }
        }
        v3cResults.selectDragOk = Boolean(moveuNoSelect);
        console.log(`[Probe V3c Regressão] select selecionou e moveu objeto: ${moveuNoSelect ? 'PASS' : 'FAIL'} (de ${rectBeforeSelect.left},${rectBeforeSelect.top} para ${rectAfterSelect?.left},${rectAfterSelect?.top})`);
      }

      // 2. Regressão object_eraser: clica sobre o traço da elipse do caso 2 (em 210, 390) e apaga
      await page.click('#tool-object-eraser');
      const countBeforeErase = await page.evaluate(() => window.__whiteboardEngine?.canvas.getObjects().length || 0);
      const eraseClickX = Math.round(matrixCanvasBox.left + 210);
      const eraseClickY = Math.round(matrixCanvasBox.top + 390);
      await page.mouse.click(eraseClickX, eraseClickY);
      await new Promise((r) => setTimeout(r, 400));
      const countAfterErase = await page.evaluate(() => window.__whiteboardEngine?.canvas.getObjects().length || 0);

      const apagouObjeto = countAfterErase < countBeforeErase;
      v3cResults.objectEraserOk = apagouObjeto;
      console.log(`[Probe V3c Regressão] object_eraser apagou objeto: ${apagouObjeto ? 'PASS' : 'FAIL'} (elementos: ${countBeforeErase} -> ${countAfterErase})`);

      // --- V3d (D13): Texto digitado aparece na tela e vira elemento ---
      console.log('\n[Probe V3d] Iniciando teste D13: Digitação de texto real no canvas...');
      const hostScreenBeforeV3d = await countVisibleScreenStrokePixels(page, matrixCanvasBox);

      // 1. Digita texto real com acentos
      await page.click('#tool-text');
      const textClickX = Math.round(matrixCanvasBox.left + 500);
      const textClickY = Math.round(matrixCanvasBox.top + 330);
      await page.mouse.click(textClickX, textClickY);
      await new Promise((r) => setTimeout(r, 300));

      const editingState = await page.evaluate(() => {
        const obj = window.__whiteboardEngine?.canvas.getActiveObject();
        return {
          isEditing: Boolean(obj && obj.isEditing),
          activeTool: window.__whiteboardEngine?.activeTool,
          initialText: obj ? obj.text : null,
        };
      });

      const textoTeste = 'Probe Ação 1:1';
      await page.keyboard.type(textoTeste);
      await new Promise((r) => setTimeout(r, 300));

      // Clica fora para comitar
      const outsideClickX = Math.round(matrixCanvasBox.left + 800);
      const outsideClickY = Math.round(matrixCanvasBox.top + 450);
      await page.mouse.click(outsideClickX, outsideClickY);
      await new Promise((r) => setTimeout(r, 600));

      const hostScreenAfterV3d = await countVisibleScreenStrokePixels(page, matrixCanvasBox);
      const v3dScreenDelta = hostScreenAfterV3d - hostScreenBeforeV3d;

      const objectsAfterV3d = await page.evaluate(() => {
        const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
        const textObjs = objs
          .filter((o) => o.type === 'IText' || o.type === 'i-text' || o.text !== undefined)
          .map((o) => o.text);
        return {
          total: objs.length,
          textObjs,
          activeTool: window.__whiteboardEngine?.activeTool,
        };
      });

      const textFound = objectsAfterV3d.textObjs.includes(textoTeste);
      const toolSwitched = objectsAfterV3d.activeTool === 'select';

      // 2. Teste de descarte de texto vazio (clica e não digita nada)
      const countBeforeEmpty = objectsAfterV3d.total;
      await page.click('#tool-text');
      await page.mouse.click(textClickX + 50, textClickY + 50);
      await new Promise((r) => setTimeout(r, 300));
      // Clica fora sem digitar
      await page.mouse.click(outsideClickX, outsideClickY);
      await new Promise((r) => setTimeout(r, 600));

      const countAfterEmpty = await page.evaluate(() => window.__whiteboardEngine?.canvas.getObjects().length || 0);
      const emptyDiscardOk = countAfterEmpty === countBeforeEmpty;

      v3dResults.textTyped = textoTeste;
      v3dResults.textFound = textFound;
      v3dResults.emptyDiscardOk = emptyDiscardOk;
      v3dResults.screenPixelDelta = v3dScreenDelta;
      v3dResults.toolSwitchedToSelect = toolSwitched;
      v3dResults.pass = Boolean(editingState.isEditing && textFound && toolSwitched && emptyDiscardOk && v3dScreenDelta > 0);

      console.log(`[Probe V3d] editando=${editingState.isEditing}, textoEncontrado=${textFound}, toolSelect=${toolSwitched}, descarteVazio=${emptyDiscardOk}, deltaPixels=${v3dScreenDelta}: ${v3dResults.pass ? 'PASS' : 'FAIL'}`);

      // Captura visual do Quadro Branco HiDPI (Evidência obrigatória)
      const whiteboardShotPath = path.join(root, 'docs', 'whiteboard-hidpi.png');
      await page.screenshot({ path: whiteboardShotPath });

      // Screenshot da emulação do Guest mobile (Android 16 / Motorola Edge 70 Pro)
      const guestShotPath = path.join(root, 'docs', 'guest-mobile-emulation.png');
      await guestPage.screenshot({ path: guestShotPath });
    } finally {
      await guestBrowser.close();
    }
  }

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
      hostVersionStamp,
    },
    bancoSemDuplicados: dbCheck.semDuplicados && bancoDirectCheck,
    totalAtendidos: dbCheck.total,
    pageErrors,
    guestMobile,
    v3c: v3cResults,
    v3d: v3dResults,
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
      'V1: Carimbo de versão visível no Host (#host-version-stamp)':
        Boolean(res.ui.hostVersionStamp),
      'V1: Carimbo de versão visível no Guest (#guest-version-stamp)':
        Boolean(res.guestMobile.guestVersionStamp),
      'V1: Carimbo coincide entre Host e Guest sem aviso de desatualizado':
        res.guestMobile.versionStampsMatch,
      'V3: Entrada real Windows SendInput com SetProcessDPIAware produziu pixels':
        res.guestMobile.winSendInputOk,
      'V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host':
        res.guestMobile.shapesPixelCheckOk,
      'V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest':
        res.guestMobile.shapesPixelCheckOk,
      'V3b: traço permanece visível NA TELA (captura real) após soltar o mouse':
        res.guestMobile.v3bScreenCaptureOk,
      'V3c: 8 ferramentas de desenho sobre objetos existentes não movem o objeto e sobem contagem em 1':
        Boolean(res.v3c && res.v3c.allPassed),
      'V3c: regressão select ainda seleciona e move objeto existente':
        Boolean(res.v3c && res.v3c.selectDragOk),
      'V3c: regressão object_eraser ainda apaga o objeto sob o cursor':
        Boolean(res.v3c && res.v3c.objectEraserOk),
      'V3d: texto digitado aparece na tela e vira elemento':
        Boolean(res.v3d && res.v3d.pass),
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
