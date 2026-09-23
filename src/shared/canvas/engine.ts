import {
  Canvas,
  Rect,
  Ellipse,
  Line,
  IText,
  PencilBrush,
  Group,
  Triangle,
  Path,
  FabricObject,
} from 'fabric';
import {
  TabState,
  WhiteboardEvent,
  getVisibleElements,
} from '../events/reducer';
import { generateUUID } from '../events/protocol';
import { diagLog, isDiagEnabled } from '../diag';

export const CANONICAL_VIRTUAL_WIDTH = 1200;
export const CANONICAL_VIRTUAL_HEIGHT = 800;

export type WhiteboardTool =
  | 'select'
  | 'pencil'
  | 'brush'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'eraser'
  | 'object_eraser';

export interface PointerCoords {
  clientX: number;
  clientY: number;
}

export interface CanvasSceneTransform {
  boundingRect: { left: number; top: number; width: number; height: number };
  virtualWidth: number;
  virtualHeight: number;
  viewportTransform?: [number, number, number, number, number, number];
}

/**
 * Função única de conversão de evento de ponteiro (mouse/touch/pen) para coordenada de cena.
 * Garante que independentemente do devicePixelRatio (1.0, 1.5, 2.0) e da escala de exibição,
 * a coordenada de cena calculada corresponda exatamente ao ponto clicado pelo usuário
 * (sem deslocamento/offset e sem dupla escala), satisfazendo a Regra #2 e o ADR-003.
 */
export function pointerToScene(
  pointer: PointerCoords,
  transform: CanvasSceneTransform
): { x: number; y: number } {
  const { boundingRect, virtualWidth, virtualHeight, viewportTransform } = transform;
  const rawX = pointer.clientX - boundingRect.left;
  const rawY = pointer.clientY - boundingRect.top;

  // Se houver matriz de viewport (zoom / pan do Fabric), mapeia a coordenada de viewport CSS diretamente para a cena
  if (viewportTransform) {
    const [zoomX, , , zoomY, panX, panY] = viewportTransform;
    return {
      x: (rawX - (panX || 0)) / (zoomX || 1),
      y: (rawY - (panY || 0)) / (zoomY || 1),
    };
  }

  // Se não houver viewportTransform, aplica a escala direta entre CSS e tamanho virtual
  const scaleX = boundingRect.width > 0 ? virtualWidth / boundingRect.width : 1;
  const scaleY = boundingRect.height > 0 ? virtualHeight / boundingRect.height : 1;

  return { x: rawX * scaleX, y: rawY * scaleY };
}

/**
 * Instancia um objeto Fabric.js correspondente a partir do tipo e dos dados armazenados no evento.
 */
export function createFabricObjectFromData(tipo: string, data: any): FabricObject | null {
  if (!data) return null;

  switch (tipo) {
    case 'eraser_stroke': {
      if (data.path) {
        return new Path(data.path, {
          left: data.left,
          top: data.top,
          fill: null,
          stroke: '#000000',
          strokeWidth: data.strokeWidth ?? 8,
          strokeLineCap: data.strokeLineCap ?? 'round',
          strokeLineJoin: data.strokeLineJoin ?? 'round',
          globalCompositeOperation: 'destination-out',
          selectable: false,
          evented: false,
        });
      }
      return null;
    }

    case 'path': {
      if (typeof data === 'string') {
        return new Path(data);
      }
      if (data.path) {
        return new Path(data.path, {
          left: data.left,
          top: data.top,
          fill: data.fill ?? null,
          stroke: data.stroke ?? '#0284c7',
          strokeWidth: data.strokeWidth ?? 2,
          strokeLineCap: data.strokeLineCap ?? 'round',
          strokeLineJoin: data.strokeLineJoin ?? 'round',
          selectable: true,
        });
      }
      return null;
    }

    case 'rect':
    case 'rectangle': {
      return new Rect({
        left: data.left ?? 0,
        top: data.top ?? 0,
        width: Math.max(1, data.width ?? 50),
        height: Math.max(1, data.height ?? 50),
        fill: data.fill ?? 'transparent',
        stroke: data.stroke ?? '#0284c7',
        strokeWidth: data.strokeWidth ?? 2,
        angle: data.angle ?? 0,
        selectable: true,
      });
    }

    case 'ellipse':
    case 'circle': {
      return new Ellipse({
        left: data.left ?? 0,
        top: data.top ?? 0,
        rx: Math.max(1, data.rx ?? 25),
        ry: Math.max(1, data.ry ?? 25),
        fill: data.fill ?? 'transparent',
        stroke: data.stroke ?? '#0284c7',
        strokeWidth: data.strokeWidth ?? 2,
        angle: data.angle ?? 0,
        selectable: true,
      });
    }

    case 'line': {
      const points = data.points || [data.x1 ?? 0, data.y1 ?? 0, data.x2 ?? 50, data.y2 ?? 50];
      return new Line(points, {
        stroke: data.stroke ?? '#0284c7',
        strokeWidth: data.strokeWidth ?? 2,
        selectable: true,
      });
    }

    case 'arrow': {
      return createArrowObject(data);
    }

    case 'text': {
      return new IText(data.text || 'Texto', {
        left: data.left ?? 0,
        top: data.top ?? 0,
        fontSize: data.fontSize ?? 22,
        fill: data.fill ?? '#0f172a',
        angle: data.angle ?? 0,
        selectable: true,
        hasControls: true,
        hasRotatingPoint: true,
      });
    }

    default:
      return null;
  }
}

