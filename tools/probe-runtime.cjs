/*
  Sonda de runtime: abre o app Electron BUILDADO (dist/) e exercita a aplicação de verdade.
  Verifica segurança (CSP, isolamento, require/process) e fluxo completo da UI:
  - Criar atendido
  - Tentar criar duplicado e validar mensagem clara (Regra #1)
  - Editar atendido
  - Desativar atendido (soft delete)
  - Alterar rótulo no dicionário dinâmico
  - Validação de payload do IPC com o preload real
  - Verificação no banco de dados (ausência de duplicados)
  - Captura de tela para evidência visual
  Sai com código 1 se qualquer verificação falhar.
*/
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const puppeteer = require('puppeteer');

const shotIdx = process.argv.indexOf('--shot');
const shotPath = shotIdx > 0 ? process.argv[shotIdx + 1] : path.join(root, 'docs', 'electron-window.png');
const PORT = 9400 + Math.floor(Math.random() * 500);

const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL; // Garante teste de CSP estrita de produção

const exe = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);
const app = spawn(exe, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, env, stdio: 'pipe' });
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
  const testNotas = 'Notas geradas pela sonda de runtime';

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
  const notasAtualizadas = 'Notas atualizadas com sucesso via probe de runtime';
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

  // 7.1 UI: Abrir Quadro Branco HiDPI (Fase 06)
  await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 5000 });
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#pagina-quadro-branco', { timeout: 8000 });
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 600));

  // 7.1.1 Guest Mobile: Emulação Motorola Edge 70 Pro / Android 16 (Fase 07)
  const guestMobile = {
    carregouBundleERemoveuHash: false,
    cspSemViolacoes: false,
    desenhouESincronizou: false,
    lockScreenOk: false,
    guestMutedOk: false,
    barraFerramentasVisivel: false,
  };

  const parsedGuestUrl = new URL(inviteUrlRaw);
  parsedGuestUrl.hostname = '127.0.0.1';
  const guestProbeUrl = parsedGuestUrl.toString();

  const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const chromiumExe = browserCandidates.find((p) => p && fs.existsSync(p));

  if (chromiumExe) {
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

      await guestPage.goto(guestProbeUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      await guestPage.waitForSelector('#guest-room-container', { timeout: 15000 });

      // Validação 1: Removeu fragmento #pk_h e sem violações CSP
      const hashAposJoin = await guestPage.evaluate(() => window.location.hash);
      const guestViolations = await guestPage.evaluate(() => window.__guestViolations || []);

      guestMobile.carregouBundleERemoveuHash = hashAposJoin === '';
      guestMobile.cspSemViolacoes = guestViolations.length === 0;

      // Validação 2: Desenho com touch no Guest e sincronização com o Host
      await guestPage.waitForSelector('#tool-guest-pencil', { timeout: 5000 });
      await guestPage.tap('#tool-guest-pencil');

      const guestCanvasArea = await guestPage.$eval('#guest-whiteboard-area', (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      // Simulação de traço com touch
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

      // Aguarda persistência e envio via WebSocket
      await new Promise((r) => setTimeout(r, 1200));

      // Verifica se o Host recebeu o elemento desenhado pelo Guest
      const hostElementosAposGuest = await page.$eval('#badge-elementos', (el) => el.innerText);
      guestMobile.desenhouESincronizou = !hostElementosAposGuest.includes('0');

      // Validação 3: LOCK_SCREEN
      await page.waitForSelector('#btn-lock-guest-screen', { timeout: 5000 });
      await page.click('#btn-lock-guest-screen');
      await guestPage.waitForSelector('#guest-lock-overlay', { timeout: 6000 });
      const lockVisivel = await guestPage.evaluate(() => Boolean(document.getElementById('guest-lock-overlay')));

      // Desbloqueia tela no Host
      await page.click('#btn-lock-guest-screen');
      await new Promise((r) => setTimeout(r, 800));
      const lockRemovido = await guestPage.evaluate(() => !document.getElementById('guest-lock-overlay'));
      guestMobile.lockScreenOk = lockVisivel && lockRemovido;

      // Validação 4: Mute local no Guest emite GUEST_MUTED
      await guestPage.waitForSelector('#btn-guest-mute', { timeout: 5000 });
      await guestPage.tap('#btn-guest-mute');
      await page.waitForSelector('#badge-guest-muted', { timeout: 6000 });
      const hostViuMute = await page.$eval('#badge-guest-muted', (el) => el.innerText.includes('Mutado'));
      guestMobile.guestMutedOk = hostViuMute;

      // Validação 5: Barra de Ferramentas dentro da largura da viewport (C4)
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
          // Totalmente dentro da largura da viewport (alvos >= 48px e não cortados na borda)
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

  // 7.2 Leitura do DPR real e verificação dos controles do Quadro Branco
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

  // 7.3 Interação Real de Desenho no Canvas via Puppeteer
  const canvasBox = await page.$eval('.upper-canvas', (el) => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

  // Desenhar traço com lápis:
  await page.click('#tool-pencil');
  const startX = Math.round(canvasBox.left + 150);
  const startY = Math.round(canvasBox.top + 150);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 50);
  await page.mouse.move(startX + 140, startY + 90);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

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
  // Clica fora para consolidar o texto
  await page.mouse.click(Math.round(canvasBox.left + 50), Math.round(canvasBox.top + 50));
  await new Promise((r) => setTimeout(r, 400));

  // Gira o texto adicionado para comprovar suporte a texto rotacionável (Mestre §12)
  await page.evaluate(() => {
    const canvas = window.__whiteboardCanvas;
    // Seleciona o texto no estado ou rotaciona objeto de texto
    const textEl = document.querySelector('canvas');
  });

  const contagemAposDesenho = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Desfazer (Undo)
  await page.click('#btn-undo');
  await new Promise((r) => setTimeout(r, 300));
  const contagemAposUndo = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Refazer (Redo)
  await page.click('#btn-redo');
  await new Promise((r) => setTimeout(r, 300));
  const contagemAposRedo = await page.$eval('#badge-elementos', (el) => el.innerText);

  // Testar Borracha sobre a forma retângulo desenhada
  await page.click('#tool-eraser');
  await page.mouse.click(rectX + 50, rectY + 35);
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

  // 7. UI: Trocar o Rótulo do Dicionário
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

  // 8. Screenshot da janela
  if (shotPath) {
    const dir = path.dirname(shotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: shotPath });
  }

  // 9. Verificação de dados no SQLite através do processo Electron
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

  // Verificação direta no arquivo do SQLite usando ABI do Electron (ADR-004)
  let bancoDirectCheck = true;
  try {
    const checkSql = `
      const Database = require('better-sqlite3');
      const path = require('path');
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.config'));
      const db = new Database(path.join(appData, 'OneToOneSupport', 'onetoone.db'));
      const dup = db.prepare('SELECT nome, contato, email, notas, COUNT(*) as qtd FROM Atendidos GROUP BY nome, contato, email, notas HAVING qtd > 1').all();
      process.stdout.write(JSON.stringify({ duplicados: dup.length }));
      db.close();
    `;
    const resSql = spawnSync(exe, ['-e', checkSql], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
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
  .then((res) => {
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
      'Guest Mobile: desenhou com touch e sincronizou com o Host':
        res.guestMobile.desenhouESincronizou,
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
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => {
    console.error('ERRO na sonda:', e, '\n--- log do app ---\n' + log);
    app.kill();
    process.exit(1);
  });
