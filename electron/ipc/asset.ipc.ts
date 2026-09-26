import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPCResult,
  AssetDTO,
} from '../../src/shared/ipc-contract';
import { assetService } from '../services/asset.service';

export async function handleAssetImport(payload: unknown): Promise<IPCResult<AssetDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido para importação de asset.' };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.sessaoId !== 'string' || !p.sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }

  const originalName = typeof p.originalName === 'string' ? p.originalName.trim() : undefined;

  if (typeof p.sourceBase64 === 'string' && p.sourceBase64.length > 0) {
    const buffer = Buffer.from(p.sourceBase64, 'base64');
    return assetService.importAsset(p.sessaoId.trim(), buffer, originalName);
  }

  if (typeof p.sourcePath === 'string' && p.sourcePath.trim().length > 0) {
    return assetService.importAsset(p.sessaoId.trim(), p.sourcePath.trim(), originalName);
  }

  return {
    success: false,
    error: 'VALIDATION',
    message: 'É necessário fornecer sourcePath ou sourceBase64 para importar o asset.',
  };
}

export async function handleAssetGet(payload: unknown): Promise<IPCResult<AssetDTO>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { id } = payload as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return { success: false, error: 'VALIDATION', message: 'ID do asset é obrigatório.' };
  }
  return assetService.getById(id.trim());
}

export async function handleAssetListBySessao(payload: unknown): Promise<IPCResult<AssetDTO[]>> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'VALIDATION', message: 'Payload inválido.' };
  }
  const { sessaoId } = payload as { sessaoId?: unknown };
  if (typeof sessaoId !== 'string' || !sessaoId.trim()) {
    return { success: false, error: 'VALIDATION', message: 'sessaoId é obrigatório.' };
  }
  return assetService.listBySessao(sessaoId.trim());
}

export function registerAssetIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASSET_IMPORT, (_event, payload) => handleAssetImport(payload));
  ipcMain.handle(IPC_CHANNELS.ASSET_GET, (_event, payload) => handleAssetGet(payload));
  ipcMain.handle(IPC_CHANNELS.ASSET_LIST_BY_SESSAO, (_event, payload) => handleAssetListBySessao(payload));
}
