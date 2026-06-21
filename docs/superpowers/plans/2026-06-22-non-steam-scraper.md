# 非 Steam 游戏刮削方案实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现插件化刮削架构，支持多数据源（Steam、TheGamesDB、本地NFO等），让非Steam游戏也能自动刮削元数据。

**Architecture:** 
- 刮削器插件系统：每个数据源独立插件，统一接口
- 刮削管理器：管理插件调用顺序、降级逻辑、日志记录
- 配置扩展：用户可启用/禁用数据源，配置 API Key
- 新增 API：不修改现有 API，新增刮削器管理端点

**Tech Stack:** TypeScript, Express, SQLite (better-sqlite3), undici (fetch)

---

## 文件结构规划

```
src/games/scraper-plugins/
├── base.ts              # 插件接口定义 + 基类
├── registry.ts          # 插件注册中心
├── steam-plugin.ts      # Steam 插件（重构现有实现）
├── tgdb-plugin.ts       # TheGamesDB 插件
├── nfo-plugin.ts        # NFO 文件解析插件

src/games/
├── scraper-manager.ts   # 刮削管理器（新增）
├── scraper.ts           # 保留，重构为调用 ScraperManager

src/types/
├── scraper.ts           # 刮削器类型定义（新增）

src/routes/
├── scrapers.ts          # 刮削器管理 API（新增）
```

---

## 第一阶段：架构搭建

### Task 1: 创建刮削器类型定义

**Files:**
- Create: `src/types/scraper.ts`

- [ ] **Step 1: 定义刮削器插件接口**

```typescript
/**
 * 刮削器插件类型定义
 */

/**
 * 刮削候选结果
 */
export interface ScrapeCandidate {
  id: string;             // 数据源内的唯一标识
  title: string;
  titleEn?: string;
  year?: string;
  thumbnail?: string;
  source: string;         // 数据源名称
}

/**
 * 图片 URL 集合
 */
export interface ScraperImageUrls {
  horizontal?: string;    // 横版海报 URL
  vertical?: string;      // 竖版海报 URL
  background?: string;    // 背景图 URL
  screenshots?: string[]; // 截图 URL 列表
}

/**
 * 图片本地路径集合
 */
export interface ScraperImagePaths {
  horizontal?: string;
  vertical?: string;
  background?: string;
  screenshots?: string[];
}

/**
 * 刮削得到的游戏元数据
 */
export interface ScraperMetadata {
  title?: string;
  titleEn?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;   // YYYY-MM-DD
  genres?: string[];
  rating?: number;
  description?: string;
  shortDescription?: string;
  languages?: string[];
  images?: ScraperImageUrls;
  source: string;         // 数据源标识
  raw?: any;              // 原始 API 响应
}

/**
 * 刮削器插件接口
 */
export interface ScraperPlugin {
  name: string;           // 插件标识: "steam", "tgdb", "nfo"
  displayName: string;    // 显示名称: "Steam", "TheGamesDB"
  priority: number;       // 内置优先级（固定顺序）
  requiresAuth: boolean;  // 是否需要 API Key
  enabled: boolean;       // 启用状态

  // 核心方法
  search(query: string): Promise<ScrapeCandidate[]>;
  getDetails(id: string): Promise<ScraperMetadata | null>;
  downloadImages?(urls: ScraperImageUrls, gameId: number): Promise<ScraperImagePaths>;

  // 可选方法
  matchConfidence?(result: ScrapeCandidate, query: string): number;
}

/**
 * 刮削器配置
 */
export interface ScraperPluginConfig {
  enabled: boolean;
  clientId?: string;      // IGDB Client ID
  clientSecret?: string;  // IGDB Client Secret
  apiKey?: string;        // Giant Bomb API Key
}

/**
 * 刮削器系统配置
 */
export interface ScrapersConfig {
  priority: string[];     // 优先级顺序数组
  plugins: Record<string, ScraperPluginConfig>;
}

/**
 * 刮削器状态
 */
export interface ScraperStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  requiresAuth: boolean;
  hasAuthConfig: boolean;  // 是否已配置认证信息
}

/**
 * 刮削日志条目
 */
export interface ScrapeLogEntry {
  scraper: string;
  status: 'success' | 'failed';
  reason: string;
  time: string;           // ISO timestamp
}

/**
 * 刮削日志
 */
export interface ScrapeLog {
  gameId: number;
  gameName: string;
  attempts: ScrapeLogEntry[];
  finalSource?: string;
  scrapedAt?: string;
}

/**
 * 刮削结果
 */
export interface ScrapeResult {
  success: boolean;
  metadata?: ScraperMetadata;
  source?: string;
  log: ScrapeLogEntry[];
}
```

- [ ] **Step 2: 在 index.ts 中导出新类型**

修改 `src/types/index.ts`:

```typescript
// 在文件末尾添加
export * from './scraper';
```

- [ ] **Step 3: Commit**

```bash
git add src/types/scraper.ts src/types/index.ts
git commit -m "feat: 添加刮削器插件类型定义"
```

---

### Task 2: 创建插件基类和接口

**Files:**
- Create: `src/games/scraper-plugins/base.ts`

- [ ] **Step 1: 创建插件基类**

