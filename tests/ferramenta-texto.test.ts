// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WhiteboardEngine } from '../src/shared/canvas/engine';
import { WhiteboardEvent } from '../src/shared/events/reducer';

// Mock do contexto 2D para ambiente JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (this: any, contextType: string) {
    if (contextType === '2d') {
      return {
        canvas: this,
        save: () => {},
        restore: () => {},
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        measureText: (text: string) => ({
          width: text.length * 10,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }),
        font: '10px sans-serif',
        textAlign: 'left',
        textBaseline: 'top',
        direction: 'ltr',
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        fillText: () => {},
        strokeText: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(400) }),
        putImageData: () => {},
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as any;
}

describe('D13 — Ferramenta Texto Utilizável (Ciclo de Vida, Edição e Descarte)', () => {
  let canvasEl: HTMLCanvasElement;
  let engine: WhiteboardEngine;
  let emittedEvents: WhiteboardEvent[];

  beforeEach(() => {
    canvasEl = document.createElement('canvas');
    canvasEl.width = 1200;
    canvasEl.height = 800;
    document.body.appendChild(canvasEl);

    emittedEvents = [];
    engine = new WhiteboardEngine(canvasEl, {
      autor: 'host',
      sessaoId: 'sess-d13-text',
      abaId: 'aba-principal',
      onEmitEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });
    engine.setDimensions(1200, 800);
  });

  afterEach(() => {
    engine.dispose();
    if (canvasEl.parentNode) {
      canvasEl.parentNode.removeChild(canvasEl);
    }
  });

  it('D13.1.1: ao clicar com ferramenta texto, entra em modo de edição e NÃO troca imediatamente para select', () => {
    engine.setTool('text');
    expect(engine.activeTool).toBe('text');

    // Simula clique do mouse para criação de texto
    const fakeDownEvent = {
      e: { clientX: 200, clientY: 200 },
      clientX: 200,
      clientY: 200,
    };
    (engine.canvas as any).fire('mouse:down', fakeDownEvent);

    const activeObj = engine.canvas.getActiveObject() as any;
    expect(activeObj).toBeTruthy();
    expect(activeObj.type).toMatch(/text/i);
    expect(activeObj.isEditing).toBe(true);
    // A ferramenta continua sendo 'text' para permitir digitação imediata
    expect(engine.activeTool).toBe('text');
  });

  it('D13.1.2: texto nasce vazio; se desselecionado sem digitar nada, NENHUM elemento é gravado e volta para select', () => {
    engine.setTool('text');
    const fakeDownEvent = {
      e: { clientX: 300, clientY: 250 },
      clientX: 300,
      clientY: 250,
    };
    (engine.canvas as any).fire('mouse:down', fakeDownEvent);

    const activeObj = engine.canvas.getActiveObject() as any;
    expect(activeObj).toBeTruthy();
    expect(activeObj.text).toBe(''); // Não nasce com placeholder 'Texto'

    // Desseleciona / encerra edição sem digitar nada
    activeObj.exitEditing();

    // Nenhum evento DRAW_ADD deve ter sido emitido
    const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
    expect(drawAdds.length).toBe(0);

    // O objeto temporário foi removido do canvas
    expect(engine.canvas.getObjects().includes(activeObj)).toBe(false);

    // Ferramenta comutou para 'select'
    expect(engine.activeTool).toBe('select');
  });

  it('D13.1.3: digitação de texto com acentuação e multilinha emite DRAW_ADD correto e comuta para select', () => {
    engine.setTool('text');
    const fakeDownEvent = {
      e: { clientX: 150, clientY: 180 },
      clientX: 150,
      clientY: 180,
    };
    (engine.canvas as any).fire('mouse:down', fakeDownEvent);

    const activeObj = engine.canvas.getActiveObject() as any;
    expect(activeObj).toBeTruthy();

    // Simula digitação no objeto em edição
    activeObj.text = 'Ação Multilinha\nSegunda Linha';

    // Encerra edição (ex: Escape ou clique fora)
    activeObj.exitEditing();

    const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
    expect(drawAdds.length).toBe(1);
    expect((drawAdds[0].payload as any).tipo).toBe('text');
    expect((drawAdds[0].payload as any).data.text).toBe('Ação Multilinha\nSegunda Linha');
    expect(engine.activeTool).toBe('select');
  });

  it('D13.1.4: se o usuário troca de ferramenta para "pencil" durante a edição, comita o texto e adota "pencil"', () => {
    engine.setTool('text');
    const fakeDownEvent = {
      e: { clientX: 100, clientY: 100 },
      clientX: 100,
      clientY: 100,
    };
    (engine.canvas as any).fire('mouse:down', fakeDownEvent);

    const activeObj = engine.canvas.getActiveObject() as any;
    activeObj.text = 'Texto comutando ferramenta';

    // Usuário clica na ferramenta lápis
    engine.setTool('pencil');

    // O texto foi comitado
    const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
    expect(drawAdds.length).toBe(1);
    expect((drawAdds[0].payload as any).data.text).toBe('Texto comutando ferramenta');

    // A ferramenta ativa permaneceu 'pencil' (não regrediu para 'select')
    expect(engine.activeTool).toBe('pencil');
  });

  it('D13.1.5: clique fora de texto em edição encerra e comita sem criar um segundo texto no local do clique fora', () => {
    engine.setTool('text');
    // 1º clique: cria e inicia edição do 1º texto
    (engine.canvas as any).fire('mouse:down', {
      e: { clientX: 200, clientY: 200 },
      clientX: 200,
      clientY: 200,
    });
    const activeObj = engine.canvas.getActiveObject() as any;
    activeObj.text = 'Primeiro Texto';

    // 2º clique: longe do objeto (clique fora para comitar)
    (engine.canvas as any).fire('mouse:down', {
      e: { clientX: 800, clientY: 500 },
      clientX: 800,
      clientY: 500,
      target: null,
    });

    // Deve ter comitado o 1º texto
    const drawAdds = emittedEvents.filter((ev) => ev.tipo === 'DRAW_ADD');
    expect(drawAdds.length).toBe(1);
    expect((drawAdds[0].payload as any).data.text).toBe('Primeiro Texto');

    // Ferramenta comutou para 'select'
    expect(engine.activeTool).toBe('select');

    // Não existe novo objeto em edição
    const activeAposCliqueFora = engine.canvas.getActiveObject() as any;
    expect(activeAposCliqueFora?.isEditing).toBeFalsy();
  });
});
