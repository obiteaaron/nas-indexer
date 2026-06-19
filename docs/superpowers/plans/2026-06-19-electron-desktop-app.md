# NAS Indexer Electron 桌面应用实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 NAS Indexer Web 应用包装为 Electron 桌面应用，实现系统托盘、单实例运行、托盘通知功能。

**Architecture:** Electron 作为"壳"包装现有 Express + Vue 应用。主进程启动 Express server，等待就绪后创建 BrowserWindow 加载前端。系统托盘支持最小化到托盘、托盘菜单和通知。

**Tech Stack:** Electron v33、electron-builder、TypeScript

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 新增 electron 和 electron-builder 依赖，新增 npm scripts |
| `tsconfig.json` | 修改 | 添加 electron 目录到编译范围 |
| `electron/tsconfig.json` | 创建 | Electron 专用 TypeScript 配置 |
| `electron/main.ts` | 创建 | 主进程入口：单实例锁、启动 Express、创建窗口、托盘初始化 |
| `electron/tray.ts` | 创建 | 系统托盘管理：图标、菜单、通知 |
| `electron/preload.ts` | 创建 | 预加载脚本：IPC 暴露给前端 |
| `electron-builder.yml` | 创建 | 打包配置：全平台支持 |
| `scripts/pack-electron.js` | 创建 | 一键打包脚本 |
| `src/server.ts` | 修改 | 导出 startServer 函数供 Electron 调用 |

---

## Task 1: 修改 package.json 添加依赖和脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 electron 和 electron-builder 依赖**

在 `package.json` 中添加：

```json
{
  "dependencies": {
    "electron": "^33.0.0"
  },
  "devDependencies": {
    "electron-builder": "^25.1.8"
  }
}
```

完整修改后的 dependencies 部分：
```json
"dependencies": {
  "adm-zip": "^0.5.17",
  "archiver": "^8.0.0",
  "cors": "^2.8.5",
  "electron": "^33.0.0",
  "express": "^4.22.1",
  "multer": "^2.1.1",
  "node-cron": "^3.0.3",
  "pino": "^10.3.1",
  "pino-pretty": "^13.1.3",
  "sortablejs": "^1.15.7",
  "sql.js": "^1.14.1",
  "undici": "^8.4.1"
},
```

完整修改后的 devDependencies 部分：
```json
"devDependencies": {
  "@types/cors": "^2.8.19",
  "@types/express": "^5.0.6",
  "@types/jest": "^30.0.0",
  "@types/multer": "^2.1.0",
  "@types/node": "^25.8.0",
  "@types/node-cron": "^3.0.11",
  "@types/sortablejs": "^1.15.9",
  "@typescript-eslint/eslint-plugin": "^8.59.3",
  "@typescript-eslint/parser": "^8.59.3",
  "electron-builder": "^25.1.8",
  "eslint": "^8.56.0",
  "jest": "^29.7.0",
  "pkg": "^5.8.1",
  "prettier": "^3.2.0",
  "ts-jest": "^29.4.9",
  "ts-node": "^10.9.2",
  "typescript": "^6.0.3"
},
```

- [ ] **Step 2: 添加 Electron 相关 npm scripts**

在 `scripts` 部分添加以下命令：

```json
"scripts": {
  "start": "node scripts/start.js",
  "dev": "ts-node src/server.ts",
  "dev:watch": "nodemon --exec ts-node src/server.ts",
  "build": "tsc",
  "build:watch": "tsc --watch",
  "build:dist": "npm run build && node scripts/create-dist.js",
  "lint": "eslint src/ tests/ --ext .js,.ts",
  "lint:fix": "eslint src/ tests/ --ext .js,.ts --fix",
  "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"scripts/**/*.js\"",
  "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" \"scripts/**/*.js\"",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "electron": "electron .",
  "electron:dev": "npm run build && electron .",
  "build:electron": "npm run build && tsc -p electron/tsconfig.json && electron-builder",
  "pack:win": "npm run build && tsc -p electron/tsconfig.json && electron-builder --win",
  "pack:mac": "npm run build && tsc -p electron/tsconfig.json && electron-builder --mac",
  "pack:linux": "npm run build && tsc -p electron/tsconfig.json && electron-builder --linux",
  "pack:all": "npm run build && tsc -p electron/tsconfig.json && electron-builder --win --mac --linux"
},
```

- [ ] **Step 3: 修改 main 字段指向 Electron 入口**