/**
 * Cria um objeto composto de seta vetorial (Linha + Cabeça triangular)
 */
export function createArrowObject(data: {
  points?: [number, number, number, number];
  stroke?: string;
  strokeWidth?: number;
  angle?: number;
}): FabricObject {
  const [x1, y1, x2, y2] = data.points || [0, 0, 60, 60];
  const stroke = data.stroke || '#0284c7';
  const strokeWidth = data.strokeWidth || 2;
  const headLength = Math.max(12, strokeWidth * 3.5);

  const angleRad = Math.atan2(y2 - y1, x2 - x1);
  const angleDeg = (angleRad * 180) / Math.PI;

  const line = new Line([x1, y1, x2, y2], {
    stroke,
    strokeWidth,
    selectable: false,
    evented: false,
  });

  const arrowHead = new Triangle({
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    angle: angleDeg + 90,
    width: headLength,
    height: headLength,
    fill: stroke,
    selectable: false,
    evented: false,
  });

  return new Group([line, arrowHead], {
    selectable: true,
    hasControls: true,
    angle: data.angle ?? 0,
  });
}

export interface WhiteboardEngineOptions {
  virtualWidth?: number;
  virtualHeight?: number;
  autor?: string;
  sessaoId?: string;
  abaId?: string;
  onEmitEvent?: (event: WhiteboardEvent) => void;
  onToolChange?: (tool: WhiteboardTool) => void;
}

/**
 * Motor vetorial Fabric.js HiDPI para o Quadro Branco 1:1 (Mestre §12, Regra #2, ADR-003).
 */
let nextEngineInstanceId = 1;

/**
 * Princípios de Arquitetura:
 * - O engine NÃO decide regra de negócio: captura interações do usuário, converte coordenadas
 *   de cena sem offset e emite eventos append-only (DRAW_ADD, DRAW_HIDE, CLEAR_TAB).
 * - Renderização do estado via projeção estrita vinda do Reducer da Fase 05 (`renderState`).
 * - Compensação HiDPI 4K @150%: buffer real = virtual × DPR sem dupla escala (`cssOnly: true` + retina nativa).
 * - Reação em tempo real a mudança de DPR (`matchMedia('(resolution: ...)')`) e redimensionamento.
 * - Suporte completo a caneta/touch com Pointer Events e prevenção de rolagem/zoom acidental.
 */
export class WhiteboardEngine {
  public readonly instanciaId: number;
  public readonly canvas: Canvas;
  public virtualWidth: number;
  public virtualHeight: number;
  public displayWidth: number;
  public displayHeight: number;
  public lastContainerWidth: number;
  public lastContainerHeight: number;
  public readonly containerElement: HTMLElement | null = null;
  public scale: number = 1;
  public currentDpr: number = 1;

  public activeTool: WhiteboardTool = 'pencil';
  public strokeColor: string = '#0284c7';
  public strokeWidth: number = 3;

  public readonly author: string;
  public readonly sessaoId: string;
  public readonly abaId: string;

  private onEmitEvent?: (event: WhiteboardEvent) => void;
  private onToolChange?: (tool: WhiteboardTool) => void;

  private objectsMap: Map<string, FabricObject> = new Map();
  private lastRenderedState: TabState | null = null;

  // Controle de desenho interativo de formas
  private isCreatingShape: boolean = false;
  private shapeOrigin: { x: number; y: number } | null = null;
  private lastPointerScene: { x: number; y: number } | null = null;
  private previewShape: FabricObject | null = null;

  // Cleanup de listeners de resolução e redimensionamento
  private cleanupFns: Array<() => void> = [];

  // Diagnóstico de divergência estado-vs-pixel (D6.1)
  private lastPixelCheckTimestamp: number = 0;
  private readonly pixelCheckThrottleMs: number = 500;
  private pendingPixelCheckHandle: number | null = null;

  // Forçar repaint real da janela e reflow DOM (D7 - esta é uma correção experimental, não comprovada por automação)
  private lastRepaintTimestamp: number = 0;
  private readonly repaintThrottleMs: number = 180;
  private pendingRepaintTimer: ReturnType<typeof setTimeout> | null = null;

  // D8: checagem de CSS/DOM que poderia estar escondendo ou cobrindo o canvas mesmo com pixels corretos
  private lastCssCheckTimestamp: number = 0;
  private readonly cssCheckThrottleMs: number = 500;
  private pendingCssCheckHandle: number | null = null;

