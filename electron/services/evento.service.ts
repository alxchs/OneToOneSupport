import * as fs from 'fs';
import * as path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from '../db/connection';
import {
  appendEvento,
  countEventosBySessao,
  getEventosSlice,
  EventoInput,
  EventoRecord,
} from '../db/repositories/evento.repo';
import {
  createRevisao,
  getRevisaoByVersao,
  listRevisoesBySessao,
  RevisaoRecord,
} from '../db/repositories/revisao.repo';
import { getConfig } from '../db/repositories/configuracao.repo';
import {
  createInitialTabState,
  reduceEvents,
  TabState,
  WhiteboardEvent,
} from '../../src/shared/events/reducer';

export interface EventoServiceOptions {
  db?: DatabaseType;
  snapshotsDir?: string;
  defaultSnapshotInterval?: number;
}

export interface GravarEventoResult {
  sucesso: boolean;
  evento?: EventoRecord;
  motivo?: string;
  snapshotGerado?: boolean;
}

export function getDefaultSnapshotsDir(): string {
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
  return path.join(appData, 'OneToOneSupport', 'snapshots');
}

/**
 * Serviço de Domínio de Event Sourcing, Snapshots e Revisões Imutáveis (Mestre §4, §8, §9).
 */
export class EventoService {
  private readonly db: DatabaseType;
  private readonly snapshotsDir: string;
  private readonly defaultSnapshotInterval: number;

  constructor(options: EventoServiceOptions = {}) {
    this.db = options.db || getDb();
    this.snapshotsDir = options.snapshotsDir || getDefaultSnapshotsDir();
    this.defaultSnapshotInterval = options.defaultSnapshotInterval || 200;
  }

