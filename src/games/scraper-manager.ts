/**
 * 刮削管理器
 * 管理插件调用顺序、降级逻辑、日志记录
 */

import { logger } from '../logger';
import { gameDatabase } from './database';
import { scraperRegistry } from './scraper-plugins/registry';
import type {
  Game,
  ScraperPlugin,
  ScraperMetadata,
  ScrapeCandidate,
  ScrapeLog,
  ScrapeLogEntry,
  ScrapeResult
} from '../types';

/**
 * 刮削管理器（单例）
 */
class ScraperManager {
  /** 刮削日志缓存（内存中） */
  private scrapeLogs: Map<number, ScrapeLog> = new Map();

  /**
   * 按优先级自动降级刮削
   * 遍历启用的插件，直到成功或全部失败
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
          reason: '游戏不存在',
          time: new Date().toISOString()
        }]
      };
    }

    // 使用 title 作为查询词，优先使用原名
    const query = game.original_name || game.title;
    logger.info('[ScraperManager] 开始刮削: %s (gameId=%d)', query, gameId);

    // 获取启用的插件列表（按优先级排序）
    const plugins = scraperRegistry.getEnabledPlugins();
    if (plugins.length === 0) {
      logger.warn('[ScraperManager] 无可用插件');
      return {
        success: false,
        log: [{
          scraper: 'none',
          status: 'failed',
          reason: '无可用插件',
          time: new Date().toISOString()
        }]
      };
    }

    // 初始化日志
    const log: ScrapeLogEntry[] = [];
    const scrapeLog: ScrapeLog = {
      gameId,
      gameName: game.title,
      attempts: log
    };

    // 遍历插件尝试刮削
    for (const plugin of plugins) {
      const attemptTime = new Date().toISOString();
      logger.info('[ScraperManager] 尝试插件: %s', plugin.displayName);

      try {
        // 1. 搜索候选
        const candidates = await plugin.search(query);
        if (candidates.length === 0) {
          log.push({
            scraper: plugin.name,
            status: 'failed',
            reason: '搜索无结果',
            time: attemptTime
          });
          logger.info('[ScraperManager] %s 搜索无结果', plugin.displayName);
          continue;
        }

        // 2. 选择最佳匹配
        const bestMatch = this.selectBestMatch(candidates, query, plugin);
        if (!bestMatch) {
          log.push({
            scraper: plugin.name,
            status: 'failed',
            reason: '无法选择最佳匹配',
            time: attemptTime
          });
          logger.warn('[ScraperManager] %s 无法选择最佳匹配', plugin.displayName);
          continue;
        }

        // 3. 获取详情
        const metadata = await plugin.getDetails(bestMatch.id);
        if (!metadata) {
          log.push({
            scraper: plugin.name,
            status: 'failed',
            reason: '获取详情失败',
            time: attemptTime
          });
          logger.warn('[ScraperManager] %s 获取详情失败: %s', plugin.displayName, bestMatch.id);
          continue;
        }

        // 4. 保存元数据
        await this.saveMetadata(game, metadata, downloadPosters);

        // 5. 记录成功日志
        log.push({
          scraper: plugin.name,
          status: 'success',
          reason: `匹配: ${bestMatch.title}`,
          time: attemptTime
        });

        scrapeLog.finalSource = plugin.name;
        scrapeLog.scrapedAt = new Date().toISOString();
        this.scrapeLogs.set(gameId, scrapeLog);

        logger.info('[ScraperManager] 刮削成功: %s -> %s', query, plugin.displayName);

        return {
          success: true,
          metadata,
          source: plugin.name,
          log
        };

      } catch (err) {
        const error = err as Error;
        log.push({
          scraper: plugin.name,
          status: 'failed',
          reason: error.message,
          time: attemptTime
        });
        logger.error('[ScraperManager] %s 刮削异常: %s', plugin.displayName, error.message);
        continue;
      }
    }

    // 所有插件都失败
    scrapeLog.scrapedAt = new Date().toISOString();
    this.scrapeLogs.set(gameId, scrapeLog);

    logger.warn('[ScraperManager] 所有插件失败: %s', query);

    return {
      success: false,
      log
    };
  }

  /**
   * 使用指定插件刮削
   */
  async scrapeWith(gameId: number, pluginName: string, downloadPosters: boolean = true): Promise<ScrapeResult> {
    const game = gameDatabase.getGameById(gameId);
    if (!game) {
      logger.warn('[ScraperManager] 游戏不存在: id %d', gameId);
      return {
        success: false,
        log: [{
          scraper: pluginName,
          status: 'failed',
          reason: '游戏不存在',
          time: new Date().toISOString()
        }]
      };
    }

    const plugin = scraperRegistry.get(pluginName);
    if (!plugin) {
      logger.warn('[ScraperManager] 插件不存在: %s', pluginName);
      return {
        success: false,
        log: [{
          scraper: pluginName,
          status: 'failed',
          reason: '插件不存在',
          time: new Date().toISOString()
        }]
      };
    }

    const query = game.original_name || game.title;
    const log: ScrapeLogEntry[] = [];
    const attemptTime = new Date().toISOString();

    try {
      // 搜索
      const candidates = await plugin.search(query);
      if (candidates.length === 0) {
        log.push({
          scraper: plugin.name,
          status: 'failed',
          reason: '搜索无结果',
          time: attemptTime
        });
        return { success: false, log };
      }

      // 选择最佳匹配
      const bestMatch = this.selectBestMatch(candidates, query, plugin);
      if (!bestMatch) {
        log.push({
          scraper: plugin.name,
          status: 'failed',
          reason: '无法选择最佳匹配',
          time: attemptTime
        });
        return { success: false, log };
      }

      // 获取详情
      const metadata = await plugin.getDetails(bestMatch.id);
      if (!metadata) {
        log.push({
          scraper: plugin.name,
          status: 'failed',
          reason: '获取详情失败',
          time: attemptTime
        });
        return { success: false, log };
      }

      // 保存元数据
      await this.saveMetadata(game, metadata, downloadPosters);

      log.push({
        scraper: plugin.name,
        status: 'success',
        reason: `匹配: ${bestMatch.title}`,
        time: attemptTime
      });

      // 保存日志
      const scrapeLog: ScrapeLog = {
        gameId,
        gameName: game.title,
        attempts: log,
        finalSource: plugin.name,
        scrapedAt: new Date().toISOString()
      };
      this.scrapeLogs.set(gameId, scrapeLog);

      logger.info('[ScraperManager] 指定插件刮削成功: %s -> %s', query, plugin.displayName);

      return {
        success: true,
        metadata,
        source: plugin.name,
        log
      };

    } catch (err) {
      const error = err as Error;
      log.push({
        scraper: plugin.name,
        status: 'failed',
        reason: error.message,
        time: attemptTime
      });
      logger.error('[ScraperManager] 指定插件刮削异常: %s - %s', plugin.displayName, error.message);
      return { success: false, log };
    }
  }

