/**
 * 刮削管理器
 * 协调多个插件按优先级顺序执行刮削
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger';
import { gameDatabase } from '../database';
import { cleanGameName } from '../name-cleaner';
import { resolveGameNames } from '../name-resolver';
import { getStoragePath, loadConfig } from '../../utils';
import { ensurePosterDir, getPosterPath, ensureGamesDirs } from '../storage';
import { SteamCacheService, getSteamCacheDir } from '../steam-cache-service';
import { scraperRegistry } from './registry';
import type {
  ScraperMetadata,
  ScrapeCandidate,
  ScrapeLogEntry,
  ScraperImageUrls
} from '../../types/scraper';
import type { Game } from '../../types';

/**
 * 刮削管理器
 */
class ScraperManager {
  /**
   * 刮削单个游戏
   * 按优先级尝试各个插件，返回首个成功的结果
   */
  async scrape(gameId: number, downloadPosters: boolean = true): Promise<Game | null> {
    const game = gameDatabase.getGameById(gameId);
    if (!game) {
      logger.warn('[ScraperManager] 游戏不存在: id %d', gameId);
      return null;
    }

    const log: ScrapeLogEntry[] = [];
    let bestMatch: { candidate: ScrapeCandidate; pluginName: string; confidence: number } | null = null;

    // 获取启用的插件（按优先级排序）
    const plugins = scraperRegistry.getEnabledPlugins();

    if (plugins.length === 0) {
      logger.warn('[ScraperManager] 无可用插件');
      return game;
    }

    // 1. 如果已有 steam_appid，优先使用 Steam 插件直接获取详情
    if (game.steam_appid) {
      const steamPlugin = plugins.find(p => p.name === 'steam');
      if (steamPlugin) {
        const entry: ScrapeLogEntry = {
          scraper: 'steam',
          status: 'success',
          reason: '使用已有 AppID',
          time: new Date().toISOString()
        };

        const metadata = await steamPlugin.getDetails(game.steam_appid);
        if (metadata) {
          log.push(entry);
          return this.applyMetadata(game, metadata, downloadPosters, log, 'steam');
        }
      }
    }

    // 2. 搜索阶段：各插件搜索候选结果
    const searchQuery = cleanGameName(game.title);
    const allCandidates: { candidate: ScrapeCandidate; pluginName: string; confidence: number }[] = [];

    for (const plugin of plugins) {
      try {
        const candidates = await plugin.search(searchQuery);

        for (const candidate of candidates.slice(0, 5)) { // 每个插件最多取5个结果
          const confidence = plugin.matchConfidence?.(candidate, searchQuery) ?? 50;
          allCandidates.push({ candidate, pluginName: plugin.name, confidence });
        }

        logger.debug('[ScraperManager] %s 搜索返回 %d 个结果', plugin.displayName, candidates.length);
      } catch (err) {
        const error = err as Error;
        logger.warn('[ScraperManager] %s 搜索失败: %s', plugin.displayName, error.message);
      }
    }

    if (allCandidates.length === 0) {
      logger.info('[ScraperManager] 无搜索结果: %s', game.title);
      return game;
    }

    // 3. 匹配阶段：按置信度排序，找最佳匹配
    allCandidates.sort((a, b) => b.confidence - a.confidence);

    // 如果有高置信度匹配（>=80），直接使用
    bestMatch = allCandidates.find(m => m.confidence >= 80) || allCandidates[0];

    logger.info('[ScraperManager] 最佳匹配: %s (appid=%s, confidence=%d, source=%s)',
      bestMatch.candidate.title, bestMatch.candidate.id, bestMatch.confidence, bestMatch.pluginName);

    // 4. 详情获取阶段：从对应插件获取详情
    const matchedPlugin = plugins.find(p => p.name === bestMatch!.pluginName);
    if (!matchedPlugin) {
      logger.warn('[ScraperManager] 插件不存在: %s', bestMatch.pluginName);
      return game;
    }

    const metadata = await matchedPlugin.getDetails(bestMatch.candidate.id);
    if (!metadata) {
      logger.info('[ScraperManager] 无法获取详情: %s (id=%s)', game.title, bestMatch.candidate.id);
      // 保存 AppID 供下次使用
      if (bestMatch.pluginName === 'steam') {
        gameDatabase.updateGame(gameId, { steam_appid: bestMatch.candidate.id });
      }
      return gameDatabase.getGameById(gameId);
    }

    log.push({
      scraper: bestMatch.pluginName,
      status: 'success',
      reason: `匹配: ${bestMatch.candidate.title} (${bestMatch.confidence}% 置信度)`,
      time: new Date().toISOString()
    });

    return this.applyMetadata(game, metadata, downloadPosters, log, bestMatch.pluginName);
  }

