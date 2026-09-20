#!/usr/bin/env node
/*
  Auditor automático (QA desconfiado), configurável por projeto. Clona a branch em pasta temporária, roda tudo do zero
  e imprime um RESUMO CURTO. Uso: node tools/auditar.cjs [branch]   (padrão: branch atual). Exit 1 se algo reprovar.
  Configuração: orquestrador.config.json (veja o README do kit). Sem config, usa padrões de projeto Node.
*/
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'orquestrador.config.json'), 'utf8')); } catch { /* sem config */ }
const C = {
  baseBranch: 'main', installCmd: 'npm ci', verifyCmd: 'npm run verify', unusedCmd: null,
  testCountRegex: 'Tests\\s+(?:\\d+ failed \\| )?(\\d+) passed', probeRegex: '^(PASS|FAIL)\\s+(.+)$', requireProbe: false,
  layerRules: [], handoff: 'docs/HANDOFF.md', selfAudit: 'docs/reviews/autoauditoria-{NN}.md', requireSelfAudit: true,
  branchPrefix: 'fase', ...cfg,
};
const env = { ...process.env }; delete env.NODE_ENV; delete env.ELECTRON_RUN_AS_NODE; // NODE_ENV=production faria o npm ci pular devDependencies
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true, env, maxBuffer: 1 << 28 });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '') };
};
const branch = process.argv.slice(2).find((a) => !a.startsWith('--')) || run('git rev-parse --abbrev-ref HEAD', root).out.trim();
const nn = (branch.match(new RegExp(C.branchPrefix + '/(\\d+)')) || [])[1];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
const rows = []; const add = (nome, ok, det = '') => rows.push({ nome, ok, det });
const q = (p) => `"${p}"`;

const cl = run(`git clone -q --branch ${q(branch)} ${q(root)} ${q(tmp)}`, root);
add('clone limpo da branch', cl.code === 0, cl.code ? cl.out.slice(0, 200) : branch);
if (cl.code === 0) {
  const ci = run(C.installCmd, tmp);
  add(`instalação (${C.installCmd})`, ci.code === 0, (ci.out.match(/(\d+) vulnerabilities[^\n]*/) || [''])[0]);
  const v = run(C.verifyCmd, tmp);
  const t = v.out.match(new RegExp(C.testCountRegex)), f = v.out.match(/(\d+) failed/);
  add(`verificação (${C.verifyCmd})`, v.code === 0, `${t ? t[1] + ' testes ok' : 'sem contagem de testes'}${f ? ', ' + f[0] : ''}`);
  const probe = [...v.out.matchAll(new RegExp(C.probeRegex, 'gm'))], pf = probe.filter((m) => m[1] === 'FAIL');
  if (probe.length || C.requireProbe) add('sonda de runtime', probe.length > 0 && pf.length === 0, `${probe.length - pf.length}/${probe.length} checagens` + (pf.length ? ' FALHOU: ' + pf.map((m) => m[2]).join('; ') : ''));
  if (C.unusedCmd) {
    const u = run(C.unusedCmd, tmp), n = (u.out.match(/error TS\d+|error:/g) || []).length;
    add('sem variável/parâmetro não usado', u.code === 0 && n === 0, n ? `${n} ocorrência(s): ` + u.out.split('\n').filter((l) => /error/.test(l)).slice(0, 3).join(' | ') : '');
  }
  // regras de camada/paleta definidas pelo projeto
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)])) : []);
  for (const r of C.layerRules) {
    const re = new RegExp(r.regex, r.flags || ''), exts = new Set(r.exts || ['ts', 'tsx', 'js', 'jsx', 'css', 'html']);
    const hits = (r.dirs || ['src']).flatMap((d) => walk(path.join(tmp, d))).filter((p) => exts.has(path.extname(p).slice(1)))
      .flatMap((p) => fs.readFileSync(p, 'utf8').split('\n').map((l, i) => (re.test(l) ? `${path.relative(tmp, p).replace(/\\/g, '/')}:${i + 1}` : null)).filter(Boolean));
    add(r.nome, hits.length === 0, hits.slice(0, 3).join(', '));
  }
  // sinais de risco e afirmações (rodam a partir DESTA pasta de ferramentas, sobre o clone)
  const sr = run(`node ${q(path.join(__dirname, 'sinais-risco.cjs'))} --root ${q(tmp)} --json`, tmp);
  try {
    const j = JSON.parse(sr.out.trim().split('\n').pop());
    const ex = j.items.filter((i) => i.sev === 'falha').concat(j.items.filter((i) => i.sev !== 'falha')).slice(0, 4).map((i) => `${i.id} ${i.file}:${i.line}`).join('; ');
    add('sinais de risco (linhas novas)', j.fail === 0, `${j.fail} falha(s), ${j.warn} aviso(s)${ex ? ' -> ' + ex : ''}`);
  } catch { add('sinais de risco (linhas novas)', false, 'não executou: ' + sr.out.slice(0, 160)); }
  if (nn) {
    const auto = path.join(tmp, C.selfAudit.replace('{NN}', nn));
    if (C.requireSelfAudit) add(`autoauditoria-${nn} existe`, fs.existsSync(auto));
    if (fs.existsSync(auto)) {
      const s = fs.readFileSync(auto, 'utf8'), nP = (s.match(/\bPASS\b/g) || []).length, nF = (s.match(/\bFAIL\b/g) || []).length;
      add('autoauditoria lista o que NÃO foi verificado', /n[aã]o (foi )?verificad/i.test(s));
      add('autoauditoria sem FAIL aberto', nF === 0, `${nP} PASS / ${nF} FAIL`);
    }
    const hp = path.join(tmp, C.handoff);
    add('HANDOFF atualizado para esta fase', fs.existsSync(hp) && new RegExp(`(fase|phase|etapa)\\s*0?${Number(nn)}\\b`, 'i').test(fs.readFileSync(hp, 'utf8')));
  }
  const vc = run(`node ${q(path.join(__dirname, 'verificar-afirmacoes.cjs'))} --root ${q(tmp)} --branch ${q(branch)} --json`, tmp);
  try {
    const j = JSON.parse(vc.out.trim().split('\n').pop());
    add('afirmações da documentação existem no código', j.missing.length === 0 || vc.code === 0, `${j.verificados} verificadas` + (j.missing.length ? `; ${j.missing.length} inexistente(s): ` + j.missing.slice(0, 4).map((m) => `${m.tipo} ${m.token}`).join('; ') : ''));
  } catch { add('afirmações da documentação existem no código', false, 'não executou: ' + vc.out.slice(0, 160)); }
  const commits = run(`git rev-list --count origin/${C.baseBranch}..HEAD`, tmp).out.trim();
  const diff = run(`git diff --shortstat origin/${C.baseBranch}...HEAD`, tmp).out.trim();
  add('commits novos desde a base', Number(commits) > 0, `${commits} commits; ${diff}`);
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows pode manter lock; a pasta é temporária */ }
console.log(`\nAUDITORIA AUTOMATICA — ${branch}`);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.nome}${r.det ? '  -> ' + r.det : ''}`);
const bad = rows.filter((r) => !r.ok).length;
console.log(`\n${bad === 0 ? 'TUDO VERDE' : bad + ' REPROVACAO(OES)'} — este relatorio NAO substitui a abertura da tela, a leitura de amostra do diff e a decisão do chefe.`);
process.exit(bad ? 1 : 0);
