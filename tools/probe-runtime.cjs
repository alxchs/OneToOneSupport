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
    },
    bancoSemDuplicados: dbCheck.semDuplicados && bancoDirectCheck,
    totalAtendidos: dbCheck.total,
    pageErrors,
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
