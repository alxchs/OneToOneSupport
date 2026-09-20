import { create } from 'zustand';
import type {
  AtendidoDTO,
  SessaoDTO,
  CreateAtendidoPayload,
} from '../../shared/ipc-contract';

export type HostView = 'lista' | 'form' | 'detalhes' | 'configuracoes';

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
    const { selectedAtendido } = get();
    if (selectedAtendido) {
      await get().carregarSessoes(selectedAtendido.id);
    }
    return true;
  },
}));