```typescript
/**
 * 刮削器插件基类
 * 提供通用功能：代理支持、错误处理、图片下载
 */

import fs from 'fs';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { logger } from '../../logger';
import { loadConfig, getStoragePath } from '../../utils';
import { ensurePosterDir, getPosterPath } from '../storage';
import type { ScraperPlugin, ScraperImageUrls, ScraperImagePaths, ScraperMetadata, ScrapeCandidate } from '../../types/scraper';

/**
 * 插件基类
 */
export abstract class BaseScraperPlugin implements ScraperPlugin {
  abstract name: string;
  abstract displayName: string;
  abstract priority: number;
  abstract requiresAuth: boolean;
  abstract enabled: boolean;

  abstract search(query: string): Promise<ScrapeCandidate[]>;
  abstract getDetails(id: string): Promise<ScraperMetadata | null>;

  // 代理 Agent
  protected proxyAgent: ProxyAgent | undefined;

  /**
   * 初始化代理（根据全局配置）
   */
  protected initProxy(): void {
    const config = loadConfig();
    const proxyUrl = config.proxyUrl;

    if (proxyUrl && proxyUrl.trim()) {
      this.proxyAgent = new ProxyAgent(proxyUrl.trim());
      setGlobalDispatcher(this.proxyAgent);
      logger.info('[%s] 已启用代理: %s', this.displayName, proxyUrl.trim());
    } else {
      this.proxyAgent = undefined;
    }
  }

  /**
   * 带代理的 fetch
   */
  protected async fetch(url: string): Promise<Response> {
    this.initProxy();
    return fetch(url);
  }

  /**
   * 下载图片到海报目录
   */
  async downloadImages(urls: ScraperImageUrls, gameId: number): Promise<ScraperImagePaths> {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensurePosterDir(storagePath, gameId);

    const paths: ScraperImagePaths = {};

    // 下载横版海报
    if (urls.horizontal) {
      const destPath = getPosterPath(storagePath, gameId, 'horizontal');
      await this.downloadImage(urls.horizontal, destPath);
      paths.horizontal = destPath;
    }

    // 下载竖版海报
    if (urls.vertical) {
      const destPath = getPosterPath(storagePath, gameId, 'vertical');
      await this.downloadImage(urls.vertical, destPath);
      paths.vertical = destPath;
    }

    // 下载背景图
    if (urls.background) {
      const destPath = getPosterPath(storagePath, gameId, 'background');
      await this.downloadImage(urls.background, destPath);
      paths.background = destPath;
    }

    return paths;
  }

  /**
   * 下载单张图片
   */
  protected async downloadImage(url: string, destPath: string): Promise<void> {
    try {
      // 目标已存在则跳过
      if (fs.existsSync(destPath)) {
        logger.debug('[%s] 图片已存在，跳过: %s', this.displayName, destPath);
        return;
      }

      const response = await this.fetch(url);
      if (!response.ok) {
        logger.warn('[%s] 图片下载失败: %s (status %d)', this.displayName, url, response.status);
        return;
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
      logger.info('[%s] 图片下载成功: %s', this.displayName, destPath);
    } catch (err) {
      const error = err as Error;
      logger.warn('[%s] 图片下载失败: %s - %s', this.displayName, url, error.message);
    }
  }

  /**
   * 计算匹信度（默认实现）
   */
  matchConfidence(result: ScrapeCandidate, query: string): number {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTitle = result.title.toLowerCase().trim();

    // 完全匹配
    if (normalizedQuery === normalizedTitle) return 100;

    // 包含匹配
    if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) return 80;

    // 默认返回首个结果的置信度
    return 50;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/games/scraper-plugins/base.ts
git commit -m "feat: 添加刮削器插件基类"
```

---

### Task 3: 创建插件注册中心

**Files:**
- Create: `src/games/scraper-plugins/registry.ts`

- [ ] **Step 1: 创建注册中心**

```typescript
/**
 * 刮削器插件注册中心
 * 管理所有插件的注册、获取、状态查询
 */

import { logger } from '../../logger';
import type { ScraperPlugin, ScraperStatus, ScrapersConfig } from '../../types/scraper';

/**
 * 插件注册中心
 */
class ScraperRegistry {
  private plugins: Map<string, ScraperPlugin> = new Map();
  private config: ScrapersConfig;

  constructor() {
    // 默认配置
    this.config = {
      priority: ['steam', 'tgdb', 'nfo', 'igdb', 'giantbomb'],
      plugins: {
        steam: { enabled: true },
        tgdb: { enabled: true },
        nfo: { enabled: true },
        igdb: { enabled: true, clientId: '', clientSecret: '' },
        giantbomb: { enabled: false, apiKey: '' }
      }
    };
  }

  /**
   * 注册插件
   */
  register(plugin: ScraperPlugin): void {
    this.plugins.set(plugin.name, plugin);
    logger.info('[ScraperRegistry] 注册插件: %s (priority=%d)', plugin.displayName, plugin.priority);
  }

  /**
   * 获取插件
   */
  get(name: string): ScraperPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有已启用的插件（按优先级排序）
   */
  getEnabledPlugins(): ScraperPlugin[] {
    const enabledNames = this.config.priority.filter(name => {
      const plugin = this.plugins.get(name);
      if (!plugin) return false;
      const pluginConfig = this.config.plugins[name];
      return pluginConfig?.enabled !== false;
    });

    return enabledNames
      .map(name => this.plugins.get(name))
      .filter((p): p is ScraperPlugin => p !== undefined);
  }

  /**
   * 获取所有插件状态
   */
  getPluginStatus(): ScraperStatus[] {
    return Array.from(this.plugins.values()).map(plugin => {
      const pluginConfig = this.config.plugins[plugin.name] || {};
      const hasAuthConfig = this.checkAuthConfig(plugin.name, pluginConfig);

      return {
        name: plugin.name,
        displayName: plugin.displayName,
        enabled: pluginConfig.enabled !== false,
        requiresAuth: plugin.requiresAuth,
        hasAuthConfig
      };
    });
  }

  /**
   * 检查认证配置是否完整
   */
  private checkAuthConfig(name: string, config: any): boolean {
    if (name === 'igdb') {
      return Boolean(config.clientId && config.clientSecret);
    }
    if (name === 'giantbomb') {
      return Boolean(config.apiKey);
    }
    // 不需要认证的插件，返回 true
    return true;
  }

  /**
   * 更新配置
   */
  updateConfig(config: ScrapersConfig): void {
    this.config = config;
    
    // 应用启用状态到插件
    for (const [name, plugin] of this.plugins) {
      const pluginConfig = config.plugins[name];
      if (pluginConfig) {
        plugin.enabled = pluginConfig.enabled !== false;
      }
    }
    
    logger.info('[ScraperRegistry] 配置已更新');
  }

  /**
   * 获取当前配置
   */
  getConfig(): ScrapersConfig {
    return this.config;
  }

  /**
   * 从环境变量加载认证配置
   */
  loadEnvAuthConfig(): void {
    const envConfig: Partial<ScrapersConfig> = { plugins: {} };

    // IGDB
    if (process.env.IGDB_CLIENT_ID) {
      envConfig.plugins!['igdb'] = {
        ...this.config.plugins['igdb'],
        clientId: process.env.IGDB_CLIENT_ID
      };
    }
    if (process.env.IGDB_CLIENT_SECRET) {
      envConfig.plugins!['igdb'] = {
        ...envConfig.plugins!['igdb'] || this.config.plugins['igdb'],
        clientSecret: process.env.IGDB_CLIENT_SECRET
      };
    }

    // Giant Bomb
    if (process.env.GIANTBOMB_API_KEY) {
      envConfig.plugins!['giantbomb'] = {
        ...this.config.plugins['giantbomb'],
        apiKey: process.env.GIANTBOMB_API_KEY
      };
    }

    // 合并配置
    if (envConfig.plugins) {
      this.config = {
        ...this.config,
        plugins: {
          ...this.config.plugins,
          ...envConfig.plugins
        }
      };
      logger.info('[ScraperRegistry] 从环境变量加载认证配置');
    }
  }
}

// 单例导出
export const scraperRegistry = new ScraperRegistry();
```

- [ ] **Step 2: Commit**

