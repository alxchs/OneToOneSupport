import { create } from 'zustand';
import type {
  AtendidoDTO,
  SessaoDTO,
  CreateAtendidoPayload,
  ServerSessionInfoDTO,
  AbaDTO,
  AssetDTO,
  GuestEventDTO,
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
import { isAcaoPermitidaGuest } from '../../shared/autoridade';

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

  // Quadro Branco HiDPI (Fase 06 e 07, D16) e Abas Multimodais (Fase 08)
  activeSessaoId: string | null;
  activeAbaId: string;
  abas: AbaDTO[];
  activeAsset: AssetDTO | null;
  pdfPagina: number;
  pdfTotalPaginas: number;
  tabState: TabState;
  quadroSomenteLeitura: boolean;
  abrirQuadroSessao: (sessaoId: string, options?: { somenteLeitura?: boolean }) => Promise<void>;
  aplicarEventoQuadro: (evento: WhiteboardEvent) => Promise<void>;
  desfazerQuadro: () => Promise<void>;
  refazerQuadro: () => Promise<void>;
  limparQuadro: () => Promise<void>;
  bloquearTelaGuest: (locked: boolean) => Promise<boolean>;
  liberarMidiaGuest: (unlocked: boolean) => Promise<boolean>;
  carregarAbas: (sessaoId?: string) => Promise<void>;
  criarAba: (payload: { titulo: string; tipo: 'blank' | 'image' | 'pdf' | 'video' | 'audio'; asset_id?: string | null }) => Promise<AbaDTO | null>;
  renomearAba: (id: string, titulo: string) => Promise<boolean>;
  reordenarAbas: (abaIdsEmOrdem: string[]) => Promise<boolean>;
  removerAba: (id: string) => Promise<boolean>;
  mudarPaginaPdf: (pagina: number) => Promise<boolean>;
  trocarAba: (abaId: string) => Promise<boolean>;
  aplicarEventoRemoto: (event: GuestEventDTO) => boolean;
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
  abas: [],
  activeAsset: null,
  pdfPagina: 1,
  pdfTotalPaginas: 1,
  tabState: createInitialTabState('default'),
  quadroSomenteLeitura: false,

  setView: (view) =>
    set((state) => ({
      view,
      quadroSomenteLeitura: view === 'quadro' ? state.quadroSomenteLeitura : false,
      mensagemAlerta: null,
      erroDuplicado: null,
    })),

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

  abrirQuadroSessao: async (sessaoId: string, options?: { somenteLeitura?: boolean }) => {
    const { sessoes } = get();
    const sessao = sessoes.find((s) => s.id === sessaoId);
    const isEncerrada = sessao?.status === 'encerrada';
    const somenteLeitura = Boolean(options?.somenteLeitura || isEncerrada);
    set({
      activeSessaoId: sessaoId,
      activeAbaId: 'default',
      quadroSomenteLeitura: somenteLeitura,
      carregando: true,
      pdfPagina: 1,
      pdfTotalPaginas: 1,
      activeAsset: null,
    });

    let activeAba = 'default';
    if (window.desktopAPI?.abas) {
      try {
        const abasRes = await window.desktopAPI.abas.listBySessao(sessaoId);
        if (abasRes.success && abasRes.data) {
          set({ abas: abasRes.data });
          if (abasRes.data.length > 0) {
            activeAba = abasRes.data[0].id;
            set({ activeAbaId: activeAba });
          }
        }
      } catch (err) {
        console.error('[HostStore] Erro ao carregar abas da sessão:', err);
      }
    }

    let state = createInitialTabState(activeAba);
    if (window.desktopAPI?.eventos) {
      try {
        const res = await window.desktopAPI.eventos.obterEstadoAba(sessaoId, activeAba);
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
    const { tabState, activeSessaoId, activeAbaId, abas, pdfPagina, quadroSomenteLeitura } = get();
    if (quadroSomenteLeitura) {
      diagLog('aplicarEventoQuadro_bloqueado_readonly', {
        tipo: evento.tipo,
        abaId: activeAbaId,
        sessaoId: activeSessaoId,
      });
      console.warn('[HostStore] Modo somente leitura: emissão de evento bloqueada.');
      return;
    }

    const currentAba = abas.find((a) => a.id === activeAbaId);
    const targetAbaId = currentAba?.tipo === 'pdf' ? `${activeAbaId}_p${pdfPagina}` : activeAbaId;

    const visiveisAntes = getVisibleElements(tabState).length;
    const proximoEstado = reduceEvent(tabState, evento);
    const visiveisDepois = getVisibleElements(proximoEstado).length;

    diagLog('aplicarEventoQuadro', {
      tipo: evento.tipo,
      visiveisAntes,
      visiveisDepois,
      abaId: targetAbaId,
      autor: evento.autor,
    });

    set({ tabState: proximoEstado });

    if (window.desktopAPI?.eventos && activeSessaoId) {
      diagLog('gravar (IPC)', {
        fase: 'inicio',
        tipo: evento.tipo,
        sessaoId: activeSessaoId,
        abaId: targetAbaId,
        autor: evento.autor,
      });
      try {
        const res = await window.desktopAPI.eventos.gravar({
          sessao_id: activeSessaoId,
          aba_id: targetAbaId,
          tipo: evento.tipo,
          payload: evento.payload,
          autor: evento.autor,
        });
        const isSuccess = Boolean(res && res.success);
        const errCode = res && !res.success ? res.error : undefined;
        const errMsg = res && !res.success ? res.message : undefined;
        diagLog('gravar (IPC)', {
          fase: 'retorno',
          sucesso: isSuccess,
          erro: errCode,
          motivo: errMsg,
          tipo: evento.tipo,
        });
        diagLog('gravarEventoIPC', {
          sucesso: isSuccess,
          erro: errCode,
          motivo: errMsg,
          tipo: evento.tipo,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        diagLog('gravar (IPC)', {
          fase: 'retorno',
          sucesso: false,
          erro: 'EXCEPTION',
          motivo: msg,
          tipo: evento.tipo,
        });
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
    if (get().quadroSomenteLeitura) return;
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
    if (get().quadroSomenteLeitura) return;
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
    if (get().quadroSomenteLeitura) return;
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
    if (get().quadroSomenteLeitura) return false;
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.lockScreen(locked);
    if (res.success && res.data) {
      set({ activeServerSession: res.data });
      return true;
    }
    return false;
  },

  liberarMidiaGuest: async (unlocked: boolean) => {
    if (get().quadroSomenteLeitura) return false;
    if (!window.desktopAPI?.serverSession) return false;
    const res = await window.desktopAPI.serverSession.unlockMedia(unlocked);
    if (res.success && res.data) {
      set({ activeServerSession: res.data });
      return true;
    }
    return false;
  },

  carregarAbas: async (sessaoId?: string) => {
    const targetSessaoId = sessaoId || get().activeSessaoId;
    if (!targetSessaoId || !window.desktopAPI?.abas) return;
    try {
      const res = await window.desktopAPI.abas.listBySessao(targetSessaoId);
      if (res.success && res.data) {
        set({ abas: res.data });
      }
    } catch (err) {
      console.error('[HostStore] Erro ao listar abas:', err);
    }
  },

  criarAba: async (payload: { titulo: string; tipo: 'blank' | 'image' | 'pdf' | 'video' | 'audio'; asset_id?: string | null }) => {
    const { activeSessaoId, abas } = get();
    if (!activeSessaoId || !window.desktopAPI?.abas) return null;
    try {
      const res = await window.desktopAPI.abas.create({
        sessao_id: activeSessaoId,
        titulo: payload.titulo,
        tipo: payload.tipo,
        ordem: abas.length,
        asset_id: payload.asset_id ?? null,
      });
      if (res.success && res.data) {
        await get().carregarAbas();
        await get().trocarAba(res.data.id);
        return res.data;
      }
    } catch (err) {
      console.error('[HostStore] Erro ao criar aba:', err);
    }
    return null;
  },

  renomearAba: async (id: string, titulo: string) => {
    if (!window.desktopAPI?.abas) return false;
    try {
      const res = await window.desktopAPI.abas.rename({ id, novoTitulo: titulo });
      if (res.success) {
        await get().carregarAbas();
        return true;
      }
    } catch (err) {
      console.error('[HostStore] Erro ao renomear aba:', err);
    }
    return false;
  },

  reordenarAbas: async (abaIdsEmOrdem: string[]) => {
    const { activeSessaoId } = get();
    if (!activeSessaoId || !window.desktopAPI?.abas) return false;
    try {
      const res = await window.desktopAPI.abas.reorder({ sessaoId: activeSessaoId, abaIdsEmOrdem });
      if (res.success) {
        await get().carregarAbas();
        return true;
      }
    } catch (err) {
      console.error('[HostStore] Erro ao reordenar abas:', err);
    }
    return false;
  },

  removerAba: async (id: string) => {
    if (!window.desktopAPI?.abas) return false;
    try {
      const res = await window.desktopAPI.abas.delete(id);
      if (res.success) {
        await get().carregarAbas();
        const { abas, activeAbaId } = get();
        if (activeAbaId === id) {
          const nextAba = abas[0]?.id || 'default';
          await get().trocarAba(nextAba);
        }
        return true;
      }
    } catch (err) {
      console.error('[HostStore] Erro ao remover aba:', err);
    }
    return false;
  },

  mudarPaginaPdf: async (pagina: number) => {
    const { activeAbaId, activeSessaoId } = get();
    if (!activeSessaoId) return false;
    const pag = Math.max(1, pagina);
    set({ pdfPagina: pag });
    if (window.desktopAPI?.serverSession) {
      window.desktopAPI.serverSession.broadcastToGuest({
        type: 'PDF_PAGE',
        payload: { tabId: activeAbaId, pagina: pag },
        tabId: activeAbaId,
        pagina: pag,
        ts: Date.now(),
      });
    }
    const subAbaId = `${activeAbaId}_p${pag}`;
    if (window.desktopAPI?.eventos) {
      try {
        const res = await window.desktopAPI.eventos.obterEstadoAba(activeSessaoId, subAbaId);
        if (res.success && res.data) {
          set({ tabState: res.data });
        } else {
          set({ tabState: createInitialTabState(subAbaId) });
        }
      } catch {
        set({ tabState: createInitialTabState(subAbaId) });
      }
    }
    return true;
  },

  trocarAba: async (abaId: string) => {
    set({ activeAbaId: abaId, pdfPagina: 1 });
    if (window.desktopAPI?.serverSession) {
      await window.desktopAPI.serverSession.switchTab(abaId);
    }
    const { activeSessaoId, abas } = get();
    const aba = abas.find((a) => a.id === abaId);
    if (aba?.asset_id && window.desktopAPI?.assets) {
      try {
        const aRes = await window.desktopAPI.assets.get(aba.asset_id);
        if (aRes.success && aRes.data) {
          set({ activeAsset: aRes.data });
        } else {
          set({ activeAsset: null });
        }
      } catch {
        set({ activeAsset: null });
      }
    } else {
      set({ activeAsset: null });
    }

    if (activeSessaoId && window.desktopAPI?.eventos) {
      try {
        const contextAbaId = aba?.tipo === 'pdf' ? `${abaId}_p1` : abaId;
        const res = await window.desktopAPI.eventos.obterEstadoAba(activeSessaoId, contextAbaId);
        if (res.success && res.data) {
          set({ tabState: res.data });
        } else {
          set({ tabState: createInitialTabState(contextAbaId) });
        }
      } catch (err) {
        console.error('[HostStore] Erro ao carregar estado da nova aba:', err);
      }
    }
    return true;
  },

  aplicarEventoRemoto: (event: GuestEventDTO): boolean => {
    // 1. Validação básica de envelope
    if (!event || typeof event !== 'object') {
      diagLog('aplicarEventoRemoto_descarte', { motivo: 'EVENTO_INVALIDO' });
      return false;
    }

    // 2. Quadro em modo somente leitura: bloqueia sumariamente qualquer evento remoto (D17.2.3)
    if (get().quadroSomenteLeitura) {
      diagLog('aplicarEventoRemoto_descarte', {
        motivo: 'QUADRO_SOMENTE_LEITURA',
        tipo: event.type,
        sessaoId: event.sessaoId,
        abaId: event.abaId,
      });
      return false;
    }

    // 3. Validação estrita de sessaoId da autoridade (obrigatório, string não-vazia) (D17.2.3)
    if (typeof event.sessaoId !== 'string' || !event.sessaoId.trim()) {
      diagLog('aplicarEventoRemoto_descarte', {
        motivo: 'SESSAO_ID_INVALIDO',
        tipo: event.type,
        sessaoId: event.sessaoId,
      });
      return false;
    }

    // 4. Tipo de evento deve estar na allowlist estrita do Guest (ADR-011) via isAcaoPermitidaGuest (M9.1)
    if (typeof event.type !== 'string' || !isAcaoPermitidaGuest(event.type)) {
      diagLog('aplicarEventoRemoto_descarte', {
        motivo: 'TIPO_NAO_PERMITIDO',
        tipo: event.type,
        sessaoId: event.sessaoId,
      });
      return false;
    }

    // 5. sessaoId do evento deve coincidir com a sessão ativa aberta na tela (D17.2.3)
    const { activeSessaoId, activeAbaId } = get();
    if (!activeSessaoId || event.sessaoId !== activeSessaoId) {
      diagLog('aplicarEventoRemoto_descarte', {
        motivo: 'SESSAO_DIVERGENTE',
        eventSessaoId: event.sessaoId,
        activeSessaoId,
        tipo: event.type,
      });
      return false;
    }

    // 6. abaId do evento deve coincidir com a aba ativa aberta na tela (D17.2.3 e M9.2)
    const rawPayloadObj = (typeof event.payload === 'object' && event.payload) ? event.payload as Record<string, unknown> : null;
    const eventAbaId =
      (typeof event.abaId === 'string' && event.abaId.trim() ? event.abaId.trim() : undefined) ||
      (rawPayloadObj && typeof rawPayloadObj.abaId === 'string' && rawPayloadObj.abaId.trim()
        ? rawPayloadObj.abaId.trim()
        : undefined) ||
      'default';

    const { abas, pdfPagina } = get();
    const currentAba = abas.find((a) => a.id === activeAbaId);
    const expectedAbaId = currentAba?.tipo === 'pdf' ? `${activeAbaId}_p${pdfPagina}` : activeAbaId;

    if (eventAbaId !== activeAbaId && eventAbaId !== expectedAbaId) {
      diagLog('aplicarEventoRemoto_descarte', {
        motivo: 'ABA_DIVERGENTE',
        eventAbaId,
        activeAbaId,
        tipo: event.type,
      });
      // Evento de outra aba foi persistido pela autoridade (M9.2).
      // Ao trocar de aba, obterEstadoAba restaura sem perda.
      return false;
    }

    // 7. Controle local de privacidade: GUEST_MUTED
    if (event.type === 'GUEST_MUTED') {
      const rawPayload = event.payload;
      const parsedPayload =
        typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
      const isMuted = Boolean(parsedPayload?.muted ?? event.muted);
      set({ guestMuted: isMuted });
      diagLog('aplicarEventoRemoto_sucesso', {
        tipo: event.type,
        sessaoId: event.sessaoId,
        muted: isMuted,
      });
      return true;
    }

    // 8. Eventos interativos de manipulação do quadro branco (DRAW_ADD, DRAW_HIDE, UNDO, REDO)
    if (
      event.type === 'DRAW_ADD' ||
      event.type === 'DRAW_HIDE' ||
      event.type === 'UNDO' ||
      event.type === 'REDO'
    ) {
      const rawPayload = event.payload;
      let parsedPayload = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          parsedPayload = JSON.parse(rawPayload);
        } catch {
          parsedPayload = rawPayload;
        }
      }

      const ev: WhiteboardEvent = {
        id: (typeof event.id === 'string' && event.id) ? event.id : generateUUID(),
        sessao_id: event.sessaoId,
        aba_id: eventAbaId,
        tipo: event.type,
        payload: (parsedPayload && typeof parsedPayload === 'object')
          ? (parsedPayload as Record<string, unknown>)
          : (typeof parsedPayload === 'string' ? parsedPayload : {}),
        autor: 'guest',
        criado_em: typeof event.ts === 'number' ? event.ts : Date.now(),
      };

      const nextState = reduceEvent(get().tabState, ev);
      set({ tabState: nextState });

      diagLog('aplicarEventoRemoto_sucesso', {
        tipo: event.type,
        sessaoId: event.sessaoId,
        abaId: eventAbaId,
      });
      return true;
    }

    return false;
  },
}));

if (typeof window !== 'undefined') {
  (window as any).__useHostStore = useHostStore;
}

