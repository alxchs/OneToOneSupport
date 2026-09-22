/**
 * Teste automatizado de ponta a ponta para D1 (Encaminhamento de Diagnóstico e Ordem de Checkpoints)
 * Com ONETOONE_DIAG=1, conecta Host + Guest (mobile emulado), desenha um retângulo via SendInput
 * captura o stdout do processo app (Electron) e afirma a ordem cronológica estrita:
 * finishShapeCreation -> emitEvent -> aplicarEventoQuadro -> gravar (IPC) -> broadcastToGuest -> chegada no Guest -> renderState
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const PORT = 9500 + Math.floor(Math.random() * 400);

const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-diag-test-'));
const testDbPath = path.join(testTempDir, 'onetoone-diag.db');
const testUserDataDir = path.join(testTempDir, 'userData');
fs.mkdirSync(testUserDataDir, { recursive: true });

console.log(`[DiagTest] Ambiente isolado temporário: ${testTempDir}`);
console.log(`[DiagTest] Banco SQLite: ${testDbPath}`);

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

console.log(`[DiagTest] Lançando Electron com ONETOONE_DIAG=1...`);
const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });

let stdoutBuffer = '';
let stderrBuffer = '';

app.stdout.on('data', (chunk) => {
  const str = chunk.toString();
  stdoutBuffer += str;
  process.stdout.write(str);
});

app.stderr.on('data', (chunk) => {
  const str = chunk.toString();
  stderrBuffer += str;
});

async function run() {
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });

  const page = (await browser.pages())[0];
  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));

  // 1. Criar Atendido
  console.log('[DiagTest] Criando atendido...');
  const testNome = `Diag Test ${Date.now().toString().slice(-4)}`;
  await page.waitForSelector('#btn-novo-atendido', { timeout: 8000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 5000 });
  await page.type('#input-nome', testNome);
  await page.click('#btn-salvar-atendido');
  await page.waitForSelector('#input-busca-atendido', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 600));

  // 2. Abrir detalhes do atendido
  const detailSelector = `tr[data-nome="${testNome}"] button[id^="btn-ver-detalhes-"]`;
  await page.waitForSelector(detailSelector, { timeout: 5000 });
  await page.click(detailSelector);

  // 3. Iniciar Sessão e obter URL de convite
  console.log('[DiagTest] Iniciando sessão LAN...');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
  await page.type('#input-titulo-sessao', 'Sessao Diag Test');
  await page.click('#btn-confirmar-sessao');

  await page.waitForSelector('#painel-sala-servidor', { timeout: 8000 });
  await page.waitForSelector('#input-url-convite', { timeout: 5000 });
  const inviteUrlRaw = await page.$eval('#input-url-convite', (el) => el.value);
  console.log(`[DiagTest] URL de convite gerada: ${inviteUrlRaw}`);

  // 4. Abrir Quadro Branco no Host
  await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 5000 });
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#canvas-quadro-branco', { timeout: 8000 });
  await page.waitForSelector('.upper-canvas', { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 5. Lançar Chromium para o Guest Mobile e conectar
  const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const chromiumExe = browserCandidates.find((p) => p && fs.existsSync(p));
  if (!chromiumExe) {
    throw new Error('Nenhum navegador Chromium encontrado para o Guest.');
  }

  console.log(`[DiagTest] Lançando Guest mobile: ${chromiumExe}`);
  const guestBrowser = await puppeteer.launch({
    executablePath: chromiumExe,
    headless: true,
  });

  let guestPage;
  try {
    guestPage = await guestBrowser.newPage();
    await guestPage.setViewport({
      width: 412,
      height: 915,
      devicePixelRatio: 2.625,
      isMobile: true,
      hasTouch: true,
    });
    console.log(`[DiagTest] Conectando Guest à sala...`);
    await guestPage.goto(inviteUrlRaw, { waitUntil: 'networkidle0', timeout: 15000 });
    await guestPage.waitForSelector('#guest-room-container', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[DiagTest] Guest conectado com sucesso!');

    // Ponto de corte do buffer antes do desenho do retângulo
    const startMarker = `--- START-RECTANGLE-${Date.now()} ---`;
    console.log(`[DiagTest] ${startMarker}`);
    const offsetBeforeDraw = stdoutBuffer.length;

    // 6. Host seleciona ferramenta Retângulo e desenha via SendInput real
    await page.bringToFront();
    await page.waitForSelector('#tool-rectangle', { timeout: 5000 });
    await page.click('#tool-rectangle');

    const clientBox = await page.$eval('.upper-canvas', (el) => {
      const r = el.getBoundingClientRect();
      return {
        startX: Math.round(r.left + 80),
        startY: Math.round(r.top + 120),
        endX: Math.round(r.left + 220),
        endY: Math.round(r.top + 220),
      };
    });

    console.log(`[DiagTest] Executando SendInput retângulo: (${clientBox.startX},${clientBox.startY}) -> (${clientBox.endX},${clientBox.endY})`);
    const psScript = path.join(root, 'tools', 'drag-sendinput.ps1');
    const sendInputRes = spawnSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        psScript,
        '-ProcessId',
        String(app.pid || 0),
        '-WindowTitle',
        'OneToOneSupport',
        '-ClientStartX',
        String(clientBox.startX),
        '-ClientStartY',
        String(clientBox.startY),
        '-ClientEndX',
        String(clientBox.endX),
        '-ClientEndY',
        String(clientBox.endY),
        '-Steps',
        '20',
        '-DelayMs',
        '15',
      ],
      { stdio: 'inherit' }
    );

    await new Promise((r) => setTimeout(r, 1000));

    // Se foco tiver falhado no SendInput do OS, fallback garantido via page.mouse
    const stdoutSub = stdoutBuffer.slice(offsetBeforeDraw);
    if (!stdoutSub.includes('finishShapeCreation')) {
      console.log('[DiagTest] Acionando fallback page.mouse para garantir evento finishShapeCreation...');
      await page.mouse.move(clientBox.startX, clientBox.startY);
      await page.mouse.down();
      await page.mouse.move(clientBox.endX, clientBox.endY);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 1200));
    } else {
      await new Promise((r) => setTimeout(r, 1200));
    }

    // 7. Análise da saída do terminal após o desenho
    const finalStdout = stdoutBuffer.slice(offsetBeforeDraw);

    console.log('\n=================== VERIFICAÇÃO DE CHECKPOINTS NO TERMINAL ===================');

    const expectedOrder = [
      {
        name: 'path:created/finishShapeCreation',
        regex: /\[DIAG-HOST\]\s*\[\S+\]\s*\[(finishShapeCreation|path:created)\]/,
      },
      {
        name: 'emitEvent',
        regex: /\[DIAG-HOST\]\s*\[\S+\]\s*\[emitEvent\]/,
      },
      {
        name: 'aplicarEventoQuadro',
        regex: /\[DIAG-HOST\]\s*\[\S+\]\s*\[aplicarEventoQuadro\]/,
      },
      {
        name: 'gravar (IPC)',
        regex: /\[DIAG-HOST\]\s*\[\S+\]\s*\[gravar \(IPC\)\]/,
      },
      {
        name: 'broadcastToGuest',
        regex: /\[DIAG-SERVER\]\s*\[\S+\]\s*\[broadcastToGuest\]/,
      },
      {
        name: 'chegada no Guest',
        regex: /\[DIAG-SERVER\]\s*\[\S+\]\s*\[(chegada no Guest|chegadaNoGuest)\]/,
      },
      {
        name: 'renderState',
        regex: /\[DIAG-HOST\]\s*\[\S+\]\s*\[renderState\]/,
      },
    ];

    let lastIdx = -1;
    let allPassed = true;
    const capturedLines = [];

    for (const step of expectedOrder) {
      const match = step.regex.exec(finalStdout.slice(Math.max(0, lastIdx)));
      if (!match) {
        console.error(`FAIL: Checkpoint '${step.name}' NÃO foi encontrado após a posição ${lastIdx}!`);
        allPassed = false;
      } else {
        const absolutePos = (lastIdx > 0 ? lastIdx : 0) + match.index;
        // Pega a linha completa onde ocorreu
        const lineStart = finalStdout.lastIndexOf('\n', absolutePos) + 1;
        let lineEnd = finalStdout.indexOf('\n', absolutePos);
        if (lineEnd === -1) lineEnd = finalStdout.length;
        const matchedLine = finalStdout.slice(lineStart, lineEnd).trim();

        capturedLines.push({ step: step.name, pos: absolutePos, line: matchedLine });
        console.log(`PASS: [${step.name}] encontrado na pos ${absolutePos}:`);
        console.log(`      ${matchedLine}`);
        lastIdx = absolutePos + match[0].length;
      }
    }

    console.log('==============================================================================\n');

    await browser.disconnect();
    return { allPassed, capturedLines, fullOutput: finalStdout };
  } finally {
    if (guestBrowser) {
      await guestBrowser.close();
    }
  }
}

run()
  .then(({ allPassed }) => {
    app.kill();
    setTimeout(() => {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {}
      process.exit(allPassed ? 0 : 1);
    }, 600);
  })
  .catch((err) => {
    console.error('[DiagTest] Erro na execução:', err);
    app.kill();
    setTimeout(() => {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {}
      process.exit(1);
    }, 600);
  });
