import { contextBridge, ipcRenderer } from 'electron';

export interface DisplayMetrics {
  width: number;
  height: number;
  scaleFactor: number;
}

export interface DesktopAPI {
  getScaleFactor: () => Promise<number>;
  getDisplayMetrics: () => Promise<DisplayMetrics>;
  getAppVersion: () => Promise<string>;
}

const desktopAPI: DesktopAPI = {
  getScaleFactor: () => ipcRenderer.invoke('desktop:get-scale-factor'),
  getDisplayMetrics: () => ipcRenderer.invoke('desktop:get-display-metrics'),
  getAppVersion: () => ipcRenderer.invoke('desktop:get-app-version'),
};

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI);
