import { create } from 'zustand';
import type {
  AtendidoDTO,
  SessaoDTO,
  CreateAtendidoPayload,
  ServerSessionInfoDTO,
} from '../../shared/ipc-contract';

import {
  TabState,
  createInitialTabState,
  reduceEvent,
  getVisibleElements,
  WhiteboardEvent,
} from '../../shared/events/reducer';
import { generateUUID } from '../../shared/events/protocol';
import { diagLog } from '../../shared/diag';

export type HostView = 'lista' | 'form' | 'detalhes' | 'configuracoes' | 'quadro';

interface HostState {
  view: HostView;
  formMode: 'create' | 'edit';
  atendidos: AtendidoDTO[];
  sessoes: SessaoDTO[];
  selectedAtendido: AtendidoDTO | null;
  dicionario: Record<string, string>;
  filtroBusca: string;
  apenasAtivos: boolean;
  carregando: boolean;
  mensagemAlerta: { tipo: 'alerta' | 'sucesso'; texto: string } | null;
  erroDuplicado: string | null;
  activeServerSession: ServerSessionInfoDTO | null;
  guestMuted: boolean;

  // Ações puras de UI e invocação de IPC
  setView: (view: HostView) => void;
  setFiltroBusca: (busca: string) => void;
  setApenasAtivos: (apenasAtivos: boolean) => void;
  limparMensagens: () => void;
  carregarDicionario: () => Promise<void>;
  salvarRotulo: (chave: string, valor: string) => Promise<boolean>;
  carregarAtendidos: () => Promise<void>;
  selecionarAtendido: (id: string) => Promise<void>;
  abrirFormularioCriacao: () => void;
  abrirFormularioEdicao: (atendido: AtendidoDTO) => void;
  salvarAtendido: (dados: CreateAtendidoPayload) => Promise<boolean>;
  desativarAtendido: (id: string) => Promise<boolean>;
  reativarAtendido: (id: string) => Promise<boolean>;
  purgarAtendido: (id: string) => Promise<boolean>;
  carregarSessoes: (atendidoId: string) => Promise<void>;
  criarSessao: (dados: { atendido_id: string; titulo?: string | null; notas_host?: string | null }) => Promise<boolean>;
  encerrarSessao: (id: string, notasHost?: string | null) => Promise<boolean>;
  iniciarServidorSessao: (sessaoId: string, atendidoId: string, preferredIp?: string) => Promise<boolean>;
  encerrarServidorSessao: () => Promise<boolean>;
  selecionarIpServidor: (ip: string) => Promise<boolean>;
  carregarStatusServidor: () => Promise<void>;

  // Quadro Branco HiDPI (Fase 06 e 07)
  activeSessaoId: string | null;
  activeAbaId: string;
  tabState: TabState;
  abrirQuadroSessao: (sessaoId: string) => Promise<void>;
  aplicarEventoQuadro: (evento: WhiteboardEvent) => Promise<void>;
  desfazerQuadro: () => Promise<void>;
  refazerQuadro: () => Promise<void>;
  limparQuadro: () => Promise<void>;
  bloquearTelaGuest: (locked: boolean) => Promise<boolean>;
  liberarMidiaGuest: (unlocked: boolean) => Promise<boolean>;
  trocarAba: (abaId: string) => Promise<boolean>;
}

