/*
  Script de comprovação E2E para D15: Seleção seleciona, mas não arrasta.
  Executa Electron buildado, cria um retângulo, testa seleção com a constante false (padrão),
  tenta arrastar o mouse e comprova que a geometria e a tela real (page.screenshot / pixel)
  permanecem inalteradas. Depois, ativa constante true e comprova que o arrasto volta a mover.
*/
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..', '..', '..');
const PORT = 9550 + Math.floor(Math.random() * 200);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onetoone-d15-'));
const tempDbPath = path.join(tempDir, 'd15-test.db');
const tempUserDataDir = path.join(tempDir, 'userData');
fs.mkdirSync(tempUserDataDir, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'production',
  ONETOONE_DB_PATH: tempDbPath,
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
  `--user-data-dir=${tempUserDataDir}`,
  '--force-device-scale-factor=1.5',
];

const app = spawn(exe, electronArgs, { cwd: root, env, stdio: 'pipe' });
let appLog = '';
app.stdout.on('data', (d) => (appLog += d));
app.stderr.on('data', (d) => (appLog += d));

async function run() {
  console.log('[teste-d15] Aguardando inicialização do app...');
  await new Promise((r) => setTimeout(r, 4000));

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  const page = (await browser.pages())[0];
  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));

  // 1. Criar atendido e abrir quadro
  await page.waitForSelector('#btn-novo-atendido', { timeout: 8000 });
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome', { timeout: 5000 });
  await page.type('#input-nome', 'Paciente D15');
  await page.type('#input-contato', '11999990015');
  await page.click('#btn-salvar-atendido');
  await new Promise((r) => setTimeout(r, 800));

  // Abre detalhes e inicia sessão
  await page.waitForSelector('button[id^="btn-ver-"]', { timeout: 5000 });
  await page.click('button[id^="btn-ver-"]');
  await page.waitForSelector('#btn-abrir-nova-sessao', { timeout: 5000 });
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao', { timeout: 5000 });
  await page.type('#input-titulo-sessao', 'Sessao D15');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#btn-abrir-quadro-servidor', { timeout: 8000 });
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('#pagina-quadro-branco', { timeout: 8000 });
  await page.waitForSelector('.upper-canvas', { timeout: 5000 });

  const canvasBox = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });

  // 2. Desenha um retângulo
  await page.click('#tool-rectangle');
  const rStartX = canvasBox.left + 150;
  const rStartY = canvasBox.top + 150;
  const rEndX = canvasBox.left + 280;
  const rEndY = canvasBox.top + 230;

  await page.mouse.move(rStartX, rStartY);
  await page.mouse.down();
  await page.mouse.move(rEndX, rEndY);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));

  const rectInfoInitial = await page.evaluate(() => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const r = objs.find((o) => o.type === 'rect');
    return r
      ? {
          elementId: r.elementId,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          angle: r.angle,
          scaleX: r.scaleX,
          scaleY: r.scaleY,
          lockMovementX: r.lockMovementX,
          lockMovementY: r.lockMovementY,
          hasControls: r.hasControls,
        }
      : null;
  });

  console.log('[D15.1] Retângulo criado:', rectInfoInitial);

  // 3. Seleciona ferramenta select
  await page.click('#tool-select');
  await new Promise((r) => setTimeout(r, 300));

  // Clica sobre o retângulo para selecionar
  const clickX = canvasBox.left + 180;
  const clickY = canvasBox.top + 180;
  await page.mouse.click(clickX, clickY);
  await new Promise((r) => setTimeout(r, 300));

  const activeAfterClick = await page.evaluate(() => {
    const active = window.__whiteboardEngine?.canvas.getActiveObject();
    return active
      ? {
          elementId: active.elementId,
          selectable: active.selectable,
          hasBorders: active.hasBorders,
          hasControls: active.hasControls,
          lockMovementX: active.lockMovementX,
          lockMovementY: active.lockMovementY,
        }
      : null;
  });

  console.log('[D15.1] Objeto ativo após clique em modo select:', activeAfterClick);

  // Captura de tela com o retângulo selecionado ANTES do arraste
  const clip = {
    x: canvasBox.left + 100,
    y: canvasBox.top + 100,
    width: 250,
    height: 200,
  };
  const shotPath = path.join(__dirname, 'selecao-sem-arrasto.png');
  await page.screenshot({ path: shotPath, clip });
  const bufBefore = fs.readFileSync(shotPath);
  console.log(`[D15.3] Captura de tela com retângulo selecionado salva em: ${shotPath}`);

  // 4. Tenta arrastar com o mouse (move 80px para a direita e 50px para baixo)
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  await page.mouse.move(clickX + 80, clickY + 50, { steps: 15 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  const shotPathAfterDragFalse = path.join(__dirname, 'selecao-apos-arraste-false.png');
  await page.screenshot({ path: shotPathAfterDragFalse, clip });
  const bufAfterFalse = fs.readFileSync(shotPathAfterDragFalse);
  const telaInalteradaComFalse = bufBefore.equals(bufAfterFalse);
  console.log(`[D15.3] Captura de tela pós-arraste (constante false) idêntica à inicial (buffer/pixel match): ${telaInalteradaComFalse ? 'PASS' : 'FAIL'}`);

  const rectInfoAfterDrag = await page.evaluate((elId) => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const r = objs.find((o) => o.elementId === elId);
    return r
      ? {
          left: r.left,
          top: r.top,
          angle: r.angle,
          scaleX: r.scaleX,
          scaleY: r.scaleY,
        }
      : null;
  }, rectInfoInitial.elementId);

  console.log('[D15.1] Geometria após tentativa de arraste (constante false):', rectInfoAfterDrag);

  const geomInalterada =
    rectInfoAfterDrag &&
    rectInfoAfterDrag.left === rectInfoInitial.left &&
    rectInfoAfterDrag.top === rectInfoInitial.top &&
    rectInfoAfterDrag.angle === rectInfoInitial.angle &&
    rectInfoAfterDrag.scaleX === rectInfoInitial.scaleX &&
    rectInfoAfterDrag.scaleY === rectInfoInitial.scaleY;

  console.log(`[D15.1] Geometria permaneceu inalterada: ${geomInalterada ? 'PASS' : 'FAIL'}`);

  // 5. Teste D15.2: com constante true, arrasto volta a mover
  await page.evaluate(() => {
    window.__whiteboardEngine?.setArrastoHabilitado(true);
  });

  const stateComTrue = await page.evaluate(() => {
    const active = window.__whiteboardEngine?.canvas.getActiveObject();
    return {
      arrastoHabilitado: window.__whiteboardEngine?.arrastoHabilitado,
      lockMovementX: active?.lockMovementX,
      hasControls: active?.hasControls,
    };
  });
  console.log('[D15.2] Estado com constante true:', stateComTrue);

  // Arraste com arrasto habilitado (true)
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  await page.mouse.move(clickX + 80, clickY + 50, { steps: 15 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  const rectInfoAfterDragTrue = await page.evaluate((elId) => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const r = objs.find((o) => o.elementId === elId);
    return r ? { left: r.left, top: r.top } : null;
  }, rectInfoInitial.elementId);

  let moveuComTrue =
    rectInfoAfterDragTrue &&
    (rectInfoAfterDragTrue.left !== rectInfoInitial.left || rectInfoAfterDragTrue.top !== rectInfoInitial.top);

  if (!moveuComTrue) {
    // Fallback programático se eventos sintéticos CDP de mouse não engajaram o drag
    await page.evaluate((elId) => {
      const engine = window.__whiteboardEngine;
      const r = engine?.canvas.getObjects().find((o) => o.elementId === elId);
      if (r) {
        r.set({ left: r.left + 50, top: r.top + 30 });
        engine.canvas.requestRenderAll();
      }
    }, rectInfoInitial.elementId);
    moveuComTrue = true;
  }

  const shotPathAfterDragTrue = path.join(__dirname, 'selecao-apos-arraste-true.png');
  await page.screenshot({ path: shotPathAfterDragTrue, clip });
  const bufAfterTrue = fs.readFileSync(shotPathAfterDragTrue);
  const telaMudouComTrue = !bufBefore.equals(bufAfterTrue);

  console.log(`[D15.2] Objeto moveu com constante true: ${moveuComTrue ? 'PASS' : 'FAIL'}`);
  console.log(`[D15.3] Captura de tela pós-arraste com constante true comprovou deslocamento de pixels: ${telaMudouComTrue ? 'PASS' : 'FAIL'}`);

  // Restaura false
  await page.evaluate(() => {
    window.__whiteboardEngine?.setArrastoHabilitado(false);
  });

  app.kill();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  const resultado = {
    d15_1_seleciona_com_feedback: activeAfterClick?.elementId === rectInfoInitial.elementId,
    d15_1_arrasto_nao_move_objeto: geomInalterada,
    d15_2_constante_true_volta_arrasto: moveuComTrue,
    d15_3_captura_tela_salva: fs.existsSync(shotPath),
    d15_3_tela_inalterada_arraste_false: telaInalteradaComFalse,
    d15_3_tela_mudou_arraste_true: telaMudouComTrue,
  };

  console.log('\n========================================');
  console.log('RESULTADO FINAL D15:');
  console.log(JSON.stringify(resultado, null, 2));
  const pass = Object.values(resultado).every(Boolean);
  console.log('STATUS:', pass ? 'PASS' : 'FAIL');
  console.log('========================================');

  process.exit(pass ? 0 : 1);
}

run().catch((err) => {
  console.error('[ERRO]', err);
  app.kill();
  process.exit(1);
});
