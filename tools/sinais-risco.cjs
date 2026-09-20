#!/usr/bin/env node
/*
  Sinais de risco nas linhas ADICIONADAS por uma branch (regras fixas, sem IA, sem ler o diff inteiro).
  Uso: node tools/sinais-risco.cjs [--root dir] [--base ref] [--max 15] [--json]
  Falha (exit 1) só para severidade "falha". Aviso pede justificativa: marque a linha com  risco-aceito: ID
  (comentário na própria linha) e o sinal some, ficando visível na revisão.
  Configuração opcional em orquestrador.config.json -> riskSignals { ignore:[ids], failOn:[ids], extra:[{id,regex,flags,severity,msg}],
  exts:[...], excludePaths:[regex...] }.
*/
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const root = path.resolve(arg('--root', process.cwd()));
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'orquestrador.config.json'), 'utf8')); } catch { /* sem config */ }
const rs = cfg.riskSignals || {};
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const refOk = (r) => git(['rev-parse', '--verify', '-q', r]).status === 0;
const baseName = cfg.baseBranch || 'main';
const base = arg('--base', refOk('origin/' + baseName) ? 'origin/' + baseName : baseName);
const max = Number(arg('--max', 15));

const P = (id, severity, regex, msg, o = {}) => ({ id, severity, re: new RegExp(regex, o.flags || ''), msg, skipTests: !!o.skipTests });
const PADROES = [
  P('ELECTRON_INSEGURO', 'falha', 'nodeIntegration\\s*:\\s*true|contextIsolation\\s*:\\s*false|webSecurity\\s*:\\s*false|sandbox\\s*:\\s*false|allowRunningInsecureContent\\s*:\\s*true', 'Configuração insegura do Electron'),
  P('TLS_DESLIGADO', 'falha', 'rejectUnauthorized\\s*:\\s*false|NODE_TLS_REJECT_UNAUTHORIZED|--no-sandbox|--ignore-certificate-errors', 'Validação TLS/sandbox desligada'),
  P('EVAL', 'falha', '(?<![\\w$.])eval\\s*\\(|new\\s+Function\\s*\\(', 'Execução dinâmica de código (não confunde com page.$eval nem obj.eval)'),
  P('SEGREDO_NO_CODIGO', 'falha', '(api[_-]?key|secret|passw(or)?d|token|private[_-]?key)\\s*[:=]\\s*[\'"][A-Za-z0-9+/_\\-]{12,}[\'"]|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----', 'Possível segredo no código', { flags: 'i', skipTests: true }),
  P('SEGREDO_COMPARADO', 'aviso', '\\b(token|secret|passw(or)?d|hmac|signature|api_?key|mac)\\w*\\s*(===|!==|==|!=)\\s*(?!null\\b|undefined\\b|\'\'|""|typeof\\b)[\\w.\'"\\[]', 'Segredo comparado sem tempo constante (use timingSafeEqual)', { flags: 'i', skipTests: true }),
  P('ALEATORIO_FRACO', 'aviso', 'Math\\.random\\(\\)', 'Math.random não é seguro para token/id/chave', { skipTests: true }),
  P('HTML_INSEGURO', 'aviso', 'innerHTML\\s*=|dangerouslySetInnerHTML|document\\.write\\(|insertAdjacentHTML', 'HTML montado sem escape (XSS)'),
  P('EXEC_SHELL', 'aviso', '\\b(exec|execSync)\\s*\\(\\s*[`\'"].*(\\$\\{|\\+)|shell\\s*:\\s*true', 'Comando de shell com entrada interpolada'),
  P('SQL_CONCATENADO', 'aviso', '[\'"`]\\s*(SELECT|INSERT|UPDATE|DELETE)\\b[^\'"`]*[\'"`]\\s*\\+|`[^`]*\\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\\b[^`]*\\$\\{', 'SQL montado por concatenação/interpolação', { flags: 'i' }),
  P('BIND_TODAS_INTERFACES', 'aviso', '[\'"]0\\.0\\.0\\.0[\'"]|host\\s*:\\s*[\'"]::[\'"]', 'Servidor exposto em todas as interfaces'),
  P('LOG_DE_SEGREDO', 'aviso', 'console\\.\\w+\\(.*\\b(token|secret|passw(or)?d|privateKey|secretKey)\\b', 'Log pode vazar segredo', { flags: 'i', skipTests: true }),
  P('PATH_SEM_SANEAR', 'aviso', 'path\\.(join|resolve)\\([^)]*(req\\.|params\\.|query\\.|body\\.)', 'Caminho de arquivo a partir de entrada externa (path traversal)'),
  P('CATCH_VAZIO', 'aviso', 'catch\\s*(\\([^)]*\\))?\\s*\\{\\s*\\}', 'Erro engolido sem tratamento'),
  P('TIPO_SUPRIMIDO', 'aviso', '@ts-ignore|@ts-nocheck|\\bas any\\b', 'Checagem de tipo suprimida'),
  P('PENDENCIA', 'aviso', '\\b(TODO|FIXME|HACK|XXX)\\b', 'Pendência deixada no código'),
];
for (const e of rs.extra || []) PADROES.push(P(e.id, e.severity || 'aviso', e.regex, e.msg || e.id, { flags: e.flags }));
const ignorar = new Set(rs.ignore || []); const forcaFalha = new Set(rs.failOn || []);
const exts = new Set(rs.exts || ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'cs', 'go', 'rb', 'php', 'rs', 'kt', 'dart', 'swift']);
const excluir = [/(^|\/)(node_modules|dist|build|out|coverage|vendor|\.git)\//, /^docs\//, /^tools\/(sinais-risco|auditar|verificar-afirmacoes)\.cjs$/, ...(rs.excludePaths || []).map((r) => new RegExp(r))];
const ehTeste = (f) => /(^|\/)(tests?|__tests__|spec|e2e)\//.test(f) || /\.(test|spec)\./.test(f);

let diff = git(['diff', '-U0', '--no-color', `${base}...HEAD`]);
if (diff.status !== 0) diff = git(['diff', '-U0', '--no-color', `${base}..HEAD`]);
if (diff.status !== 0) { console.error(`sinais-risco: não consegui obter o diff contra "${base}": ${diff.stderr.trim()}`); process.exit(2); }

const achados = []; let arquivo = null, ln = 0, ativo = false;
for (const l of diff.stdout.split('\n')) {
  if (l.startsWith('+++ ')) { const f = l.slice(4).replace(/^b\//, ''); arquivo = f === '/dev/null' ? null : f; ativo = !!arquivo && exts.has(path.extname(arquivo).slice(1)) && !excluir.some((r) => r.test(arquivo)); continue; }
  const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (h) { ln = Number(h[1]); continue; }
  if (!ativo || !l.startsWith('+') || l.startsWith('+++')) continue;
  const texto = l.slice(1);
  const marca = texto.match(/risco-aceito:\s*([A-Z_]+)/);
  for (const p of PADROES) {
    if (ignorar.has(p.id) || (p.skipTests && ehTeste(arquivo)) || (marca && marca[1] === p.id)) continue;
    if (p.re.test(texto)) achados.push({ id: p.id, sev: forcaFalha.has(p.id) ? 'falha' : p.severity, msg: p.msg, file: arquivo, line: ln, text: texto.trim().slice(0, 110) });
  }
  ln++;
}
const nFalha = achados.filter((a) => a.sev === 'falha').length, nAviso = achados.length - nFalha;
if (process.argv.includes('--json')) { console.log(JSON.stringify({ base, fail: nFalha, warn: nAviso, items: achados })); process.exit(nFalha ? 1 : 0); }
console.log(`SINAIS DE RISCO (linhas adicionadas vs ${base}): ${nFalha} falha(s), ${nAviso} aviso(s)`);
const porId = {}; for (const a of achados) (porId[a.id] = porId[a.id] || []).push(a);
let linhas = 0;
for (const [id, lst] of Object.entries(porId).sort((a, b) => (a[1][0].sev === 'falha' ? 0 : 1) - (b[1][0].sev === 'falha' ? 0 : 1))) {
  console.log(` ${lst[0].sev.toUpperCase()} ${id} x${lst.length} — ${lst[0].msg}`);
  for (const a of lst.slice(0, 3)) { if (linhas++ >= max) break; console.log(`    ${a.file}:${a.line}  ${a.text}`); }
}
if (achados.length) console.log(' (justifique um aviso com o comentário "risco-aceito: ID" na própria linha)');
process.exit(nFalha ? 1 : 0);
