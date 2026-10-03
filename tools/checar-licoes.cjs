#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let rootDir = process.cwd();
let isJson = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && i + 1 < args.length) {
    rootDir = args[i + 1];
    i++;
  } else if (args[i] === '--json') {
    isJson = true;
  }
}

const licoesPath = path.join(rootDir, 'docs', 'LICOES.md');
if (!fs.existsSync(licoesPath)) {
  if (isJson) console.log(JSON.stringify({ findings: [] }));
  process.exit(0);
}

const content = fs.readFileSync(licoesPath, 'utf8');
const lines = content.split('\n');

const findings = [];
let currentLesson = null;
let lessonLines = [];
let nextExpectedNumber = 1;

// We need to parse lessons.
// A lesson starts with `## L-NN — <título>`

const parseLesson = (lines, startNum) => {
  let origem = null;
  let oQueAconteceu = null;
  let porQuePassou = null;
  let regra = null;
  let comoAtacar = null;
  let checagem = null;

  for (const line of lines) {
    if (line.startsWith('- Origem:')) origem = line.substring('- Origem:'.length).trim();
    else if (line.startsWith('- O que aconteceu:')) oQueAconteceu = line.substring('- O que aconteceu:'.length).trim();
    else if (line.startsWith('- Por que passou:')) porQuePassou = line.substring('- Por que passou:'.length).trim();
    else if (line.startsWith('- Regra:')) regra = line.substring('- Regra:'.length).trim();
    else if (line.startsWith('- Como atacar:')) comoAtacar = line.substring('- Como atacar:'.length).trim();
    else if (line.startsWith('- Checagem por máquina:')) checagem = line.substring('- Checagem por máquina:'.length).trim();
  }

  const missing = [];
  if (origem === null) missing.push('Origem');
  if (oQueAconteceu === null) missing.push('O que aconteceu');
  if (porQuePassou === null) missing.push('Por que passou');
  if (regra === null) missing.push('Regra');
  if (comoAtacar === null) missing.push('Como atacar');
  if (checagem === null) missing.push('Checagem por máquina');

  if (missing.length > 0) {
    findings.push({ id: startNum, issue: `Campos ausentes: ${missing.join(', ')}` });
  }

  // Check origem for backticks containing file paths
  if (origem !== null) {
    const backticks = origem.match(/`([^`]+)`/g) || [];
    for (const b of backticks) {
      const p = b.slice(1, -1);
      if (p.includes('/') || p.includes('.')) { // seems like a path
        if (!fs.existsSync(path.join(rootDir, p))) {
          findings.push({ id: startNum, issue: `Arquivo em Origem não existe: ${p}` });
        }
      }
    }
  }

  // Check checagem
  if (checagem !== null && checagem.startsWith('sim')) {
    const auditarPath = path.join(rootDir, 'tools', 'auditar.cjs');
    let auditarContent = '';
    if (fs.existsSync(auditarPath)) {
      auditarContent = fs.readFileSync(auditarPath, 'utf8');
    }

    const backticks = checagem.match(/`([^`]+)`/g) || [];
    let foundValidTool = false;
    for (const b of backticks) {
      const p = b.slice(1, -1);
      if (p.startsWith('tools/')) {
        if (fs.existsSync(path.join(rootDir, p))) {
          const toolName = path.basename(p);
          if (auditarContent.includes(toolName)) {
            foundValidTool = true;
            break;
          }
        }
      }
    }
    
    if (!foundValidTool) {
      findings.push({ id: startNum, issue: `Checagem 'sim' não cita ferramenta válida em tools/ que conste no auditar.cjs: ${checagem}` });
    }
  }
};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(/^## L-(\d+) — (.+)$/);
  
  if (line.startsWith('## L-')) {
    if (currentLesson) {
      parseLesson(lessonLines, currentLesson);
    }
    
    if (!match) {
      findings.push({ id: 'N/A', issue: `Título fora do formato: ${line}` });
      currentLesson = null;
    } else {
      const num = parseInt(match[1], 10);
      if (num !== nextExpectedNumber) {
         findings.push({ id: `L-${match[1]}`, issue: `Número fora de sequência ou repetido: esperado ${nextExpectedNumber}, veio ${num}` });
      }
      nextExpectedNumber = num + 1;
      currentLesson = `L-${match[1]}`;
      lessonLines = [];
    }
  } else if (line.trim().startsWith('#') && line.includes('L-') && !line.startsWith('## L-')) {
     findings.push({ id: 'N/A', issue: `Título fora do formato: ${line}` });
  } else if (currentLesson) {
    lessonLines.push(line);
  }
}

if (currentLesson) {
  parseLesson(lessonLines, currentLesson);
}

if (isJson) {
  console.log(JSON.stringify({ findings }));
} else {
  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`[${f.id}] ${f.issue}`);
    }
  } else {
    console.log("Checagem LICOES.md: OK");
  }
}

process.exit(findings.length > 0 ? 1 : 0);
