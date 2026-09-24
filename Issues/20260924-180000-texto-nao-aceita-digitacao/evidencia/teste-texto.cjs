const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.resolve(__dirname, '../../..');
const puppeteer = require('puppeteer');

const PORT = 9660 + Math.floor(Math.random() * 30);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'o2o-txt-'));
const env = {
  ...process.env,
  NODE_ENV: 'production',
  ONETOONE_DB_PATH: path.join(tmp, 'db.sqlite'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.ONETOONE_DIAG;
delete env.VITE_DEV_SERVER_URL;

const app = spawn(
  path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(tmp, 'ud')}`],
  { cwd: root, env, stdio: 'pipe' }
);

(async () => {
  console.log('[teste-texto] Aguardando inicialização do Electron...');
  await new Promise((r) => setTimeout(r, 7000));
  const b = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  const page = (await b.pages())[0];
  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));

  const nome = `Txt ${Date.now().toString().slice(-4)}`;
  await page.waitForSelector('#btn-novo-atendido');
  await page.click('#btn-novo-atendido');
  await page.waitForSelector('#input-nome');
  await page.type('#input-nome', nome);
  await page.type('#input-contato', '11999998888');
  await page.click('#btn-salvar-atendido');
  await page.waitForSelector('#input-busca-atendido');

  const sel = `tr[data-nome="${nome}"] button[id^="btn-ver-detalhes-"]`;
  await page.waitForSelector(sel);
  await page.click(sel);

  await page.waitForSelector('#btn-abrir-nova-sessao');
  await page.click('#btn-abrir-nova-sessao');
  await page.waitForSelector('#input-titulo-sessao');
  await page.type('#input-titulo-sessao', 'Sessao Teste Texto');
  await page.click('#btn-confirmar-sessao');
  await page.waitForSelector('#painel-sala-servidor');

  await page.waitForSelector('#btn-abrir-quadro-servidor');
  await page.click('#btn-abrir-quadro-servidor');
  await page.waitForSelector('.upper-canvas');
  await new Promise((r) => setTimeout(r, 1000));

  const box = await page.$eval('.upper-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });

  const branch = require('child_process')
    .execSync('git rev-parse --abbrev-ref HEAD')
    .toString()
    .trim();
  console.log('BRANCH:', branch);

  const results = {
    caso1_digitacao_com_acentos_multilinha: false,
    caso2_clicou_e_nao_digitou_nada: false,
    caso3_escape_comita_e_muda_ferramenta: false,
    captura_tela_salva: false,
  };

  // CASO 1: Clica com a ferramenta Texto, digita texto com acentuação e multilinha, e clica fora para comitar
  console.log('\n--- CASO 1: Digitação de texto com acentos e multilinha ---');
  await page.click('#tool-text');
  await page.mouse.click(box.x + 150, box.y + 150);
  await new Promise((r) => setTimeout(r, 400));

  const estadoAposClique1 = await page.evaluate(() => {
    const o = window.__whiteboardEngine?.canvas.getActiveObject();
    return {
      temAtivo: !!o,
      editando: !!(o && o.isEditing),
      textoInicial: o ? o.text : null,
      ferramenta: window.__whiteboardEngine?.activeTool,
    };
  });
  console.log('Estado logo apos clicar com ferramenta texto:', JSON.stringify(estadoAposClique1));

  // Digita com acentuação 'Ação' + quebra de linha + 'Multilinha'
  await page.keyboard.type('Ação');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Multilinha');
  await new Promise((r) => setTimeout(r, 300));

  // Clica fora para comitar
  await page.mouse.click(box.x + 700, box.y + 450);
  await new Promise((r) => setTimeout(r, 700));

  const estadoAposCommit1 = await page.evaluate(() => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const textObjs = objs
      .filter((o) => o.type === 'IText' || o.type === 'i-text' || o.text !== undefined)
      .map((o) => o.text);
    return {
      textObjs,
      totalObjetos: objs.length,
      ferramentaAtiva: window.__whiteboardEngine?.activeTool,
    };
  });
  console.log('Estado apos comitar Caso 1:', JSON.stringify(estadoAposCommit1));

  const textoEsperado1 = 'Ação\nMultilinha';
  if (
    estadoAposCommit1.textObjs.includes(textoEsperado1) &&
    estadoAposCommit1.ferramentaAtiva === 'select'
  ) {
    results.caso1_digitacao_com_acentos_multilinha = true;
    console.log('[PASS] Caso 1: Texto com acentuação e multilinha gravado com sucesso no canvas.');
  } else {
    console.error('[FAIL] Caso 1: Texto esperado não encontrado ou ferramenta não voltou para select.');
  }

  // CASO 2: Clicou e não digitou nada — nenhum elemento novo deve ser criado
  console.log('\n--- CASO 2: Clicou e não digitou nada (descarte de texto vazio) ---');
  const countAntesCaso2 = estadoAposCommit1.totalObjetos;

  await page.click('#tool-text');
  await page.mouse.click(box.x + 400, box.y + 150);
  await new Promise((r) => setTimeout(r, 400));

  const estadoAposClique2 = await page.evaluate(() => {
    const o = window.__whiteboardEngine?.canvas.getActiveObject();
    return {
      temAtivo: !!o,
      editando: !!(o && o.isEditing),
      texto: o ? o.text : null,
      ferramenta: window.__whiteboardEngine?.activeTool,
    };
  });
  console.log('Estado logo apos clicar para Caso 2 (vazio):', JSON.stringify(estadoAposClique2));

  // Clica fora sem digitar NADA
  await page.mouse.click(box.x + 700, box.y + 450);
  await new Promise((r) => setTimeout(r, 700));

  const estadoAposCommit2 = await page.evaluate(() => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const textObjs = objs
      .filter((o) => o.type === 'IText' || o.type === 'i-text' || o.text !== undefined)
      .map((o) => o.text);
    return {
      textObjs,
      totalObjetos: objs.length,
      ferramentaAtiva: window.__whiteboardEngine?.activeTool,
    };
  });
  console.log('Estado apos sair sem digitar Caso 2:', JSON.stringify(estadoAposCommit2));

  if (
    estadoAposCommit2.totalObjetos === countAntesCaso2 &&
    !estadoAposCommit2.textObjs.includes('Texto') &&
    !estadoAposCommit2.textObjs.includes('') &&
    estadoAposCommit2.ferramentaAtiva === 'select'
  ) {
    results.caso2_clicou_e_nao_digitou_nada = true;
    console.log('[PASS] Caso 2: Nenhum elemento novo criado ao sair sem digitar.');
  } else {
    console.error('[FAIL] Caso 2: Elemento fantasma/placeholder foi gravado no canvas.');
  }

  // CASO 3: Digitação finalizada via tecla Escape
  console.log('\n--- CASO 3: Digitação finalizada via Escape ---');
  await page.click('#tool-text');
  await page.mouse.click(box.x + 150, box.y + 300);
  await new Promise((r) => setTimeout(r, 400));

  await page.keyboard.type('Nota de Homologação');
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 700));

  const estadoAposCommit3 = await page.evaluate(() => {
    const objs = window.__whiteboardEngine?.canvas.getObjects() || [];
    const textObjs = objs
      .filter((o) => o.type === 'IText' || o.type === 'i-text' || o.text !== undefined)
      .map((o) => o.text);
    return {
      textObjs,
      totalObjetos: objs.length,
      ferramentaAtiva: window.__whiteboardEngine?.activeTool,
    };
  });
  console.log('Estado apos commit com Escape Caso 3:', JSON.stringify(estadoAposCommit3));

  if (
    estadoAposCommit3.textObjs.includes('Nota de Homologação') &&
    estadoAposCommit3.ferramentaAtiva === 'select'
  ) {
    results.caso3_escape_comita_e_muda_ferramenta = true;
    console.log('[PASS] Caso 3: Tecla Escape comitou o texto e retornou a ferramenta para select.');
  } else {
    console.error('[FAIL] Caso 3: Falha ao comitar via Escape.');
  }

  // EVIDÊNCIA VISUAL: Captura de tela real provando que o texto aparece para o usuário
  const shotPath = path.join(__dirname, 'tela-com-texto-digitado.png');
  await page.screenshot({ path: shotPath });
  const shotExists = fs.existsSync(shotPath) && fs.statSync(shotPath).size > 1000;
  results.captura_tela_salva = shotExists;
  console.log(`\nEvidência visual salva: ${shotPath} (${shotExists ? 'OK' : 'FALHA'})`);

  console.log('\n========================================');
  console.log('RESUMO FINAL DOS TESTES:');
  console.log(JSON.stringify(results, null, 2));
  const allOk = Object.values(results).every(Boolean);
  console.log(allOk ? 'RESULTADO GERAL: PASS' : 'RESULTADO GERAL: FAIL');
  console.log('========================================\n');

  await b.disconnect();
  app.kill();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
  process.exit(allOk ? 0 : 1);
})().catch((e) => {
  console.error('[ERRO FATAL NO TESTE]:', e);
  app.kill();
  process.exit(2);
});