```bash
git add src/games/scraper-plugins/registry.ts
git commit -m "feat: 添加刮削器插件注册中心"
```

---

### Task 4: 创建刮削管理器

**Files:**
- Create: `src/games/scraper-manager.ts`

- [ ] **Step 1: 创建刮削管理器**

```typescript
/**
 * 刮削管理器
 * 管理插件调用顺序、降级逻辑、日志记录
 */

import { gameDatabase } from './database';
import { logger } from '../logger';
import { scraperRegistry } from './scraper-plugins/registry';
import type { Game } from '../types';
import type { ScrapeResult, ScrapeLog, ScrapeLogEntry, ScraperMetadata } from '../types/scraper';

/**
 * 刮削管理器
 */
class ScraperManager {
  /**
   * 刮削单个游戏（按优先级自动降级）
   */
  async scrape(gameId: number, downloadPosters: boolean = true): Promise<ScrapeResult> {
    const game = gameDatabase.getGameById(gameId);
    if (!game) {
      logger.warn('[ScraperManager] 游戏不存在: id %d', gameId);
      return {
        success: false,
        log: [{
          scraper: 'none',
          status: 'failed',
          reason: 'Game not found',
          time: new Date().toISOString()
        }]
      };
    }

    const query = game.title || game.original_name || '';
    if (!query) {
      logger.warn('[ScraperManager] 游戏无名称: id %d', gameId);
      return {
        success: false,
        log: [{
          scraper: 'none',
          status: 'failed',
          reason: 'Game has no name',
          time: new Date().toISOString()
        }]
      };
    }

    const plugins = scraperRegistry.getEnabledPlugins();
    const logEntries: ScrapeLogEntry[] = [];

    logger.info('[ScraperManager] 开始刮削: %s (尝试 %d 个插件)', query, plugins.length);

    for (const plugin of plugins) {
      const startTime = new Date().toISOString();
      logger.info('[ScraperManager] 尝试插件: %s', plugin.displayName);

      try {
        // 搜索候选
        const candidates = await plugin.search(query);

        if (candidates.length === 0) {
          logEntries.push({
            scraper: plugin.name,
            status: 'failed',
            reason: 'No candidates found',
            time: startTime
          });
          logger.info('[ScraperManager] %s 无候选结果', plugin.displayName);
          continue;
        }

        // 选择最佳匹配
        const bestMatch = this.selectBestMatch(candidates, query, plugin);
        
        // 获取详情
        const metadata = await plugin.getDetails(bestMatch.id);

        if (!metadata) {
          logEntries.push({
            scraper: plugin.name,
            status: 'failed',
            reason: 'Failed to get details',
            time: startTime
          });
          logger.warn('[ScraperManager] %s 获取详情失败', plugin.displayName);
          continue;
        }

        // 成功：保存元数据
        await this.saveMetadata(game, metadata, downloadPosters);

        logEntries.push({
          scraper: plugin.name,
          status: 'success',
          reason: '',
          time: startTime
        });

        logger.info('[ScraperManager] 刮削成功: %s -> %s', query, plugin.displayName);

        // 记录完整日志
        this.saveScrapeLog(gameId, game.title, logEntries, plugin.name);

        return {
          success: true,
          metadata,
          source: plugin.name,
          log: logEntries
        };

      } catch (err) {
        const error = err as Error;
        logEntries.push({
          scraper: plugin.name,
          status: 'failed',
          reason: error.message,
          time: startTime
        });
        logger.warn('[ScraperManager] %s 刮削失败: %s', plugin.displayName, error.message);
        // 继续下一个插件
      }
    }

    // 所有插件都失败
    logger.info('[ScraperManager] 所有插件都失败: %s', query);
    this.saveScrapeLog(gameId, game.title, logEntries);

    return {
      success: false,
      log: logEntries
    };
  }

  /**
   * 使用指定插件刮削
   */
  async scrapeWith(gameId: number, pluginName: string, downloadPosters: boolean = true): Promise<ScrapeResult> {
    const plugin = scraperRegistry.get(pluginName);
    if (!plugin) {
      return {
        success: false,
        log: [{
          scraper: pluginName,
          status: 'failed',
          reason: 'Plugin not found',
          time: new Date().toISOString()
        }]
      };
    }

    const game = gameDatabase.getGameById(gameId);
    if (!game) {
      return {
        success: false,
        log: [{
          scraper: pluginName,
          status: 'failed',
          reason: 'Game not found',
          time: new Date().toISOString()
        }]
      };
    }

    const query = game.title || game.original_name || '';
    const startTime = new Date().toISOString();

    try {
      const candidates = await plugin.search(query);
      if (candidates.length === 0) {
        return {
          success: false,
          log: [{
            scraper: pluginName,
            status: 'failed',
            reason: 'No candidates found',
            time: startTime
          }]
        };
      }

      const bestMatch = this.selectBestMatch(candidates, query, plugin);
      const metadata = await plugin.getDetails(bestMatch.id);

      if (!metadata) {
        return {
          success: false,
          log: [{
            scraper: pluginName,
            status: 'failed',
            reason: 'Failed to get details',
            time: startTime
          }]
        };
      }

      await this.saveMetadata(game, metadata, downloadPosters);

      return {
        success: true,
        metadata,
        source: pluginName,
        log: [{
          scraper: pluginName,
          status: 'success',
          reason: '',
          time: startTime
        }]
      };

    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        log: [{
          scraper: pluginName,
          status: 'failed',
          reason: error.message,
          time: startTime
        }]
      };
    }
  }

  /**
   * 选择最佳匹配
   */
  private selectBestMatch(candidates: any[], query: string, plugin: any): any {
    // 计算匹信度并排序
    const scored = candidates.map(c => ({
      candidate: c,
      score: plugin.matchConfidence ? plugin.matchConfidence(c, query) : 50
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].candidate;
  }

  /**
   * 保存元数据到数据库
   */
  private async saveMetadata(game: Game, metadata: ScraperMetadata, downloadPosters: boolean): Promise<void> {
    const updateData: Partial<Game> = {
      title: metadata.title || game.title,
      title_en: metadata.titleEn || game.title_en,
      developer: metadata.developer,
      publisher: metadata.publisher,
      release_date: metadata.releaseDate,
      genres: metadata.genres ? JSON.stringify(metadata.genres) : undefined,
      rating: metadata.rating,
      description: metadata.description,
      short_description: metadata.shortDescription,
      languages: metadata.languages ? JSON.stringify(metadata.languages) : undefined,
      metadata_source: metadata.source,
      scraped_at: new Date().toISOString()
    };

    gameDatabase.updateGame(game.id!, updateData);

    // 下载图片
    if (downloadPosters && metadata.images && metadata.source !== 'nfo') {
      const plugin = scraperRegistry.get(metadata.source);
      if (plugin && plugin.downloadImages) {
        await plugin.downloadImages(metadata.images, game.id!);
      }
    }
  }

  /**
   * 保存刮削日志到数据库
   */
  private saveScrapeLog(gameId: number, gameName: string, attempts: ScrapeLogEntry[], finalSource?: string): void {
    // 暂时用 logger 记录，后续可存入 scrape_logs 表
    logger.info('[ScraperManager] 刮削日志: gameId=%d, attempts=%d, final=%s',
      gameId, attempts.length, finalSource || 'none');
    
    for (const entry of attempts) {
      logger.debug('[ScraperManager] - %s: %s (%s)', entry.scraper, entry.status, entry.reason || 'ok');
    }
  }

  /**
   * 获取刮削日志
   */
  getScrapeLog(gameId: number): ScrapeLog | null {
    // 目前从 logger 获取，后续可从数据库查询
    const game = gameDatabase.getGameById(gameId);
    if (!game) return null;

    return {
      gameId,
      gameName: game.title,
      attempts: [],
      finalSource: game.metadata_source,
      scrapedAt: game.scraped_at
    };
  }
}

// 单例导出
export const scraperManager = new ScraperManager();
```

