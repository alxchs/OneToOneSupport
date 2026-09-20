import * as QRCode from 'qrcode';
import { SessionManager, ServerSessionState } from './session-manager';
import { startHttpServer, HttpServerHandle } from './http';
import { createWebSocketServer, WsServerHandle } from './ws';
import { getLanInterfaces, getDefaultLanIp, LanInterface } from './network';
import { buildInviteUrl } from '../../src/shared/crypto/invite';
import { EventoService } from '../services/evento.service';

export interface ServerSessionInfo {
  sessaoId: string;
  atendidoId: string;
  status: ServerSessionState;
  port: number;
  selectedIp: string;
  availableIps: LanInterface[];
  inviteUrl: string;
  qrDataUrl: string;
  guestConnected: boolean;
  screenLocked: boolean;
  mediaUnlocked: boolean;
}

/**
 * Controlador de Sessão Remota do Servidor (Main Process)
 * Orquestra o ciclo de vida do HTTP Express, WebSocket, SessionManager e geração de Convites com QR Code.
 */
export class ServerSessionController {
  private sessionManager: SessionManager | null = null;
  private httpHandle: HttpServerHandle | null = null;
  private wsHandle: WsServerHandle | null = null;

  private selectedIp: string = '';
  private inviteUrl: string = '';
  private qrDataUrl: string = '';

  private statusListeners: Array<(info: ServerSessionInfo | null) => void> = [];
  private guestEventListeners: Array<(event: any) => void> = [];

  constructor() {
    this.selectedIp = getDefaultLanIp();
  }

  public getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  public getWsHandle(): WsServerHandle | null {
    return this.wsHandle;
  }

  public listIps(): LanInterface[] {
    return getLanInterfaces();
  }

