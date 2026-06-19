# NAS Indexer Electron 桌面应用设计文档

> 创建日期：2026-06-19
> 状态：待实现

---

## 1. 项目概述

将 NAS Indexer（现有的 Web 应用）包装为 Electron 桌面应用，实现：
- 一键启动桌面应用，无需打开浏览器
- 系统托盘集成，最小化到托盘运行
- 单实例运行，防止多窗口冲突
- 托盘通知，扫描完成等事件提醒
- 全平台支持（Windows / macOS / Linux）
- Web + Electron 双模式并行

---

## 2. 需求确认

| 项目 | 决定 |
|------|------|
| **目的** | 完整桌面体验：便捷启动、分发、系统集成 |
| **平台** | Windows / macOS / Linux 全平台 |
| **分发** | 自用/内部分发，无需签名/公证 |
| **架构** | Web + Electron 双模式并行 |
| **桌面功能** | 系统托盘 + 单实例运行 + 托盘通知 |
| **配置方式** | 继续使用现有 `config.json` |
| **项目结构** | 集成到现有项目，新增 `electron/` 目录 |

---

## 3. 技术方案

### 3.1 方案选择

采用 **方案 A：最小改动方案** —— Electron 作为"壳"，包装现有的 Express + Vue 应用。

```
electron/main.ts (主进程)
    ↓ 启动 Express server
    ↓ 加载 BrowserWindow → http://localhost:PORT
    ↓ 系统托盘 + 单实例 + 通知
```

**优点**：
- 改动最小，几乎不改动现有代码
- Web 模式完全保留，零风险
- Express server 正常运行，所有 API 无缝可用
- 开发调试时仍可直接用 Web 模式

---

## 4. 项目架构

### 4.1 目录结构

```
nas-indexer/
├── electron/                    # 新增 Electron 模块
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本（IPC 通信）
│   ├── tray.ts                  # 系统托盘管理
│   └── icons/                   # 应用图标（各平台）
│       ├── icon.ico             # Windows
│       ├── icon.icns            # macOS
│       ├── icon.png             # Linux
│
├── src/                         # 现有后端（不变）
├── frontend/                    # 现有前端（不变）
├── package.json                 # 共享依赖，新增 electron 相关
├── electron-builder.yml         # 打包配置（新增）
│
└── scripts/                     # 新增打包脚本
    └── pack-electron.js         # 一键打包脚本
```

### 4.2 核心思路

- `electron/main.ts` 启动 Express server，等待就绪后创建 BrowserWindow 加载前端
- Express 和前端代码完全不动，只作为 Electron 的"内部服务"
- 新增 `npm run electron` 命令启动桌面模式

---

## 5. 主进程核心逻辑

### 5.1 启动流程

```typescript
// electron/main.ts 主进程启动流程
1. 检查单实例锁（防止多窗口冲突）
2. 启动 Express server（沿用现有 src/server.ts）
3. 等待 server 就绪（监听端口）
4. 创建 BrowserWindow，加载 http://localhost:PORT
5. 初始化系统托盘（图标 + 菜单）
6. 监听窗口关闭事件（最小化到托盘而非退出）
7. 监听托盘菜单事件（显示窗口/退出应用）
```

### 5.2 关键功能实现

| 功能 | 实现方式 |
|------|----------|
| **单实例锁** | `app.requestSingleInstanceLock()`，二次启动时聚焦已有窗口 |
| **启动 Express** | 直接 `import` 并调用 server 启动函数 |
| **窗口管理** | 关闭时 `window.hide()`，托盘点击时 `window.show()` |
| **托盘菜单** | 右键菜单：显示窗口、重启服务、打开配置目录、退出应用 |
| **托盘通知** | 扫描完成等事件通过 IPC 推送到主进程，调用 `tray.displayBalloon()` |

---

## 6. 系统托盘设计

### 6.1 托盘图标状态

- **常态**：应用图标
- **运行中**：带进度指示（扫描进行时可选）

### 6.2 托盘右键菜单

```
┌─────────────────────────────────────────────┐
│  ▶ 显示主窗口                                │
│  ─────────────────                          │
│  ⟳ 重启服务                                  │
│  ⚙ 打开配置目录                              │
│  ─────────────────                          │
│  ❌ 退出应用                                  │
└─────────────────────────────────────────────┘
```

### 6.3 托盘通知场景

| 事件 | 通知内容 |
|------|----------|
| 扫描完成 | "扫描完成，新增 X 个文件" |
| 服务异常 | "服务启动失败，请检查配置" |
| NAS 断连 | "NAS 连接中断"（可选） |

### 6.4 实现方式