  /**
   * 选择最佳匹配
   * 使用插件的 matchConfidence 方法计算置信度，选择最高分
   */
  selectBestMatch(candidates: ScrapeCandidate[], query: string, plugin: ScraperPlugin): ScrapeCandidate | null {
    if (candidates.length === 0) return null;

    // 计算每个候选的置信度
    const scoredCandidates = candidates.map(candidate => {
      // 使用插件的 matchConfidence 方法（如果有）
      const confidence = plugin.matchConfidence
        ? plugin.matchConfidence(candidate, query)
        : this.defaultMatchConfidence(candidate, query);
      return { candidate, confidence };
    });

    // 按置信度降序排序
    scoredCandidates.sort((a, b) => b.confidence - a.confidence);

    // 返回置信度最高的候选
    const best = scoredCandidates[0];
    logger.debug('[ScraperManager] 最佳匹配: %s (confidence=%d)', best.candidate.title, best.confidence);

    return best.candidate;
  }

  /**
   * 默认置信度计算（插件未提供时使用）
   */
  private defaultMatchConfidence(candidate: ScrapeCandidate, query: string): number {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTitle = candidate.title.toLowerCase().trim();

    // 完全匹配
    if (normalizedQuery === normalizedTitle) return 100;

    // 包含匹配
    if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) return 80;

    // 年份匹配加分
    if (candidate.year) {
      const queryYearMatch = normalizedQuery.match(/\b(19\d{2}|20\d{2})\b/);
      if (queryYearMatch && candidate.year === queryYearMatch[1]) return 70;
    }

    // 默认返回基础分数
    return 50;
  }

  /**
   * 保存元数据到数据库
   */
  async saveMetadata(game: Game, metadata: ScraperMetadata, downloadPosters: boolean): Promise<void> {
    // 如果需要下载图片，先下载
    if (downloadPosters && metadata.images) {
      const plugin = scraperRegistry.get(metadata.source);
      if (plugin && plugin.downloadImages) {
        try {
          await plugin.downloadImages(metadata.images, game.id);
          logger.info('[ScraperManager] 图片下载完成: gameId=%d', game.id);
        } catch (err) {
          logger.warn('[ScraperManager] 图片下载失败: gameId=%d - %s', game.id, (err as Error).message);
        }
      }
    }

    // 构建更新数据
    const shouldUpdateTitle = !game.is_manually_edited;
    const updateData: Partial<Game> = {
      // 基本信息（仅当未手动编辑时更新）
      title: shouldUpdateTitle ? metadata.title : undefined,
      title_en: metadata.titleEn || undefined,
      // 元数据
      developer: metadata.developer || undefined,
      publisher: metadata.publisher || undefined,
      release_date: metadata.releaseDate || undefined,
      genres: metadata.genres ? JSON.stringify(metadata.genres) : undefined,
      rating: metadata.rating || undefined,
      description: metadata.description || undefined,
      short_description: metadata.shortDescription || undefined,
      languages: metadata.languages ? JSON.stringify(metadata.languages) : undefined,
      // 来源标记
      metadata_source: metadata.source,
      scraped_at: new Date().toISOString()
    };

    // 更新数据库
    gameDatabase.updateGame(game.id, updateData);

    logger.info('[ScraperManager] 元数据保存完成: gameId=%d, source=%s', game.id, metadata.source);
  }

  /**
   * 获取刮削日志
   */
  getScrapeLog(gameId: number): ScrapeLog | undefined {
    return this.scrapeLogs.get(gameId);
  }

  /**
   * 清除刮削日志缓存
   */
  clearScrapeLog(gameId: number): void {
    this.scrapeLogs.delete(gameId);
  }

  /**
   * 清除所有刮削日志缓存
   */
  clearAllScrapeLogs(): void {
    this.scrapeLogs.clear();
  }
}

// 单例导出
export const scraperManager = new ScraperManager();