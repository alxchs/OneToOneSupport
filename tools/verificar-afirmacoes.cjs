#!/usr/bin/env node
/*
  Verificador de afirmações: confere se o que HANDOFF/autoauditoria AFIRMAM existe no código.
  Pega invenção de identificadores, arquivos, scripts npm e branches. NÃO valida prosa (ex.: "usa áudio Opus").
  Uso: node tools/verificar-afirmacoes.cjs [--root dir] [--branch fase/01-x] [--files a.md,b.md] [--json]
  O que é verificado (só o que aparece entre crases ou como nome de branch, fora de blocos ``` ):
    - caminhos de arquivo (com / ou \ e extensão, ou nome de arquivo com extensão de código): têm que existir;
    - identificadores CONSTANTE_COM_UNDERSCORE (nomes de eventos, códigos de erro, chaves): têm que aparecer no código;
    - "npm run X": X precisa existir em package.json;
    - nomes de branch <prefixo>/NN-slug: precisam existir (local/remota) ou ser derivados de uma ordem em docs/prompts.
  Config em orquestrador.config.json -> claims { ignore:[nomes], codeDirs:[dirs], warnOnly:false }.
*/
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const root = path.resolve(arg('--root', process.cwd()));
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'orquestrador.config.json'), 'utf8')); } catch { /* sem config */ }
const cl = cfg.claims || {};
const prefixo = cfg.branchPrefix || 'fase';
const branch = arg('--branch', '');
const nn = (branch.match(new RegExp(prefixo + '/(\\d+)')) || [])[1];
const IGN = new Set(['NODE_ENV', 'NODE_OPTIONS', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'PATH', 'ELECTRON_RUN_AS_NODE', 'CI', ...(cl.ignore || [])]);

// ---- corpus do código (uma leitura só)
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', 'docs', 'release', 'vendor', '.next', 'target', '__pycache__']);
const EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'cs', 'go', 'rb', 'php', 'rs', 'kt', 'dart', 'swift', 'sql', 'css', 'scss', 'html', 'json', 'yml', 'yaml', 'ps1', 'cmd', 'sh', 'toml', 'xml', 'gradle', 'c', 'cpp', 'h']);
const nomes = new Set(); const arquivos = new Set(); let corpus = '';
(function walk(d, rel) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) || (e.name === 'docs' && false)) walk(path.join(d, e.name), r); continue; }
    arquivos.add(r); nomes.add(e.name);
  }
})(root, '');
// docs/ e afins entram só na checagem de existência de arquivos
(function walkDocs(d, rel) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) { const r = rel + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules') walkDocs(path.join(d, e.name), r); } else { arquivos.add(r); nomes.add(e.name); } }
})(path.join(root, 'docs'), 'docs');
for (const f of arquivos) {
  if (f.startsWith('docs/') || !EXT.has(path.extname(f).slice(1))) continue;
  try { const s = fs.statSync(path.join(root, f)); if (s.size < 1.5e6 && f !== 'package-lock.json') corpus += '\n' + fs.readFileSync(path.join(root, f), 'utf8'); } catch { /* ignora */ }
}
let scripts = null; try { scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {}; } catch { /* sem package.json */ }
const g = spawnSync('git', ['branch', '-a', '--format=%(refname:short)'], { cwd: root, encoding: 'utf8' });
const branches = new Set((g.stdout || '').split('\n').map((s) => s.trim().replace(/^origin\//, '')).filter(Boolean));
const pdir = path.join(root, cfg.promptsDir || 'docs/prompts');
try { for (const f of fs.readdirSync(pdir)) { const m = f.match(/^(?:fase|phase|etapa)-(\d+)-(.+)\.md$/i); if (m) branches.add(`${prefixo}/${m[1]}-${m[2]}`); } } catch { /* sem prompts */ }

// ---- arquivos a verificar
let files = arg('--files', '') ? arg('--files', '').split(',') : [cfg.handoff || 'docs/HANDOFF.md'];
if (!arg('--files', '') && nn) files.push((cfg.selfAudit || 'docs/reviews/autoauditoria-{NN}.md').replace('{NN}', nn));
files = files.filter((f) => fs.existsSync(path.join(root, f)));
const faltando = []; const vistos = new Set();
const falta = (tipo, token, arquivo, linha) => { const k = tipo + '|' + token; if (vistos.has(k)) return; vistos.add(k); faltando.push({ tipo, token, arquivo, linha }); };
const BUILTIN_NPM = new Set(['test', 'start', 'ci', 'install', 'i', 'audit', 'fund', 'init', 'publish', 'pack', 'ls', 'outdated', 'update', 'exec', 'config']);
let total = 0;
for (const f of files) {
  const bruto = fs.readFileSync(path.join(root, f), 'utf8').replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ''));
  bruto.split('\n').forEach((linha, i) => {
    for (const bm of linha.matchAll(new RegExp('\\b' + prefixo + '/\\d+-[a-z0-9][a-z0-9-]*', 'g'))) { total++; if (!branches.has(bm[0])) falta('branch', bm[0], f, i + 1); }
    for (const m of linha.matchAll(/`([^`\n]+)`/g)) {
      const t = m[1].trim();
      const npm = t.match(/^npm (?:run )?([\w:.-]+)/);
      if (npm) { total++; if (scripts && !BUILTIN_NPM.has(npm[1]) && !(npm[1] in scripts)) falta('script npm', t, f, i + 1); continue; }
      if (/\s/.test(t) || /^https?:/.test(t) || /^[A-Za-z]:[\\/]/.test(t) || /[*<>{}$|]|\b(NN|XX)\b|\.\.\./.test(t)) continue;
      const caminho = t.replace(/\\/g, '/').replace(/^\.\//, '').replace(/[),.;:]+$/, '');
      if (/^(dist|build|out|coverage|release|node_modules|target|\.next)\//.test(caminho)) continue;   // saída de build: não fica no repositório
      if (/\/.*\.[A-Za-z0-9]+$/.test(caminho)) { total++; if (!arquivos.has(caminho)) falta('arquivo', t, f, i + 1); continue; }
      if (/^[\w.-]+\.(js|jsx|ts|tsx|mjs|cjs|py|java|cs|go|rb|php|rs|kt|dart|sql|css|html|json|ps1|sh|md|yml|yaml)$/.test(caminho) && !caminho.includes('/')) { total++; if (!nomes.has(caminho)) falta('arquivo', t, f, i + 1); continue; }
      if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(t) && !IGN.has(t)) { total++; if (!corpus.includes(t)) falta('identificador', t, f, i + 1); }
    }
  });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify({ verificados: total, missing: faltando })); process.exit(faltando.length && !cl.warnOnly ? 1 : 0); }
console.log(`AFIRMAÇÕES vs CÓDIGO: ${total} verificadas em ${files.join(', ') || '(nenhum arquivo)'}; ${faltando.length} NÃO ENCONTRADA(S)`);
for (const x of faltando) console.log(`  ${x.tipo}: ${x.token}  (${x.arquivo}:${x.linha})`);
if (faltando.length) console.log('  -> a documentação afirma algo que o código não tem. Corrija a documentação ou implemente de verdade.');
console.log('  (limite: só confere nomes; afirmações em prosa continuam exigindo leitura humana)');
process.exit(faltando.length && !cl.warnOnly ? 1 : 0);