export const useHostStore = create<HostState>((set, get) => ({
  view: 'lista',
  formMode: 'create',
  atendidos: [],
  sessoes: [],
  selectedAtendido: null,
  dicionario: {
    'rotulo.host': 'Profissional',
    'rotulo.guest': 'Atendido',
    'rotulo.sessao': 'Sessão',
  },
  filtroBusca: '',
  apenasAtivos: true,
  carregando: false,
  mensagemAlerta: null,
  erroDuplicado: null,
  activeServerSession: null,
  guestMuted: false,
  activeSessaoId: null,
  activeAbaId: 'default',
  tabState: createInitialTabState('default'),

  setView: (view) => set({ view, mensagemAlerta: null, erroDuplicado: null }),

  setFiltroBusca: (busca) => {
    set({ filtroBusca: busca });
    get().carregarAtendidos();
  },

  setApenasAtivos: (apenasAtivos) => {
    set({ apenasAtivos });
    get().carregarAtendidos();
  },

  limparMensagens: () => set({ mensagemAlerta: null, erroDuplicado: null }),

  carregarDicionario: async () => {
    if (!window.desktopAPI?.config) return;
    const res = await window.desktopAPI.config.getDictionary();
    if (res.success) {
      set({ dicionario: res.data });
    }
  },

  salvarRotulo: async (chave: string, valor: string) => {
    if (!window.desktopAPI?.config) return false;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const res = await window.desktopAPI.config.setLabel(chave, valor);
    set({ carregando: false });
    if (!res.success) {
      if (res.error === 'DUPLICATE') {
        set({
          mensagemAlerta: {
            tipo: 'alerta',
            texto: 'Este rótulo já possui exatamente esse valor cadastrado no banco.',
          },
        });
      } else {
        set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      }
      return false;
    }
    set((state) => ({
      dicionario: { ...state.dicionario, [chave]: valor },
      mensagemAlerta: { tipo: 'sucesso', texto: `Rótulo "${chave}" atualizado com sucesso.` },
    }));
    return true;
  },

  carregarAtendidos: async () => {
    if (!window.desktopAPI?.atendidos) return;
    set({ carregando: true });
    const { filtroBusca, apenasAtivos } = get();
    const res = await window.desktopAPI.atendidos.list({
      busca: filtroBusca || undefined,
      apenasAtivos,
    });
    set({ carregando: false });
    if (res.success) {
      set({ atendidos: res.data });
    } else {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
    }
  },

  selecionarAtendido: async (id: string) => {
    if (!window.desktopAPI?.atendidos) return;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const resAtendido = await window.desktopAPI.atendidos.get(id);
    if (!resAtendido.success) {
      set({ carregando: false, mensagemAlerta: { tipo: 'alerta', texto: resAtendido.message } });
      return;
    }
    set({ selectedAtendido: resAtendido.data, view: 'detalhes' });
    await get().carregarSessoes(id);
    set({ carregando: false });
  },

  abrirFormularioCriacao: () => {
    set({
      formMode: 'create',
      selectedAtendido: null,
      view: 'form',
      mensagemAlerta: null,
      erroDuplicado: null,
    });
  },

  abrirFormularioEdicao: (atendido: AtendidoDTO) => {
    set({
      formMode: 'edit',
      selectedAtendido: atendido,
      view: 'form',
      mensagemAlerta: null,
      erroDuplicado: null,
    });
  },

  salvarAtendido: async (dados: CreateAtendidoPayload) => {
    if (!window.desktopAPI?.atendidos) return false;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const { formMode, selectedAtendido } = get();

    if (formMode === 'create') {
      const res = await window.desktopAPI.atendidos.create(dados);
      set({ carregando: false });
      if (!res.success) {
        if (res.error === 'DUPLICATE') {
          const msg = `Cadastro DUPLICADO detectado: já existe um registro idêntico com ID ${res.existingId || 'existente'}. Regra #1 SQLite aplicada.`;
          set({ erroDuplicado: msg, mensagemAlerta: { tipo: 'alerta', texto: msg } });
        } else {
          set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
        }
        return false;
      }
      set({
        view: 'lista',
        mensagemAlerta: { tipo: 'sucesso', texto: 'Cadastro realizado com sucesso.' },
      });
      await get().carregarAtendidos();
      return true;
    } else {
      if (!selectedAtendido) return false;
      const res = await window.desktopAPI.atendidos.update(selectedAtendido.id, dados);
      set({ carregando: false });
      if (!res.success) {
        if (res.error === 'DUPLICATE') {
          const msg = `Alteração DUPLICADA: os novos dados colidem com outro cadastro existente (ID: ${res.existingId}). Regra #1 aplicada.`;
          set({ erroDuplicado: msg, mensagemAlerta: { tipo: 'alerta', texto: msg } });
        } else {
          set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
        }
        return false;
      }
      set({
        selectedAtendido: res.data,
        view: 'detalhes',
        mensagemAlerta: { tipo: 'sucesso', texto: 'Cadastro atualizado com sucesso.' },
      });
      await get().carregarAtendidos();
      return true;
    }
  },

  desativarAtendido: async (id: string) => {
    if (!window.desktopAPI?.atendidos) return false;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const res = await window.desktopAPI.atendidos.softDelete(id);
    set({ carregando: false });
    if (!res.success) {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
    set({ mensagemAlerta: { tipo: 'sucesso', texto: 'Cadastro desativado com sucesso (soft delete).' } });
    await get().carregarAtendidos();
    if (get().selectedAtendido?.id === id) {
      const updated = await window.desktopAPI.atendidos.get(id);
      if (updated.success) set({ selectedAtendido: updated.data });
    }
    return true;
  },

  reativarAtendido: async (id: string) => {
    if (!window.desktopAPI?.atendidos) return false;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const res = await window.desktopAPI.atendidos.reactivate(id);
    set({ carregando: false });
    if (!res.success) {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
    set({ mensagemAlerta: { tipo: 'sucesso', texto: 'Cadastro reativado com sucesso.' } });
    await get().carregarAtendidos();
    if (get().selectedAtendido?.id === id) {
      const updated = await window.desktopAPI.atendidos.get(id);
      if (updated.success) set({ selectedAtendido: updated.data });
    }
    return true;
  },

  purgarAtendido: async (id: string) => {
    if (!window.desktopAPI?.atendidos) return false;
    set({ carregando: true, mensagemAlerta: null, erroDuplicado: null });
    const res = await window.desktopAPI.atendidos.purge(id);
    set({ carregando: false });
    if (!res.success) {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
    set({
      selectedAtendido: null,
      view: 'lista',
      mensagemAlerta: { tipo: 'sucesso', texto: 'Registro purgado fisicamente do banco de dados.' },
    });
    await get().carregarAtendidos();
    return true;
  },

  carregarSessoes: async (atendidoId: string) => {
    if (!window.desktopAPI?.sessoes) return;
    const res = await window.desktopAPI.sessoes.listByAtendido(atendidoId);
    if (res.success) {
      set({ sessoes: res.data });
    }
  },

  criarSessao: async (dados) => {
    if (!window.desktopAPI?.sessoes) return false;
    set({ carregando: true, mensagemAlerta: null });
    const res = await window.desktopAPI.sessoes.create(dados);
    set({ carregando: false });
    if (!res.success) {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
    set({ mensagemAlerta: { tipo: 'sucesso', texto: 'Sessão iniciada com sucesso.' } });
    await get().carregarSessoes(dados.atendido_id);

    // Inicia automaticamente o servidor HTTP/WS e gera o convite com QR Code
    await get().iniciarServidorSessao(res.data.id, dados.atendido_id);
    return true;
  },

  encerrarSessao: async (id: string, notasHost?: string | null) => {
    if (!window.desktopAPI?.sessoes) return false;
    set({ carregando: true, mensagemAlerta: null });
    const res = await window.desktopAPI.sessoes.encerrar(id, notasHost);
    set({ carregando: false });
    if (!res.success) {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
    set({ mensagemAlerta: { tipo: 'sucesso', texto: 'Sessão encerrada com sucesso.' } });

    // Encerra também o servidor se estiver atendendo esta sessão
    const currentServer = get().activeServerSession;
    if (currentServer && currentServer.sessaoId === id) {
      await get().encerrarServidorSessao();
    }

    const { selectedAtendido } = get();
    if (selectedAtendido) {
      await get().carregarSessoes(selectedAtendido.id);
    }
    return true;
  },

  iniciarServidorSessao: async (sessaoId: string, atendidoId: string, preferredIp?: string) => {
    if (!window.desktopAPI?.serverSession) return false;
    set({ carregando: true, activeSessaoId: sessaoId, activeAbaId: 'default' });
    const res = await window.desktopAPI.serverSession.start({
      sessaoId,
      atendidoId,
      preferredIp,
    });
    set({ carregando: false });
    if (res.success) {
      set({ activeServerSession: res.data, activeSessaoId: sessaoId, activeAbaId: 'default' });
      return true;
    } else {
      set({ mensagemAlerta: { tipo: 'alerta', texto: res.message } });
      return false;
    }
  },

  encerrarServidorSessao: async () => {
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.stop();
    if (res.success) {
      set({ activeServerSession: null });
      return true;
    }
    return false;
  },

  selecionarIpServidor: async (ip: string) => {
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.setIp({ ip });
    if (res.success) {
      set({ activeServerSession: res.data });
      return true;
    }
    return false;
  },

  carregarStatusServidor: async () => {
    if (!window.desktopAPI?.serverSession) return;
    const res = await window.desktopAPI.serverSession.getStatus();
    if (res.success) {
      set({ activeServerSession: res.data });
    }
  },

  abrirQuadroSessao: async (sessaoId: string) => {
    set({ activeSessaoId: sessaoId, activeAbaId: 'default', carregando: true });
    let state = createInitialTabState('default');
    if (window.desktopAPI?.eventos) {
      try {
        const res = await window.desktopAPI.eventos.obterEstadoAba(sessaoId, 'default');
        if (res.success && res.data) {
          state = res.data;
        }
      } catch (err) {
        console.error('[HostStore] Erro ao carregar estado da aba via IPC:', err);
      }
    }
    set({ tabState: state, view: 'quadro', carregando: false });
  },

  aplicarEventoQuadro: async (evento: WhiteboardEvent) => {
    const { tabState, activeSessaoId, activeAbaId } = get();
    const visiveisAntes = getVisibleElements(tabState).length;
    const proximoEstado = reduceEvent(tabState, evento);
    const visiveisDepois = getVisibleElements(proximoEstado).length;

    diagLog('aplicarEventoQuadro', {
      tipo: evento.tipo,
      visiveisAntes,
      visiveisDepois,
      abaId: activeAbaId,
      autor: evento.autor,
    });

    set({ tabState: proximoEstado });

    if (window.desktopAPI?.eventos && activeSessaoId) {
      try {
        const res = await window.desktopAPI.eventos.gravar({
          sessao_id: activeSessaoId,
          aba_id: activeAbaId,
          tipo: evento.tipo,
          payload: evento.payload,
          autor: evento.autor,
        });
        const isSuccess = Boolean(res && res.success);
        const errCode = res && !res.success ? res.error : undefined;
        const errMsg = res && !res.success ? res.message : undefined;
        diagLog('gravarEventoIPC', {
          sucesso: isSuccess,
          erro: errCode,
          motivo: errMsg,
          tipo: evento.tipo,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        diagLog('gravarEventoIPC', {
          sucesso: false,
          erro: 'EXCEPTION',
          motivo: msg,
          tipo: evento.tipo,
        });
        console.error('[HostStore] Erro ao persistir evento no SQLite:', err);
      }
    }
  },

  desfazerQuadro: async () => {
    const { aplicarEventoQuadro, activeSessaoId, activeAbaId } = get();
    const ev: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: activeSessaoId || undefined,
      aba_id: activeAbaId,
      tipo: 'UNDO',
      autor: 'host',
      payload: {},
      criado_em: Date.now(),
    };
    await aplicarEventoQuadro(ev);
  },

  refazerQuadro: async () => {
    const { aplicarEventoQuadro, activeSessaoId, activeAbaId } = get();
    const ev: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: activeSessaoId || undefined,
      aba_id: activeAbaId,
      tipo: 'REDO',
      autor: 'host',
      payload: {},
      criado_em: Date.now(),
    };
    await aplicarEventoQuadro(ev);
  },

  limparQuadro: async () => {
    const { aplicarEventoQuadro, activeSessaoId, activeAbaId } = get();
    const ev: WhiteboardEvent = {
      id: generateUUID(),
      sessao_id: activeSessaoId || undefined,
      aba_id: activeAbaId,
      tipo: 'CLEAR_TAB',
      autor: 'host',
      payload: { tabId: activeAbaId },
      criado_em: Date.now(),
    };
    await aplicarEventoQuadro(ev);
  },

  bloquearTelaGuest: async (locked: boolean) => {
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.lockScreen(locked);
    if (res.success && res.data) {
      set({ activeServerSession: res.data });
      return true;
    }
    return false;
  },

  liberarMidiaGuest: async (unlocked: boolean) => {
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.unlockMedia(unlocked);
    if (res.success && res.data) {
      set({ activeServerSession: res.data });
      return true;
    }
    return false;
  },

  trocarAba: async (abaId: string) => {
    set({ activeAbaId: abaId });
    if (window.desktopAPI?.serverSession) {
      await window.desktopAPI.serverSession.switchTab(abaId);
    }
    const { activeSessaoId } = get();
    if (activeSessaoId && window.desktopAPI?.eventos) {
      try {
        const res = await window.desktopAPI.eventos.obterEstadoAba(activeSessaoId, abaId);
        if (res.success && res.data) {
          set({ tabState: res.data });
        }
      } catch (err) {
        console.error('[HostStore] Erro ao carregar estado da nova aba:', err);
      }
    }
    return true;
  },
}));