  /**
   * 应用元数据到游戏记录
   */
  private async applyMetadata(
    game: Game,
    metadata: ScraperMetadata,
    downloadPosters: boolean,
    _log: ScrapeLogEntry[],
    source: string
  ): Promise<Game | null> {
    const gameId = game.id!;
    const shouldUpdateTitle = !game.is_manually_edited;

    // 构建更新数据
    const updateData: Partial<Game> = {
      steam_appid: metadata.source === 'steam' ? (metadata.raw as any)?.steam_appid?.toString() : game.steam_appid,
      title: shouldUpdateTitle ? metadata.title : game.title,
      title_en: metadata.titleEn || game.title_en,
      developer: metadata.developer || game.developer,
      publisher: metadata.publisher || game.publisher,
      release_date: metadata.releaseDate || game.release_date,
      genres: metadata.genres ? JSON.stringify(metadata.genres) : game.genres,
      rating: metadata.rating || game.rating,
      description: metadata.description || game.description,
      short_description: metadata.shortDescription || game.short_description,
      languages: metadata.languages ? metadata.languages.join(',') : game.languages,
      metadata_source: source,
      scraped_at: new Date().toISOString()
    };

    // Steam 特殊处理：名称解析
    if (source === 'steam' && metadata.raw) {
      const rawData = metadata.raw as any;
      const steamName = rawData.name;
      const dirName = game.original_name;

      const resolved = resolveGameNames(steamName, dirName, []);

      if (shouldUpdateTitle) {
        updateData.title = resolved.name;
      }
      updateData.title_en = resolved.nameEn || steamName;
    }

    // 更新数据库
    gameDatabase.updateGame(gameId, updateData);

    // 下载图片
    if (downloadPosters && metadata.images) {
      await this.downloadImages(metadata.images, gameId, source, metadata.source === 'steam' ? updateData.steam_appid : undefined);
    }

    logger.info('[ScraperManager] 刮削完成: %s (source=%s)', game.title, source);

    return gameDatabase.getGameById(gameId);
  }

