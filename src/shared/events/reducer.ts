/**
 * Reducer puro de Event Sourcing para o Quadro Branco Multimodal (Mestre §4, §8, §12).
 *
 * Princípios:
 * - 100% puro, determinístico e livre de I/O (roda tanto no Host Electron quanto no Guest Browser).
 * - O estado da aba é uma projeção funcional do log de eventos: f(estado_anterior, evento) -> novo_estado.
 * - DRAW_ADD adiciona elemento vetorial.
 * - DRAW_HIDE oculta elemento por ID (borracha lógica, nunca remove fisicamente).
 * - CLEAR_TAB oculta todos os elementos visíveis anteriores (sem apagar histórico).
 * - UNDO / REDO varrem o histórico por autor (Host desfaz ações do Host; Guest desfaz apenas as próprias).
 * - Novo DRAW_ADD invalida a pilha de redo do respectivo autor.
 * - Desempenho linear O(N) com `applyEventInPlace` e imutabilidade garantida nas fronteiras.
 */

export interface DrawElement {
  id: string;
  autor: string;
  tipo: string;
  data: unknown;
  hidden: boolean;
  criado_em: number;
  hiddenBy?: string;
}

export interface AuthorHistory {
  undoStack: string[];
  redoStack: string[];
}

export interface ActionEffect {
  eventId: string;
  type: 'DRAW_ADD' | 'DRAW_HIDE' | 'CLEAR_TAB';
  autor: string;
  elementId?: string;
  clearedElementIds?: string[];
}

export interface TabState {
  abaId: string;
  elements: Record<string, DrawElement>;
  elementOrder: string[];
  history: {
    host: AuthorHistory;
    guest: AuthorHistory;
    [author: string]: AuthorHistory;
  };
  actionEffects: Record<string, ActionEffect>;
  lastEventId: string | null;
  lastEventCriadoEm: number;
  totalEventsApplied: number;
}

export interface WhiteboardEvent {
  id: string;
  sessao_id?: string;
  aba_id?: string | null;
  tipo: string;
  payload: string | Record<string, unknown>;
  autor: string;
  criado_em: number;
}

/**
 * Cria o estado inicial limpo para uma aba.
 */
export function createInitialTabState(abaId: string): TabState {
  return {
    abaId,
    elements: {},
    elementOrder: [],
    history: {
      host: { undoStack: [], redoStack: [] },
      guest: { undoStack: [], redoStack: [] },
    },
    actionEffects: {},
    lastEventId: null,
    lastEventCriadoEm: 0,
    totalEventsApplied: 0,
  };
}

/**
 * Clona profundamente o estado da aba de forma determinística e rápida.
 */
export function cloneTabState(state: TabState): TabState {
  const clonedElements: Record<string, DrawElement> = {};
  for (const key of Object.keys(state.elements)) {
    const el = state.elements[key];
    clonedElements[key] = { ...el };
  }

  const clonedHistory: Record<string, AuthorHistory> = {};
  for (const auth of Object.keys(state.history)) {
    clonedHistory[auth] = {
      undoStack: [...state.history[auth].undoStack],
      redoStack: [...state.history[auth].redoStack],
    };
  }

  const clonedEffects: Record<string, ActionEffect> = {};
  for (const key of Object.keys(state.actionEffects)) {
    const eff = state.actionEffects[key];
    clonedEffects[key] = {
      ...eff,
      clearedElementIds: eff.clearedElementIds ? [...eff.clearedElementIds] : undefined,
    };
  }

  return {
    abaId: state.abaId,
    elements: clonedElements,
    elementOrder: [...state.elementOrder],
    history: clonedHistory as TabState['history'],
    actionEffects: clonedEffects,
    lastEventId: state.lastEventId,
    lastEventCriadoEm: state.lastEventCriadoEm,
    totalEventsApplied: state.totalEventsApplied,
  };
}

/**
 * Retorna os elementos atualmente visíveis no canvas em sua ordem de desenho original.
 */
export function getVisibleElements(state: TabState): DrawElement[] {
  const result: DrawElement[] = [];
  for (const id of state.elementOrder) {
    const el = state.elements[id];
    if (el && !el.hidden) {
      result.push(el);
    }
  }
  return result;
}

/**
 * Normaliza o payload de um evento caso venha serializado em JSON.
 */
function parsePayload(payload: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return { raw: payload };
    }
  }
  return payload || {};
}

function getAuthorHistory(state: TabState, autor: string): AuthorHistory {
  if (!state.history[autor]) {
    state.history[autor] = { undoStack: [], redoStack: [] };
  }
  return state.history[autor];
}

/**
 * Aplica um único evento diretamente sobre a instância de TabState fornecida (mutação local eficiente).
 */
