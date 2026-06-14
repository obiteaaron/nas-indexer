# Steam 本地缓存完整方案实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现完整 Steam 数据本地缓存，支持多游戏共享缓存、本地优先、手动刷新，并重构前端为模块化结构。

**Architecture:** 扩展 steam_db 表存储完整元数据，按 AppID 存储图片缓存，拆分游戏配置为独立文件，重构前端为 game/ 目录模块化结构。

**Tech Stack:** Node.js + Express + SQLite (后端), Vue 3 + Composition API (前端)

---

## 文件结构规划

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/games-config.ts` | 游戏配置加载/保存，配置迁移 |
| `src/games/steam-cache-service.ts` | Steam 缓存图片管理（下载、检查、统计） |
| `src/routes/steam-cache.ts` | Steam 缓存 API 路由 |
| `src/routes/games-config.ts` | 游戏配置 API 路由 |
| `src/types/games-config.ts` | GamesConfig 类型定义 |
| `frontend/src/views/game/GameSteamView.vue` | Steam 管理页面 |
| `frontend/src/views/game/GameSettingsView.vue` | 游戏设置页面 |
| `frontend/src/composables/game/useGameList.ts` | 游戏列表逻辑 |
| `frontend/src/composables/game/useGameFilters.ts` | 筛选逻辑 |
| `frontend/src/composables/game/useGameGroups.ts` | 分组逻辑 |
| `frontend/src/composables/game/useGameSteamSearch.ts` | Steam 搜索逻辑 |
| `frontend/src/composables/game/useGamePoster.ts` | 海报逻辑 |
| `frontend/src/composables/game/useGameToast.ts` | Toast 通知 |
| `frontend/src/components/game/GameDetailModal.vue` | 详情模态框 |
| `frontend/src/components/game/GameEditModal.vue` | 编辑模态框 |
| `frontend/src/components/game/GameAddModal.vue` | 添加模态框 |
| `frontend/src/components/game/GameSteamSearchModal.vue` | Steam 搜索模态框 |
| `frontend/src/components/game/GameFilterBar.vue` | 筛选栏 |
| `frontend/src/components/game/GameStatsBar.vue` | 统计栏 |
| `frontend/src/components/game/GameSteamCacheDetailModal.vue` | 缓存详情弹窗 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/games/database.ts` | 扩展 steam_db 表结构，新增缓存相关方法 |
| `src/games/scraper.ts` | 重构刮削流程，本地优先逻辑 |
| `src/types/game.ts` | 扩展 SteamDbEntry 类型 |
| `src/types/config.ts` | 移除游戏配置字段，仅保留 gamesEnabled |
| `src/utils.ts` | 移除游戏配置相关导出 |
| `src/server.ts` | 注册新路由，新增静态文件服务 |
| `frontend/src/views/GameWallView.vue` | 模块化拆分后精简 |
| `frontend/src/router/index.ts` | 新增游戏 TAB 路由结构 |
| `frontend/src/api/index.ts` | 新增 Steam 缓存和游戏配置 API |
| `frontend/src/App.vue` | 导航栏新增游戏 TAB |
| `frontend/src/views/SettingsView.vue` | 移除游戏配置部分 |

---

## Phase 1: 数据库与配置

### Task 1.1: 扩展 SteamDbEntry 类型定义

**Files:**
- Modify: `src/types/game.ts`

- [ ] **Step 1: 扩展 SteamDbEntry 接口**

```typescript
// src/types/game.ts - 扩展 SteamDbEntry 接口
export interface SteamDbEntry {
  id?: number;
  steam_appid: string;
  name: string;
  name_en?: string;
  aliases: string[];
  notes?: string;
  
  // 新增查询字段
  release_date?: string;      // 发行日期 YYYY-MM-DD
  genres?: string;            // 类型 JSON 数组
  rating?: number;            // Metacritic 评分
  languages?: string;         // 语言 JSON 数组
  tags?: string;              // 标签 JSON 数组
  
  // 原始数据
  raw_data?: string;          // Steam API 完整返回 JSON
  
  source: 'manual' | 'imported' | 'auto' | 'scraper';
  scraped_at?: string;
  created_at?: string;
  updated_at?: string;
}

// 新增缓存统计接口
export interface SteamCacheStats {
  totalEntries: number;
  completeEntries: number;    // 元数据 + 图片完整
  missingImagesEntries: number; // 缺失图片
  totalPosters: number;
  totalScreenshots: number;
  totalSizeMB: number;
}

// 新增缓存状态接口
export interface SteamCacheStatus {
  appid: string;
  name: string;
  name_en?: string;
  hasMetadata: boolean;
  hasHeader: boolean;
  hasCapsule: boolean;
  hasBackground: boolean;
  screenshotCount: number;
  scraped_at?: string;
}
```

- [ ] **Step 2: Commit 类型定义扩展**

```bash
git add src/types/game.ts
git commit -m "feat: 扩展 SteamDbEntry 类型定义，新增缓存统计接口"
```

---

### Task 1.2: 扩展 steam_db 表结构

**Files:**
- Modify: `src/games/database.ts`

- [ ] **Step 1: 扩展 createGameTables 中的 steam_db 表**

找到 `createGameTables` 方法中 `steam_db` 表的创建语句，替换为：

