const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function test() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          .page { height: 1000px; page-break-after: always; font-size: 32px; }
        </style>
      </head>
      <body>
        <div class="page">Pagina 1</div>
        <div class="page">Pagina 2</div>
      </body>
    </html>
  `);
  const buf = await page.pdf({ printBackground: true });
  await browser.close();
  console.log('PDF byte length:', buf.length);

  // Testa carregamento com pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log('Total pages according to pdf.js:', doc.numPages);
}

test().catch(console.error);