将 `"main": "dist/server.js"` 改为：

```json
"main": "dist-electron/main.js",
```

- [ ] **Step 4: 运行 npm install 安装依赖**

```bash
npm install
```

Expected: 安装成功，无错误

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: 添加 electron 和 electron-builder 依赖"
```

---

## Task 2: 创建 Electron TypeScript 配置

**Files:**
- Create: `electron/tsconfig.json`

- [ ] **Step 1: 创建 electron 目录**

```bash
mkdir electron
```

- [ ] **Step 2: 创建 electron/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "../dist-electron",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noImplicitAny": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["./**/*"],
  "exclude": ["../node_modules", "../dist", "../dist-electron"]
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/tsconfig.json
git commit -m "feat: 添加 Electron TypeScript 配置"
```

---

## Task 3: 修改 server.ts 导出启动函数

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 将 app.listen 改为可导出的函数**

在文件末尾，将现有的 `app.listen()` 改为导出函数。替换文件末尾代码：

原代码（第 191-207 行）：
```typescript
app.listen(PORT, async () => {
  await initDatabase();

  // 初始化代理（用于 Steam API 刮削）
  initProxy();

  logger.info('\n🚀 NAS Indexer v1.3.2 服务已启动');
  logger.info('📍 访问地址: http://localhost:%d', PORT);
  logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

  const config: Config = loadConfig();
  const storagePath: string = getStoragePath(config);
  ensureGamesDirs(storagePath);
  logger.info('📂 当前存储目录: %s', storagePath);

  scheduleScan(config);
});
```

改为：
```typescript
let server: ReturnType<typeof app.listen> | null = null;

export async function startServer(customPort?: number): Promise<number> {
  const port = customPort || PORT;
  
  return new Promise((resolve, reject) => {
    server = app.listen(port, async () => {
      try {
        await initDatabase();
        initProxy();

        logger.info('\n🚀 NAS Indexer v1.5.8 服务已启动');
        logger.info('📍 访问地址: http://localhost:%d', port);
        logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

        const config: Config = loadConfig();
        const storagePath: string = getStoragePath(config);
        ensureGamesDirs(storagePath);
        logger.info('📂 当前存储目录: %s', storagePath);

        scheduleScan(config);
        
        resolve(port);
      } catch (err) {
        reject(err);
      }
    });
    
    server.on('error', (err) => {
      reject(err);
    });
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

export function getPort(): number {
  return PORT;
}

// 独立运行时（非 Electron 模式）自动启动
if (require.main === module) {
  startServer().catch((err) => {
    logger.error('服务启动失败: %s', (err as Error).message);
    process.exit(1);
  });
}
```

- [ ] **Step 2: 运行编译验证**

```bash
npm run build
```