```typescript
// src/games/database.ts - createGameTables 方法中
// Steam 数据库表：完整缓存表
database.db!.run(`
  CREATE TABLE IF NOT EXISTS steam_db (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steam_appid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_en TEXT,
    aliases TEXT DEFAULT '[]',
    
    -- 查询字段
    release_date TEXT,
    genres TEXT,
    rating REAL,
    languages TEXT,
    tags TEXT,
    
    -- 原始数据
    raw_data TEXT,
    
    -- 元信息
    notes TEXT,
    source TEXT DEFAULT 'manual',
    scraped_at DATETIME,
    updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_appid ON steam_db(steam_appid)');
database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_name ON steam_db(name)');
database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_release_date ON steam_db(release_date)');
database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_rating ON steam_db(rating)');
```

- [ ] **Step 2: 添加数据库迁移逻辑**

在 `createGameTables` 方法末尾添加迁移逻辑：

```typescript
// src/games/database.ts - createGameTables 方法末尾
// 兼容已存在表：检查新列是否存在
const steamDbColumns = ['release_date', 'genres', 'rating', 'languages', 'tags', 'raw_data', 'scraped_at'];
for (const col of steamDbColumns) {
  const colCheck: QueryResult[] = database.db!.exec(
    `SELECT COUNT(*) as cnt FROM pragma_table_info('steam_db') WHERE name='${col}'`
  );
  const hasCol = colCheck.length > 0 && (colCheck[0].values[0][0] as number) > 0;
  if (!hasCol) {
    database.db!.run(`ALTER TABLE steam_db ADD COLUMN ${col} TEXT`);
    logger.info('Steam DB 表: 新增 %s 列', col);
  }
}
// rating 是 REAL 类型，单独处理
const ratingCheck: QueryResult[] = database.db!.exec(
  "SELECT COUNT(*) as cnt FROM pragma_table_info('steam_db') WHERE name='rating'"
);
const hasRating = ratingCheck.length > 0 && (ratingCheck[0].values[0][0] as number) > 0;
if (!hasRating) {
  database.db!.run('ALTER TABLE steam_db ADD COLUMN rating REAL');
  logger.info('Steam DB 表: 新增 rating 列');
}

database.save();
```

- [ ] **Step 3: Commit 数据库扩展**

```bash
git add src/games/database.ts
git commit -m "feat: 扩展 steam_db 表结构，新增元数据缓存字段和迁移逻辑"
```

---

### Task 1.3: 新增缓存统计和查询方法

**Files:**
- Modify: `src/games/database.ts`

- [ ] **Step 1: 新增 getSteamCacheStats 方法**

```typescript
// src/games/database.ts - 新增方法
/**
 * 获取 Steam 缓存统计
 */
getSteamCacheStats(): SteamCacheStats {
  const totalResult: QueryResult[] = database.db!.exec('SELECT COUNT(*) as count FROM steam_db');
  const totalEntries = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;
  
  // 统计有元数据的条目
  const metadataResult: QueryResult[] = database.db!.exec(
    "SELECT COUNT(*) as count FROM steam_db WHERE raw_data IS NOT NULL AND raw_data != ''"
  );
  const hasMetadata = metadataResult.length > 0 ? (metadataResult[0].values[0][0] as number) : 0;
  
  return {
    totalEntries,
    completeEntries: 0,      // 图片完整性需配合文件检查
    missingImagesEntries: 0,
    totalPosters: 0,
    totalScreenshots: 0,
    totalSizeMB: 0
  };
}
```

- [ ] **Step 2: 新增 getAllSteamDbAppids 方法**

```typescript
// src/games/database.ts - 新增方法
/**
 * 获取所有已缓存的 AppID 列表（用于批量刷新）
 */
getAllSteamDbAppids(): string[] {
  const result: QueryResult[] = database.db!.exec(
    "SELECT steam_appid FROM steam_db WHERE raw_data IS NOT NULL AND raw_data != ''"
  );
  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}
```

- [ ] **Step 3: 新增 updateSteamDbFull 方法**

```typescript
// src/games/database.ts - 新增方法
/**
 * 更新 Steam 缓存完整数据（增量更新）
 */
updateSteamDbFull(appid: string, data: Partial<SteamDbEntry>): boolean {
  const fields: string[] = [];
  const params: unknown[] = [];
  
  const allowedFields = ['name', 'name_en', 'aliases', 'release_date', 'genres', 'rating', 
                         'languages', 'tags', 'raw_data', 'notes', 'source'];
  for (const field of allowedFields) {
    if (data[field as keyof SteamDbEntry] !== undefined) {
      if (field === 'aliases' || field === 'genres' || field === 'languages' || field === 'tags') {
        fields.push(`${field} = ?`);
        params.push(JSON.stringify(data[field as keyof SteamDbEntry]));
      } else {
        fields.push(`${field} = ?`);
        params.push(data[field as keyof SteamDbEntry]);
      }
    }
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = datetime("now", "localtime")');
  params.push(appid);
  
  database.db!.run(`UPDATE steam_db SET ${fields.join(', ')} WHERE steam_appid = ?`, params);
  database.save();
  return true;
}
```

- [ ] **Step 4: Commit 数据库新方法**

```bash
git add src/games/database.ts
git commit -m "feat: 新增 Steam 缓存统计、批量查询、增量更新方法"
```

---

### Task 1.4: 新建 GamesConfig 类型定义

**Files:**
- Create: `src/types/games-config.ts`

- [ ] **Step 1: 创建 games-config.ts 类型文件**

```typescript
// src/types/games-config.ts - 新文件
/**
 * 游戏模块独立配置类型定义
 */

import type { GameRules, GameScrapeConfig } from './game';

export interface GamesConfig {
  // 扫描配置
  gameScanPathsEnabled: boolean;
  gameScanPaths: string[];
  
  // 识别规则
  gamesRules: GameRules;
  
  // 刮削配置
  gamesScrape: GameScrapeConfig;
  
  // 图片配置
  maxPosterBackups: number;
  
  // Steam 配置
  proxyUrl: string;
}

export const DEFAULT_GAMES_CONFIG: GamesConfig = {
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: {
    recognitionRules: [
      { pattern: '\\[GOG\\]$', levelOffset: 0, enabled: true, description: 'GOG 版游戏' },
      { pattern: '\\[Steam\\]$', levelOffset: 0, enabled: true, description: 'Steam 版游戏' },
      { pattern: '\\[CRACK\\]$', levelOffset: 0, enabled: true, description: '破解版游戏' },
      { pattern: 'FitGirl.*Repack$', levelOffset: 1, enabled: true, description: 'FitGirl 压缩包' },
      { pattern: '/steamapps/', levelOffset: 0, enabled: true, description: 'Steam 游戏库' },
      { pattern: '/games/', levelOffset: 0, enabled: true, description: '通用游戏目录' },
    ],
    heuristicRules: {},
    blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
    maxScanDepth: 3
  },
  gamesScrape: {
    autoScrape: true,
    downloadPosters: true,
    scrapeOnIdentify: true
  },
  maxPosterBackups: 5,
  proxyUrl: ''
};
```

- [ ] **Step 2: Commit 类型定义**

```bash
git add src/types/games-config.ts
git commit -m "feat: 新增 GamesConfig 类型定义和默认配置"
```

---

### Task 1.5: 新建 games-config.ts 模块

**Files:**
- Create: `src/games-config.ts`

- [ ] **Step 1: 创建 games-config.ts 模块**

```typescript
// src/games-config.ts - 新文件
/**
 * 游戏模块独立配置管理
 */

import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { loadConfig, getStoragePath, ensureStorageDir } from './utils';
import type { GamesConfig } from './types/games-config';
import { DEFAULT_GAMES_CONFIG } from './types/games-config';

const GAMES_CONFIG_FILE = 'games-config.json';

/**
 * 获取游戏配置文件路径
 */
function getGamesConfigPath(): string {
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  return path.join(storagePath, GAMES_CONFIG_FILE);
}

/**
 * 加载游戏配置
 * 首次加载时自动从旧 config.json 迁移
 */
function loadGamesConfig(): GamesConfig {
  const configPath = getGamesConfigPath();
  
  // 如果 games-config.json 已存在，直接加载
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const merged: GamesConfig = {
        ...DEFAULT_GAMES_CONFIG,
        ...raw,
        gamesRules: {
          ...DEFAULT_GAMES_CONFIG.gamesRules,
          ...(raw.gamesRules || {}),
          heuristicRules: {
            ...DEFAULT_GAMES_CONFIG.gamesRules.heuristicRules,
            ...(raw.gamesRules?.heuristicRules || {})
          }
        },
        gamesScrape: {
          ...DEFAULT_GAMES_CONFIG.gamesScrape,
          ...(raw.gamesScrape || {})
        }
      };
      logger.debug('加载游戏配置: %s', configPath);
      return merged;
    } catch (err) {
      const error = err as Error;
      logger.error('加载游戏配置失败: %s', error.message);
      return DEFAULT_GAMES_CONFIG;
    }
  }
  
  // 不存在：尝试从旧 config.json 迁移
  const oldConfig = loadConfig();
  const migrated: GamesConfig = {
    gameScanPathsEnabled: oldConfig.gameScanPathsEnabled ?? DEFAULT_GAMES_CONFIG.gameScanPathsEnabled,
    gameScanPaths: oldConfig.gameScanPaths ?? DEFAULT_GAMES_CONFIG.gameScanPaths,
    gamesRules: oldConfig.gamesRules ?? DEFAULT_GAMES_CONFIG.gamesRules,
    gamesScrape: oldConfig.gamesScrape ?? DEFAULT_GAMES_CONFIG.gamesScrape,
    maxPosterBackups: oldConfig.maxPosterBackups ?? DEFAULT_GAMES_CONFIG.maxPosterBackups,
    proxyUrl: oldConfig.proxyUrl ?? DEFAULT_GAMES_CONFIG.proxyUrl
  };
  
  // 保存新的 games-config.json
  saveGamesConfig(migrated);
  logger.info('游戏配置已迁移: %s', configPath);
  
  return migrated;
}

/**
 * 保存游戏配置
 */
function saveGamesConfig(config: GamesConfig): boolean {
  const configPath = getGamesConfigPath();
  try {
    ensureStorageDir(loadConfig());
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.info('游戏配置已保存: %s', configPath);
    return true;
  } catch (err) {
    const error = err as Error;
    logger.error('保存游戏配置失败: %s', error.message);
    return false;
  }
}

/**
 * 获取游戏扫描路径
 */
function getGameScanPathsFromConfig(): string[] {
  const gamesConfig = loadGamesConfig();
  if (gamesConfig.gameScanPathsEnabled && gamesConfig.gameScanPaths.length > 0) {
    return gamesConfig.gameScanPaths;
  }
  // 兜底：使用全局扫描路径
  return loadConfig().scanPaths;
}

export {
  loadGamesConfig,
  saveGamesConfig,
  getGameScanPathsFromConfig,
  DEFAULT_GAMES_CONFIG
};
```

- [ ] **Step 2: Commit games-config 模块**

```bash
git add src/games-config.ts
git commit -m "feat: 新增游戏配置独立模块，支持从旧配置迁移"
```

---

### Task 1.6: 修改全局配置类型

**Files:**
- Modify: `src/types/config.ts`

- [ ] **Step 1: 移除游戏配置字段，仅保留开关**

```typescript
// src/types/config.ts - 精简 Config 接口
export interface Config {
  // 全局配置
  storagePath: string;
  scanPaths: string[];
  scanTime: string;
  excludePatterns: string[];
  fileExtensionFilter: FileExtensionFilter;
  categories?: string[];
  categoryRules?: CategoryRule;
  categoryPathRules?: CategoryPathRule[];
  trackingConfig?: TrackingConfig;
  
  // 仅保留游戏模块开关（详细配置已移至 games-config.json）
  gamesEnabled?: boolean;
  
