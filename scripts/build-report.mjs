import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export async function buildReportBundle() {
  const entryPoint = path.join(root, 'src', 'report', 'report-renderer.ts');
  const targetDir1 = path.join(root, 'electron', 'reports');
  const targetDir2 = path.join(root, 'dist', 'electron', 'reports');

  fs.mkdirSync(targetDir1, { recursive: true });
  fs.mkdirSync(targetDir2, { recursive: true });

  const outfile1 = path.join(targetDir1, 'report-renderer.bundle.js');
  const outfile2 = path.join(targetDir2, 'report-renderer.bundle.js');

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile: outfile1,
    format: 'iife',
    globalName: 'ReportRendererModule',
    platform: 'browser',
    target: ['chrome120', 'es2022'],
    minify: false,
    sourcemap: false,
  });

  fs.copyFileSync(outfile1, outfile2);

  const templateSrc = path.join(root, 'electron', 'reports', 'templates', 'sessao.html');
  const templateDist = path.join(root, 'dist', 'electron', 'reports', 'templates', 'sessao.html');
  fs.mkdirSync(path.dirname(templateDist), { recursive: true });
  if (fs.existsSync(templateSrc)) {
    fs.copyFileSync(templateSrc, templateDist);
  }

  console.log(`[ReportBundle] Bundle gerado com sucesso: ${outfile1}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildReportBundle().catch((err) => {
    console.error('[ReportBundle] Erro ao compilar bundle de relatório:', err);
    process.exit(1);
  });
}