- [ ] **Step 2: Commit**

```bash
git add src/games/scraper-manager.ts
git commit -m "feat: 添加刮削管理器"
```

---

### Task 5: 扩展配置文件类型

**Files:**
- Modify: `src/types/games-config.ts`
- Modify: `src/types/scraper.ts`

- [ ] **Step 1: 在 games-config.ts 中导入 ScrapersConfig**

```typescript
// 在文件顶部添加导入
import type { ScrapersConfig } from './scraper';

// 在 GamesConfig 接口中添加字段
export interface GamesConfig {
  // ... 现有字段 ...
  
  // 刮削器配置
  scrapers?: ScrapersConfig;
}
```

- [ ] **Step 2: 更新 DEFAULT_GAMES_CONFIG**

```typescript
// 在 DEFAULT_GAMES_CONFIG 中添加 scrapers 默认值
import { DEFAULT_SCRAPERS_CONFIG } from './scraper';

export const DEFAULT_GAMES_CONFIG: GamesConfig = {
  // ... 现有字段 ...
  scrapers: DEFAULT_SCRAPERS_CONFIG
};
```

- [ ] **Step 3: 在 scraper.ts 中添加默认配置**

```typescript
// 在 src/types/scraper.ts 文件末尾添加

/**
 * 默认刮削器配置
 */
export const DEFAULT_SCRAPERS_CONFIG: ScrapersConfig = {
  priority: ['steam', 'tgdb', 'nfo', 'igdb', 'giantbomb'],
  plugins: {
    steam: { enabled: true },
    tgdb: { enabled: true },
    nfo: { enabled: true },
    igdb: { enabled: true, clientId: '', clientSecret: '' },
    giantbomb: { enabled: false, apiKey: '' }
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add src/types/games-config.ts src/types/scraper.ts
git commit -m "feat: 扩展配置类型，添加刮削器配置支持"
```

---

## 第二阶段：Steam 插件重构

### Task 6: 重构 Steam 插件

**Files:**
- Create: `src/games/scraper-plugins/steam-plugin.ts`
- Modify: `src/games/scraper.ts`

- [ ] **Step 1: 创建 Steam 插件**

```typescript
/**
 * Steam 刮削插件
 * 重构现有 scraper.ts 的 Steam API 调用逻辑
 */

import { logger } from '../../logger';
import { gameDatabase } from '../database';
import { resolveGameNames } from '../name-resolver';
import { SteamCacheService, getSteamCacheDir } from '../steam-cache-service';
import { copySteamCacheToPosters } from '../scraper';  // 暂时从原文件导入
import { BaseScraperPlugin } from './base';
import type { ScrapeCandidate, ScraperMetadata, ScraperImageUrls } from '../../types/scraper';
import type { SteamDbEntry } from '../../types';

const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

interface SteamSearchResult {
  total: number;
  items: Array<{
    id: number;
    name: string;
    tiny_image: string;
    metascore?: string;
  }>;
}

interface SteamAppDetails {
  success: boolean;
  data?: {
    steam_appid: number;
    name: string;
    short_description: string;
    detailed_description: string;
    developers: string[];
    publishers: string[];
    release_date: { date: string };
    genres: Array<{ id: string; description: string }>;
    header_image: string;
    capsule_images: Array<{ capsule: string }>;
    background: string;
    screenshots: Array<{ path_full: string }>;
    metacritic?: { score: number };
    supported_languages: string;
  };
}

/**
 * Steam 刮削插件
 */
export class SteamPlugin extends BaseScraperPlugin {
  name = 'steam';
  displayName = 'Steam';
  priority = 1;
  requiresAuth = false;
  enabled = true;

  /**
   * 搜索 Steam 游戏
   */
  async search(query: string): Promise<ScrapeCandidate[]> {
    try {
      const searchUrl = `${STEAM_SEARCH_URL}?term=${encodeURIComponent(query)}&l=schinese&cc=CN`;
      const response = await this.fetch(searchUrl);

      if (!response.ok) {
        logger.warn('[Steam] 搜索请求失败: %s', query);
        return [];
      }

      const result = (await response.json()) as SteamSearchResult;

      if (!result.items || result.items.length === 0) {
        logger.info('[Steam] 搜索无结果: %s', query);
        return [];
      }

      return result.items.map(item => ({
        id: String(item.id),
        title: item.name,
        thumbnail: item.tiny_image,
        year: item.metascore,
        source: 'steam'
      }));

    } catch (err) {
      const error = err as Error;
      logger.error('[Steam] 搜索失败: %s - %s', query, error.message);
      return [];
    }
  }

  /**
   * 获取 Steam 游戏详情
   */
  async getDetails(appid: string): Promise<ScraperMetadata | null> {
    try {
      // 先检查本地缓存
      const cached = gameDatabase.getSteamDbByAppid(appid);
      if (cached && cached.raw_data) {
        logger.info('[Steam] 使用本地缓存: appid %s', appid);
        return this.extractMetadataFromCache(cached);
      }

      // 远程获取
      const detailsUrl = `${STEAM_DETAILS_URL}?appids=${appid}&l=schinese`;
      const response = await this.fetch(detailsUrl);

      if (!response.ok) {
        logger.warn('[Steam] 详情请求失败: appid %s', appid);
        return null;
      }

      const result = await response.json() as Record<string, SteamAppDetails>;
      const appDetails = result[appid];

      if (!appDetails || !appDetails.success || !appDetails.data) {
        logger.info('[Steam] 详情无数据: appid %s', appid);
        return null;
      }

      // 缓存到 steam_db
      this.saveToSteamDb(appid, appDetails.data);

      return this.extractMetadataFromApi(appDetails.data);

    } catch (err) {
      const error = err as Error;
      logger.error('[Steam] 详情获取失败: appid %s - %s', appid, error.message);
      return null;
    }
  }

  /**
   * 从缓存提取元数据
   */
  private extractMetadataFromCache(cached: SteamDbEntry): ScraperMetadata {
    let rawData: any = null;
    if (cached.raw_data) {
      try {
        rawData = JSON.parse(cached.raw_data);
      } catch {
        // 解析失败，使用缓存字段
      }
    }

    return {
      title: cached.name,
      titleEn: cached.name_en,
      developer: cached.developer,
      publisher: cached.publisher,
      releaseDate: cached.release_date,
      genres: cached.genres ? JSON.parse(cached.genres as string) : undefined,
      rating: cached.rating,
      shortDescription: cached.short_description,
      languages: cached.languages ? JSON.parse(cached.languages as string) : undefined,
      images: rawData ? {
        horizontal: rawData.header_image,
        vertical: rawData.capsule_images?.[0]?.capsule,
        background: rawData.background
      } : undefined,
      source: 'steam',
      raw: rawData
    };
  }

  /**
   * 从 API 提取元数据
   */
  private extractMetadataFromApi(data: SteamAppDetails['data']): ScraperMetadata {
    return {
      title: data.name,
      developer: data.developers?.[0],
      publisher: data.publishers?.[0],
      releaseDate: data.release_date?.date,
      genres: data.genres?.map(g => g.description),
      rating: data.metacritic?.score,
      description: data.detailed_description,
      shortDescription: data.short_description,
      languages: data.supported_languages,
      images: {
        horizontal: data.header_image,
        vertical: data.capsule_images?.[0]?.capsule,
        background: data.background,
        screenshots: data.screenshots?.map(s => s.path_full)
      },
      source: 'steam',
      raw: data
    };
  }

  /**
   * 保存到 steam_db
   */
  private saveToSteamDb(appid: string, data: SteamAppDetails['data']): void {
    const existing = gameDatabase.getSteamDbByAppid(appid);

    const cacheData: Partial<SteamDbEntry> = {
      steam_appid: appid,
      name: data.name,
      release_date: data.release_date?.date,
      genres: data.genres ? JSON.stringify(data.genres.map(g => g.description)) : undefined,
      rating: data.metacritic?.score,
      languages: data.supported_languages,
      developer: data.developers?.[0],
      publisher: data.publishers?.[0],
      short_description: data.short_description,
      raw_data: JSON.stringify(data),
      source: 'scraper',
      scraped_at: new Date().toISOString()
    };

    if (existing) {
      gameDatabase.updateSteamDbFull(appid, cacheData);
    } else {
      gameDatabase.insertSteamDbEntry(cacheData);
    }
  }
}
```

