import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
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
let serverProcess: ChildProcess | null = null;

// IPC 处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('show-notification', (_event, data: { title: string; body: string }) => {
  TrayManager.showNotification(data.title, data.body);
});

// 使用 fork 启动 Express server
async function startExpressServer(): Promise<number> {
  const projectRoot = path.dirname(__dirname);
  const serverPath = path.join(projectRoot, 'dist', 'server.js');

  console.log('启动 server:', serverPath);

  // 使用 fork 启动 server
  serverProcess = fork(serverPath, [], {
    cwd: projectRoot,
    env: { ...process.env, PROJECT_ROOT: projectRoot },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  // 监听 server 进程输出
  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data.toString()}`);
  });

  // 等待 server 就绪
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('Server timeout, assuming started');
      resolve(serverPort);
    }, 5000);

    serverProcess?.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Server process error:', err);
      reject(err);
    });

    serverProcess?.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });
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