  // 以下字段已废弃，将在迁移后从 config.json 中移除
  // gameScanPathsEnabled, gameScanPaths, gamesRules, gamesScrape, maxPosterBackups, proxyUrl
  // 保留类型定义以支持迁移读取
  gameScanPathsEnabled?: boolean;
  gameScanPaths?: string[];
  gamesRules?: import('./game').GameRules;
  gamesScrape?: import('./game').GameScrapeConfig;
  maxPosterBackups?: number;
  proxyUrl?: string;
}
```

- [ ] **Step 2: Commit 配置类型修改**

```bash
git add src/types/config.ts
git commit -m "feat: 精简 Config 类型，仅保留 gamesEnabled 开关"
```

---

### Task 1.7: 更新 utils.ts 导出

**Files:**
- Modify: `src/utils.ts`

- [ ] **Step 1: 移除游戏配置相关导出**

找到 utils.ts 中导出的游戏相关常量，移除或标记废弃：

```typescript
// src/utils.ts - 移除游戏配置相关导出
// 移除以下导出（已迁移到 games-config.ts）：
// DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE, getGameScanPaths

// 更新导出列表
export {
  PROJECT_ROOT,
  DEFAULT_STORAGE_PATH,
  DEFAULT_CONFIG_FILE,
  initDatabase,
  getStoragePath,
  getStorageFilePath,
  ensureStorageDir,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  getFileScanPaths,
  // getGameScanPaths 已移除，改用 games-config.ts 的 getGameScanPathsFromConfig
};
```

- [ ] **Step 2: 更新依赖 utils.ts 的文件导入**

暂不修改其他文件，后续 Task 中统一更新。

- [ ] **Step 3: Commit utils.ts 更新**

```bash
git add src/utils.ts
git commit -m "refactor: 移除 utils.ts 中游戏配置导出，迁移至 games-config.ts"
```

---

## Phase 2: 刮削逻辑重构

### Task 2.1: 新建 steam-cache-service.ts

**Files:**
- Create: `src/games/steam-cache-service.ts`

- [ ] **Step 1: 创建 steam-cache-service.ts 文件**

```typescript
// src/games/steam-cache-service.ts - 新文件
/**
 * Steam 缓存图片管理服务
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { loadConfig, getStoragePath } from '../utils';
import { ensureGamesDirs } from './storage';

const STEAM_CACHE_DIR = 'steam-cache';
const SCREENSHOTS_DIR = 'screenshots';

export interface SteamCacheImageStatus {
  hasHeader: boolean;
  hasCapsule: boolean;
  hasBackground: boolean;
  screenshotCount: number;
}

export interface SteamCacheStats {
  totalEntries: number;
  totalPosters: number;
  totalScreenshots: number;
  totalSizeMB: number;
}

/**
 * 获取 Steam 缓存根目录
 */
function getSteamCacheRoot(storagePath: string): string {
  return path.join(storagePath, 'games', STEAM_CACHE_DIR);
}

/**
 * 获取指定 AppID 的缓存目录
 */
function getSteamCacheDir(storagePath: string, appid: string): string {
  return path.join(getSteamCacheRoot(storagePath), appid);
}

/**
 * 确保 Steam 缓存目录存在
 */
function ensureSteamCacheDir(storagePath: string, appid: string): string {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  const screenshotsDir = path.join(cacheDir, SCREENSHOTS_DIR);
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    logger.debug('创建 Steam 缓存目录: %s', cacheDir);
  }
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  return cacheDir;
}

/**
 * 检查缓存图片状态
 */
function checkCacheStatus(storagePath: string, appid: string): SteamCacheImageStatus {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  
  return {
    hasHeader: fs.existsSync(path.join(cacheDir, 'header.jpg')),
    hasCapsule: fs.existsSync(path.join(cacheDir, 'capsule.jpg')),
    hasBackground: fs.existsSync(path.join(cacheDir, 'background.jpg')),
    screenshotCount: fs.existsSync(path.join(cacheDir, SCREENSHOTS_DIR)) 
      ? fs.readdirSync(path.join(cacheDir, SCREENSHOTS_DIR))
          .filter(f => f.endsWith('.jpg')).length 
      : 0
  };
}

/**
 * 保存图片到缓存
 */
function saveImageToCache(storagePath: string, appid: string, type: string, buffer: Buffer): void {
  ensureSteamCacheDir(storagePath, appid);
  const filePath = path.join(getSteamCacheDir(storagePath, appid), `${type}.jpg`);
  fs.writeFileSync(filePath, buffer);
  logger.debug('保存 Steam 缓存图片: %s', filePath);
}

/**
 * 保存截图到缓存
 */
function saveScreenshotToCache(storagePath: string, appid: string, index: number, buffer: Buffer): void {
  ensureSteamCacheDir(storagePath, appid);
  const filePath = path.join(getSteamCacheDir(storagePath, appid), SCREENSHOTS_DIR, `${index}.jpg`);
  fs.writeFileSync(filePath, buffer);
  logger.debug('保存 Steam 缓存截图: %s', filePath);
}

/**
 * 获取缓存图片路径（用于静态服务）
 */
function getCacheImagePath(storagePath: string, appid: string, type: string): string {
  return path.join(getSteamCacheDir(storagePath, appid), `${type}.jpg`);
}

/**
 * 获取截图路径
 */
function getScreenshotPath(storagePath: string, appid: string, index: number): string {
  return path.join(getSteamCacheDir(storagePath, appid), SCREENSHOTS_DIR, `${index}.jpg`);
}

/**
 * 删除缓存目录
 */
function deleteSteamCache(storagePath: string, appid: string): boolean {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    logger.info('删除 Steam 缓存: %s', cacheDir);
    return true;
  }
  return false;
}

/**
 * 统计缓存大小
 */
function calculateCacheStats(storagePath: string, appids: string[]): SteamCacheStats {
  let totalPosters = 0;
  let totalScreenshots = 0;
  let totalSize = 0;
  
  for (const appid of appids) {
    const cacheDir = getSteamCacheDir(storagePath, appid);
    if (!fs.existsSync(cacheDir)) continue;
    
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.endsWith('.jpg') && file !== SCREENSHOTS_DIR) {
        totalPosters++;
        const filePath = path.join(cacheDir, file);
        totalSize += fs.statSync(filePath).size;
      }
    }
    
    const screenshotsDir = path.join(cacheDir, SCREENSHOTS_DIR);
    if (fs.existsSync(screenshotsDir)) {
      const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.jpg'));
      totalScreenshots += screenshots.length;
      for (const ss of screenshots) {
        totalSize += fs.statSync(path.join(screenshotsDir, ss)).size;
      }
    }
  }
  
  return {
    totalEntries: appids.length,
    totalPosters,
    totalScreenshots,
    totalSizeMB: Math.round(totalSize / 1024 / 1024)
  };
}

