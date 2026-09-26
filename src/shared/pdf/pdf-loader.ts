import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configura o worker se fornecido ou opera com fake worker seguro (ADR-013, ADR-014)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Deixa o legacy build usar o fake worker in-thread como fallback padrão se worker não estiver configurado
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