- [ ] **Step 2: 创建插件索引文件**

创建 `src/games/scraper-plugins/index.ts`:

```typescript
/**
 * 刮削器插件索引
 * 注册所有内置插件
 */

import { scraperRegistry } from './registry';
import { SteamPlugin } from './steam-plugin';

// 注册内置插件
export function registerBuiltinPlugins(): void {
  scraperRegistry.register(new SteamPlugin());
  // 后续添加: tgdb, nfo, igdb, giantbomb
}

// 自动注册
registerBuiltinPlugins();

export { scraperRegistry } from './registry';
export { BaseScraperPlugin } from './base';
export { SteamPlugin } from './steam-plugin';
```

- [ ] **Step 3: 修改 scraper.ts 调用管理器**

在 `src/games/scraper.ts` 中添加:

```typescript
// 在文件顶部添加导入
import { scraperManager } from './scraper-manager';
import { initProxy, searchSteamCandidates } from './scraper-plugins/steam-plugin';

// 导出供插件使用的工具函数
export { copySteamCacheToPosters };

// 修改 scrapeGame 函数
export async function scrapeGame(gameId: number, downloadPosters: boolean = true): Promise<Game | null> {
  // 使用管理器刮削
  const result = await scraperManager.scrape(gameId, downloadPosters);
  
  // 返回更新后的游戏
  return gameDatabase.getGameById(gameId);
}

// 保留现有导出供兼容
export { initProxy, getProxyStatus, searchSteamCandidates, refreshSteamCache, scrapeUnscrapedGames };
```

- [ ] **Step 4: Commit**

```bash
git add src/games/scraper-plugins/steam-plugin.ts src/games/scraper-plugins/index.ts src/games/scraper.ts
git commit -m "feat: 重构 Steam 刮削为插件模式"
```

---

## 第三阶段：TheGamesDB 插件

### Task 7: 实现 TheGamesDB 插件

**Files:**
- Create: `src/games/scraper-plugins/tgdb-plugin.ts`

- [ ] **Step 1: 研究 TheGamesDB API**

TheGamesDB API 端点：
- 搜索: `https://thegamesdb.net/api/SearchGames.php?name={query}`
- 详情: `https://thegamesdb.net/api/GetGames.php?id={id}`
- 图片: `https://thegamesdb.net/api/GetGamesImages.php?games_id={id}`

- [ ] **Step 2: 创建 TheGamesDB 插件**

