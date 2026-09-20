/*
  Sonda de runtime: abre o app Electron BUILDADO (dist/) e verifica a segurança de verdade.
  Uso: npm run build && node tools/probe-runtime.cjs [--shot caminho.png]
  Sai com código 1 se qualquer verificação falhar. Não depende de nada além do repo.
*/
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const puppeteer = require('puppeteer');
const shotIdx = process.argv.indexOf('--shot');
const shot = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const PORT = 9400 + Math.floor(Math.random() * 500);

const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE; // o VS Code define isso e faria o Electron rodar como Node puro
const exe = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const app = spawn(exe, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, env, stdio: 'pipe' });
let log = '';
app.stdout.on('data', (d) => (log += d));
app.stderr.on('data', (d) => (log += d));

async function main() {
  await new Promise((r) => setTimeout(r, 4000));
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = (await browser.pages())[0];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate(async () => {
    const violacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => violacoes.push(e.violatedDirective));
    window.__inline = 0;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.head.appendChild(s);
    await new Promise((res) => setTimeout(res, 300));
    let evalBloqueado = false;
    try { new Function('return 1')(); } catch { evalBloqueado = true; }
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
  if (shot) await page.screenshot({ path: shot });
  await browser.disconnect();
  return { r, pageErrors };
}

main()
  .then(({ r, pageErrors }) => {
    const checks = {
      'typeof require === undefined': r.typeofRequire === 'undefined',
      'typeof process === undefined': r.typeofProcess === 'undefined',
      'UI renderizou (#root com filhos)': r.renderizou,
      'CSP: script inline NAO executa': !r.inlineExecutou,
      'CSP: eval bloqueado': r.evalBloqueado,
      'sem erro de pagina': pageErrors.length === 0,
    };
    console.log(JSON.stringify({ ...r, pageErrors }, null, 2));
    let ok = true;
    for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); ok = ok && v; }
    app.kill();
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => { console.error('ERRO na sonda:', e, '\n--- log do app ---\n' + log); app.kill(); process.exit(1); });
