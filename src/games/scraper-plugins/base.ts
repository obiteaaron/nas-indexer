/**
 * 刮削器插件基类
 * 提供通用功能：代理支持、错误处理、图片下载
 */

import fs from 'fs';
import path from 'path';
import { ProxyAgent } from 'undici';
import { logger } from '../../logger';
import { loadConfig, getStoragePath } from '../../utils';
import { ensurePosterDir, getPosterPath } from '../storage';
import type {
  ScraperPlugin,
  ScraperImageUrls,
  ScraperImagePaths,
  ScraperMetadata,
  ScrapeCandidate
} from '../../types/scraper';

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

  /**
   * 带代理的 fetch（不污染全局）
   */
  protected async fetch(url: string): Promise<Response> {
    const config = loadConfig();
    const proxyUrl = config.proxyUrl?.trim();

    if (proxyUrl) {
      const agent = new ProxyAgent(proxyUrl);
      logger.debug('[%s] 使用代理: %s', this.displayName, proxyUrl);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fetch(url, { dispatcher: agent as any });
    }
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

    // 下载截图（最多5张）
    if (urls.screenshots && urls.screenshots.length > 0) {
      paths.screenshots = [];
      const screenshotsDir = path.join(storagePath, 'games', 'posters', String(gameId), 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      const maxScreenshots = Math.min(urls.screenshots.length, 5);
      for (let i = 0; i < maxScreenshots; i++) {
        const destPath = path.join(screenshotsDir, `${i + 1}.jpg`);
        await this.downloadImage(urls.screenshots[i], destPath);
        paths.screenshots.push(destPath);
      }
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