  constructor(canvasElement: HTMLCanvasElement, options: WhiteboardEngineOptions = {}) {
    this.instanciaId = nextEngineInstanceId++;
    diagLog('engine_lifecycle', { evento: 'criado', instanciaId: this.instanciaId });

    this.virtualWidth = options.virtualWidth || CANONICAL_VIRTUAL_WIDTH;
    this.virtualHeight = options.virtualHeight || CANONICAL_VIRTUAL_HEIGHT;
    this.containerElement = canvasElement.parentElement;

    const parentBounds = this.containerElement?.getBoundingClientRect?.();
    if (parentBounds && parentBounds.width > 0 && parentBounds.height > 0) {
      this.lastContainerWidth = parentBounds.width;
      this.lastContainerHeight = parentBounds.height;
    } else {
      this.lastContainerWidth = this.virtualWidth;
      this.lastContainerHeight = this.virtualHeight;
    }

    this.displayWidth = this.virtualWidth;
    this.displayHeight = this.virtualHeight;
    this.author = options.autor || 'host';
    this.sessaoId = options.sessaoId || 'sessao-ativa';
    this.abaId = options.abaId || 'default';
    this.onEmitEvent = options.onEmitEvent;
    this.onToolChange = options.onToolChange;

    // Fundo branco no elemento HTML e buffer transparente para composição destination-out (ADR-003, ADR-012)
    canvasElement.style.backgroundColor = '#ffffff';
    this.canvas = new Canvas(canvasElement, {
      backgroundColor: 'transparent',
      enableRetinaScaling: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
      allowTouchScrolling: false,
    });

    // Configura Pointer Events e previne rolagem acidental no canvas
    this.setupPointerAndTouchGuards(canvasElement);

    // Aplica dimensionamento HiDPI inicial sem dupla escala
    this.setDimensions(this.virtualWidth, this.virtualHeight);

    // Registra listeners de interação da engine
    this.setupEngineEventListeners();

    // Reage a mudança de DPR (matchMedia) e redimensionamento da janela
    this.setupResolutionListeners();

    // Ativa a ferramenta inicial
    this.setTool('pencil');
  }

