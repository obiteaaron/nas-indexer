import { contextBridge, ipcRenderer } from 'electron';

// 暴露给前端的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 发送通知请求
  showNotification: (title: string, body: string) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  // 监听通知事件（从后端推送）
  onNotification: (callback: (data: { title: string; body: string }) => void) => {
    ipcRenderer.on('notification', (_event, data) => callback(data));
  },

  // 移除通知监听
  removeNotificationListener: () => {
    ipcRenderer.removeAllListeners('notification');
  },

  // 获取平台信息
  getPlatform: () => process.platform,

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});