export function applyEventInPlace(state: TabState, event: WhiteboardEvent): void {
  const payload = parsePayload(event.payload);
  const autor = event.autor || 'host';
  const authorHistory = getAuthorHistory(state, autor);

  switch (event.tipo) {
    case 'DRAW_ADD': {
      const elementId = (payload.id as string) || event.id;
      const tipo = (payload.tipo as string) || (payload.type as string) || 'path';
      const data = payload.data !== undefined ? payload.data : payload;

      if (!state.elements[elementId]) {
        state.elementOrder.push(elementId);
      }

      state.elements[elementId] = {
        id: elementId,
        autor,
        tipo,
        data,
        hidden: false,
        criado_em: event.criado_em,
      };

      state.actionEffects[event.id] = {
        eventId: event.id,
        type: 'DRAW_ADD',
        autor,
        elementId,
      };

      // Adiciona na pilha de Undo do autor
      authorHistory.undoStack.push(event.id);
      // Regra da OS: Novo DRAW_ADD invalida a pilha de redo do respectivo autor
      authorHistory.redoStack = [];
      break;
    }

    case 'DRAW_HIDE': {
      const targetId =
        (payload.targetId as string) ||
        (payload.elementId as string) ||
        (payload.id as string);
      if (targetId && state.elements[targetId]) {
        state.elements[targetId].hidden = true;
        state.elements[targetId].hiddenBy = event.id;

        state.actionEffects[event.id] = {
          eventId: event.id,
          type: 'DRAW_HIDE',
          autor,
          elementId: targetId,
        };

        authorHistory.undoStack.push(event.id);
      }
      break;
    }

    case 'CLEAR_TAB': {
      // CLEAR_TAB só pode ser emitido pelo Host (Mestre §16)
      if (autor !== 'host') {
        break;
      }

      const visibleIds: string[] = [];
      for (const id of state.elementOrder) {
        if (!state.elements[id].hidden) {
          visibleIds.push(id);
          state.elements[id].hidden = true;
          state.elements[id].hiddenBy = event.id;
        }
      }

      state.actionEffects[event.id] = {
        eventId: event.id,
        type: 'CLEAR_TAB',
        autor,
        clearedElementIds: visibleIds,
      };

      authorHistory.undoStack.push(event.id);
      break;
    }

    case 'UNDO': {
      // Desfaz a última ação realizada pelo próprio autor
      if (authorHistory.undoStack.length === 0) {
        break;
      }

      const actionId = authorHistory.undoStack.pop()!;
      authorHistory.redoStack.push(actionId);

      const effect = state.actionEffects[actionId];
      if (!effect) {
        break;
      }

      if (effect.type === 'DRAW_ADD' && effect.elementId && state.elements[effect.elementId]) {
        state.elements[effect.elementId].hidden = true;
      } else if (effect.type === 'DRAW_HIDE' && effect.elementId && state.elements[effect.elementId]) {
        state.elements[effect.elementId].hidden = false;
        delete state.elements[effect.elementId].hiddenBy;
      } else if (effect.type === 'CLEAR_TAB' && effect.clearedElementIds) {
        for (const id of effect.clearedElementIds) {
          if (state.elements[id]) {
            state.elements[id].hidden = false;
            delete state.elements[id].hiddenBy;
          }
        }
      }
      break;
    }

    case 'REDO': {
      // Refaz a ação mais recente desfeita pelo autor
      if (authorHistory.redoStack.length === 0) {
        break;
      }

      const actionId = authorHistory.redoStack.pop()!;
      authorHistory.undoStack.push(actionId);

      const effect = state.actionEffects[actionId];
      if (!effect) {
        break;
      }

      if (effect.type === 'DRAW_ADD' && effect.elementId && state.elements[effect.elementId]) {
        state.elements[effect.elementId].hidden = false;
      } else if (effect.type === 'DRAW_HIDE' && effect.elementId && state.elements[effect.elementId]) {
        state.elements[effect.elementId].hidden = true;
        state.elements[effect.elementId].hiddenBy = actionId;
      } else if (effect.type === 'CLEAR_TAB' && effect.clearedElementIds) {
        for (const id of effect.clearedElementIds) {
          if (state.elements[id]) {
            state.elements[id].hidden = true;
            state.elements[id].hiddenBy = actionId;
          }
        }
      }
      break;
    }

    default:
      break;
  }

  state.lastEventId = event.id;
  state.lastEventCriadoEm = event.criado_em;
  state.totalEventsApplied += 1;
}

/**
 * Aplica um único evento sobre o estado existente, produzindo uma nova versão projetada imutável.
 */
export function reduceEvent(state: TabState, event: WhiteboardEvent): TabState {
  const next = cloneTabState(state);
  applyEventInPlace(next, event);
  return next;
}

/**
 * Reduz uma lista ordenada de eventos sobre um estado inicial com alto desempenho O(N).
 */
export function reduceEvents(events: WhiteboardEvent[], initialState?: TabState): TabState {
  const state = initialState ? cloneTabState(initialState) : createInitialTabState(events[0]?.aba_id || 'default');
  for (const ev of events) {
    applyEventInPlace(state, ev);
  }
  return state;
}