  /**
   * Previne gestos de rolagem e zoom acidentais na área do canvas
   */
  private setupPointerAndTouchGuards(canvasEl: HTMLCanvasElement): void {
    canvasEl.style.touchAction = 'none';
    canvasEl.style.userSelect = 'none';

    const upperEl = this.canvas.upperCanvasEl;
    if (upperEl) {
      upperEl.style.touchAction = 'none';
      upperEl.style.userSelect = 'none';

      const preventTouchDefault = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
      };
      upperEl.addEventListener('touchmove', preventTouchDefault, { passive: false });
      this.cleanupFns.push(() => upperEl.removeEventListener('touchmove', preventTouchDefault));

      const preventWindowZoom = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault();
        }
      };
      upperEl.addEventListener('wheel', preventWindowZoom, { passive: false });
      this.cleanupFns.push(() => upperEl.removeEventListener('wheel', preventWindowZoom));
    }
  }

  /**
   * Converte evento de ponteiro para coordenada de cena utilizando a função canônica única
   */
  public pointerToScene(
    e: MouseEvent | TouchEvent | PointerEvent | PointerCoords | { clientX: number; clientY: number }
  ): { x: number; y: number } {
    let clientX = 0;
    let clientY = 0;

    if (
      'changedTouches' in e &&
      (e as TouchEvent).changedTouches &&
      (e as TouchEvent).changedTouches.length > 0
    ) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else if (
      'touches' in e &&
      (e as TouchEvent).touches &&
      (e as TouchEvent).touches.length > 0
    ) {
      clientX = (e as TouchEvent).touches[0].clientX;
      clientY = (e as TouchEvent).touches[0].clientY;
    } else if ('clientX' in e && typeof e.clientX === 'number') {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const upperEl = this.canvas.upperCanvasEl || this.canvas.lowerCanvasEl;
    const bounds = upperEl
      ? upperEl.getBoundingClientRect()
      : { left: 0, top: 0, width: this.displayWidth, height: this.displayHeight };

    return pointerToScene(
      { clientX, clientY },
      {
        boundingRect: bounds,
        virtualWidth: this.virtualWidth,
        virtualHeight: this.virtualHeight,
        viewportTransform: this.canvas.viewportTransform as [number, number, number, number, number, number],
      }
    );
  }

  /**
   * Dimensiona o canvas para caber no container com escala uniforme preservando a cena virtual (V4, Mestre §12, ADR-003).
   * O buffer físico acompanha DPR sem aplicar o fator em duplicidade.
   */
  public setDimensions(containerWidth: number, containerHeight: number): void {
    const validWidth = Math.max(100, containerWidth);
    const validHeight = Math.max(100, containerHeight);
    this.lastContainerWidth = validWidth;
    this.lastContainerHeight = validHeight;

    // Escala uniforme para caber o quadro inteiro sem recorte
    const scale = Math.min(
      validWidth / this.virtualWidth,
      validHeight / this.virtualHeight
    );
    this.scale = scale;

    const displayWidth = Math.max(1, Math.round(this.virtualWidth * scale));
    const displayHeight = Math.max(1, Math.round(this.virtualHeight * scale));
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.currentDpr = dpr;

    // 1. Aplica dimensões do canvas CSS e buffer de tela
    this.canvas.setDimensions(
      { width: displayWidth, height: displayHeight },
      { cssOnly: false }
    );

    // 2. Aplica escala uniforme na cena através da viewportTransform do Fabric
    this.canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);

    this.canvas.calcOffset();
    this.canvas.requestRenderAll();
  }

  /**
   * Monitora alterações na resolução e DPR de exibição (matchMedia) e resize da janela
   */
  private setupResolutionListeners(): void {
    if (typeof window === 'undefined') return;

    const onDprChange = () => {
      // Preserva o tamanho de exibição atual do container real em CSS px (D5.1, ADR-003).
      // Se houver elemento container no DOM com dimensões válidas, relê getBoundingClientRect().
      // Caso contrário, reutiliza as últimas dimensões de container aplicadas (ou displayWidth/displayHeight).
      let width = this.lastContainerWidth || this.displayWidth;
      let height = this.lastContainerHeight || this.displayHeight;

      if (this.containerElement && typeof this.containerElement.getBoundingClientRect === 'function') {
        const bounds = this.containerElement.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          width = bounds.width;
          height = bounds.height;
        }
      }

      this.setDimensions(width, height);
      attachMediaQuery();
    };

    let mql: MediaQueryList | null = null;
    const attachMediaQuery = () => {
      if (!window.matchMedia) return;
      if (mql) {
        mql.removeEventListener('change', onDprChange);
      }
      const dpr = window.devicePixelRatio || 1;
      mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
      mql.addEventListener('change', onDprChange);
    };

    attachMediaQuery();
    this.cleanupFns.push(() => {
      if (mql) mql.removeEventListener('change', onDprChange);
    });

    const onWindowResize = () => {
      this.canvas.calcOffset();
    };
    window.addEventListener('resize', onWindowResize);
    this.cleanupFns.push(() => window.removeEventListener('resize', onWindowResize));
  }

  /**
   * Configura listeners de eventos do Fabric para captura e emissão de eventos
   */
  private setupEngineEventListeners(): void {
    // 1. Finalização de traço livre (Pencil, Brush e Borracha de Trecho)
    this.canvas.on('path:created', (opt: any) => {
      const pathObj = opt.path;
      if (!pathObj) return;

      const isEraser = this.activeTool === 'eraser';
      const elementId = generateUUID();
      const pathData = pathObj.toObject();

      // Remove imediatamente o elemento cru do canvas; ele será inserido
      // determinísticamente através da projeção do Reducer (renderState)
      this.canvas.remove(pathObj);

      const event: WhiteboardEvent = {
        id: generateUUID(),
        sessao_id: this.sessaoId,
        aba_id: this.abaId,
        tipo: 'DRAW_ADD',
        autor: this.author,
        criado_em: Date.now(),
        payload: {
          id: elementId,
          tipo: isEraser ? 'eraser_stroke' : 'path',
          data: isEraser
            ? {
                path: pathData.path,
                left: pathData.left,
                top: pathData.top,
                strokeWidth: pathObj.strokeWidth,
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
              }
            : pathData,
        },
      };

      diagLog('path:created', {
        tool: this.activeTool,
        author: this.author,
        isEraser,
        elementId,
      });

      this.emitEvent(event);
    });

    // 2. Interações com o mouse/ponteiro para formas, texto e borracha de objeto
    this.canvas.on('mouse:down', (opt: any) => {
      const e = opt.e;
      if (!e) return;

      if (this.activeTool === 'object_eraser') {
        this.handleEraserAction(opt);
        return;
      }

      if (
        this.activeTool === 'rectangle' ||
        this.activeTool === 'ellipse' ||
        this.activeTool === 'line' ||
        this.activeTool === 'arrow'
      ) {
        this.startShapeCreation(e);
        return;
      }

      if (this.activeTool === 'text') {
        this.handleTextCreation(e);
        return;
      }
    });

    this.canvas.on('mouse:move', (opt: any) => {
      const e = opt.e;
      if (!e) return;

      if (this.activeTool === 'object_eraser' && opt.e.buttons === 1) {
        this.handleEraserAction(opt);
        return;
      }

      if (this.isCreatingShape && this.previewShape && this.shapeOrigin) {
        this.updateShapeCreation(e);
      }
    });

    this.canvas.on('mouse:up', (opt: any) => {
      const e = opt.e;
      if (this.isCreatingShape && this.shapeOrigin) {
        this.finishShapeCreation(e);
      }
    });
  }

  /**
   * Ação da borracha de objeto: localiza o elemento sob o ponteiro e emite DRAW_HIDE (sem apagar do histórico do reducer)
   */
  private handleEraserAction(opt: any): void {
    const target = opt.target;
    if (target && (target as any).elementId) {
      const elementId = (target as any).elementId;
      const event: WhiteboardEvent = {
        id: generateUUID(),
        sessao_id: this.sessaoId,
        aba_id: this.abaId,
        tipo: 'DRAW_HIDE',
        autor: this.author,
        criado_em: Date.now(),
        payload: {
          tabId: this.abaId,
          elementId,
          targetId: elementId,
        },
      };
      this.emitEvent(event);
    }
  }

  /**
   * Inicia o desenho interativo de uma forma geométrica
   */
  private startShapeCreation(e: any): void {
    this.isCreatingShape = true;
    this.shapeOrigin = this.pointerToScene(e);
    this.lastPointerScene = this.shapeOrigin;

    const { x, y } = this.shapeOrigin;

    if (this.activeTool === 'rectangle') {
      this.previewShape = new Rect({
        left: x,
        top: y,
        width: 1,
        height: 1,
        fill: 'transparent',
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        selectable: false,
        evented: false,
      });
    } else if (this.activeTool === 'ellipse') {
      this.previewShape = new Ellipse({
        left: x,
        top: y,
        rx: 1,
        ry: 1,
        fill: 'transparent',
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        selectable: false,
        evented: false,
      });
    } else if (this.activeTool === 'line' || this.activeTool === 'arrow') {
      this.previewShape = new Line([x, y, x, y], {
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        selectable: false,
        evented: false,
      });
    }

    if (this.previewShape) {
      this.canvas.add(this.previewShape);
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Atualiza a geometria da forma enquanto o ponteiro se move
   */
  private updateShapeCreation(e: any): void {
    if (!this.previewShape || !this.shapeOrigin) return;

    const current = this.pointerToScene(e);
    this.lastPointerScene = current;

    if (this.activeTool === 'rectangle') {
      const left = Math.min(this.shapeOrigin.x, current.x);
      const top = Math.min(this.shapeOrigin.y, current.y);
      const width = Math.max(1, Math.abs(current.x - this.shapeOrigin.x));
      const height = Math.max(1, Math.abs(current.y - this.shapeOrigin.y));
      this.previewShape.set({ left, top, width, height });
    } else if (this.activeTool === 'ellipse') {
      const left = Math.min(this.shapeOrigin.x, current.x);
      const top = Math.min(this.shapeOrigin.y, current.y);
      const rx = Math.max(1, Math.abs(current.x - this.shapeOrigin.x) / 2);
      const ry = Math.max(1, Math.abs(current.y - this.shapeOrigin.y) / 2);
      this.previewShape.set({ left, top, rx, ry });
    } else if (this.activeTool === 'line' || this.activeTool === 'arrow') {
      this.previewShape.set({ x2: current.x, y2: current.y });
    }

    this.canvas.requestRenderAll();
  }

  /**
   * Finaliza a forma desenhada e emite o evento DRAW_ADD com os dados exatos
   */
  private finishShapeCreation(e: any): void {
    if (!this.shapeOrigin) return;

    let current = e ? this.pointerToScene(e) : null;
    if (
      !current ||
      (current.x === 0 &&
        current.y === 0 &&
        this.lastPointerScene &&
        (this.lastPointerScene.x !== 0 || this.lastPointerScene.y !== 0))
    ) {
      current = this.lastPointerScene || this.shapeOrigin;
    }

    const dist = Math.hypot(current.x - this.shapeOrigin.x, current.y - this.shapeOrigin.y);

    if (this.previewShape) {
      this.canvas.remove(this.previewShape);
      this.previewShape = null;
    }
    this.isCreatingShape = false;

    // Ignora cliques mínimos sem arraste
    if (dist < 4) {
      diagLog('finishShapeCreation', {
        tool: this.activeTool,
        author: this.author,
        tipo: this.activeTool,
        dist: Math.round(dist),
        descartado: true,
      });
      this.shapeOrigin = null;
      this.lastPointerScene = null;
      return;
    }

    const elementId = generateUUID();
    let tipo = '';
    let data: any = {};

    if (this.activeTool === 'rectangle') {
      tipo = 'rect';
      data = {
        left: Math.min(this.shapeOrigin.x, current.x),
        top: Math.min(this.shapeOrigin.y, current.y),
        width: Math.abs(current.x - this.shapeOrigin.x),
        height: Math.abs(current.y - this.shapeOrigin.y),
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        fill: 'transparent',
      };
    } else if (this.activeTool === 'ellipse') {
      tipo = 'ellipse';
      data = {
        left: Math.min(this.shapeOrigin.x, current.x),
        top: Math.min(this.shapeOrigin.y, current.y),
        rx: Math.abs(current.x - this.shapeOrigin.x) / 2,
        ry: Math.abs(current.y - this.shapeOrigin.y) / 2,
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
        fill: 'transparent',
      };
    } else if (this.activeTool === 'line') {
      tipo = 'line';
      data = {
        points: [this.shapeOrigin.x, this.shapeOrigin.y, current.x, current.y],
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
      };
    } else if (this.activeTool === 'arrow') {
      tipo = 'arrow';
      data = {
        points: [this.shapeOrigin.x, this.shapeOrigin.y, current.x, current.y],
        stroke: this.strokeColor,
        strokeWidth: this.strokeWidth,
      };
    }

    diagLog('finishShapeCreation', {
      tool: this.activeTool,
      author: this.author,
      tipo,
      dist: Math.round(dist),
      descartado: false,
    });

    this.shapeOrigin = null;
    this.lastPointerScene = null;

    if (tipo) {
      const event: WhiteboardEvent = {
        id: generateUUID(),
        sessao_id: this.sessaoId,
        aba_id: this.abaId,
        tipo: 'DRAW_ADD',
        autor: this.author,
        criado_em: Date.now(),
        payload: {
          id: elementId,
          tipo,
          data,
        },
      };

      this.emitEvent(event);
    }
  }

  /**
   * Criação de texto rotacionável no ponto clicado
   */
  private handleTextCreation(e: any): void {
    const pos = this.pointerToScene(e);
    const elementId = generateUUID();

    const textObj = new IText('Texto', {
      left: pos.x,
      top: pos.y,
      fontSize: 24,
      fill: this.strokeColor,
      hasControls: true,
      hasRotatingPoint: true,
      selectable: true,
    });

    this.canvas.add(textObj);
    this.canvas.setActiveObject(textObj);
    textObj.enterEditing();
    textObj.selectAll();

    let committed = false;
    const commitText = () => {
      if (committed) return;
      committed = true;
      this.canvas.remove(textObj);

      const textValue = textObj.text?.trim();
      if (!textValue) {
        diagLog('finishShapeCreation', {
          tool: 'text',
          author: this.author,
          tipo: 'text',
          dist: 0,
          descartado: true,
        });
        return;
      }

      diagLog('finishShapeCreation', {
        tool: 'text',
        author: this.author,
        tipo: 'text',
        dist: textValue.length,
        descartado: false,
      });

      const event: WhiteboardEvent = {
        id: generateUUID(),
        sessao_id: this.sessaoId,
        aba_id: this.abaId,
        tipo: 'DRAW_ADD',
        autor: this.author,
        criado_em: Date.now(),
        payload: {
          id: elementId,
          tipo: 'text',
          data: {
            text: textValue,
            left: textObj.left,
            top: textObj.top,
            fontSize: textObj.fontSize,
            fill: textObj.fill,
            angle: textObj.angle,
          },
        },
      };

      this.emitEvent(event);
    };

    textObj.on('editing:exited', commitText);
    textObj.on('deselected', commitText);

    // Volta para ferramenta de seleção após posicionar texto
    this.setTool('select');
  }

  /**
   * Define a ferramenta ativa e ajusta as propriedades do canvas Fabric
   */
  public setTool(tool: WhiteboardTool): void {
    this.activeTool = tool;

    // Desativa seleção e criação anterior
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.discardActiveObject();

    switch (tool) {
      case 'select': {
        this.canvas.selection = true;
        this.canvas.defaultCursor = 'default';
        break;
      }

      case 'pencil': {
        this.canvas.isDrawingMode = true;
        const brush = new PencilBrush(this.canvas);
        brush.width = Math.max(1, this.strokeWidth);
        brush.color = this.strokeColor;
        this.canvas.freeDrawingBrush = brush;
        this.canvas.defaultCursor = 'crosshair';
        break;
      }

      case 'brush': {
        this.canvas.isDrawingMode = true;
        const brush = new PencilBrush(this.canvas);
        brush.width = Math.max(6, this.strokeWidth * 2.5);
        brush.color = this.strokeColor;
        this.canvas.freeDrawingBrush = brush;
        this.canvas.defaultCursor = 'crosshair';
        break;
      }

      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'arrow': {
        this.canvas.defaultCursor = 'crosshair';
        break;
      }

      case 'text': {
        this.canvas.defaultCursor = 'text';
        break;
      }

      case 'eraser': {
        this.canvas.isDrawingMode = true;
        const brush = new PencilBrush(this.canvas);
        brush.width = Math.max(2, this.strokeWidth);
        brush.color = '#000000';
        this.canvas.freeDrawingBrush = brush;
        this.canvas.defaultCursor = 'crosshair';
        break;
      }

      case 'object_eraser': {
        this.canvas.isDrawingMode = false;
        this.canvas.defaultCursor = 'not-allowed';
        break;
      }
    }

    if (this.onToolChange) {
      this.onToolChange(tool);
    }
  }

  public setStrokeColor(color: string): void {
    this.strokeColor = color;
    if (this.canvas.freeDrawingBrush && this.activeTool !== 'eraser') {
      this.canvas.freeDrawingBrush.color = color;
    }
  }

  public setStrokeWidth(width: number): void {
    this.strokeWidth = width;
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.width =
        this.activeTool === 'brush' ? Math.max(6, width * 2.5) : Math.max(1, width);
    }
  }

  /**
   * Emite evento padronizado para o Reducer/Session Manager
   */
  private emitEvent(event: WhiteboardEvent): void {
    diagLog('emitEvent', {
      tipo: event.tipo,
      autor: event.autor,
      id: event.id,
      abaId: event.aba_id,
      payloadId: (event.payload as any)?.id,
    });
    if (this.onEmitEvent) {
      this.onEmitEvent(event);
    }
  }

  /**
   * Emite ação de Limpar Tela (CLEAR_TAB)
   */
  public clearTab(): void {
    const event: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: this.sessaoId,
      aba_id: this.abaId,
      tipo: 'CLEAR_TAB',
      autor: this.author,
      criado_em: Date.now(),
      payload: {
        tabId: this.abaId,
      },
    };
    this.emitEvent(event);
  }

  /**
   * Emite ação de Desfazer (UNDO) para o respectivo autor
   */
  public undo(): void {
    const event: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: this.sessaoId,
      aba_id: this.abaId,
      tipo: 'UNDO',
      autor: this.author,
      criado_em: Date.now(),
      payload: {},
    };
    this.emitEvent(event);
  }

  /**
   * Emite ação de Refazer (REDO) para o respectivo autor
   */
  public redo(): void {
    const event: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: this.sessaoId,
      aba_id: this.abaId,
      tipo: 'REDO',
      autor: this.author,
      criado_em: Date.now(),
      payload: {},
    };
    this.emitEvent(event);
  }

  /**
   * Renderiza deterministicamente o estado puro vindo do Reducer.
   * Aplica eventos remotos e locais EXATAMENTE pelo mesmo caminho (Mestre §12, OS item 3).
   */
  public renderState(state: TabState): void {
    this.lastRenderedState = state;
    const visibleElements = getVisibleElements(state);
    const visibleIds = new Set(visibleElements.map((el) => el.id));

    const idsRemovidos: string[] = [];
    const idsAdicionados: string[] = [];

    // 1. Remove do canvas qualquer objeto que foi ocultado (DRAW_HIDE, CLEAR_TAB, UNDO)
    for (const [id, fabricObj] of this.objectsMap.entries()) {
      if (!visibleIds.has(id)) {
        this.canvas.remove(fabricObj);
        this.objectsMap.delete(id);
        idsRemovidos.push(id);
      }
    }

    // 2. Renderiza ou atualiza cada elemento visível
    for (const el of visibleElements) {
      let fabricObj: FabricObject | null | undefined = this.objectsMap.get(el.id);
      if (!fabricObj) {
        fabricObj = createFabricObjectFromData(el.tipo, el.data);
        if (fabricObj) {
          (fabricObj as any).elementId = el.id;
          (fabricObj as any).autor = el.autor;
          this.canvas.add(fabricObj);
          this.objectsMap.set(el.id, fabricObj);
          idsAdicionados.push(el.id);
        }
      }
    }

    diagLog('renderState', {
      autor: this.author,
      totalVisiveis: visibleElements.length,
      adicionados: idsAdicionados,
      removidos: idsRemovidos,
    });

    this.canvas.requestRenderAll();

    // D7: Se novos elementos foram adicionados ou alterados no canvas, força repaint real (esta é uma correção experimental, não comprovada por automação)
    if (idsAdicionados.length > 0 || idsRemovidos.length > 0) {
      this.triggerRepaintReinforcement();
    }

    if (isDiagEnabled()) {
      this.schedulePixelDivergenceCheck();
      this.scheduleCssVisibilityCheck();
    }
  }

  /**
   * D7: Correção experimental para forçar repaint da janela e reflow no DOM.
   * Esta é uma correção experimental, não comprovada por automação - validação é o dono testando na máquina.
   * Aplica throttle (~180ms) com trailing edge para não sobrecarregar e garantir
   * que o último traço executado receba o repaint forçado.
   */
  public triggerRepaintReinforcement(): void {
    const now = Date.now();
    const elapsed = now - this.lastRepaintTimestamp;

    if (elapsed < this.repaintThrottleMs) {
      if (this.pendingRepaintTimer === null && typeof setTimeout !== 'undefined') {
        this.pendingRepaintTimer = setTimeout(() => {
          this.pendingRepaintTimer = null;
          this.executeRepaintReinforcement();
        }, this.repaintThrottleMs - elapsed);
      }
      return;
    }

    if (this.pendingRepaintTimer !== null && typeof clearTimeout !== 'undefined') {
      clearTimeout(this.pendingRepaintTimer);
      this.pendingRepaintTimer = null;
    }

    this.executeRepaintReinforcement();
  }

  /**
   * Executa os mecanismos D7.1 (webContents.invalidate no Host via IPC)
   * e D7.2 (reflow síncrono no DOM via offsetHeight no Host e Guest).
   * Esta é uma correção experimental, não comprovada por automação.
   */
  private executeRepaintReinforcement(): void {
    this.lastRepaintTimestamp = Date.now();

    // D7.2: Reflow síncrono barato no DOM (funciona tanto no Host quanto no Guest)
    try {
      if (this.canvas) {
        const lowerEl = this.canvas.lowerCanvasEl;
        if (lowerEl && typeof lowerEl.offsetHeight === 'number') {
          void lowerEl.offsetHeight; // força reflow síncrono no Chromium
        }
      }
    } catch {
      // Ignora erro em ambientes de teste sem DOM real
    }

    // D7.1: Invalidação de janela do Host via webContents.invalidate() (só Host/Electron)
    if (
      typeof window !== 'undefined' &&
      window.desktopAPI?.canvas?.forceRepaint &&
      typeof window.desktopAPI.canvas.forceRepaint === 'function'
    ) {
      try {
        window.desktopAPI.canvas.forceRepaint().catch(() => {});
      } catch {
        // Ignora erro em caso de teardown
      }
    }
  }

  /**
   * Método público para acionamento explícito de repaint reforçado (D7)
   */
  public forceRepaint(): void {
    this.triggerRepaintReinforcement();
  }

  /**
   * D6.1: Agenda checagem de divergência entre estado interno do Fabric e pixels no canvas (sob ONETOONE_DIAG=1).
   * Aguarda 2 frames via requestAnimationFrame para que a renderização assíncrona do Fabric se complete.
   * Aplica throttle de ~500ms para evitar sobrecarga no desenho interativo.
   */
  private schedulePixelDivergenceCheck(): void {
    if (!isDiagEnabled()) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    const now = Date.now();
    if (now - this.lastPixelCheckTimestamp < this.pixelCheckThrottleMs) {
      return;
    }
    if (this.pendingPixelCheckHandle !== null) {
      return;
    }

    this.pendingPixelCheckHandle = window.requestAnimationFrame(() => {
      this.pendingPixelCheckHandle = window.requestAnimationFrame(() => {
        this.pendingPixelCheckHandle = null;
        this.lastPixelCheckTimestamp = Date.now();
        this.checkPixelDivergence();
      });
    });
  }

  /**
   * D6.1: Compara a quantidade de objetos no Fabric com os pixels não-transparentes no canvas visível.
   * Se houver objetos (length > 0) mas o canvas estiver em branco (zero pixels), registra advertência.
   */
  public checkPixelDivergence(): void {
    if (!isDiagEnabled()) return;
    if (!this.canvas) return;

    const objects = this.canvas.getObjects();
    const objetosNoFabric = objects.length;
    if (objetosNoFabric === 0) return;

    const lowerEl = this.canvas.lowerCanvasEl;
    if (!lowerEl || lowerEl.width <= 0 || lowerEl.height <= 0) return;

    try {
      const ctx = lowerEl.getContext('2d');
      if (!ctx) return;
      const imgData = ctx.getImageData(0, 0, lowerEl.width, lowerEl.height);
      const data = imgData.data;
      let pixelsNoCanvas = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          pixelsNoCanvas++;
        }
      }

      if (pixelsNoCanvas === 0) {
        diagLog('divergencia_estado_pixel', {
          objetosNoFabric,
          pixelsNoCanvas,
          larguraCanvas: lowerEl.width,
          alturaCanvas: lowerEl.height,
        });
      }
    } catch {
      // Ignora falhas de leitura em contextos restritos ou mocks parciais
    }
  }

  /**
   * D8: Agenda checagem de que nada (CSS/DOM) está escondendo ou cobrindo o canvas visível,
   * mesmo quando o buffer de pixels e o estado do Fabric estão corretos (ex.: exportação PNG
   * do dono mostrou o desenho, mas a tela do app continuava em branco — descarta bug de pixel
   * puro e investiga se é a APRESENTAÇÃO do elemento, não o conteúdo dele).
   */
  private scheduleCssVisibilityCheck(): void {
    if (!isDiagEnabled()) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    const now = Date.now();
    if (now - this.lastCssCheckTimestamp < this.cssCheckThrottleMs) {
      return;
    }
    if (this.pendingCssCheckHandle !== null) {
      return;
    }

    this.pendingCssCheckHandle = window.requestAnimationFrame(() => {
      this.pendingCssCheckHandle = window.requestAnimationFrame(() => {
        this.pendingCssCheckHandle = null;
        this.lastCssCheckTimestamp = Date.now();
        this.checkCssVisibility();
      });
    });
  }

  /**
   * D8: Lê o estado real de apresentação do canvas no DOM (bounding rect, display/visibility/opacity
   * computados, e o que está de fato no topo da pilha de composição no ponto central do canvas).
   * Registra SEMPRE que houver algo suspeito: dimensão zero, display none, visibility hidden,
   * opacity baixa, ou um elemento diferente do canvas ocupando o centro dele.
   */
  public checkCssVisibility(): void {
    if (!isDiagEnabled()) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (!this.canvas) return;

    try {
      const lowerEl = this.canvas.lowerCanvasEl;
      const upperEl = this.canvas.upperCanvasEl;
      if (!lowerEl) return;

      const rect = lowerEl.getBoundingClientRect();
      const computed = window.getComputedStyle(lowerEl);
      const parent = lowerEl.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementNoCentro =
        typeof document.elementFromPoint === 'function'
          ? document.elementFromPoint(centerX, centerY)
          : null;

      const suspeito =
        rect.width <= 0 ||
        rect.height <= 0 ||
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        parseFloat(computed.opacity || '1') < 0.5 ||
        (parentComputed !== null &&
          (parentComputed.display === 'none' || parentComputed.visibility === 'hidden')) ||
        (elementNoCentro !== null &&
          elementNoCentro !== lowerEl &&
          elementNoCentro !== upperEl &&
          !lowerEl.contains(elementNoCentro));

      if (suspeito) {
        diagLog('canvas_possivelmente_escondido', {
          rectWidth: rect.width,
          rectHeight: rect.height,
          rectLeft: rect.left,
          rectTop: rect.top,
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          parentDisplay: parentComputed?.display,
          parentVisibility: parentComputed?.visibility,
          elementoNoCentro: elementNoCentro
            ? `${elementNoCentro.tagName}${(elementNoCentro as HTMLElement).id ? '#' + (elementNoCentro as HTMLElement).id : ''}${(elementNoCentro as HTMLElement).className ? '.' + String((elementNoCentro as HTMLElement).className).replace(/\s+/g, '.') : ''}`
            : null,
        });
      }
    } catch {
      // Ignora falhas de leitura em contextos restritos ou mocks parciais
    }
  }

  public getLastRenderedState(): TabState | null {
    return this.lastRenderedState;
  }

  /**
   * Exporta a imagem do quadro em alta definição preservando nitidez HiDPI (multiplier = DPR).
   * Compõe sobre fundo branco opaco para evitar perfurações transparentes causadas por destination-out (ADR-012).
   */
  public toDataURL(options?: {
    multiplier?: number;
    format?: 'png' | 'jpeg';
    quality?: number;
  }): string {
    const dpr = this.currentDpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const multiplier = options?.multiplier ?? dpr;

    if (typeof document !== 'undefined') {
      const lowerEl = this.canvas.lowerCanvasEl;
      if (lowerEl && lowerEl.width > 0 && lowerEl.height > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = lowerEl.width;
        tempCanvas.height = lowerEl.height;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          ctx.drawImage(lowerEl, 0, 0);
          return tempCanvas.toDataURL(
            options?.format === 'jpeg' ? 'image/jpeg' : 'image/png',
            options?.quality ?? 1
          );
        }
      }
    }

    return this.canvas.toDataURL({
      format: options?.format || 'png',
      quality: options?.quality || 1,
      multiplier,
    });
  }

  /**
   * Destrói a instância liberando memória e listeners
   */
  public dispose(): void {
    if (
      this.pendingPixelCheckHandle !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelAnimationFrame === 'function'
    ) {
      window.cancelAnimationFrame(this.pendingPixelCheckHandle);
      this.pendingPixelCheckHandle = null;
    }
    if (this.pendingRepaintTimer !== null && typeof clearTimeout !== 'undefined') {
      clearTimeout(this.pendingRepaintTimer);
      this.pendingRepaintTimer = null;
    }
    if (
      this.pendingCssCheckHandle !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelAnimationFrame === 'function'
    ) {
      window.cancelAnimationFrame(this.pendingCssCheckHandle);
      this.pendingCssCheckHandle = null;
    }
    diagLog('engine_lifecycle', { evento: 'descartado', instanciaId: this.instanciaId });

    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch {
        // Ignora erros no descarte
      }
    }
    this.cleanupFns = [];
    this.objectsMap.clear();
    this.canvas.dispose();
  }
}