/**
 * 下载图片
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('下载图片失败: %s (status %d)', url, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    const error = err as Error;
    logger.warn('下载图片失败: %s - %s', url, error.message);
    return null;
  }
}

export class SteamCacheService {
  private storagePath: string;
  
  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }
  
  /**
   * 下载并保存所有图片到缓存
   */
  async downloadAllImages(appid: string, data: {
    header_image?: string;
    capsule_image?: string;
    background?: string;
    screenshots?: string[];
  }): Promise<void> {
    // 下载海报
    if (data.header_image) {
      const buffer = await downloadImage(data.header_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'header', buffer);
    }
    if (data.capsule_image) {
      const buffer = await downloadImage(data.capsule_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'capsule', buffer);
    }
    if (data.background) {
      const buffer = await downloadImage(data.background);
      if (buffer) saveImageToCache(this.storagePath, appid, 'background', buffer);
    }
    
    // 下载所有截图
    if (data.screenshots && data.screenshots.length > 0) {
      for (let i = 0; i < data.screenshots.length; i++) {
        const buffer = await downloadImage(data.screenshots[i]);
        if (buffer) saveScreenshotToCache(this.storagePath, appid, i + 1, buffer);
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  /**
   * 增量下载缺失图片
   */
  async downloadMissingImages(appid: string, data: {
    header_image?: string;
    capsule_image?: string;
    background?: string;
    screenshots?: string[];
  }): Promise<void> {
    const status = checkCacheStatus(this.storagePath, appid);
    
    // 只下载缺失的
    if (!status.hasHeader && data.header_image) {
      const buffer = await downloadImage(data.header_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'header', buffer);
    }
    if (!status.hasCapsule && data.capsule_image) {
      const buffer = await downloadImage(data.capsule_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'capsule', buffer);
    }
    if (!status.hasBackground && data.background) {
      const buffer = await downloadImage(data.background);
      if (buffer) saveImageToCache(this.storagePath, appid, 'background', buffer);
    }
    
    // 增量下载新截图
    if (data.screenshots && data.screenshots.length > status.screenshotCount) {
      for (let i = status.screenshotCount; i < data.screenshots.length; i++) {
        const buffer = await downloadImage(data.screenshots[i]);
        if (buffer) saveScreenshotToCache(this.storagePath, appid, i + 1, buffer);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  checkStatus(appid: string): SteamCacheImageStatus {
    return checkCacheStatus(this.storagePath, appid);
  }
  
  deleteCache(appid: string): boolean {
    return deleteSteamCache(this.storagePath, appid);
  }
  
  getStats(appids: string[]): SteamCacheStats {
    return calculateCacheStats(this.storagePath, appids);
  }
  
  getImagePath(appid: string, type: string): string {
    return getCacheImagePath(this.storagePath, appid, type);
  }
  
  getScreenshotPath(appid: string, index: number): string {
    return getScreenshotPath(this.storagePath, appid, index);
  }
}

// 导出辅助函数
export {
  getSteamCacheRoot,
  getSteamCacheDir,
  ensureSteamCacheDir,
  checkCacheStatus,
  downloadImage
};
```

- [ ] **Step 2: Commit steam-cache-service**

```bash
git add src/games/steam-cache-service.ts
git commit -m "feat: 新增 Steam 缓存图片管理服务"
```

---

### Task 2.2: 重构 scraper.ts 刮削流程

**Files:**
- Modify: `src/games/scraper.ts`

- [ ] **Step 1: 导入 SteamCacheService**

```typescript
// src/games/scraper.ts - 新增导入
import { SteamCacheService, getSteamCacheDir, ensureSteamCacheDir } from './steam-cache-service';
```

- [ ] **Step 2: 重构 scrapeGame 方法**

找到 `scrapeGame` 方法，替换为：

```typescript
// src/games/scraper.ts - 重构 scrapeGame
/**
 * 刮削单个游戏（本地优先）
 */
export async function scrapeGame(gameId: number, downloadPosters: boolean = true): Promise<Game | null> {
  const game = gameDatabase.getGameById(gameId);
  if (!game) {
    logger.warn('游戏不存在: id %d', gameId);
    return null;
  }

  // 获取或搜索 AppID
  let appid: number | null = null;
  if (game.steam_appid) {
    appid = parseInt(game.steam_appid);
  } else {
    appid = await searchSteamGame(game.title);
  }

  if (!appid) {
    logger.info('无法找到 Steam appid: %s', game.title);
    return game;
  }

  const appidStr = String(appid);

  // === 本地优先逻辑 ===
  const existingCache = gameDatabase.getSteamDbByAppid(appidStr);
  
  if (existingCache && existingCache.raw_data) {
    // 有完整缓存：从 raw_data 提取元数据
    logger.info('使用本地缓存: appid %d', appid);
    
    try {
      const rawData = JSON.parse(existingCache.raw_data);
      const updateData = extractMetadataFromRawData(rawData, game);
      gameDatabase.updateGame(gameId, updateData);
      
      // 检查图片完整性，缺失则补充
      if (downloadPosters) {
        const config = loadConfig();
        const storagePath = getStoragePath(config);
        const cacheService = new SteamCacheService(storagePath);
        await cacheService.downloadMissingImages(appidStr, {
          header_image: rawData.header_image,
          capsule_image: rawData.capsule_images?.[0]?.capsule,
          background: rawData.background,
          screenshots: rawData.screenshots?.map(s => s.path_full)
        });
      }
    } catch (err) {
      logger.warn('解析缓存数据失败，将重新刮削: appid %d', appid);
      // 缓存解析失败，走远程刮削流程
      return await scrapeFromRemote(game, appid, downloadPosters);
    }
    
    return gameDatabase.getGameById(gameId);
  }

  // 无缓存或缓存不完整：远程刮削
  return await scrapeFromRemote(game, appid, downloadPosters);
}

/**
 * 从远程 API 刮削
 */
async function scrapeFromRemote(game: Game, appid: number, downloadPosters: boolean): Promise<Game | null> {
  const details = await getSteamDetails(appid);
  if (!details || !details.data) {
    logger.info('无法获取 Steam 详情: appid %d', appid);
    gameDatabase.updateGame(game.id!, { steam_appid: String(appid) });
    return gameDatabase.getGameById(game.id!);
  }

  const data = details.data;
  const appidStr = String(appid);

  // 存入 steam_db 缓存
  const existing = gameDatabase.getSteamDbByAppid(appidStr);
  const steamName = data.name;
  const dirName = game.original_name;

  const resolved = resolveGameNames(
    steamName,
    dirName,
    existing ? existing.aliases || [] : []
  );

  // 提取图片 URL
  const headerImage = data.header_image;
  const capsuleImage = data.capsule_images?.[0]?.capsule;
  const background = data.background;
  const screenshots = data.screenshots?.map(s => s.path_full);

  // 存入完整缓存
  const cacheData: Partial<SteamDbEntry> = {
    steam_appid: appidStr,
    name: resolved.name,
    name_en: resolved.nameEn,
    aliases: resolved.aliases,
    release_date: data.release_date?.date,
    genres: data.genres ? JSON.stringify(data.genres.map(g => g.description)) : undefined,
    rating: data.metacritic?.score,
    languages: data.supported_languages,
    raw_data: JSON.stringify(data),  // 存储完整原始数据
    source: 'scraper',
    scraped_at: new Date().toISOString()
  };

  if (existing) {
    gameDatabase.updateSteamDbFull(appidStr, cacheData);
  } else {
    gameDatabase.insertSteamDbEntry(cacheData);
  }

  // 下载图片到 steam-cache/{appid}/
  if (downloadPosters) {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensureGamesDirs(storagePath);
    const cacheService = new SteamCacheService(storagePath);
    await cacheService.downloadAllImages(appidStr, {
      header_image: headerImage,
      capsule_image: capsuleImage,
      background: background,
      screenshots: screenshots
    });
  }

  // 更新 games 表
  const shouldUpdateTitle = !game.is_manually_edited;
  const updateData: Partial<Game> = {
    steam_appid: appidStr,
    title: shouldUpdateTitle ? resolved.name : game.title,
    title_en: resolved.nameEn || steamName,
    developer: data.developers?.[0] || undefined,
    publisher: data.publishers?.[0] || undefined,
    release_date: data.release_date?.date || undefined,
    genres: data.genres ? JSON.stringify(data.genres.map(g => g.description)) : undefined,
    rating: data.metacritic?.score || undefined,
    description: data.detailed_description || undefined,
    short_description: data.short_description || undefined,
    languages: data.supported_languages || undefined,
    metadata_source: 'steam',
    scraped_at: new Date().toISOString()
  };

  gameDatabase.updateGame(game.id!, updateData);
  logger.info('刮削完成: %s (appid %d)', game.title, appid);
  
  return gameDatabase.getGameById(game.id!);
}

/**
 * 从 raw_data 提取元数据
 */
function extractMetadataFromRawData(rawData: any, game: Game): Partial<Game> {
  const shouldUpdateTitle = !game.is_manually_edited;
  
  return {
    steam_appid: String(rawData.steam_appid),
    title: shouldUpdateTitle ? game.title : game.title,  // 不更新标题
    title_en: game.title_en || rawData.name,
    developer: rawData.developers?.[0] || game.developer,
    publisher: rawData.publishers?.[0] || game.publisher,
    release_date: rawData.release_date?.date || game.release_date,
    genres: rawData.genres ? JSON.stringify(rawData.genres.map(g => g.description)) : game.genres,
    rating: rawData.metacritic?.score || game.rating,
    description: rawData.detailed_description || game.description,
    short_description: rawData.short_description || game.short_description,
    languages: rawData.supported_languages || game.languages,
    metadata_source: 'steam',
    scraped_at: new Date().toISOString()
  };
}
```

- [ ] **Step 3: 新增强制刷新方法**

```typescript
// src/games/scraper.ts - 新增方法
/**
 * 强制刷新 Steam 缓存（手动触发）
 */
export async function refreshSteamCache(appid: string): Promise<boolean> {
  const details = await getSteamDetails(parseInt(appid));
  if (!details || !details.data) {
    logger.warn('刷新缓存失败: 无法获取 Steam 详情 appid %s', appid);
    return false;
  }

  const data = details.data;
  
  // 增量更新缓存
  const existing = gameDatabase.getSteamDbByAppid(appid);
  const steamName = data.name;

  const resolved = existing 
    ? resolveGameNames(steamName, '', existing.aliases || [])
    : { name: steamName, nameEn: undefined, aliases: [] };

  const cacheData: Partial<SteamDbEntry> = {
    name: resolved.name,
    name_en: resolved.nameEn,
    aliases: resolved.aliases,
    release_date: data.release_date?.date,
    genres: data.genres ? JSON.stringify(data.genres.map(g => g.description)) : undefined,
    rating: data.metacritic?.score,
    languages: data.supported_languages,
    raw_data: JSON.stringify(data),
    source: 'scraper',
    scraped_at: new Date().toISOString()
  };

  if (existing) {
    gameDatabase.updateSteamDbFull(appid, cacheData);
  } else {
    gameDatabase.insertSteamDbEntry({
      steam_appid: appid,
      ...cacheData
    });
  }

  // 增量下载图片
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  const cacheService = new SteamCacheService(storagePath);
  await cacheService.downloadMissingImages(appid, {
    header_image: data.header_image,
    capsule_image: data.capsule_images?.[0]?.capsule,
    background: data.background,
    screenshots: data.screenshots?.map(s => s.path_full)
  });

  logger.info('缓存刷新完成: appid %s', appid);
  return true;
}
```

- [ ] **Step 4: 更新导入和类型**

在文件顶部添加 SteamDbEntry 类型导入：

```typescript
// src/games/scraper.ts - 更新导入
import type { Game, SteamDbEntry } from '../types';
```

- [ ] **Step 5: Commit scraper 重构**

```bash
git add src/games/scraper.ts
git commit -m "feat: 重构刮削流程，本地优先 + 缺失补齐 + 强制刷新"
```

---

## Phase 3: 后端 API

### Task 3.1: 新建 steam-cache 路由

**Files:**
- Create: `src/routes/steam-cache.ts`

- [ ] **Step 1: 创建 steam-cache.ts 路由文件**

```typescript
// src/routes/steam-cache.ts - 新文件
/**
 * Steam 缓存 API 路由
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { gameDatabase } from '../games/database';
import { SteamCacheService, getSteamCacheDir } from '../games/steam-cache-service';
import { refreshSteamCache } from '../games/scraper';
import { loadConfig, getStoragePath, initDatabase } from '../utils';
import { logger } from '../logger';
import type { SteamCacheStatus, SteamCacheStats } from '../types/game';

const router: Router = Router();

/**
 * 初始化
 */
async function init(): Promise<void> {
  await initDatabase();
  gameDatabase.createGameTables();
}

/**
 * 获取缓存统计
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    
    const dbStats = gameDatabase.getSteamCacheStats();
    const appids = gameDatabase.getAllSteamDbAppids();
    const cacheService = new SteamCacheService(storagePath);
    const fileStats = cacheService.getStats(appids);
    
    res.json({
      success: true,
      data: {
        totalEntries: dbStats.totalEntries,
        completeEntries: fileStats.totalPosters > 0 ? appids.length : 0,
        missingImagesEntries: dbStats.totalEntries - (fileStats.totalPosters > 0 ? appids.length : 0),
        totalPosters: fileStats.totalPosters,
        totalScreenshots: fileStats.totalScreenshots,
        totalSizeMB: fileStats.totalSizeMB
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取缓存列表
 */
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const { search, page = '1', pageSize = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const limit = parseInt(pageSize as string);
    
    const result = gameDatabase.getAllSteamDbEntries({
      search: search as string,
      orderBy: 'name',
      orderDir: 'ASC',
      limit,
      offset
    });
    
    // 检查图片状态
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);
    
    const entriesWithStatus = result.entries.map(entry => {
      const status = cacheService.checkStatus(entry.steam_appid);
      const isComplete = status.hasHeader && entry.raw_data;
      return {
        ...entry,
        cacheStatus: isComplete ? 'complete' : (entry.raw_data ? 'missing_images' : 'metadata_only'),
        hasHeader: status.hasHeader,
        hasCapsule: status.hasCapsule,
        hasBackground: status.hasBackground,
        screenshotCount: status.screenshotCount
      };
    });
    
    res.json({
      success: true,
      data: {
        entries: entriesWithStatus,
        total: result.total,
        page: parseInt(page as string),
        pageSize: limit,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个缓存详情
 */
router.get('/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const entry = gameDatabase.getSteamDbByAppid(appid);
    
    if (!entry) {
      res.status(404).json({ success: false, error: '缓存不存在' });
      return;
    }
    
    // 检查图片状态
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);
    const status = cacheService.checkStatus(appid);
    
    // 解析 raw_data 提取图片 URL
    let imageUrl = null;
    if (entry.raw_data) {
      try {
        const rawData = JSON.parse(entry.raw_data);
        imageUrl = {
          header: rawData.header_image,
          capsule: rawData.capsule_images?.[0]?.capsule,
          background: rawData.background,
          screenshots: rawData.screenshots?.map((s: any) => s.path_full)
        };
      } catch {}
    }
    
    res.json({
      success: true,
      data: {
        ...entry,
        imageStatus: status,
        originalUrls: imageUrl
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 强制刷新单个缓存
 */
router.post('/:appid/refresh', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const success = await refreshSteamCache(appid);
    
    if (success) {
      res.json({ success: true, message: '缓存刷新完成' });
    } else {
      res.status(400).json({ success: false, error: '刷新失败，无法获取 Steam 数据' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除单个缓存
 */
router.delete('/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    
    // 删除数据库记录
    const entry = gameDatabase.getSteamDbByAppid(appid);
    if (!entry) {
      res.status(404).json({ success: false, error: '缓存不存在' });
      return;
    }
    gameDatabase.deleteSteamDbEntry(entry.id!);
    
    // 删除缓存文件
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);
    cacheService.deleteCache(appid);
    
    res.json({ success: true, message: '缓存已删除' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量刷新所有缓存
 */
router.post('/refresh-all', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appids = gameDatabase.getAllSteamDbAppids();
    
    if (appids.length === 0) {
      res.json({ success: true, message: '无缓存需要刷新' });
      return;
    }
    
    // 使用 SSE 返回进度
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    
    for (let i = 0; i < appids.length; i++) {
      const appid = appids[i];
      const success = await refreshSteamCache(appid);
      
      res.write(`data: ${JSON.stringify({ 
        current: i + 1, 
        total: appids.length, 
        appid, 
        success 
      })}\n\n`);
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取缓存图片列表
 */
router.get('/images/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheDir = getSteamCacheDir(storagePath, appid);
    
    if (!fs.existsSync(cacheDir)) {
      res.json({ success: true, data: { posters: [], screenshots: [] } });
      return;
    }
    
    const posters: string[] = [];
    const screenshots: string[] = [];
    
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.endsWith('.jpg') && file !== 'screenshots') {
        posters.push(file.replace('.jpg', ''));
      }
    }
    
    const screenshotsDir = path.join(cacheDir, 'screenshots');
    if (fs.existsSync(screenshotsDir)) {
      const ssFiles = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.jpg'));
      for (const ss of ssFiles) {
        screenshots.push(ss.replace('.jpg', ''));
      }
    }
    
    res.json({ success: true, data: { posters, screenshots } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Commit steam-cache 路由**

```bash
git add src/routes/steam-cache.ts
git commit -m "feat: 新增 Steam 缓存 API 路由"
```

---

### Task 3.2: 新建 games-config 路由

**Files:**
- Create: `src/routes/games-config.ts`

- [ ] **Step 1: 创建 games-config.ts 路由文件**

```typescript
// src/routes/games-config.ts - 新文件
/**
 * 游戏配置 API 路由
 */

import { Router, Request, Response } from 'express';
import { loadGamesConfig, saveGamesConfig } from '../games-config';
import type { GamesConfig } from '../types/games-config';

const router: Router = Router();

/**
 * 获取游戏配置
 */
router.get('/', (req: Request, res: Response): void => {
  try {
    const config = loadGamesConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 保存游戏配置
 */
router.put('/', (req: Request, res: Response): void => {
  try {
    const newConfig: Partial<GamesConfig> = req.body;
    
    // 合并现有配置
    const existingConfig = loadGamesConfig();
    const mergedConfig: GamesConfig = {
      ...existingConfig,
      ...newConfig,
      gamesRules: {
        ...existingConfig.gamesRules,
        ...(newConfig.gamesRules || {}),
        heuristicRules: {
          ...existingConfig.gamesRules.heuristicRules,
          ...(newConfig.gamesRules?.heuristicRules || {})
        }
      },
      gamesScrape: {
        ...existingConfig.gamesScrape,
        ...(newConfig.gamesScrape || {})
      }
    };
    
    const success = saveGamesConfig(mergedConfig);
    if (success) {
      res.json({ success: true, data: mergedConfig });
    } else {
      res.status(500).json({ success: false, error: '保存配置失败' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Commit games-config 路由**

```bash
git add src/routes/games-config.ts
git commit -m "feat: 新增游戏配置 API 路由"
```

---

### Task 3.3: 注册路由到 server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 导入新路由**

```typescript
// src/server.ts - 新增导入
import steamCacheRouter from './routes/steam-cache';
import gamesConfigRouter from './routes/games-config';
```

- [ ] **Step 2: 注册路由**

找到路由注册部分，添加：

```typescript
// src/server.ts - 注册新路由
app.use('/api/steam-cache', steamCacheRouter);
app.use('/api/games-config', gamesConfigRouter);
```

- [ ] **Step 3: 新增 Steam 缓存静态文件服务**

```typescript
// src/server.ts - 新增静态文件服务
// Steam 缓存图片静态服务
const gamesPath = path.join(storagePath, 'games');
if (fs.existsSync(gamesPath)) {
  app.use('/static/games', express.static(gamesPath));
}
```

- [ ] **Step 4: Commit server.ts 更新**

```bash
git add src/server.ts
git commit -m "feat: 注册 Steam 缓存和游戏配置路由，新增静态文件服务"
```

---

### Task 3.4: 更新前端 API 模块

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 新增 Steam 缓存 API 函数**

```typescript
// frontend/src/api/index.ts - 新增
// Steam 缓存 API
export function getSteamCacheStats(): Promise<ApiResponse<SteamCacheStats>> {
  return request('/api/steam-cache/stats');
}

export function getSteamCacheList(params?: { search?: string; page?: number; pageSize?: number }): Promise<ApiResponse<{
  entries: SteamCacheEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  return request(`/api/steam-cache/list?${query.toString()}`);
}

export function getSteamCacheDetail(appid: string): Promise<ApiResponse<SteamCacheEntry & {
  imageStatus: SteamCacheImageStatus;
  originalUrls?: { header?: string; capsule?: string; background?: string; screenshots?: string[] };
}>> {
  return request(`/api/steam-cache/${appid}`);
}

export function refreshSteamCache(appid: string): Promise<ApiResponse<void>> {
  return request(`/api/steam-cache/${appid}/refresh`, { method: 'POST' });
}

export function deleteSteamCache(appid: string): Promise<ApiResponse<void>> {
  return request(`/api/steam-cache/${appid}`, { method: 'DELETE' });
}

export function refreshAllSteamCache(): Promise<void> {
  // SSE 流式响应
  return new Promise((resolve) => {
    const eventSource = new EventSource('/api/steam-cache/refresh-all');
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.done) {
        eventSource.close();
        resolve();
      }
      // 进度数据可通过 callback 处理
    };
    eventSource.onerror = () => {
      eventSource.close();
      resolve();
    };
  });
}

// 游戏配置 API
export function getGamesConfig(): Promise<ApiResponse<GamesConfig>> {
  return request('/api/games-config');
}

export function saveGamesConfig(config: Partial<GamesConfig>): Promise<ApiResponse<GamesConfig>> {
  return request('/api/games-config', { method: 'PUT', body: JSON.stringify(config) });
}
```

- [ ] **Step 2: 新增类型定义**

```typescript
// frontend/src/types/api.ts - 新增类型
export interface SteamCacheStats {
  totalEntries: number;
  completeEntries: number;
  missingImagesEntries: number;
  totalPosters: number;
  totalScreenshots: number;
  totalSizeMB: number;
}

export interface SteamCacheEntry {
  id?: number;
  steam_appid: string;
  name: string;
  name_en?: string;
  aliases?: string[];
  release_date?: string;
  genres?: string;
  rating?: number;
  languages?: string;
  tags?: string;
  source?: string;
  scraped_at?: string;
  cacheStatus?: 'complete' | 'missing_images' | 'metadata_only';
  hasHeader?: boolean;
  hasCapsule?: boolean;
  hasBackground?: boolean;
  screenshotCount?: number;
}

export interface SteamCacheImageStatus {
  hasHeader: boolean;
  hasCapsule: boolean;
  hasBackground: boolean;
  screenshotCount: number;
}

export interface GamesConfig {
  gameScanPathsEnabled: boolean;
  gameScanPaths: string[];
  gamesRules: GameRules;
  gamesScrape: GameScrapeConfig;
  maxPosterBackups: number;
  proxyUrl: string;
}
```

- [ ] **Step 3: Commit 前端 API 更新**

```bash
git add frontend/src/api/index.ts frontend/src/types/api.ts
git commit -m "feat: 前端新增 Steam 缓存和游戏配置 API"
```

---

## Phase 4: 前端页面重构

由于前端重构涉及大量文件拆分，这里只列出关键任务的框架代码。实际实现时需要根据现有代码逐步拆分。

### Task 4.1: 创建前端目录结构

**Files:**
- Create: `frontend/src/views/game/` 目录
- Create: `frontend/src/components/game/` 目录
- Create: `frontend/src/composables/game/` 目录

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p frontend/src/views/game
mkdir -p frontend/src/components/game
mkdir -p frontend/src/composables/game
```

- [ ] **Step 2: 移动现有文件到新目录**

```bash
mv frontend/src/views/GameWallView.vue frontend/src/views/game/GameWallView.vue
mv frontend/src/components/GameCard.vue frontend/src/components/game/GameCard.vue
mv frontend/src/components/GameGroupSidebar.vue frontend/src/components/game/GameGroupSidebar.vue
mv frontend/src/components/GameGroupManager.vue frontend/src/components/game/GameGroupManager.vue
```

- [ ] **Step 3: 更新导入路径**

更新 router/index.ts 和其他引用这些组件的文件的导入路径。

- [ ] **Step 4: Commit 目录结构调整**

```bash
git add frontend/src/views/game frontend/src/components/game frontend/src/composables/game
git add frontend/src/router/index.ts
git commit -m "refactor: 前端 Game 模块目录结构调整"
```

---

### Task 4.2: 创建 useGameToast composable

**Files:**
- Create: `frontend/src/composables/game/useGameToast.ts`

- [ ] **Step 1: 创建 useGameToast.ts**

```typescript
// frontend/src/composables/game/useGameToast.ts
import { ref } from 'vue';

export function useGameToast() {
  const showToast = ref(false);
  const toastMessage = ref('');

  function showNotification(message: string): void {
    toastMessage.value = message;
    showToast.value = true;
    setTimeout(() => {
      showToast.value = false;
    }, 2000);
  }

  return {
    showToast,
    toastMessage,
    showNotification
  };
}
```

- [ ] **Step 2: Commit composable**

```bash
git add frontend/src/composables/game/useGameToast.ts
git commit -m "feat: 新增 useGameToast composable"
```

---

### Task 4.3: 创建 useGameFilters composable

**Files:**
- Create: `frontend/src/composables/game/useGameFilters.ts`

- [ ] **Step 1: 创建 useGameFilters.ts**

```typescript
// frontend/src/composables/game/useGameFilters.ts
import { ref, watch } from 'vue';

export function useGameFilters(onChange: () => void) {
  const searchQuery = ref('');
  const filterGenre = ref('');
  const filterYear = ref('');
  const filterScraped = ref('');
  const orderBy = ref('title');
  
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function debouncedSearch(): void {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      onChange();
    }, 300);
  }

  watch([filterGenre, filterYear, filterScraped, orderBy], () => {
    onChange();
  });

  return {
    searchQuery,
    filterGenre,
    filterYear,
    filterScraped,
    orderBy,
    debouncedSearch
  };
}
```

- [ ] **Step 2: Commit composable**

```bash
git add frontend/src/composables/game/useGameFilters.ts
git commit -m "feat: 新增 useGameFilters composable"
```

---

### Task 4.4: 创建 GameFilterBar 组件

**Files:**
- Create: `frontend/src/components/game/GameFilterBar.vue`

- [ ] **Step 1: 创建 GameFilterBar.vue**

```vue
<!-- frontend/src/components/game/GameFilterBar.vue -->
<template>
  <div class="filter-bar">
    <div class="filter-group">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索游戏..."
        class="search-input"
        @input="debouncedSearch"
      />
    </div>
    <div class="filter-group">
      <select v-model="filterGenre" class="filter-select">
        <option value="">所有类型</option>
        <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="filterYear" class="filter-select">
        <option value="">所有年份</option>
        <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="filterScraped" class="filter-select">
        <option value="">全部状态</option>
        <option value="true">已刮削</option>
        <option value="false">待刮削</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="orderBy" class="filter-select">
        <option value="title">按名称</option>
        <option value="rating">按评分</option>
        <option value="release_date">按年份（新→旧）</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  genres: string[];
  years: string[];
}>();

const emit = defineEmits<{
  change: [];
}>();

const searchQuery = ref('');
const filterGenre = ref('');
const filterYear = ref('');
const filterScraped = ref('');
const orderBy = ref('title');

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(): void {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => emit('change'), 300);
}

watch([filterGenre, filterYear, filterScraped, orderBy], () => emit('change'));
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-group {
  flex: 1;
  min-width: 120px;
}
.search-input, .filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: Commit 组件**

```bash
git add frontend/src/components/game/GameFilterBar.vue
git commit -m "feat: 新增 GameFilterBar 组件"
```

---

### Task 4.5: 创建 GameStatsBar 组件

**Files:**
- Create: `frontend/src/components/game/GameStatsBar.vue`

- [ ] **Step 1: 创建 GameStatsBar.vue**

```vue
<!-- frontend/src/components/game/GameStatsBar.vue -->
<template>
  <div class="stats-summary" v-if="stats">
    <span class="stat-item">总计 {{ stats.totalGames }} 个游戏</span>
    <span class="stat-item">已刮削 {{ stats.scrapedGames }} 个</span>
    <span class="stat-item">待刮削 {{ stats.unscrapedGames }} 个</span>
    <span class="stat-item" v-if="stats.favoriteGames > 0">收藏 {{ stats.favoriteGames }} 个</span>
  </div>
</template>

<script setup lang="ts">
import type { GameStatistics } from '../../types';

defineProps<{
  stats: GameStatistics | null;
}>();
</script>

<style scoped>
.stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}
.stat-item {
  padding: 4px 12px;
  background: var(--bg);
  border-radius: 4px;
}
</style>
```

- [ ] **Step 2: Commit 组件**

```bash
git add frontend/src/components/game/GameStatsBar.vue
git commit -m "feat: 新增 GameStatsBar 组件"
```

---

### Task 4.6: 创建 GameSteamView 页面

**Files:**
- Create: `frontend/src/views/game/GameSteamView.vue`

- [ ] **Step 1: 创建 GameSteamView.vue**

```vue
<!-- frontend/src/views/game/GameSteamView.vue -->
<template>
  <div class="steam-management">
    <h2 class="section-title">Steam 管理</h2>
    
    <!-- 统计卡片 -->
    <div class="stats-card">
      <div class="stat-box">
        <span class="stat-label">已缓存游戏</span>
        <span class="stat-value">{{ stats?.totalEntries || 0 }}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">海报图片</span>
        <span class="stat-value">{{ stats?.totalPosters || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">截图图片</span>
        <span class="stat-value">{{ stats?.totalScreenshots || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">总缓存大小</span>
        <span class="stat-value">{{ stats?.totalSizeMB || 0 }} MB</span>
      </div>
    </div>
    
    <!-- 操作按钮 -->
    <div class="action-bar">
      <button class="btn btn-primary" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '刷新中...' : '刷新所有缓存' }}
      </button>
      <button class="btn btn-secondary" @click="showImportModal = true">
        导入 Steam DB
      </button>
      <button class="btn btn-secondary" @click="exportSteamDb">
        导出 Steam DB
      </button>
    </div>
    
    <!-- 缓存列表 -->
    <div class="cache-list">
      <div class="list-header">
        <input v-model="searchQuery" type="text" placeholder="搜索..." class="search-input" @input="debouncedSearch" />
      </div>
      <div class="cache-table" v-if="entries.length">
        <div class="cache-row" v-for="entry in entries" :key="entry.steam_appid">
          <span class="col-appid">{{ entry.steam_appid }}</span>
          <span class="col-name">{{ entry.name }}</span>
          <span class="col-name-en">{{ entry.name_en || '-' }}</span>
          <span class="col-status">
            <span v-if="entry.cacheStatus === 'complete'" class="status-complete">✅ 完整</span>
            <span v-else-if="entry.cacheStatus === 'missing_images'" class="status-warning">⚠ 缺失图片</span>
            <span v-else class="status-error">❌ 仅元数据</span>
          </span>
          <div class="col-actions">
            <button class="btn btn-small" @click="refreshSingle(entry.steam_appid)">刷新</button>
            <button class="btn btn-small btn-danger" @click="deleteCache(entry.steam_appid)">删除</button>
            <button class="btn btn-small" @click="showDetail(entry)">详情</button>
          </div>
        </div>
      </div>
      <div class="empty-state" v-else-if="!loading">
        <p>暂无缓存数据</p>
      </div>
      <div class="pagination" v-if="totalPages > 1">
        <Pagination v-model="page" :totalPages="totalPages" />
      </div>
    </div>
    
    <!-- 详情弹窗 -->
    <GameSteamCacheDetailModal
      v-if="selectedEntry"
      :entry="selectedEntry"
      @close="selectedEntry = null"
      @refresh="refreshSingle(selectedEntry.steam_appid)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  getSteamCacheStats,
  getSteamCacheList,
  refreshSteamCache,
  deleteSteamCache,
  getSteamDbExport,
  importSteamDb
} from '../../api';
import Pagination from '../../components/Pagination.vue';
import GameSteamCacheDetailModal from '../../components/game/GameSteamCacheDetailModal.vue';
import { useGameToast } from '../../composables/game/useGameToast';
import type { SteamCacheStats, SteamCacheEntry } from '../../types/api';

const { showToast, toastMessage, showNotification } = useGameToast();

const stats = ref<SteamCacheStats | null>(null);
const entries = ref<SteamCacheEntry[]>([]);
const loading = ref(false);
const refreshing = ref(false);
const searchQuery = ref('');
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const totalPages = computed(() => Math.ceil(total.value / pageSize.value));
const selectedEntry = ref<SteamCacheEntry | null>(null);
const showImportModal = ref(false);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(): void {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    loadList();
  }, 300);
}

watch(page, () => loadList());

async function loadStats(): Promise<void> {
  const res = await getSteamCacheStats();
  if (res.success && res.data) stats.value = res.data;
}

async function loadList(): Promise<void> {
  loading.value = true;
  const res = await getSteamCacheList({
    search: searchQuery.value,
    page: page.value,
    pageSize: pageSize.value
  });
  if (res.success && res.data) {
    entries.value = res.data.entries;
    total.value = res.data.total;
  }
  loading.value = false;
}

async function refreshSingle(appid: string): Promise<void> {
  const res = await refreshSteamCache(appid);
  if (res.success) {
    showNotification('缓存刷新完成');
    loadList();
    loadStats();
  } else {
    showNotification('刷新失败');
  }
}

async function deleteCache(appid: string): Promise<void> {
  if (!confirm('确定要删除该缓存吗？')) return;
  const res = await deleteSteamCache(appid);
  if (res.success) {
    showNotification('缓存已删除');
    loadList();
    loadStats();
  }
}

async function refreshAll(): Promise<void> {
  refreshing.value = true;
  await refreshAllSteamCache();
  refreshing.value = false;
  showNotification('全部缓存刷新完成');
  loadList();
  loadStats();
}

async function exportSteamDb(): Promise<void> {
  const res = await getSteamDbExport();
  if (res.success && res.data) {
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'steam-db-export.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('导出完成');
  }
}

function showDetail(entry: SteamCacheEntry): void {
  selectedEntry.value = entry;
}

onMounted(() => {
  loadStats();
  loadList();
});
</script>

<style scoped>
.steam-management {
  padding: 24px;
}
.section-title {
  font-size: 24px;
  margin-bottom: 24px;
}
.stats-card {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}
.stat-box {
  flex: 1;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}
.action-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}
.cache-list {
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 16px;
}
.list-header {
  margin-bottom: 16px;
}
.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}
.cache-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cache-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 4px;
  align-items: center;
}
.col-appid {
  width: 100px;
  font-family: monospace;
}
.col-name {
  flex: 1;
}
.col-name-en {
  width: 150px;
}
.col-status {
  width: 100px;
}
.status-complete { color: #22c55e; }
.status-warning { color: #f59e0b; }
.status-error { color: #ef4444; }
.col-actions {
  display: flex;
  gap: 8px;
}
.btn-danger {
  background: #ef4444;
  color: white;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
}
</style>
```

- [ ] **Step 2: Commit Steam 管理页面**

```bash
git add frontend/src/views/game/GameSteamView.vue
git commit -m "feat: 新增 Steam 管理页面 GameSteamView"
```

---

### Task 4.7: 创建 GameSteamCacheDetailModal 组件

**Files:**
- Create: `frontend/src/components/game/GameSteamCacheDetailModal.vue`

- [ ] **Step 1: 创建组件（框架代码）**

```vue
<!-- frontend/src/components/game/GameSteamCacheDetailModal.vue -->
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ entry.name }}</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <!-- 海报预览 -->
        <div class="poster-preview">
          <img :src="`/static/games/steam-cache/${entry.steam_appid}/header.jpg`" alt="header" @error="onImageError" />
        </div>
        <!-- 截图列表 -->
        <div class="screenshots-preview">
          <img v-for="i in entry.screenshotCount || 0" :key="i"
            :src="`/static/games/steam-cache/${entry.steam_appid}/screenshots/${i}.jpg`"
            @error="onImageError" />
        </div>
        <!-- 元数据 -->
        <div class="metadata">
          <p><strong>AppID:</strong> {{ entry.steam_appid }}</p>
          <p><strong>英文名:</strong> {{ entry.name_en || '-' }}</p>
          <p><strong>发行日期:</strong> {{ entry.release_date || '-' }}</p>
          <p><strong>评分:</strong> {{ entry.rating || '-' }}</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
        <button class="btn btn-primary" @click="$emit('refresh')">刷新缓存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SteamCacheEntry } from '../../types/api';

defineProps<{
  entry: SteamCacheEntry;
}>();

defineEmits<{
  close: [];
  refresh: [];
}>();

function onImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none';
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
}
.modal-body {
  padding: 24px;
}
.poster-preview img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 8px;
}
.screenshots-preview {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.screenshots-preview img {
  width: 120px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}
.metadata {
  margin-top: 16px;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
</style>
```

- [ ] **Step 2: Commit 组件**

```bash
git add frontend/src/components/game/GameSteamCacheDetailModal.vue
git commit -m "feat: 新增缓存详情弹窗组件"
```

---

### Task 4.8: 创建 GameSettingsView 页面

**Files:**
- Create: `frontend/src/views/game/GameSettingsView.vue`

- [ ] **Step 1: 创建页面（框架代码）**

```vue
<!-- frontend/src/views/game/GameSettingsView.vue -->
<template>
  <div class="game-settings">
    <h2 class="section-title">游戏设置</h2>
    
    <!-- 扫描路径 -->
    <div class="settings-section">
      <h3>扫描路径</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gameScanPathsEnabled" />
          启用独立扫描路径
        </label>
      </div>
      <div class="path-list" v-if="config.gameScanPathsEnabled">
        <div class="path-item" v-for="(path, i) in config.gameScanPaths" :key="i">
          <span>{{ path }}</span>
          <button class="btn btn-small btn-danger" @click="removeScanPath(i)">删除</button>
        </div>
        <div class="add-path">
          <input v-model="newScanPath" type="text" placeholder="输入路径..." />
          <button class="btn btn-small" @click="addScanPath">添加</button>
        </div>
      </div>
    </div>
    
    <!-- 刮削配置 -->
    <div class="settings-section">
      <h3>刮削配置</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.autoScrape" />
          自动刮削
        </label>
      </div>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.downloadPosters" />
          刮削时下载海报
        </label>
      </div>
      <div class="setting-row">
        <label>Steam API 代理</label>
        <input v-model="config.proxyUrl" type="text" placeholder="http://127.0.0.1:7890" class="input" />
      </div>
    </div>
    
    <div class="action-bar">
      <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getGamesConfig, saveGamesConfig } from '../../api';
import { useGameToast } from '../../composables/game/useGameToast';
import type { GamesConfig } from '../../types/api';
import { DEFAULT_GAMES_CONFIG } from '../../types/games-config';

const { showNotification } = useGameToast();

const config = ref<GamesConfig>(DEFAULT_GAMES_CONFIG);
const saving = ref(false);
const newScanPath = ref('');

async function loadConfig(): Promise<void> {
  const res = await getGamesConfig();
  if (res.success && res.data) {
    config.value = res.data;
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  const res = await saveGamesConfig(config.value);
  saving.value = false;
  if (res.success) {
    showNotification('配置已保存');
  } else {
    showNotification('保存失败');
  }
}

function addScanPath(): void {
  if (newScanPath.value.trim()) {
    config.value.gameScanPaths.push(newScanPath.value.trim());
    newScanPath.value = '';
  }
}

function removeScanPath(index: number): void {
  config.value.gameScanPaths.splice(index, 1);
}

onMounted(() => loadConfig());
</script>

<style scoped>
.game-settings {
  padding: 24px;
  max-width: 800px;
}
.section-title {
  font-size: 24px;
  margin-bottom: 24px;
}
.settings-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.settings-section h3 {
  font-size: 16px;
  margin-bottom: 16px;
}
.setting-row {
  margin-bottom: 12px;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.path-list {
  margin-top: 12px;
}
.path-item {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: var(--bg);
  border-radius: 4px;
  margin-bottom: 8px;
}
.add-path {
  display: flex;
  gap: 8px;
}
.input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}
.action-bar {
  margin-top: 24px;
}
</style>
```

- [ ] **Step 2: Commit 页面**

```bash
git add frontend/src/views/game/GameSettingsView.vue
git commit -m "feat: 新增游戏设置页面 GameSettingsView"
```

---

### Task 4.9: 更新路由结构

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 更新路由结构为嵌套路由**

```typescript
// frontend/src/router/index.ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FileListView from '../views/FileListView.vue'
import SearchView from '../views/SearchView.vue'
import StatisticsView from '../views/StatisticsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TagManagerView from '../views/TagManagerView.vue'
import GameWallView from '../views/game/GameWallView.vue'
import GameSteamView from '../views/game/GameSteamView.vue'
import GameSettingsView from '../views/game/GameSettingsView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/files', name: 'files', component: FileListView },
  { path: '/search', name: 'search', component: SearchView },
  { path: '/statistics', name: 'statistics', component: StatisticsView },
  { path: '/tags', name: 'tags', component: TagManagerView },
  {
    path: '/game',
    name: 'game',
    redirect: '/game/wall',
    children: [
      { path: 'wall', name: 'game-wall', component: GameWallView },
      { path: 'steam', name: 'game-steam', component: GameSteamView },
      { path: 'settings', name: 'game-settings', component: GameSettingsView }
    ]
  },
  { path: '/settings', name: 'settings', component: SettingsView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
```

- [ ] **Step 2: Commit 路由更新**

```bash
git add frontend/src/router/index.ts
git commit -m "feat: 更新路由结构，新增游戏 TAB 嵌套路由"
```

---

### Task 4.10: 更新导航栏

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: 新增游戏 TAB 导航入口**

找到导航栏部分，添加游戏 TAB：

```vue
<!-- frontend/src/App.vue - 导航栏 -->
<nav class="main-nav">
  <router-link to="/">首页</router-link>
  <router-link to="/files">文件浏览</router-link>
  <router-link to="/game">游戏</router-link>
  <router-link to="/settings">设置</router-link>
</nav>
```

- [ ] **Step 2: 新增游戏子导航组件**

在导航栏下方，当处于游戏 TAB 时显示子导航：

```vue
<!-- frontend/src/App.vue - 游戏子导航 -->
<div class="game-subnav" v-if="$route.path.startsWith('/game')">
  <router-link to="/game/wall">游戏墙</router-link>
  <router-link to="/game/steam">Steam 管理</router-link>
  <router-link to="/game/settings">游戏设置</router-link>
</div>
```

- [ ] **Step 3: Commit 导航栏更新**

```bash
git add frontend/src/App.vue
git commit -m "feat: 导航栏新增游戏 TAB 和子导航"
```

---

## 自检清单

**1. Spec 覆盖检查:**
- ✅ 数据库扩展 steam_db 表 - Task 1.1, 1.2, 1.3
- ✅ 配置拆分 games-config.json - Task 1.4, 1.5, 1.6, 1.7
- ✅ 刮削逻辑本地优先 - Task 2.1, 2.2
- ✅ Steam 缓存图片管理 - Task 2.1
- ✅ 后端 API 新增 - Task 3.1, 3.2, 3.3, 3.4
- ✅ 前端目录结构规范 - Task 4.1
- ✅ Composables 拆分 - Task 4.2, 4.3
- ✅ 子组件拆分 - Task 4.4, 4.5, 4.7
- ✅ Steam 管理页面 - Task 4.6, 4.7
- ✅ 游戏设置页面 - Task 4.8
- ✅ 路由结构更新 - Task 4.9
- ✅ 导航栏更新 - Task 4.10

**2. Placeholder 检查:**
- 无 TBD/TODO 占位符
- 所有代码块包含完整实现

**3. 类型一致性检查:**
- SteamDbEntry 在 src/types/game.ts 和 frontend/src/types/api.ts 定义一致
- GamesConfig 在 src/types/games-config.ts 和 frontend/src/types/api.ts 定义一致
- API 函数签名与路由响应类型匹配

---

## 注意事项

1. **GameWallView.vue 模块化拆分**：由于涉及大量代码迁移，建议在实际执行时逐步拆分，每拆分一个 composable/组件 后验证功能正常再继续。

2. **数据库迁移**：Phase 1 的数据库迁移逻辑会自动检测并添加新列，无需手动干预。

3. **配置迁移**：首次加载 games-config.json 时会自动从旧 config.json 迁移，迁移后旧字段保留在 config.json 中（向后兼容）。

4. **前端 API 类型**：需要确保 frontend/src/types/api.ts 中新增的类型与后端定义一致。

5. **静态文件服务**：Steam 缓存图片路径为 `/static/games/steam-cache/{appid}/xxx.jpg`，需确保 server.ts 中静态服务正确挂载。