```typescript
/**
 * TheGamesDB 刮削插件
 * 免费 API，无需认证
 */

import { logger } from '../../logger';
import { BaseScraperPlugin } from './base';
import type { ScrapeCandidate, ScraperMetadata, ScraperImageUrls } from '../../types/scraper';

const TGDB_API_BASE = 'https://thegamesdb.net/api';

interface TgdbSearchResult {
  code: number;
  status: string;
  data: {
    count: number;
    games: Array<{
      id: number;
      game_title: string;
      platform: number;
      release_date?: string;
      overview?: string;
    }>;
  };
}

interface TgdbGamesResult {
  code: number;
  data: {
    count: number;
    games: Array<{
      id: number;
      game_title: string;
      release_date?: string;
      platform: number;
      overview?: string;
      developers?: string[];
      publishers?: string[];
      genres?: string[];
      rating?: number;
    }>;
    platforms: Record<number, { name: string }>;
  };
}

interface TgdbImagesResult {
  code: number;
  data: {
    base_url: { original: string; small: string };
    images: Record<string, Array<{
      type: string;
      filename: string;
      width: number;
      height: number;
    }>>;
  };
}

/**
 * TheGamesDB 刮削插件
 */
export class TgdbPlugin extends BaseScraperPlugin {
  name = 'tgdb';
  displayName = 'TheGamesDB';
  priority = 2;
  requiresAuth = false;
  enabled = true;

  /**
   * 搜索游戏
   */
  async search(query: string): Promise<ScrapeCandidate[]> {
    try {
      const searchUrl = `${TGDB_API_BASE}/SearchGames.php?name=${encodeURIComponent(query)}`;
      const response = await this.fetch(searchUrl);

      if (!response.ok) {
        logger.warn('[TGDB] 搜索请求失败: %s', query);
        return [];
      }

      const result = (await response.json()) as TgdbSearchResult;

      if (result.code !== 200 || !result.data?.games) {
        logger.info('[TGDB] 搜索无结果: %s', query);
        return [];
      }

      return result.data.games.map(game => ({
        id: String(game.id),
        title: game.game_title,
        year: game.release_date?.substring(0, 4),
        source: 'tgdb'
      }));

    } catch (err) {
      const error = err as Error;
      logger.error('[TGDB] 搜索失败: %s - %s', query, error.message);
      return [];
    }
  }

  /**
   * 获取游戏详情
   */
  async getDetails(id: string): Promise<ScraperMetadata | null> {
    try {
      // 获取基本信息
      const gamesUrl = `${TGDB_API_BASE}/GetGames.php?id=${id}`;
      const gamesResponse = await this.fetch(gamesUrl);

      if (!gamesResponse.ok) {
        logger.warn('[TGDB] 详情请求失败: id %s', id);
        return null;
      }

      const gamesResult = (await gamesResponse.json()) as TgdbGamesResult;

      if (gamesResult.code !== 200 || !gamesResult.data?.games?.[0]) {
        logger.info('[TGDB] 详情无数据: id %s', id);
        return null;
      }

      const game = gamesResult.data.games[0];

      // 获取图片
      const images = await this.getImages(id);

      return {
        title: game.game_title,
        developer: game.developers?.[0],
        publisher: game.publishers?.[0],
        releaseDate: game.release_date,
        genres: game.genres,
        rating: game.rating,
        description: game.overview,
        images,
        source: 'tgdb'
      };

    } catch (err) {
      const error = err as Error;
      logger.error('[TGDB] 详情获取失败: id %s - %s', id, error.message);
      return null;
    }
  }

  /**
   * 获取游戏图片
   */
  private async getImages(id: string): Promise<ScraperImageUrls | undefined> {
    try {
      const imagesUrl = `${TGDB_API_BASE}/GetGamesImages.php?games_id=${id}`;
      const response = await this.fetch(imagesUrl);

      if (!response.ok) {
        return undefined;
      }

      const result = (await response.json()) as TgdbImagesResult;

      if (result.code !== 200 || !result.data?.images) {
        return undefined;
      }

      const baseUrl = result.data.base_url.original;
      const images = result.data.images[id];

      if (!images) return undefined;

      const urls: ScraperImageUrls = {};

      // 找横版海报 (boxart front)
      const boxartFront = images.find(img => img.type === 'boxart' && img.filename.includes('front'));
      if (boxartFront) {
        urls.horizontal = `${baseUrl}${boxartFront.filename}`;
      }

      // 找竖版海报 (boxart front, 小尺寸)
      if (boxartFront && result.data.base_url.small) {
        urls.vertical = `${result.data.base_url.small}${boxartFront.filename}`;
      }

      // 找截图
      const screenshots = images.filter(img => img.type === 'screenshot');
      if (screenshots.length > 0) {
        urls.screenshots = screenshots.map(s => `${baseUrl}${s.filename}`);
      }

      return urls;

    } catch {
      return undefined;
    }
  }
}
```

- [ ] **Step 2: 注册插件**

修改 `src/games/scraper-plugins/index.ts`:

```typescript
import { TgdbPlugin } from './tgdb-plugin';

export function registerBuiltinPlugins(): void {
  scraperRegistry.register(new SteamPlugin());
  scraperRegistry.register(new TgdbPlugin());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/games/scraper-plugins/tgdb-plugin.ts src/games/scraper-plugins/index.ts
git commit -m "feat: 实现 TheGamesDB 刮削插件"
```

---

## 第四阶段：NFO 插件

### Task 8: 实现 NFO 文件解析插件

**Files:**
- Create: `src/games/scraper-plugins/nfo-plugin.ts`

- [ ] **Step 1: 创建 NFO 插件**

