import { app, BrowserWindow, Tray, Menu, MenuItemConstructorOptions, nativeImage, Notification, shell, NativeImage } from 'electron';
import * as path from 'path';
import { setQuitting } from './types';

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
    // 图标路径：打包后图标在 resources/electron/icons/ 下（extraResources）
    // 未打包时在 __dirname/icons/ 下
    const isPackaged = app.isPackaged;
    this.iconPath = isPackaged
      ? path.join(process.resourcesPath, 'electron', 'icons', 'icon.png')
      : path.join(__dirname, 'icons', 'icon.png');

    // 创建托盘图标
    let icon: NativeImage;

    if (process.platform === 'win32') {
      // Windows 使用 .ico 文件（如果存在）
      const icoPath = isPackaged
        ? path.join(process.resourcesPath, 'electron', 'icons', 'icon.ico')
        : path.join(__dirname, 'icons', 'icon.ico');
      icon = nativeImage.createFromPath(icoPath);
      if (icon.isEmpty()) {
        icon = nativeImage.createFromPath(this.iconPath);
      }
    } else if (process.platform === 'darwin') {
      // macOS 使用 .icns 文件（如果存在），或调整 PNG 大小
      const icnsPath = isPackaged
        ? path.join(process.resourcesPath, 'electron', 'icons', 'icon.icns')
        : path.join(__dirname, 'icons', 'icon.icns');
      icon = nativeImage.createFromPath(icnsPath);
      if (icon.isEmpty()) {
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
          setQuitting(true);
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
    // 打包模式下 profiles 在用户数据目录（userData）
    // 未打包时在项目根目录
    const isPackaged = app.isPackaged;
    const profilesPath = isPackaged
      ? path.join(app.getPath('userData'), 'profiles')
      : path.join(path.dirname(__dirname), 'profiles');

    shell.openPath(profilesPath);
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