Expected: 编译成功，无错误

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: 导出 startServer 函数供 Electron 调用"
```

---

## Task 4: 创建 Electron 主进程入口

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: 创建 electron/main.ts**

```typescript
import { app, BrowserWindow, Menu, MenuItemConstructorOptions, dialog } from 'electron';
import * as path from 'path';
import { TrayManager } from './tray';

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
    if (!app.isQuitting) {
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
  app.isQuitting = true;
  TrayManager.destroy();
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: 创建 Electron 主进程入口"
```

---

## Task 5: 创建系统托盘管理模块

**Files:**
- Create: `electron/tray.ts`

- [ ] **Step 1: 创建 electron/tray.ts**

```typescript
import { app, BrowserWindow, Tray, Menu, MenuItemConstructorOptions, nativeImage, Notification } from 'electron';
import * as path from 'path';

export class TrayManager {
  private static tray: Tray | null = null;
  private static _mainWindow: BrowserWindow | null = null;
  private static iconPath: string;

  public static get mainWindow(): BrowserWindow | null {
    return this._mainWindow;
  }

  public static setMainWindow(window: BrowserWindow): void {
    this._mainWindow = window;
  }

  static init(): void {
    this.iconPath = path.join(__dirname, 'icons', 'icon.png');
    
    // 创建托盘图标
    let icon: nativeImage;
    
    if (process.platform === 'win32') {
      // Windows 使用 .ico 文件（如果存在）
      const icoPath = path.join(__dirname, 'icons', 'icon.ico');
      try {
        icon = nativeImage.createFromPath(icoPath);
      } catch {
        icon = nativeImage.createFromPath(this.iconPath);
      }
    } else if (process.platform === 'darwin') {
      // macOS 使用 .icns 文件（如果存在），或调整 PNG 大小
      const icnsPath = path.join(__dirname, 'icons', 'icon.icns');
      try {
        icon = nativeImage.createFromPath(icnsPath);
      } catch {
        icon = nativeImage.createFromPath(this.iconPath).resize({ width: 16, height: 16 });
      }
    } else {
      // Linux 直接使用 PNG
      icon = nativeImage.createFromPath(this.iconPath);
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('NAS Indexer');

    // 设置托盘菜单
    const contextMenu = this.createContextMenu();
    this.tray.setContextMenu(contextMenu);

    // 点击托盘图标显示窗口（Windows/Linux）
    if (process.platform !== 'darwin') {
      this.tray.on('click', () => {
        this.showMainWindow();
      });
    }
  }

  private static createContextMenu(): Menu {
    const menuItems: MenuItemConstructorOptions[] = [
      {
        label: '显示主窗口',
        click: () => this.showMainWindow(),
      },
      {
        type: 'separator',
      },
      {
        label: '重启服务',
        click: () => this.restartServer(),
      },
      {
        label: '打开配置目录',
        click: () => this.openConfigDirectory(),
      },
      {
        type: 'separator',
      },
      {
        label: '退出应用',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ];

    return Menu.buildFromTemplate(menuItems);
  }

  private static showMainWindow(): void {
    if (this._mainWindow) {
      if (this._mainWindow.isMinimized()) {
        this._mainWindow.restore();
      }
      this._mainWindow.show();
      this._mainWindow.focus();
    }
  }

  private static restartServer(): void {
    // 重启服务：关闭窗口，重新启动 Express，再打开窗口
    if (this._mainWindow) {
      this._mainWindow.hide();
    }
    
    // 这里可以添加服务重启逻辑
    // 目前简单实现：显示窗口
    this.showMainWindow();
  }

  private static openConfigDirectory(): void {
    // 打开配置目录（profiles）
    const projectRoot = path.dirname(path.dirname(__dirname));
    const profilesPath = path.join(projectRoot, 'profiles');
    
    // 使用 Electron 的 shell.openPath 打开目录
    import('electron').then(({ shell }) => {
      shell.openPath(profilesPath);
    });
  }

  static showNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: this.iconPath,
      });
      notification.show();
    }
  }

  static destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

// 扩展 App 类型，添加 isQuitting 属性
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/tray.ts
git commit -m "feat: 创建系统托盘管理模块"
```

---

## Task 6: 创建预加载脚本

**Files:**
- Create: `electron/preload.ts`

- [ ] **Step 1: 创建 electron/preload.ts**

```typescript
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
```

- [ ] **Step 2: 在 main.ts 中添加 IPC 处理**

在 `electron/main.ts` 中添加以下代码（在 `bootstrap` 函数之前）：

```typescript
// IPC 处理
import { ipcMain } from 'electron';

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('show-notification', (_event, data: { title: string; body: string }) => {
  TrayManager.showNotification(data.title, data.body);
});
```

同时在文件顶部导入语句区域添加：
```typescript
import { ipcMain } from 'electron';
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts electron/main.ts
git commit -m "feat: 创建预加载脚本和 IPC 处理"
```

---

## Task 7: 创建应用图标文件

**Files:**
- Create: `electron/icons/icon.png`
- Create: `electron/icons/icon.ico`
- Create: `electron/icons/icon.icns`

- [ ] **Step 1: 创建 icons 目录**

```bash
mkdir electron/icons
```

- [ ] **Step 2: 创建一个简单的 PNG 图标**

使用 Node.js 生成一个简单的图标（或使用现有 logo）：

```bash
# 暂时创建一个占位图标文件
# 实际图标需要后续设计或使用项目 logo
touch electron/icons/icon.png
```

注意：实际图标需要设计或从项目 logo 转换。可以使用在线工具生成：
- PNG → ICO: https://convertio.co/png-ico/
- PNG → ICNS: https://iconverticons.com/online/

推荐图标尺寸：
- PNG: 512x512 (通用)
- ICO: 256x256 (Windows)
- ICNS: 512x512 (macOS)

- [ ] **Step 3: Commit**

```bash
git add electron/icons/
git commit -m "feat: 添加应用图标占位文件"
```

---

## Task 8: 创建打包配置文件

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: 创建 electron-builder.yml**

```yaml
appId: nas-indexer
productName: NAS Indexer
copyright: MIT License