- 前端通过 IPC 发送通知请求 → 主进程调用 `tray.displayBalloon()`（Windows）或原生通知 API（macOS/Linux）
- 托盘图标使用现有项目 logo 或简单设计

---

## 7. 打包配置

### 7.1 electron-builder.yml 配置

```yaml
appId: nas-indexer
productName: NAS Indexer

# 文件包含
files:
  - dist/**/*          # 后端编译产物
  - frontend/dist/**/* # 前端编译产物
  - electron/**/*      # Electron 主进程
  - profiles/**/*      # 数据目录
  - config.default.json
  - games-config.default.json
  - node_modules/**/*  # 依赖

# 平台配置
win:
  target: nsis         # Windows 安装包
  icon: electron/icons/icon.ico

mac:
  target: dmg          # macOS 安装包
  icon: electron/icons/icon.icns
  # 无需签名/公证（自用/内部分发）

linux:
  target:
    - AppImage         # Linux 通用格式
    - deb              # Debian/Ubuntu
  icon: electron/icons/icon.png

# NSIS 安装选项
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

### 7.2 打包命令

| 命令 | 说明 |
|------|------|
| `npm run build:electron` | 编译 Electron 主进程 + 后端 + 前端 |
| `npm run pack:win` | 打包 Windows 版本 |
| `npm run pack:mac` | 打包 macOS 版本 |
| `npm run pack:linux` | 打包 Linux 版本 |
| `npm run pack:all` | 打包全平台 |

### 7.3 package.json 脚本新增

```json
{
  "scripts": {
    // 现有命令保持不变...

    // Electron 相关命令
    "electron": "electron .",
    "electron:dev": "npm run build && npm run frontend:build && electron .",

    // 打包命令
    "pack": "electron-builder",
    "pack:win": "electron-builder --win",
    "pack:mac": "electron-builder --mac",
    "pack:linux": "electron-builder --linux",
    "pack:all": "electron-builder --win --mac --linux",

    // 一键构建脚本
    "build:electron": "npm run build && npm run frontend:build && electron-builder"
  }
}
```

### 7.4 打包脚本 scripts/pack-electron.js

新增一键打包脚本，功能：
- 自动执行：编译后端 → 编译前端 → 打包 Electron
- 支持 --platform 参数指定平台（win/mac/linux/all）
- 记录打包日志到 build-log.txt

---

## 8. 依赖新增

### 8.1 生产依赖

```json
{
  "dependencies": {
    "electron": "^28.0.0"  // 或当前稳定版本
  }
}
```

### 8.2 开发依赖

```json
{
  "devDependencies": {
    "electron-builder": "^24.9.1"
  }
}
```

---

## 9. 实现优先级

| 优先级 | 任务 | 说明 |
|--------|------|------|
| **P0** | Electron 主进程 | main.ts 核心启动逻辑 |
| **P0** | 单实例锁 | 防止多窗口冲突 |
| **P1** | 系统托盘 | tray.ts 托盘管理 |
| **P1** | 托盘通知 | IPC 通信 + 通知显示 |
| **P2** | 打包配置 | electron-builder.yml |
| **P2** | 应用图标 | 各平台图标文件 |
| **P3** | 打包脚本 | scripts/pack-electron.js |

---

## 10. 测试要点

### 10.1 功能测试

- Electron 启动正常，Express server 就绪后窗口自动打开
- 单实例锁生效，二次启动时聚焦已有窗口
- 关闭窗口时最小化到托盘，托盘点击可恢复
- 托盘菜单各功能正常（显示窗口、重启、退出等）
- 托盘通知在扫描完成时正确显示

### 10.2 打包测试

- Windows 打包生成 .exe 安装包，安装后可正常运行
- macOS 打包生成 .dmg，可正常安装和启动
- Linux 打包生成 AppImage 和 deb，可正常运行
- Web 模式仍可通过 `npm start` 正常启动

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Electron 版本兼容性 | 使用稳定版本（如 v28），测试后再升级 |
| 打包体积过大 | 可后续优化：移除不必要的依赖、使用 asar |
| macOS 未公证警告 | 文档说明用户如何手动绕过（自用/内部分发可接受） |
| 端口冲突 | 主进程检测端口占用，提示用户或自动切换 |

---

## 12. 后续优化方向

| 功能 | 说明 |
|------|------|
| 开机自启 | 添加开机自动启动选项 |
| 快捷键唤醒 | 全局快捷键显示窗口 |
| 自动更新 | 集成 electron-updater（如需正式分发） |
| 原生文件对话框 | 使用 Electron dialog 替代浏览器文件选择 |
| macOS 签名/公证 | 如需公开分发，申请 Apple Developer 账号 |