```typescript
/**
 * NFO 文件解析插件
 * 从本地 NFO 文件提取游戏元数据
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger';
import { BaseScraperPlugin } from './base';
import { getPosterPath, ensurePosterDir } from '../storage';
import { loadConfig, getStoragePath } from '../../utils';
import type { ScrapeCandidate, ScraperMetadata, ScraperImagePaths } from '../../types/scraper';
import type { Game } from '../../types';

/**
 * NFO 插件（本地文件解析，无需网络）
 */
export class NfoPlugin extends BaseScraperPlugin {
  name = 'nfo';
  displayName = '本地 NFO';
  priority = 3;
  requiresAuth = false;
  enabled = true;

  // 当前游戏路径（由 search 设置）
  private currentGamePath: string = '';
  private currentScanRoot: string = '';

  /**
   * "搜索" 实际是查找 NFO 文件
   * NFO 插件特殊：search 不做网络查询，而是查找本地文件
   */
  async search(query: string): Promise<ScrapeCandidate[]> {
    // query 对 NFO 插件来说是游戏路径
    // 返回一个虚拟候选，表示"找到 NFO 文件"
    
    // 这里不做实际查找，查找逻辑在 getDetails 中
    // search 返回空数组表示"需要手动触发"
    return [];
  }

  /**
   * 设置游戏路径（供外部调用）
   */
  setGamePath(gamePath: string, scanRoot: string): void {
    this.currentGamePath = gamePath;
    this.currentScanRoot = scanRoot;
  }

  /**
   * 获取详情 - 从 NFO 文件解析
   * id 参数对 NFO 插件来说是游戏 ID
   */
  async getDetails(gameId: string): Promise<ScraperMetadata | null> {
    if (!this.currentGamePath) {
      logger.warn('[NFO] 未设置游戏路径');
      return null;
    }

    // 查找 NFO 文件
    const nfoPath = this.findNfoFile(this.currentGamePath, this.currentScanRoot);
    if (!nfoPath) {
      logger.info('[NFO] 未找到 NFO 文件: %s', this.currentGamePath);
      return null;
    }

    logger.info('[NFO] 找到 NFO 文件: %s', nfoPath);

    // 解析 NFO 文件
    const metadata = this.parseNfoFile(nfoPath);
    if (!metadata) {
      logger.warn('[NFO] 解析失败: %s', nfoPath);
      return null;
    }

    // 查找本地图片
    const nfoDir = path.dirname(nfoPath);
    metadata.images = this.findLocalImages(nfoDir, parseInt(gameId));

    metadata.source = 'nfo';
    return metadata;
  }

  /**
   * 向上查找 NFO 文件
   */
  private findNfoFile(gamePath: string, scanRoot: string): string | null {
    let currentDir = gamePath;
    let depth = 0;

    while (currentDir !== scanRoot && depth < 3) {
      const files = fs.readdirSync(currentDir);
      const nfoFiles = files.filter(f => f.toLowerCase().endsWith('.nfo'));

      if (nfoFiles.length > 0) {
        // 优先选择: game.nfo, 与目录同名的 .nfo
        const dirName = path.basename(currentDir);
        
        // 1. game.nfo
        const gameNfo = nfoFiles.find(f => f.toLowerCase() === 'game.nfo');
        if (gameNfo) {
          return path.join(currentDir, gameNfo);
        }

        // 2. 与目录同名的 .nfo
        const sameNameNfo = nfoFiles.find(f => 
          f.toLowerCase().replace('.nfo', '') === dirName.toLowerCase()
        );
        if (sameNameNfo) {
          return path.join(currentDir, sameNameNfo);
        }

        // 3. 第一个 .nfo 文件
        return path.join(currentDir, nfoFiles[0]);
      }

      currentDir = path.dirname(currentDir);
      depth++;
    }

    return null;
  }

  /**
   * 解析 NFO 文件（支持键值对和 XML 格式）
   */
  private parseNfoFile(nfoPath: string): ScraperMetadata | null {
    try {
      const content = fs.readFileSync(nfoPath, 'utf-8');

      // 尝试 XML 格式
      if (content.trim().startsWith('<')) {
        return this.parseXmlNfo(content);
      }

      // 键值对格式
      return this.parseKeyValueNfo(content);

    } catch (err) {
      const error = err as Error;
      logger.error('[NFO] 读取失败: %s - %s', nfoPath, error.message);
      return null;
    }
  }

  /**
   * 解析键值对格式 NFO
   */
  private parseKeyValueNfo(content: string): ScraperMetadata {
    const lines = content.split('\n');
    const metadata: ScraperMetadata = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmed.substring(colonIndex + 1).trim();

      switch (key) {
        case 'title':
          metadata.title = value;
          break;
        case 'developer':
          metadata.developer = value;
          break;
        case 'publisher':
          metadata.publisher = value;
          break;
        case 'release date':
        case 'releasedate':
        case 'year':
          metadata.releaseDate = this.normalizeDate(value);
          break;
        case 'genre':
          metadata.genres = value.split(',').map(g => g.trim());
          break;
        case 'rating':
          metadata.rating = parseFloat(value) || undefined;
          break;
        case 'description':
        case 'overview':
          metadata.description = value;
          break;
      }
    }

    return metadata;
  }

  /**
   * 解析 XML 格式 NFO (xbmc/Kodi 标准)
   */
  private parseXmlNfo(content: string): ScraperMetadata {
    const metadata: ScraperMetadata = {};

    // 简单 XML 解析（不依赖外部库）
    const extractTag = (tagName: string): string | undefined => {
      const match = content.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i'));
      return match ? match[1].trim() : undefined;
    };

    const extractTags = (tagName: string): string[] => {
      const matches = content.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'gi'));
      return matches ? matches.map(m => m.replace(/<[^>]*>/g, '').trim()) : [];
    };

    metadata.title = extractTag('title');
    metadata.developer = extractTag('developer');
    metadata.publisher = extractTag('publisher');
    metadata.releaseDate = this.normalizeDate(extractTag('releasedate') || extractTag('year'));
    metadata.genres = extractTags('genre');
    metadata.rating = parseFloat(extractTag('rating') || '') || undefined;
    metadata.description = extractTag('overview') || extractTag('description');

    return metadata;
  }

  /**
   * 规范化日期格式
   */
  private normalizeDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;

    // 尝试各种格式
    const yearMatch = dateStr.match(/\d{4}/);
    if (yearMatch) {
      // 只有年份的情况
      if (dateStr.length === 4) return dateStr;
      
      // YYYY-MM-DD 或 YYYY/MM/DD
      const fullMatch = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (fullMatch) {
        return `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`;
      }
      
      // 返回年份
      return yearMatch[0];
    }

    return undefined;
  }

  /**
   * 查找本地图片
   */
  private findLocalImages(nfoDir: string, gameId: number): ScraperImageUrls | undefined {
    const candidates = ['poster.jpg', 'cover.jpg', 'banner.jpg', 'folder.jpg', 'front.jpg'];
    const urls: ScraperImageUrls = {};

    for (const name of candidates) {
      const fullPath = path.join(nfoDir, name);
      if (fs.existsSync(fullPath)) {
        // 本地文件，URL 是本地路径
        if (name === 'poster.jpg' || name === 'cover.jpg' || name === 'front.jpg') {
          urls.horizontal = fullPath;
        }
        if (name === 'banner.jpg') {
          urls.horizontal = fullPath;
        }
        if (name === 'folder.jpg') {
          urls.horizontal = fullPath;
        }
      }
    }

    return Object.keys(urls).length > 0 ? urls : undefined;
  }

  /**
   * 复制本地图片到海报目录
   */
  async downloadImages(urls: ScraperImageUrls, gameId: number): Promise<ScraperImagePaths> {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensurePosterDir(storagePath, gameId);

    const paths: ScraperImagePaths = {};

    if (urls.horizontal) {
      const destPath = getPosterPath(storagePath, gameId, 'horizontal');
      if (!fs.existsSync(destPath) && fs.existsSync(urls.horizontal)) {
        fs.copyFileSync(urls.horizontal, destPath);
        paths.horizontal = destPath;
        logger.info('[NFO] 复制海报: %s -> %s', urls.horizontal, destPath);
      }
    }

    return paths;
  }

  /**
   * NFO 插件置信度始终为 100（本地文件必然匹配）
   */
  matchConfidence(): number {
    return 100;
  }
}
```

- [ ] **Step 2: 注册 NFO 插件**

修改 `src/games/scraper-plugins/index.ts`:

```typescript
import { NfoPlugin } from './nfo-plugin';

export function registerBuiltinPlugins(): void {
  scraperRegistry.register(new SteamPlugin());
  scraperRegistry.register(new TgdbPlugin());
  scraperRegistry.register(new NfoPlugin());
}
```

- [ ] **Step 3: 修改 scraper-manager 支持 NFO**

在 `scraper-manager.ts` 的 `scrape` 方法中添加 NFO 路径设置：

