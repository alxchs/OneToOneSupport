import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');

fs.mkdirSync(buildDir, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Cores da paleta azul-ardósia aprovada pelo Alexandre:
  // Base: #0f172a (slate-900)
  // Borda / Gradiente primário: #0369a1 (sky-700) e #0284c7 (sky-600)
  // Detalhes e símbolos: #38bdf8 (sky-400) e #f8fafc (slate-50)
  // REGRA INEGOCIÁVEL: ZERO vermelho, ZERO amarelo.

  const radius = Math.round(size * 0.22);
  const pad = Math.max(1, Math.round(size * 0.04));
  const innerW = size - pad * 2;
  const innerH = size - pad * 2;

  // Fundo arredondado
  ctx.beginPath();
  ctx.roundRect(pad, pad, innerW, innerH, radius);
  const bgGrad = ctx.createLinearGradient(pad, pad, pad + innerW, pad + innerH);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#0369a1');
  bgGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Borda sutil de destaque
  ctx.lineWidth = Math.max(1, Math.round(size * 0.035));
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // Emblema central estilizado: Dois retângulos com conexão (representando 1:1 e suporte)
  const cx = size / 2;
  const cy = size / 2;

  if (size >= 32) {
    // Tela Principal (Host) - Esquerda superior
    const sw = size * 0.38;
    const sh = size * 0.28;
    const sx = cx - sw * 0.75;
    const sy = cy - sh * 0.65;
    const srad = Math.max(2, size * 0.05);

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, srad);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();

    // Tela Secundária (Guest) - Direita inferior
    const gw = size * 0.26;
    const gh = size * 0.36;
    const gx = cx + sw * 0.1;
    const gy = cy - gh * 0.15;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, srad);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();

    // Link/Ponto de conexão 1:1
    ctx.beginPath();
    ctx.arc(cx - size * 0.05, cy + size * 0.05, Math.max(1.5, size * 0.04), 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Linha de dados sincronizados
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.7, sy + sh * 0.5);
    ctx.lineTo(gx + gw * 0.3, gy + gh * 0.3);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.setLineDash([Math.max(1, size * 0.04), Math.max(1, size * 0.03)]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Em tamanhos muito pequenos (16x16, 24x24), glifo simplificado nítido: "1:1"
    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1:1', cx, cy + 1);
  }

  return canvas.toBuffer('image/png');
}

export function buildIco(buffers, sizes) {
  const count = buffers.length;
  // Header: 6 bytes
  // Directory entries: 16 bytes each
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const entries = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const buf = buffers[i];
    const width = size >= 256 ? 0 : size;
    const height = size >= 256 ? 0 : size;

    const entry = Buffer.alloc(16);
    entry.writeUInt8(width, 0);
    entry.writeUInt8(height, 1);
    entry.writeUInt8(0, 2); // colorCount
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bitCount
    entry.writeUInt32LE(buf.length, 8); // bytesInRes
    entry.writeUInt32LE(offset, 12); // imageOffset

    entries.push(entry);
    offset += buf.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = ICO
  header.writeUInt16LE(count, 4); // image count

  return Buffer.concat([header, ...entries, ...buffers]);
}

export function generateAllIcons() {
  console.log('[IconGenerator] Gerando ícones com paleta azul-ardósia (#0284c7, #0369a1, #0f172a)...');
  const pngBuffers = SIZES.map((s) => drawIcon(s));

  // Salva PNG de 256x256
  const p256 = pngBuffers[SIZES.indexOf(256)];
  const pngPath = path.join(buildDir, 'icon.png');
  fs.writeFileSync(pngPath, p256);
  console.log(`[IconGenerator] Ícone PNG gravado: ${pngPath}`);

  // Salva ICO multi-resolução
  const icoBuffer = buildIco(pngBuffers, SIZES);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`[IconGenerator] Ícone ICO gravado com ${SIZES.length} resoluções: ${icoPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateAllIcons();
}