  /**
   * Obtém o intervalo configurável de snapshots (N) a partir de ConfiguracaoGlobal ou padrão (200).
   */
  public getSnapshotInterval(): number {
    const configVal = getConfig('eventos_snapshot_intervalo', this.db);
    if (configVal) {
      const parsed = parseInt(configVal, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return this.defaultSnapshotInterval;
  }

  /**
   * Valida a autoridade do autor e as permissões de execução (Mestre §4, §11, §16).
   */
  public validarAutorEPermissao(
    tipo: string,
    autor: string,
    screenLocked: boolean = false
  ): { permitido: boolean; motivo?: string } {
    const autorLower = (autor || '').toLowerCase();

    // Se a tela estiver bloqueada pelo Host, Guest não pode emitir nenhuma ação interativa
    if (autorLower === 'guest' && screenLocked) {
      return { permitido: false, motivo: 'SCREEN_LOCKED' };
    }

    // Ações estritamente exclusivas do Host
    if (autorLower === 'guest') {
      if (
        tipo === 'CLEAR_TAB' ||
        tipo === 'LOCK_SCREEN' ||
        tipo === 'UNLOCK_MEDIA' ||
        tipo === 'TAB_SWITCH'
      ) {
        return { permitido: false, motivo: 'FORBIDDEN_ACTION_GUEST' };
      }
    }

    return { permitido: true };
  }

  /**
   * Grava um novo evento após validação rigorosa de permissão, aplicando snapshot se atingir o limiar N.
   */
  public gravarEvento(
    input: EventoInput,
    screenLocked: boolean = false
  ): GravarEventoResult {
    const validacao = this.validarAutorEPermissao(input.tipo, input.autor, screenLocked);
    if (!validacao.permitido) {
      return { sucesso: false, motivo: validacao.motivo };
    }

    const evento = appendEvento(input, this.db);
    const totalEventos = countEventosBySessao(input.sessao_id, this.db);
    const intervalo = this.getSnapshotInterval();

    let snapshotGerado = false;
    if (totalEventos > 0 && totalEventos % intervalo === 0) {
      const abaId = input.aba_id || 'default';
      this.gerarSnapshotAba(input.sessao_id, abaId, totalEventos);
      snapshotGerado = true;
    }

    return { sucesso: true, evento, snapshotGerado };
  }

  /**
   * Salva um arquivo de snapshot físico no disco para uma sessão e aba específicas.
   */
  public salvarSnapshotEmDisco(
    sessaoId: string,
    abaId: string,
    eventoIdx: number,
    state: TabState
  ): void {
    const sessionDir = path.join(this.snapshotsDir, sessaoId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const filePath = path.join(sessionDir, `snapshot_${abaId}_${eventoIdx}.json`);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  /**
   * Procura o snapshot mais recente disponível para a aba até um determinado índice de corte.
   */
  public obterUltimoSnapshot(
    sessaoId: string,
    abaId: string,
    maxEventoIdx?: number
  ): { eventoIdx: number; state: TabState } | null {
    const sessionDir = path.join(this.snapshotsDir, sessaoId);
    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    const files = fs.readdirSync(sessionDir);
    const prefix = `snapshot_${abaId}_`;
    let melhorIdx = -1;
    let melhorArquivo: string | null = null;

    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.json')) {
        const idxStr = f.slice(prefix.length, -5);
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx)) {
          if (maxEventoIdx === undefined || idx <= maxEventoIdx) {
            if (idx > melhorIdx) {
              melhorIdx = idx;
              melhorArquivo = f;
            }
          }
        }
      }
    }

    if (melhorArquivo && melhorIdx >= 0) {
      try {
        const fullPath = path.join(sessionDir, melhorArquivo);
        const content = fs.readFileSync(fullPath, 'utf8');
        const state = JSON.parse(content) as TabState;
        return { eventoIdx: melhorIdx, state };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Apaga todos os snapshots em disco (usado para provar que snapshot é pura otimização e replay produz estado idêntico).
   */
  public apagarTodosSnapshots(sessaoId?: string): void {
    if (sessaoId) {
      const sessionDir = path.join(this.snapshotsDir, sessaoId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } else {
      if (fs.existsSync(this.snapshotsDir)) {
        fs.rmSync(this.snapshotsDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Gera e persiste um snapshot calculado da aba até o evento especificado.
   */
  public gerarSnapshotAba(
    sessaoId: string,
    abaId: string,
    corteIdx?: number
  ): TabState {
    const total = countEventosBySessao(sessaoId, this.db);
    const targetIdx = corteIdx !== undefined ? Math.min(corteIdx, total) : total;

    // Reconstrói até targetIdx usando o snapshot anterior se houver
    const estado = this.reconstruirEstadoAba(sessaoId, abaId, targetIdx);
    this.salvarSnapshotEmDisco(sessaoId, abaId, targetIdx, estado);
    return estado;
  }

  /**
   * Reconstrói o estado completo da aba: Estado = Último Snapshot + Delta de Eventos.
   * Se não houver snapshot, reconstrói do zero a partir de todos os eventos.
   */
  public reconstruirEstadoAba(
    sessaoId: string,
    abaId: string,
    corteEventoIdx?: number
  ): TabState {
    const total = countEventosBySessao(sessaoId, this.db);
    const limiteCorte = corteEventoIdx !== undefined ? Math.min(corteEventoIdx, total) : total;

    // 1. Tenta recuperar o snapshot mais recente anterior ou igual ao corte
    const ultimoSnapshot = this.obterUltimoSnapshot(sessaoId, abaId, limiteCorte);

    let estadoBase: TabState;
    let offsetEventos: number;

    if (ultimoSnapshot) {
      estadoBase = ultimoSnapshot.state;
      offsetEventos = ultimoSnapshot.eventoIdx;
    } else {
      estadoBase = createInitialTabState(abaId);
      offsetEventos = 0;
    }

    // 2. Busca apenas o delta de eventos após o snapshot até o corte solicitado
    const quantidadeDelta = limiteCorte - offsetEventos;
    if (quantidadeDelta > 0) {
      const eventosDelta = getEventosSlice(sessaoId, offsetEventos, quantidadeDelta, this.db);
      // Filtra apenas eventos pertinentes à aba (ou globais de sessão aplicáveis)
      const eventosAba: WhiteboardEvent[] = eventosDelta
        .filter((e) => !e.aba_id || e.aba_id === abaId)
        .map((e) => ({
          id: e.id,
          sessao_id: e.sessao_id,
          aba_id: e.aba_id,
          tipo: e.tipo,
          payload: e.payload,
          autor: e.autor,
          criado_em: e.criado_em,
        }));

      estadoBase = reduceEvents(eventosAba, estadoBase);
    }

    return estadoBase;
  }

  /**
   * Cria um snapshot final e imutável ao encerrar a sessão.
   */
  public consolidarAoEncerrar(sessaoId: string, abasIds: string[]): void {
    const total = countEventosBySessao(sessaoId, this.db);
    for (const abaId of abasIds) {
      this.gerarSnapshotAba(sessaoId, abaId, total);
    }
  }

  /**
   * Salva uma revisão imutável da sessão com `numero_versao + 1` (Mestre §4, §8, §9).
   */
  public salvarRevisao(
    sessaoId: string,
    titulo: string | null,
    autor: string,
    abasIds: string[] = ['default']
  ): RevisaoRecord {
    const totalEventos = countEventosBySessao(sessaoId, this.db);

    // Garante que existe snapshot gerado para todas as abas no ponto exato da revisão
    for (const abaId of abasIds) {
      this.gerarSnapshotAba(sessaoId, abaId, totalEventos);
    }

    // Cria o registro imutável em Sessoes_Revisoes apontando snapshot_evento_idx = totalEventos
    return createRevisao(
      {
        sessao_id: sessaoId,
        snapshot_evento_idx: totalEventos,
        titulo,
        autor,
      },
      this.db
    );
  }

  /**
   * Carrega o estado exato de uma revisão imutável histórica.
   */
  public carregarRevisao(
    sessaoId: string,
    numeroVersao: number,
    abaId: string = 'default'
  ): { revisao: RevisaoRecord; estadoAba: TabState } {
    const revisao = getRevisaoByVersao(sessaoId, numeroVersao, this.db);
    if (!revisao) {
      throw new Error(`Revisão versão ${numeroVersao} não encontrada para a sessão '${sessaoId}'.`);
    }

    const estadoAba = this.reconstruirEstadoAba(sessaoId, abaId, revisao.snapshot_evento_idx);
    return { revisao, estadoAba };
  }

  /**
   * Lista todas as revisões imutáveis de uma sessão.
   */
  public listarRevisoes(sessaoId: string): RevisaoRecord[] {
    return listRevisoesBySessao(sessaoId, this.db);
  }
}
