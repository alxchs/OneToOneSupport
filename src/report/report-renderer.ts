import { WhiteboardEngine } from '../shared/canvas/engine';
import { PdfDocumentViewer } from '../shared/pdf/pdf-loader';
import type { TabState } from '../shared/events/reducer';

export interface AbaRenderPayload {
  id: string;
  tipo: 'blank' | 'image' | 'pdf' | 'video' | 'audio';
  renderMiniatura: boolean;
  state: TabState;
  assetDataUri?: string | null;
}

export interface RelatorioIniciarPayload {
  sessaoId: string;
  abas: AbaRenderPayload[];
}

declare global {
  interface Window {
    __relatorio?: {
      onIniciar: (callback: (payload: RelatorioIniciarPayload) => Promise<void> | void) => void;
      pronto: () => void;
      erro: (mensagem: string) => void;
      renderAba?: (abaId: string, payload: AbaRenderPayload) => Promise<string>;
    };
  }
}

/**
 * Renderizador offscreen de miniaturas do relatório.
 * Executa dentro do contexto Chromium da janela offscreen do Electron.
 * Reaproveita WhiteboardEngine e PdfDocumentViewer para fidelidade visual idêntica ao Host.
 */
export async function inicializarRenderizadorRelatorio(): Promise<void> {
  if (typeof window === 'undefined' || !window.__relatorio) {
    return;
  }

  const canvasEl = document.getElementById('canvas-render') as HTMLCanvasElement | null;
  if (!canvasEl) {
    window.__relatorio.erro('Elemento #canvas-render não encontrado no DOM do template.');
    return;
  }

  window.__relatorio.onIniciar(async (payload: RelatorioIniciarPayload) => {
    try {
      const abasComMiniatura = payload.abas.filter((a) => a.renderMiniatura);

      for (const aba of abasComMiniatura) {
        const imgEl = document.getElementById(`miniatura-${aba.id}`) as HTMLImageElement | null;
        if (!imgEl) continue;

        const engine = new WhiteboardEngine(canvasEl, {
          sessaoId: payload.sessaoId,
          abaId: aba.id,
          autor: 'host',
          somenteLeitura: true,
          readOnly: true,
        });

        try {
          // 1. Fundo estático de Imagem ou PDF
          if (aba.tipo === 'image' && aba.assetDataUri) {
            await engine.setBackgroundImage(aba.assetDataUri);
          } else if (aba.tipo === 'pdf' && aba.assetDataUri) {
            const viewer = new PdfDocumentViewer();
            await viewer.load(aba.assetDataUri);
            const renderedPage = await viewer.renderPage(1, 1200);
            await engine.setBackgroundImage(renderedPage.canvas);
            viewer.destroy();
          }

          // 2. Projeta anotações do quadro
          if (aba.state) {
            engine.renderState(aba.state);
          }

          // 3. Exporta miniatura HiDPI (multiplier = DPR da janela)
          const dpr = window.devicePixelRatio || 1;
          const dataUrl = engine.toDataURL({ multiplier: dpr });
          imgEl.src = dataUrl;
        } finally {
          // Descarte obrigatório para liberar memória e buffers gráficos
          engine.dispose();
        }
      }

      // Aguarda micro-ticks para renderização das imagens no layout do Chromium
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      });

      window.__relatorio.pronto();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      window.__relatorio?.erro(msg);
    }
  });
}

// Inicializa automaticamente se carregado em ambiente com window
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      inicializarRenderizadorRelatorio().catch(console.error);
    });
  } else {
    inicializarRenderizadorRelatorio().catch(console.error);
  }
}