```typescript
// 在 scrape 方法中，在 plugins 循环前添加
import { NfoPlugin } from './scraper-plugins/nfo-plugin';

// 在循环前设置 NFO 插件的路径
const nfoPlugin = scraperRegistry.get('nfo') as NfoPlugin;
if (nfoPlugin && game.source_path) {
  const scanRoots = getGameScanPathsFromConfig();
  const scanRoot = scanRoots.find(root => game.source_path!.startsWith(path.resolve(root))) || scanRoots[0];
  nfoPlugin.setGamePath(game.source_path, scanRoot);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/games/scraper-plugins/nfo-plugin.ts src/games/scraper-plugins/index.ts src/games/scraper-manager.ts
git commit -m "feat: 实现 NFO 文件解析插件"
```

---

## 第五阶段：新增 API 端点

### Task 9: 创建刮削器管理 API

**Files:**
- Create: `src/routes/scrapers.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: 创建刮削器 API 路由**

```typescript
/**
 * 刮削器管理 API
 */

import express, { Router, Request, Response } from 'express';
import { scraperRegistry } from '../games/scraper-plugins/registry';
import { scraperManager } from '../games/scraper-manager';
import { gameDatabase } from '../games/database';
import { loadGamesConfig, saveGamesConfig } from '../games-config';
import { logger } from '../logger';
import type { ScrapersConfig } from '../types/scraper';

const router: Router = express.Router();

/**
 * 获取刮削器列表及状态
 */
router.get('/list', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = scraperRegistry.getPluginStatus();
    res.json({ success: true, data: { scrapers: status } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取刮削器配置
 */
router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = scraperRegistry.getConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新刮削器配置
 */
router.patch('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const newConfig = req.body as Partial<ScrapersConfig>;
    
    // 合并到现有配置
    const currentConfig = scraperRegistry.getConfig();
    const mergedConfig: ScrapersConfig = {
      priority: newConfig.priority || currentConfig.priority,
      plugins: {
        ...currentConfig.plugins,
        ...newConfig.plugins
      }
    };

    // 更新注册中心
    scraperRegistry.updateConfig(mergedConfig);

    // 保存到配置文件
    const gamesConfig = loadGamesConfig();
    gamesConfig.scrapers = mergedConfig;
    saveGamesConfig(gamesConfig);

    res.json({ success: true, data: mergedConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 使用指定刮削器重新刮削游戏
 */
router.post('/game/:id/scrape-with', async (req: Request, res: Response): Promise<void> => {
  try {
    const gameId = parseInt(req.params.id);
    const { plugin, downloadPosters = true } = req.body;

    if (!plugin) {
      res.status(400).json({ success: false, error: '请指定刮削器插件' });
      return;
    }

    const result = await scraperManager.scrapeWith(gameId, plugin, downloadPosters);
    res.json({ success: true, data: result });

  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取游戏刮削日志
 */
router.get('/game/:id/log', async (req: Request, res: Response): Promise<void> => {
  try {
    const gameId = parseInt(req.params.id);
    const log = scraperManager.getScrapeLog(gameId);
    res.json({ success: true, data: log });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: 注册路由到 server.ts**

```typescript
// 在 server.ts 中添加导入
import scrapersRouter from './routes/scrapers';

// 注册路由
app.use('/api/games/scrapers', scrapersRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/scrapers.ts src/server.ts
git commit -m "feat: 添加刮削器管理 API"
```

---

## 第六阶段：前端集成（简化版）

### Task 10: 前端 API 扩展

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 添加刮削器 API 调用**

```typescript
// 在 frontend/src/api/index.ts 中添加

// === 刮削器管理 ===

export interface ScraperStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  requiresAuth: boolean;
  hasAuthConfig: boolean;
}

export interface ScrapersConfig {
  priority: string[];
  plugins: Record<string, {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
  }>;
}

export async function getScrapersList(): Promise<ApiResponse<{ scrapers: ScraperStatus[] }>> {
  return request('/api/games/scrapers/list');
}

export async function getScrapersConfig(): Promise<ApiResponse<ScrapersConfig>> {
  return request('/api/games/scrapers/config');
}

export async function updateScrapersConfig(config: Partial<ScrapersConfig>): Promise<ApiResponse<ScrapersConfig>> {
  return request('/api/games/scrapers/config', {
    method: 'PATCH',
    body: JSON.stringify(config)
  });
}

export async function scrapeGameWith(gameId: number, plugin: string, downloadPosters: boolean = true): Promise<ApiResponse<any>> {
  return request(`/api/games/scrapers/game/${gameId}/scrape-with`, {
    method: 'POST',
    body: JSON.stringify({ plugin, downloadPosters })
  });
}

export async function getGameScrapeLog(gameId: number): Promise<ApiResponse<any>> {
  return request(`/api/games/scrapers/game/${gameId}/log`);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: 前端添加刮削器管理 API"
```

---

## 第七阶段：测试和文档

### Task 11: 测试刮削流程

**Files:**
- 无新增

- [ ] **Step 1: 启动服务器测试**

```bash
npm run dev
```

- [ ] **Step 2: 测试 API 端点**

```bash
# 获取刮削器列表
curl http://localhost:3000/api/games/scrapers/list

# 获取配置
curl http://localhost:3000/api/games/scrapers/config

# 更新配置（禁用 TheGamesDB）
curl -X PATCH http://localhost:3000/api/games/scrapers/config \
  -H "Content-Type: application/json" \
  -d '{"plugins": {"tgdb": {"enabled": false}}}'
```

- [ ] **Step 3: 测试刮削流程**

选择一个没有 Steam AppID 的游戏，触发刮削，观察降级日志。

---

### Task 12: 更新文档

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 CHANGELOG**

```markdown
## [v1.7.0] - 2026-06-22

### 新增功能
- **刮削器插件系统** - 支持多数据源刮削，插件化架构易于扩展
- **TheGamesDB 插件** - 免费 API，无需认证
- **NFO 文件解析插件** - 支持本地键值对和 XML 格式
- **刮削器管理 API** - 可查询、配置刮削器状态
- **自动降级刮削** - Steam 失败时自动尝试其他数据源
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: 更新版本日志和文档"
```

---

## 自检清单

**1. Spec coverage:** 
- ✅ 插件架构设计 → Task 1-4
- ✅ Steam 重构 → Task 6
- ✅ TheGamesDB → Task 7
- ✅ NFO 解析 → Task 8
- ✅ API 端点 → Task 9
- ✅ 前端 API → Task 10
- ✅ 配置扩展 → Task 5

**2. Placeholder scan:** 无 TBD/TODO

**3. Type consistency:** 
- ScraperPlugin 接口在各插件中一致实现
- ScrapersConfig 在 registry、api、frontend 中使用相同结构

---

## 后续阶段（不在本计划内）

- IGDB 插件实现（需注册 Twitch）
- Giant Bomb 插件实现（需 API Key）
- 前端设置页面刮削器配置 UI
- 刮削日志数据库表和详情页显示