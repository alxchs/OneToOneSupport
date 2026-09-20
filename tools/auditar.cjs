/*
  Auditor automático (QA desconfiado). Clona a branch em pasta temporária, roda tudo do zero e imprime um RESUMO CURTO.
  Uso: node tools/auditar.cjs [branch]      (padrão: branch atual)
  Existe para o chefe ler ~30 linhas em vez de dezenas de milhares de tokens de log. Exit 1 se algo reprovar.
*/
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
const env = { ...process.env };
delete env.NODE_ENV; // NODE_ENV=production faria o npm ci pular as devDependencies
delete env.ELECTRON_RUN_AS_NODE;
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', env, maxBuffer: 1 << 28 });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '') };
};
const branch = process.argv[2] || run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root).out.trim();
const nn = (branch.match(/fase\/(\d+)/) || [])[1];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'o2o-audit-'));
const rows = [];
const add = (nome, ok, det = '') => rows.push({ nome, ok, det });

const cl = run('git', ['clone', '-q', '--branch', branch, root, tmp], root);
add('clone limpo da branch', cl.code === 0, cl.code ? cl.out.slice(0, 200) : branch);
if (cl.code === 0) {
  const ci = run('npm', ['ci'], tmp);
  add('npm ci', ci.code === 0, (ci.out.match(/(\d+) vulnerabilities[^\n]*/) || [''])[0]);
  const v = run('npm', ['run', 'verify'], tmp);
  const tests = v.out.match(/Tests\s+(?:\d+ failed \| )?(\d+) passed/);
  const failed = v.out.match(/(\d+) failed/);
  add('npm run verify (typecheck+testes+build+sonda)', v.code === 0,
    `${tests ? tests[1] + ' testes ok' : 'sem contagem de testes'}${failed ? ', ' + failed[0] : ''}`);
  const probe = [...v.out.matchAll(/^(PASS|FAIL)\s+(.+)$/gm)];
  const pf = probe.filter((m) => m[1] === 'FAIL');
  add('sonda de runtime', probe.length > 0 && pf.length === 0, `${probe.length - pf.length}/${probe.length} checagens` + (pf.length ? ' FALHOU: ' + pf.map((m) => m[2]).join('; ') : ''));

  const unused = run('npx', ['tsc', '--noEmit', '--noUnusedLocals', '--noUnusedParameters'], tmp);
  const nUnused = (unused.out.match(/error TS\d+/g) || []).length;
  add('sem variavel/parametro nao usado (classe de bug da fase 01)', nUnused === 0, nUnused ? `${nUnused} ocorrencias: ` + unused.out.split('\n').filter((l) => /error TS/.test(l)).slice(0, 3).join(' | ') : '');

  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  const srcFiles = walk(path.join(tmp, 'src')).filter((f) => /\.(ts|tsx|css|html)$/.test(f));
  const grep = (re, files = srcFiles) => files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => (re.test(l) ? `${path.relative(tmp, f)}:${i + 1}` : null)).filter(Boolean));
  const imp = grep(/from ['"](fs|path|better-sqlite3|electron)['"]|require\(['"](fs|electron|better-sqlite3)['"]\)/);
  add('Renderer sem fs/electron/better-sqlite3', imp.length === 0, imp.slice(0, 3).join(', '));
  const sql = grep(/\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i);
  add('Renderer sem SQL (regra de negocio no Main)', sql.length === 0, sql.slice(0, 3).join(', '));
  const red = grep(/#(f00|ff0000|dc2626|ef4444|b91c1c|e11d48|991b1b|fca5a5|f87171)\b|\bred\b|rgb\(\s*2[0-5]\d\s*,\s*[0-5]?\d\s*,\s*[0-5]?\d\s*\)/i);
  add('sem vermelho na UI (regra do Alexandre)', red.length === 0, red.slice(0, 3).join(', '));

  if (nn) {
    const auto = path.join(tmp, 'docs', 'reviews', `autoauditoria-${nn}.md`);
    add(`autoauditoria-${nn}.md existe`, fs.existsSync(auto));
    if (fs.existsSync(auto)) {
      const t = fs.readFileSync(auto, 'utf8');
      const nP = (t.match(/\bPASS\b/g) || []).length, nF = (t.match(/\bFAIL\b/g) || []).length;
      add('autoauditoria lista o que NAO foi verificado', /n[aã]o (foi )?verificad/i.test(t));
      add('autoauditoria sem FAIL aberto', nF === 0, `${nP} PASS / ${nF} FAIL`);
    }
    const h = fs.readFileSync(path.join(tmp, 'docs', 'HANDOFF.md'), 'utf8');
    add('HANDOFF atualizado para esta fase', new RegExp(`fase\\s*0?${Number(nn)}`, 'i').test(h));
  }
  const diff = run('git', ['diff', '--shortstat', 'origin/main...HEAD'], tmp).out.trim();
  const commits = run('git', ['rev-list', '--count', 'origin/main..HEAD'], tmp).out.trim();
  add('commits novos desde main', Number(commits) > 0, `${commits} commits; ${diff}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nAUDITORIA AUTOMATICA — ${branch}`);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.nome}${r.det ? '  -> ' + r.det : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(`\n${bad === 0 ? 'TUDO VERDE' : bad + ' REPROVACAO(OES)'} — este relatorio NAO substitui a abertura da tela e a leitura de amostra do diff.`);
process.exit(bad ? 1 : 0);
