import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  IPC_CHANNELS,
  IPCResult,
  RelatorioGeradoDTO,
  RevisaoDTO,
} from '../../src/shared/ipc-contract';
import { relatorioService } from '../services/relatorio.service';
import { isValidId } from '../services/evento.service';
import { getDefaultArquivoRootDir } from '../services/asset.service';

export async function handleRelatorioGerar(payload: unknown): Promise<IPCResult<RelatorioGeradoDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido para geração de relatório.' };
  }
  const p = payload as { sessaoId?: unknown; numeroVersao?: unknown };

  if (typeof p.sessaoId !== 'string' || !p.sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }

  const sessaoId = p.sessaoId.trim();
  if (!isValidId(sessaoId)) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessaoId inválido: deve conter apenas letras, números, "_" ou "-".',
    };
  }

  let numeroVersao: number | undefined;
  if (p.numeroVersao !== undefined && p.numeroVersao !== null) {
    if (
      typeof p.numeroVersao !== 'number' ||
      !Number.isInteger(p.numeroVersao) ||
      p.numeroVersao <= 0
    ) {
      return {
        success: false,
        error: 'VALIDATION',
        message: 'numeroVersao inválido: deve ser um número inteiro positivo.',
      };
    }
    numeroVersao = p.numeroVersao;
  }

  return relatorioService.gerar(sessaoId, numeroVersao);
}

export async function handleRelatorioListarRevisoes(payload: unknown): Promise<IPCResult<RevisaoDTO[]>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as { sessaoId?: unknown };

  if (typeof p.sessaoId !== 'string' || !p.sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }

  const sessaoId = p.sessaoId.trim();
  if (!isValidId(sessaoId)) {
    return {
      success: false,
      error: 'VALIDATION',
      message: 'sessaoId inválido: deve conter apenas letras, números, "_" ou "-".',
    };
  }

  return relatorioService.listarRevisoes(sessaoId);
}

export async function handleRelatorioAbrir(payload: unknown): Promise<IPCResult<boolean>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const p = payload as { caminho?: unknown };

  if (typeof p.caminho !== 'string' || !p.caminho.trim()) {
    return { success: false, error: 'VALIDATION', message: 'Caminho do arquivo é obrigatório.' };
  }

  const caminho = p.caminho.trim();
  if (!caminho.toLowerCase().endsWith('.pdf')) {
    return { success: false, error: 'VALIDATION', message: 'Apenas arquivos PDF podem ser abertos.' };
  }

  // Defesa em profundidade: só abre PDF dentro da raiz de arquivamento do próprio app (mesmo padrão
  // do achado da Fase 08 para sessaoId) — mesmo não exposto hoje pela UI, essa borda de IPC não pode
  // virar um "abrir qualquer .pdf existente no disco" caso um chamador futuro passe um caminho não confiável.
  const raizArquivo = path.resolve(getDefaultArquivoRootDir());
  const caminhoResolvido = path.resolve(caminho);
  const dentroDaRaiz =
    caminhoResolvido === raizArquivo || caminhoResolvido.startsWith(raizArquivo + path.sep);
  if (!dentroDaRaiz) {
    return { success: false, error: 'VALIDATION', message: 'Caminho fora da área de relatórios do aplicativo.' };
  }

  if (!fs.existsSync(caminho)) {
    return { success: false, error: 'NOT_FOUND', message: 'Arquivo do relatório não encontrado no disco.' };
  }

  try {
    const errorMsg = await shell.openPath(caminho);
    if (errorMsg) {
      return { success: false, error: 'INTERNAL_ERROR', message: errorMsg };
    }
    return { success: true, data: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: 'INTERNAL_ERROR', message: msg };
  }
}

export function registerRelatorioIpc(): void {
  ipcMain.handle(IPC_CHANNELS.RELATORIO_GERAR, (_event, payload) => handleRelatorioGerar(payload));
  ipcMain.handle(IPC_CHANNELS.RELATORIO_LISTAR_REVISOES, (_event, payload) => handleRelatorioListarRevisoes(payload));
  ipcMain.handle(IPC_CHANNELS.RELATORIO_ABRIR, (_event, payload) => handleRelatorioAbrir(payload));
}
