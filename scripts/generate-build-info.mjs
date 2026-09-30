import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export function getBuildInfo() {
  let commit = 'unknown';
  let branch = 'unknown';

  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch (err) {
    console.warn('[BuildInfo] Não foi possível obter commit/branch via git:', err.message);
  }

  const buildDate = new Date().toISOString();
  const stamp = `${commit} (${branch}) ${buildDate}`;

  return {
    commit,
    branch,
    buildDate,
    stamp,
  };
}

const info = getBuildInfo();
const targetPath = path.join(root, 'src', 'shared', 'build-info.json');
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, JSON.stringify(info, null, 2), 'utf8');
console.log(`[BuildInfo] Carimbo gerado em ${targetPath}: ${info.stamp}`);

const guestDistDir = path.join(root, 'dist', 'guest');
if (fs.existsSync(guestDistDir)) {
  fs.writeFileSync(path.join(guestDistDir, 'version.json'), JSON.stringify(info, null, 2), 'utf8');
  console.log(`[BuildInfo] Carimbo gerado em ${path.join(guestDistDir, 'version.json')}: ${info.stamp}`);
}

try {
  const { buildReportBundle } = await import('./build-report.mjs');
  await buildReportBundle();
} catch (err) {
  console.warn('[BuildInfo] Aviso ao compilar bundle de relatório:', err?.message || err);
}

try {
  const { generateAllIcons } = await import('./generate-icon.mjs');
  generateAllIcons();
} catch (err) {
  console.warn('[BuildInfo] Aviso ao gerar ícones:', err?.message || err);
}

// Copiar migrations do SQLite para dist para estarem disponíveis no app empacotado (ASAR)
const migrationsSrc = path.join(root, 'electron', 'db', 'migrations');
const migrationsDist = path.join(root, 'dist', 'electron', 'db', 'migrations');
if (fs.existsSync(migrationsSrc)) {
  fs.mkdirSync(migrationsDist, { recursive: true });
  fs.cpSync(migrationsSrc, migrationsDist, { recursive: true });
  console.log(`[BuildInfo] Migrations copiadas para ${migrationsDist}`);
}



