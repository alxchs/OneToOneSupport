import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Arquitetura e Separação de Responsabilidades (AGENTS.md / Mestre)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const srcDir = path.join(rootDir, 'src');

  function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
  }

  const srcFiles = walk(srcDir).filter((f) => /\.(ts|tsx|css|html)$/.test(f));

  it('Renderer não importa nada de electron/ ou módulos nativos (fs, path, better-sqlite3)', () => {
    const forbiddenPattern =
      /from\s+['"](electron|electron\/.*|fs|path|better-sqlite3)['"]|require\(['"](electron|fs|path|better-sqlite3)['"]\)/;

    const violations: string[] = [];
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (forbiddenPattern.test(line)) {
          violations.push(`${path.relative(rootDir, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('Renderer não contém queries SQL (Regra de Separação de Camadas: regras no Main)', () => {
    const sqlPattern = /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;

    const violations: string[] = [];
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (sqlPattern.test(line)) {
          violations.push(`${path.relative(rootDir, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('Renderer não contém elementos ou estilos vermelhos (Regra de Preferências do Alexandre)', () => {
    const redPattern =
      /#(f00|ff0000|dc2626|ef4444|b91c1c|e11d48|991b1b|fca5a5|f87171)\b|\bred\b|rgb\(\s*2[0-5]\d\s*,\s*[0-5]?\d\s*,\s*[0-5]?\d\s*\)/i;

    const violations: string[] = [];
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (redPattern.test(line)) {
          violations.push(`${path.relative(rootDir, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