  /**
   * 下载图片
   */
  private async downloadImages(urls: ScraperImageUrls, gameId: number, source: string, steamAppid?: string): Promise<void> {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensureGamesDirs(storagePath);

    // Steam 插件：使用 Steam 缓存目录
    if (source === 'steam' && steamAppid) {
      const cacheService = new SteamCacheService(storagePath);
      await cacheService.downloadAllImages(steamAppid, {
        header_image: urls.horizontal,
        capsule_image: urls.vertical,
        background: urls.background,
        screenshots: urls.screenshots
      });

      // 复制到海报目录
      this.copySteamCacheToPosters(storagePath, steamAppid, gameId);
      return;
    }

    // 其他插件：直接下载到海报目录
    ensurePosterDir(storagePath, gameId);

    if (urls.horizontal) {
      const destPath = getPosterPath(storagePath, gameId, 'horizontal');
      await this.downloadSingleImage(urls.horizontal, destPath);
    }

    if (urls.vertical) {
      const destPath = getPosterPath(storagePath, gameId, 'vertical');
      await this.downloadSingleImage(urls.vertical, destPath);
    }

    if (urls.background) {
      const destPath = getPosterPath(storagePath, gameId, 'background');
      await this.downloadSingleImage(urls.background, destPath);
    }

    if (urls.screenshots && urls.screenshots.length > 0) {
      const screenshotsDir = path.join(storagePath, 'games', 'posters', String(gameId), 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      for (let i = 0; i < Math.min(urls.screenshots.length, 5); i++) {
        const destPath = path.join(screenshotsDir, `${i + 1}.jpg`);
        await this.downloadSingleImage(urls.screenshots[i], destPath);
      }
    }
  }

  /**
   * 下载单张图片
   */
  private async downloadSingleImage(url: string, destPath: string): Promise<void> {
    if (fs.existsSync(destPath)) {
      logger.debug('[ScraperManager] 图片已存在，跳过: %s', destPath);
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn('[ScraperManager] 图片下载失败: %s (status %d)', url, response.status);
        return;
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
      logger.info('[ScraperManager] 图片下载成功: %s', destPath);
    } catch (err) {
      const error = err as Error;
      logger.warn('[ScraperManager] 图片下载失败: %s - %s', url, error.message);
    }
  }

  /**
   * 将 Steam 缓存图片复制到游戏海报目录
   */
  private copySteamCacheToPosters(storagePath: string, appid: string, gameId: number): void {
    const cacheDir = getSteamCacheDir(storagePath, appid);
    if (!fs.existsSync(cacheDir)) {
      logger.warn('[ScraperManager] Steam 缓存目录不存在: appid %s', appid);
      return;
    }

    ensurePosterDir(storagePath, gameId);

    const imageMap: Record<string, string> = {
      'header.jpg': 'horizontal.jpg',
      'capsule.jpg': 'vertical.jpg',
      'background.jpg': 'background.jpg'
    };

    for (const [cacheFile, posterFile] of Object.entries(imageMap)) {
      const cachePath = path.join(cacheDir, cacheFile);
      const posterPath = getPosterPath(storagePath, gameId, posterFile.replace('.jpg', '') as 'horizontal' | 'vertical' | 'banner' | 'background');

      if (fs.existsSync(cachePath) && !fs.existsSync(posterPath)) {
        fs.copyFileSync(cachePath, posterPath);
        logger.info('[ScraperManager] 复制海报: %s -> gameId=%d', cacheFile, gameId);
      }
    }
  }

  /**
   * 批量刮削未刮削的游戏
   */
  async scrapeUnscrapedGames(
    downloadPosters: boolean = true,
    onProgress?: (current: number, total: number, gameTitle: string) => void
  ): Promise<number[]> {
    const unscraped = gameDatabase.getGames({ scraped: 'false', limit: 100 });
    const scrapedIds: number[] = [];
    const total = unscraped.length;

    for (let i = 0; i < unscraped.length; i++) {
      const game = unscraped[i];
      if (onProgress) {
        onProgress(i + 1, total, game.title);
      }

      const result = await this.scrape(game.id!, downloadPosters);
      if (result && result.metadata_source !== 'unknown') {
        scrapedIds.push(result.id!);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('[ScraperManager] 批量刮削完成: %d 个游戏', scrapedIds.length);
    return scrapedIds;
  }

  /**
   * 搜索候选（供前端手动选择）
   */
  async searchCandidates(query: string): Promise<ScrapeCandidate[]> {
    const plugins = scraperRegistry.getEnabledPlugins();
    const allCandidates: ScrapeCandidate[] = [];

    for (const plugin of plugins) {
      try {
        const candidates = await plugin.search(query);
        allCandidates.push(...candidates.slice(0, 10));
      } catch (err) {
        const error = err as Error;
        logger.warn('[ScraperManager] %s 搜索失败: %s', plugin.displayName, error.message);
      }
    }

    return allCandidates;
  }

  /**
   * 使用指定插件和候选 ID 刮削
   */
  async scrapeWithCandidate(
    gameId: number,
    pluginName: string,
    candidateId: string,
    downloadPosters: boolean = true
  ): Promise<Game | null> {
    const game = gameDatabase.getGameById(gameId);
    if (!game) {
      logger.warn('[ScraperManager] 游戏不存在: id %d', gameId);
      return null;
    }

    const plugin = scraperRegistry.get(pluginName);
    if (!plugin) {
      logger.warn('[ScraperManager] 插件不存在: %s', pluginName);
      return game;
    }

    const metadata = await plugin.getDetails(candidateId);
    if (!metadata) {
      logger.warn('[ScraperManager] 无法获取详情: plugin=%s, id=%s', pluginName, candidateId);
      return game;
    }

    const log: ScrapeLogEntry[] = [{
      scraper: pluginName,
      status: 'success',
      reason: '手动选择',
      time: new Date().toISOString()
    }];

    return this.applyMetadata(game, metadata, downloadPosters, log, pluginName);
  }
}

// 单例导出
export const scraperManager = new ScraperManager();