  public onStatusChange(listener: (info: ServerSessionInfo | null) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  public onGuestEvent(listener: (event: any) => void): () => void {
    this.guestEventListeners.push(listener);
    return () => {
      this.guestEventListeners = this.guestEventListeners.filter((l) => l !== listener);
    };
  }

  private notifyGuestEvent(event: any): void {
    for (const listener of this.guestEventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ServerSessionController] Erro no listener de evento do guest:', err);
      }
    }
  }

  private handleGuestEvent(envelope: any): void {
    // Se for evento de desenho, persiste no banco de dados
    if (
      envelope.type === 'DRAW_ADD' ||
      envelope.type === 'DRAW_HIDE' ||
      envelope.type === 'CLEAR_TAB'
    ) {
      try {
        const eventoService = new EventoService();
        const payloadData = envelope.payload?.data ?? envelope.payload;
        const payloadStr = typeof payloadData === 'string' ? payloadData : JSON.stringify(payloadData);
        eventoService.gravarEvento({
          sessao_id: this.sessionManager?.sessaoId || '',
          aba_id: envelope.payload?.abaId || 'default',
          tipo: envelope.type,
          payload: payloadStr,
          autor: 'guest',
        });
      } catch (err) {
        console.error('[ServerSessionController] Erro ao gravar evento do guest no SQLite:', err);
      }
    }

    this.notifyGuestEvent(envelope);
  }

  private notifyStatusChange(): void {
    const current = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('[ServerSessionController] Erro no listener de status:', err);
      }
    }
  }

  /**
   * Inicia o servidor HTTP + WS dinâmico para uma sessão de atendimento
   */
  public async startSession(
    sessaoId: string,
    atendidoId: string,
    preferredIp?: string
  ): Promise<ServerSessionInfo> {
    // Encerra sessão anterior se existente
    if (this.sessionManager || this.httpHandle) {
      await this.stopSession();
    }

    const availableIps = this.listIps();
    if (preferredIp && (preferredIp === '127.0.0.1' || availableIps.some((i) => i.ip === preferredIp))) {
      this.selectedIp = preferredIp;
    } else {
      this.selectedIp = getDefaultLanIp();
    }

    // 1. Cria o SessionManager
    this.sessionManager = new SessionManager({
      sessaoId,
      atendidoId,
    });

    // 2. Inicia o servidor HTTP em porta dinâmica (0) ouvindo em 0.0.0.0 (LAN)
    this.httpHandle = await startHttpServer(this.sessionManager, 0, '0.0.0.0');

    // 3. Monta o WebSocket Server acoplado ao servidor HTTP com listener de eventos do Guest
    this.wsHandle = createWebSocketServer({
      server: this.httpHandle.server,
      sessionManager: this.sessionManager,
      onGuestEvent: (envelope) => {
        this.handleGuestEvent(envelope);
      },
    });

    // 4. Monta o link de convite e o QR Code
    await this.updateInviteAndQr();

    // 5. Escuta mudanças de estado da sessão
    this.sessionManager.onStateChange(() => {
      this.notifyStatusChange();
    });

    this.notifyStatusChange();
    return this.getStatus()!;
  }

  /**
   * Altera manualmente o IP da LAN selecionado para o convite e regenera o QR Code
   */
  public async setIp(ip: string): Promise<ServerSessionInfo> {
    this.selectedIp = ip;
    if (this.sessionManager && this.httpHandle) {
      await this.updateInviteAndQr();
      this.notifyStatusChange();
    }
    const current = this.getStatus();
    if (!current) {
      throw new Error('Nenhuma sessão de servidor ativa.');
    }
    return current;
  }

  /**
   * Atualiza a URL do convite e gera o Data URL do QR Code
   */
  private async updateInviteAndQr(): Promise<void> {
    if (!this.sessionManager || !this.httpHandle) return;

    const port = this.httpHandle.port;
    const baseUrl = `http://${this.selectedIp}:${port}`;
    const token = this.sessionManager.getGuestToken();
    const pk_h = this.sessionManager.getHostPublicKeyBase64Url();

    // buildInviteUrl garante que pk_h trafega no fragmento # e NUNCA em path/query
    this.inviteUrl = buildInviteUrl({
      baseUrl,
      token,
      hostPublicKey: pk_h,
    });

    // Geração local de QR Code via ADR-008
    this.qrDataUrl = await QRCode.toDataURL(this.inviteUrl, {
      margin: 2,
      scale: 6,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a', // Slate escuro elegante
        light: '#ffffff',
      },
    });
  }

  /**
   * Encerra a sessão atual e libera as portas de rede e memória sensível
   */
  public async stopSession(): Promise<void> {
    if (this.sessionManager) {
      this.sessionManager.encerrar();
      this.sessionManager = null;
    }

    if (this.wsHandle) {
      await this.wsHandle.close();
      this.wsHandle = null;
    }

    if (this.httpHandle) {
      await this.httpHandle.close();
      this.httpHandle = null;
    }

    this.inviteUrl = '';
    this.qrDataUrl = '';
    this.notifyStatusChange();
  }

  /**
   * Retorna o estado atual completo da sessão do servidor
   */
  public getStatus(): ServerSessionInfo | null {
    if (!this.sessionManager || !this.httpHandle) {
      return null;
    }

    return {
      sessaoId: this.sessionManager.sessaoId,
      atendidoId: this.sessionManager.atendidoId,
      status: this.sessionManager.getState(),
      port: this.httpHandle.port,
      selectedIp: this.selectedIp,
      availableIps: this.listIps(),
      inviteUrl: this.inviteUrl,
      qrDataUrl: this.qrDataUrl,
      guestConnected: this.sessionManager.isGuestConnected(),
      screenLocked: this.sessionManager.isScreenLocked(),
      mediaUnlocked: this.sessionManager.isMediaUnlocked(),
    };
  }

  /**
   * Envia uma mensagem cifrada para o Guest conectado
   */
  public broadcastToGuest(innerEvent: Record<string, unknown>): boolean {
    if (!this.wsHandle) return false;
    return this.wsHandle.sendEncryptedToGuest(innerEvent);
  }

  /**
   * Altera o bloqueio de tela do Guest e emite o evento LOCK_SCREEN
   */
  public lockScreen(locked: boolean): ServerSessionInfo {
    if (!this.sessionManager) {
      throw new Error('Nenhuma sessão de servidor ativa.');
    }
    this.sessionManager.setScreenLocked(locked);
    this.broadcastToGuest({
      type: 'LOCK_SCREEN',
      locked,
      ts: Date.now(),
    });
    this.notifyStatusChange();
    return this.getStatus()!;
  }

  /**
   * Altera o desbloqueio de mídia do Guest e emite o evento UNLOCK_MEDIA
   */
  public unlockMedia(unlocked: boolean): ServerSessionInfo {
    if (!this.sessionManager) {
      throw new Error('Nenhuma sessão de servidor ativa.');
    }
    this.sessionManager.setMediaUnlocked(unlocked);
    this.broadcastToGuest({
      type: 'UNLOCK_MEDIA',
      unlocked,
      ts: Date.now(),
    });
    this.notifyStatusChange();
    return this.getStatus()!;
  }

  /**
   * Notifica troca sincronizada de aba ativa para o Guest
   */
  public switchTab(abaId: string): boolean {
    return this.broadcastToGuest({
      type: 'TAB_SWITCH',
      abaId,
      ts: Date.now(),
    });
  }
}

export const serverSessionController = new ServerSessionController();