# 入口文件
main: dist-electron/main.js

# 包含的文件
files:
  - dist/**/*
  - dist-electron/**/*
  - frontend/dist/**/*
  - profiles/**/*
  - config.default.json
  - games-config.default.json
  - node_modules/**/*
  - "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}"
  - "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}"
  - "!**/node_modules/*.d.ts"
  - "!**/node_modules/.bin"
  - "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}"
  - "!.editorconfig"
  - "!**/._*"
  - "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes}"

# Windows 配置
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: electron/icons/icon.ico

# NSIS 安装配置
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  installerIcon: electron/icons/icon.ico
  uninstallerIcon: electron/icons/icon.ico
  installerHeaderIcon: electron/icons/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: NAS Indexer

# macOS 配置
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: electron/icons/icon.icns
  category: public.app-category.utilities
  hardenedRuntime: false
  gatekeeperAssess: false

# Linux 配置
linux:
  target:
    - target: AppImage
      arch:
        - x64
    - target: deb
      arch:
        - x64
  icon: electron/icons/icon.png
  category: Utility
  maintainer: nomadic
  synopsis: NAS 文件索引与管理工具
  description: 离线文件索引、搜索、预览、管理

# 输出目录
directories:
  output: release
  buildResources: electron/icons

# 压缩配置
compression: normal
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: 创建 Electron 打包配置"
```

---

## Task 9: 创建一键打包脚本

**Files:**
- Create: `scripts/pack-electron.js`

- [ ] **Step 1: 创建 scripts/pack-electron.js**

```javascript
#!/usr/bin/env node

