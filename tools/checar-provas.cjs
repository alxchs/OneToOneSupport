#!/usr/bin/env node
/*
  Checador de "prova trocada" (nasce de um padrão real e repetido: o executor promete provar uma coisa forte
  — ex.: "amostragem de pixel mostrando que só o trecho tocado some" — e entrega uma prova mais fraca — ex.:
  "a propriedade do objeto está configurada certo" — marcando PASS como se tivesse cumprido o pedido original.
  Isso passou pelo auditor automático e pelo chefe mais de uma vez antes de ser pego na leitura manual.

  O que faz: para cada item (H1, C3, RT4, D1...) citado num Issues<pasta>ordem-correcao.md que promete prova VISUAL
  (pixel, amostragem, captura de tela), procura esse mesmo item nas autoauditorias (docs/reviews/autoauditoria*.md)
  e no HANDOFF, e exige que a evidência colada perto dele contenha alguma palavra de prova de pixel de verdade.
  Sem isso, REPROVA — mesmo que a linha da autoauditoria diga PASS. Não tenta validar categorias mais vagas
  (ex.: "bloqueia"/"nunca") para não virar ruído; só a categoria visual, que é inequívoca.

  Uso: node tools/checar-provas.cjs --root <dir> [--json]
  Saída: exit 0 sem achado; exit 1 com pelo menos um item prometido-e-não-provado.
*/
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : process.cwd();
const asJson = args.includes('--json');

const VISUAL_CLAIM = /\b(pixel|pixels|amostragem|captura de tela|screenshot)\b/i;
const VISUAL_EVIDENCE = /\b(pixel|pixels|getimagedata|nonwhite|non-white|screenshot|captura de tela)\b/i;
const ID_HEADING = /^#{1,3}\s*([A-Z]{1,3}\d{1,3}(?:\.\d+)?)\b/;

function listFiles(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f));
}

// 1. Extrai, de cada ordem de serviço em Issues<pasta>ordem-correcao.md, os itens (por cabeçalho ## ID — ...)
//    cujo texto promete prova visual.
const issuesDir = path.join(root, 'Issues');
const promessas = []; // { id, origem, trecho }
if (fs.existsSync(issuesDir)) {
  for (const sub of fs.readdirSync(issuesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const ordemPath = path.join(issuesDir, sub.name, 'ordem-correcao.md');
    if (!fs.existsSync(ordemPath)) continue;
    const linhas = fs.readFileSync(ordemPath, 'utf8').split('\n');
    let idAtual = null, bufer = [];
    const flush = () => {
      if (idAtual && VISUAL_CLAIM.test(bufer.join(' '))) {
        promessas.push({ id: idAtual, origem: path.relative(root, ordemPath), trecho: bufer.join(' ').slice(0, 200) });
      }
      bufer = [];
    };
    for (const l of linhas) {
      const m = l.match(ID_HEADING);
      if (m) { flush(); idAtual = m[1]; }
      else bufer.push(l);
    }
    flush();
  }
}

// 2. Para cada promessa, procura o mesmo ID nas autoauditorias e no HANDOFF; exige evidência de pixel perto.
const reviewsDir = path.join(root, 'docs', 'reviews');
const docsFiles = [
  ...listFiles(reviewsDir, /^autoauditoria.*\.md$/i),
  path.join(root, 'docs', 'HANDOFF.md'),
].filter((f) => fs.existsSync(f));
const corpo = docsFiles.map((f) => ({ arquivo: path.relative(root, f), texto: fs.readFileSync(f, 'utf8') }));

const findings = [];
for (const p of promessas) {
  const idRe = new RegExp(`\\b${p.id.replace('.', '\\.')}\\b`, 'g');
  let melhorTrecho = null, achouId = false;
  for (const doc of corpo) {
    let m;
    while ((m = idRe.exec(doc.texto))) {
      achouId = true;
      const ini = Math.max(0, m.index - 250), fim = Math.min(doc.texto.length, m.index + 250);
      const janela = doc.texto.slice(ini, fim);
      if (VISUAL_EVIDENCE.test(janela)) { melhorTrecho = null; achouId = 'provado'; break; }
      if (!melhorTrecho) melhorTrecho = { arquivo: doc.arquivo, janela: janela.replace(/\s+/g, ' ').trim().slice(0, 200) };
    }
    if (achouId === 'provado') break;
  }
  if (achouId !== 'provado') {
    findings.push({
      id: p.id,
      origemPromessa: p.origem,
      promessa: p.trecho.replace(/\s+/g, ' ').trim(),
      status: achouId ? 'item citado na autoauditoria, mas sem evidência de pixel perto' : 'item nunca citado em nenhuma autoauditoria/HANDOFF',
      evidenciaEncontrada: melhorTrecho,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ findings }));
} else {
  console.log(`CHECAR-PROVAS — ${findings.length} promessa(s) de prova visual sem evidência de pixel`);
  for (const f of findings) {
    console.log(`  [${f.id}] ${f.status} (prometido em ${f.origemPromessa})`);
    console.log(`    promessa: ${f.promessa}`);
    if (f.evidenciaEncontrada) console.log(`    trecho mais próximo achado em ${f.evidenciaEncontrada.arquivo}: "${f.evidenciaEncontrada.janela}"`);
  }
}
process.exit(findings.length ? 1 : 0);
