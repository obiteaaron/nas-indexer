import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { TrayManager } from './tray';
import { isQuitting, setQuitting } from './types';

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 已有实例运行，退出
  app.quit();
  process.exit(0);
}

// 第二个实例启动时，聚焦已有窗口
app.on('second-instance', () => {
  if (TrayManager.mainWindow) {
    if (TrayManager.mainWindow.isMinimized()) {
      TrayManager.mainWindow.restore();
    }
    TrayManager.mainWindow.focus();
  }
});

let serverPort: number = 3000;

// IPC 处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('show-notification', (_event, data: { title: string; body: string }) => {
  TrayManager.showNotification(data.title, data.body);
});

// Electron 开发模式下，需要加载编译后的 server
// 动态导入 dist/server.js
async function startExpressServer(): Promise<number> {
  // 设置 PROJECT_ROOT 环境变量
  const projectRoot = path.dirname(path.dirname(__dirname));
  process.env.PROJECT_ROOT = projectRoot;

  // 动态导入编译后的 server
  const { startServer } = await import(path.join(projectRoot, 'dist', 'server.js'));

  try {
    const port = await startServer();
    return port;
  } catch (err) {
    const error = err as Error;
    console.error('Express server 启动失败:', error.message);
    throw err;
  }
}

async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'NAS Indexer',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // 先隐藏，等页面加载完成后再显示
  });

  // 加载前端页面
  const frontendUrl = `http://localhost:${serverPort}`;
  mainWindow.loadURL(frontendUrl);

  // 页面加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭窗口时最小化到托盘，而非退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 开发模式下打开 DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

// 应用启动
async function bootstrap(): Promise<void> {
  try {
    // 启动 Express server
    console.log('正在启动 Express server...');
    serverPort = await startExpressServer();
    console.log(`Express server 已启动，端口: ${serverPort}`);

    // 创建主窗口
    const mainWindow = await createMainWindow();
    TrayManager.setMainWindow(mainWindow);

    // 初始化系统托盘
    TrayManager.init();

    console.log('NAS Indexer Electron 应用已启动');
  } catch (err) {
    const error = err as Error;
    console.error('应用启动失败:', error.message);

    // 显示错误对话框
    dialog.showErrorBox('启动失败', error.message);

    app.quit();
    process.exit(1);
  }
}

// Electron 应用就绪
app.whenReady().then(bootstrap);

// 所有窗口关闭时退出（除非 macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 激活应用时重新创建窗口
app.on('activate', () => {
  if (TrayManager.mainWindow && !TrayManager.mainWindow.isVisible()) {
    TrayManager.mainWindow.show();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  setQuitting(true);
  TrayManager.destroy();
});