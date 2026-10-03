import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checar-licoes-test-'));
const docsDir = path.join(tmpDir, 'docs');
const toolsDir = path.join(tmpDir, 'tools');
const licoesPath = path.join(docsDir, 'LICOES.md');

beforeAll(() => {
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(toolsDir, { recursive: true });
  // Create a fake auditar.cjs
  fs.writeFileSync(path.join(toolsDir, 'auditar.cjs'), 'require("./fake-tool.cjs");', 'utf8');
  fs.writeFileSync(path.join(toolsDir, 'fake-tool.cjs'), 'console.log("ok");', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'fake-file.md'), 'test', 'utf8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const runChecarLicoes = () => {
  try {
    const out = execSync(`node ${path.resolve(__dirname, '../tools/checar-licoes.cjs')} --root ${tmpDir} --json`, { encoding: 'utf8', cwd: tmpDir });
    return JSON.parse((out as string).trim().split('\n').pop() || '{}');
  } catch (err: any) {
    const out = (err.stdout || '').toString();
    return JSON.parse(out.trim().split('\n').pop() || '{}');
  }
};

describe('checar-licoes.cjs', () => {
  it('deve passar em um caso valido', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Caso valido
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste de sucesso.
- Por que passou: Nada falhou.
- Regra: Passe sempre.
- Como atacar: Como falhar?
- Checagem por máquina: sim (\`tools/fake-tool.cjs\`)
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings).toHaveLength(0);
  });

  it('deve falhar se o titulo estiver fora do formato', () => {
    fs.writeFileSync(licoesPath, `
### L-01 — Titulo errado
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: não
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('Título fora do formato'))).toBe(true);
  });

  it('deve falhar se numero repetido ou fora de sequencia', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Caso valido
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: não

## L-03 — Fora de sequencia
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: não
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('Número fora de sequência'))).toBe(true);
  });

  it('deve falhar se faltar campo', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Falta campo
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Checagem por máquina: não
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('Campos ausentes: Como atacar'))).toBe(true);
  });

  it('deve falhar se arquivo em Origem nao existir', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Arquivo fantasma
- Origem: \`nao-existe.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: não
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('Arquivo em Origem não existe: nao-existe.md'))).toBe(true);
  });

  it('deve falhar se checagem sim nao citar ferramenta valida em tools/auditar.cjs', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Checagem falsa
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: sim (\`npm test\`)
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('não cita ferramenta válida'))).toBe(true);
  });

  it('deve falhar se Sim (sonda manual) com S maiusculo', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Sim maiusculo
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: Sim (sonda manual)
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('não cita ferramenta válida'))).toBe(true);
  });

  it('deve falhar se **sim** (sonda) em negrito', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — sim negrito
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: **sim** (sonda)
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('não cita ferramenta válida'))).toBe(true);
  });

  it('deve falhar se sim citar o proprio tools/auditar.cjs', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — auditar.cjs
- Origem: \`fake-file.md\` linha 1
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: sim (\`tools/auditar.cjs\`)
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('não pode ser o próprio auditar.cjs'))).toBe(true);
  });

  it('deve falhar se Origem fase 7, de memoria', () => {
    fs.writeFileSync(licoesPath, `
## L-01 — Sem arquivo
- Origem: fase 7, de memoria
- O que aconteceu: Teste
- Por que passou: Teste
- Regra: Teste
- Como atacar: Teste
- Checagem por máquina: não
`, 'utf8');
    const result = runChecarLicoes();
    expect(result.findings.some((f: any) => f.issue.includes('Origem precisa citar pelo menos um arquivo existente'))).toBe(true);
  });
});

