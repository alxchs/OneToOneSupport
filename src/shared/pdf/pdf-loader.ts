import * as pdfjsLib from 'pdfjs-dist';

// Configura o worker de forma compatível com Vite e Electron (ADR-013, ADR-014)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    const base = typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      base
    ).toString();
  } catch {
    // Modo fallback sem worker se a URL falhar
  }
}

export interface RenderedPdfPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pageNumber: number;
  totalPages: number;
}

/**
 * Utilitário de renderização de páginas de documentos PDF em canvas HTML (M5).
 */
export class PdfDocumentViewer {
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  public totalPages: number = 0;

  public async load(source: string | Uint8Array | ArrayBuffer): Promise<number> {
    const loadingTask = pdfjsLib.getDocument(
      typeof source === 'string'
        ? { url: source, withCredentials: false }
        : { data: source }
    );
    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;
    return this.totalPages;
  }

  public async renderPage(pageNumber: number, targetWidth = 1200): Promise<RenderedPdfPage> {
    if (!this.pdfDoc) {
      throw new Error('Nenhum documento PDF carregado.');
    }
    const safePageNum = Math.min(Math.max(1, pageNumber), this.totalPages);
    const page = await this.pdfDoc.getPage(safePageNum);

    const initialViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / initialViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) {
      throw new Error('Falha ao obter contexto 2d do canvas temporário de PDF.');
    }

    await page.render({
      canvasContext,
      viewport,
    }).promise;

    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      pageNumber: safePageNum,
      totalPages: this.totalPages,
    };
  }

  public destroy(): void {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}