/**
 * Electron 一键打包脚本
 * 
 * 使用方法:
 *   node scripts/pack-electron.js            # 打包当前平台
 *   node scripts/pack-electron.js --win      # 打包 Windows
 *   node scripts/pack-electron.js --mac      # 打包 macOS
 *   node scripts/pack-electron.js --linux    # 打包 Linux
 *   node scripts/pack-electron.js --all      # 打包全平台
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORMS = {
  win: '--win',
  mac: '--mac',
  linux: '--linux',
  all: '--win --mac --linux'
};

function runCommand(command, description) {
  console.log(`\n📦 ${description}...`);
  console.log(`   执行: ${command}`);
  
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`   ✅ ${description}完成`);
    return true;
  } catch (error) {
    console.error(`   ❌ ${description}失败`);
    console.error(error.message);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const platformArg = args.find(arg => arg.startsWith('--'));
  const platform = platformArg ? platformArg.replace('--', '') : null;
  
  console.log('========================================');
  console.log('   NAS Indexer Electron 打包脚本');
  console.log('========================================');
  console.log(`   目标平台: ${platform || '当前平台'}`);
  console.log(`   工作目录: ${process.cwd()}`);
  console.log('========================================\n');

  // 步骤 1: 编译后端 TypeScript
  if (!runCommand('npm run build', '编译后端 TypeScript')) {
    process.exit(1);
  }

  // 步骤 2: 编译前端 Vue
  if (!runCommand('npm run build --prefix frontend', '编译前端 Vue')) {
    // 如果 frontend 目录下没有独立的 npm，使用项目根目录的命令
    console.log('   尝试使用项目根目录编译前端...');
    if (!runCommand('cd frontend && npm run build', '编译前端 Vue')) {
      process.exit(1);
    }
  }

  // 步骤 3: 编译 Electron 主进程
  if (!runCommand('tsc -p electron/tsconfig.json', '编译 Electron 主进程')) {
    process.exit(1);
  }

  // 步骤 4: 运行 electron-builder
  const builderArgs = platform ? PLATFORMS[platform] : '';
  const builderCommand = builderArgs 
    ? `electron-builder ${builderArgs}` 
    : 'electron-builder';
  
  if (!runCommand(builderCommand, '打包 Electron 应用')) {
    process.exit(1);
  }

  // 输出结果
  console.log('\n========================================');
  console.log('   ✅ 打包完成！');
  console.log('========================================');
  console.log('   输出目录: release/');
  console.log('   查看文件: ls release/');
  console.log('========================================\n');

  // 写入打包日志
  const logPath = path.join(process.cwd(), 'build-log.txt');
  const logContent = `
打包时间: ${new Date().toLocaleString()}
目标平台: ${platform || '当前平台'}
输出目录: release/
`;
  fs.writeFileSync(logPath, logContent);
  console.log(`   日志已写入: ${logPath}`);
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pack-electron.js
git commit -m "feat: 创建一键打包脚本"
```

---

## Task 10: 编译并测试 Electron 应用

**Files:**
- None (测试任务)

- [ ] **Step 1: 编译 Electron 主进程**

```bash
tsc -p electron/tsconfig.json
```

Expected: 编译成功，`dist-electron/` 目录下生成 `main.js`, `tray.js`, `preload.js`

- [ ] **Step 2: 编译后端**

```bash
npm run build
```

Expected: 编译成功，`dist/` 目录下有编译产物

- [ ] **Step 3: 启动 Electron 应用测试**

```bash
npm run electron
```

Expected:
- Express server 启动成功
- Electron 窗口打开并显示前端界面
- 系统托盘图标显示
- 关闭窗口时最小化到托盘

- [ ] **Step 4: 测试单实例锁**

在 Electron 应用运行时，再次执行 `npm run electron`。

Expected: 第二个实例立即退出，第一个实例的窗口被聚焦

- [ ] **Step 5: 测试托盘功能**

- 点击托盘图标 → 窗口显示
- 右键托盘菜单 → 显示主窗口、重启服务、打开配置目录、退出应用

Expected: 所有托盘菜单功能正常

- [ ] **Step 6: 测试 Web 模式仍可用**

关闭 Electron 应用后，执行：

```bash
npm start
```

Expected: Web 模式正常启动，浏览器可访问 http://localhost:3000

---

## Task 11: 更新文档

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `todo-list.md`

- [ ] **Step 1: 更新 CHANGELOG.md**

在文件顶部添加：

```markdown
## [v1.6.0] - 2026-06-20

### 新增功能
- **Electron 桌面应用** - 支持 Windows/macOS/Linux 全平台
- **系统托盘** - 最小化到托盘运行，托盘菜单快捷操作
- **单实例运行** - 防止多窗口冲突
- **托盘通知** - 扫描完成等事件通知提醒
- **一键打包脚本** - scripts/pack-electron.js 支持全平台打包
```

- [ ] **Step 2: 更新 README.md**

在"功能"部分添加：

```markdown
### 桌面应用 (v1.6.0)
- Electron 桌面应用支持（Windows/macOS/Linux）
- 系统托盘集成
- 单实例运行
- 托盘通知
```

在"快速开始"部分添加：

```markdown
## 桌面应用

```bash
# 开发模式启动 Electron
npm run electron:dev

# 打包桌面应用
npm run pack:win    # Windows
npm run pack:mac    # macOS
npm run pack:linux  # Linux
npm run pack:all    # 全平台
```
```

更新版本号：
```markdown
**版本: v1.6.0**
```

- [ ] **Step 3: 更新 ROADMAP.md**

更新"最后更新"日期和"当前版本"：
```markdown
> 最后更新：2026-06-20
> 当前版本：v1.6.0
```

在"阶段六：架构升级"表格中添加：
```markdown
| **P0** | Electron 桌面应用 | ✅ | 支持 Windows/macOS/Linux 全平台 |
```

在"关键文件参考"表格中添加：
```markdown
| Electron 主进程 | `electron/main.ts` | Electron 应用入口 |
| 系统托盘 | `electron/tray.ts` | 托盘图标和菜单管理 |
| 打包配置 | `electron-builder.yml` | electron-builder 配置 |
```

- [ ] **Step 4: 更新 todo-list.md**

更新"最后更新"日期和"版本"：
```markdown
最后更新：2026-06-20
版本：v1.6.0
```

在"已完成功能"部分添加新版本条目：
```markdown
## v1.6.0 (2026-06-20)
- Electron 桌面应用支持
- 系统托盘集成
- 单实例运行
- 托盘通知
- 一键打包脚本
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md ROADMAP.md todo-list.md
git commit -m "docs: 更新文档，记录 Electron 桌面应用功能"
```

---

## Task 12: 最终提交并合并

- [ ] **Step 1: 检查所有文件已提交**

```bash
git status
```

Expected: 无未提交文件

- [ ] **Step 2: 推送分支**

```bash
git push origin feature/electron-desktop
```

- [ ] **Step 3: 创建 Pull Request 或合并到主分支**

根据项目流程进行合并。