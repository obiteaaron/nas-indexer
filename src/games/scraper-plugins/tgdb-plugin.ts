/**
 * TheGamesDB 刮削插件
 * 调用 TheGamesDB API 进行游戏搜索和详情获取
 */

import { logger } from '../../logger';
import { BaseScraperPlugin } from './base';
import type {
  ScrapeCandidate,
  ScraperMetadata,
  ScraperImageUrls
} from '../../types/scraper';

const TGDB_SEARCH_URL = 'https://thegamesdb.net/api/SearchGames.php';
const TGDB_DETAILS_URL = 'https://thegamesdb.net/api/GetGames.php';
const TGDB_IMAGES_URL = 'https://thegamesdb.net/api/GetGamesImages.php';

/**
 * TheGamesDB 搜索结果响应结构
 */
interface TGDBSearchResponse {
  code: number;
  status: string;
  data: {
    count: number;
    games: TGDBGame[];
  };
  pages?: {
    current: number;
    total: number;
  };
}

/**
 * TheGamesDB 游戏基础信息
 */
interface TGDBGame {
  id: number;
  game_title: string;
  release_date?: string;
  platform?: string;
  platform_id?: number;
  developers?: string[];
  publishers?: string[];
  genres?: string[];
  overview?: string;
  players?: string;
  coop?: string;
  youtube?: string;
  rating?: string;
}

/**
 * TheGamesDB 详情响应结构
 */
interface TGDBDetailsResponse {
  code: number;
  status: string;
  data: {
    count: number;
    games: TGDBGame[];
    platforms?: TGDBPlatform[];
  };
  include?: {
    boxart?: boolean;
  };
}

/**
 * TheGamesDB 平台信息
 */
interface TGDBPlatform {
  id: number;
  name: string;
  alias: string;
}

/**
 * TheGamesDB 图片响应结构
 */
interface TGDBImagesResponse {
  code: number;
  status: string;
  data: {
    base_url: {
      original: string;
      small: string;
      thumb: string;
      medium: string;
      large: string;
    };
    games: Record<string, {
      boxart?: TGDBImage[];
      fanart?: TGDBImage[];
      screenshot?: TGDBImage[];
      banner?: TGDBImage[];
    }>;
  };
}

/**
 * TheGamesDB 图片信息
 */
interface TGDBImage {
  id: number;
  type: string;
  side: string;        // 'front' | 'back'
  filename: string;
  resolution: string;
}

/**
 * TheGamesDB 刮削插件
 */
export class TheGamesDBPlugin extends BaseScraperPlugin {
  name = 'tgdb';
  displayName = 'TheGamesDB';
  priority = 2;
  requiresAuth = false;
  enabled = true;

  /**
   * 搜索 TheGamesDB 游戏
   */
  async search(query: string): Promise<ScrapeCandidate[]> {
    try {
      const searchUrl = `${TGDB_SEARCH_URL}?name=${encodeURIComponent(query)}`;
      const response = await this.fetch(searchUrl);

      if (!response.ok) {
        logger.warn('[TGDB] 搜索请求失败: %s (status %d)', query, response.status);
        return [];
      }

      const result = (await response.json()) as TGDBSearchResponse;

      if (result.code !== 200 || !result.data?.games?.length) {
        logger.info('[TGDB] 搜索无结果: %s (code %d)', query, result.code);
        return [];
      }

      return result.data.games.map(game => ({
        id: String(game.id),
        title: game.game_title,
        year: game.release_date?.substring(0, 4),
        thumbnail: undefined, // 搜索结果不返回缩略图，需要单独获取
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
      // 1. 获取游戏详情
      const detailsUrl = `${TGDB_DETAILS_URL}?id=${id}`;
      const detailsResponse = await this.fetch(detailsUrl);

      if (!detailsResponse.ok) {
        logger.warn('[TGDB] 详情请求失败: id %s (status %d)', id, detailsResponse.status);
        return null;
      }

      const detailsResult = (await detailsResponse.json()) as TGDBDetailsResponse;

      if (detailsResult.code !== 200 || !detailsResult.data?.games?.length) {
        logger.info('[TGDB] 详情无数据: id %s (code %d)', id, detailsResult.code);
        return null;
      }

      const game = detailsResult.data.games[0];

      // 2. 获取图片
      const images = await this.fetchImages(id);

      // 3. 组装元数据
      return this.extractMetadata(game, images);
    } catch (err) {
      const error = err as Error;
      logger.error('[TGDB] 详情获取失败: id %s - %s', id, error.message);
      return null;
    }
  }

  /**
   * 获取游戏图片
   */
  private async fetchImages(id: string): Promise<ScraperImageUrls> {
    try {
      const imagesUrl = `${TGDB_IMAGES_URL}?games_id=${id}`;
      const response = await this.fetch(imagesUrl);

      if (!response.ok) {
        logger.warn('[TGDB] 图片请求失败: id %s (status %d)', id, response.status);
        return {};
      }

      const result = (await response.json()) as TGDBImagesResponse;

      if (result.code !== 200 || !result.data?.games?.[id]) {
        logger.info('[TGDB] 图片无数据: id %s', id);
        return {};
      }

      const baseUrl = result.data.base_url.original;
      const gameImages = result.data.games[id];

      return this.extractImageUrls(baseUrl, gameImages);
    } catch (err) {
      const error = err as Error;
      logger.warn('[TGDB] 图片获取失败: id %s - %s', id, error.message);
      return {};
    }
  }

  /**
   * 从 API 数据提取图片 URL
   */
  private extractImageUrls(baseUrl: string, gameImages: TGDBImagesResponse['data']['games'][string]): ScraperImageUrls {
    const images: ScraperImageUrls = {};

    // 横版海报（boxart front）
    if (gameImages.boxart) {
      const frontBoxart = gameImages.boxart.find(img => img.side === 'front');
      if (frontBoxart) {
        images.horizontal = `${baseUrl}${frontBoxart.filename}`;
      }
    }

    // 竖版海报（如果有 banner）
    if (gameImages.banner && gameImages.banner.length > 0) {
      images.vertical = `${baseUrl}${gameImages.banner[0].filename}`;
    }

    // 背景图（fanart）
    if (gameImages.fanart && gameImages.fanart.length > 0) {
      images.background = `${baseUrl}${gameImages.fanart[0].filename}`;
    }

    // 截图（最多5张）
    if (gameImages.screenshot && gameImages.screenshot.length > 0) {
      images.screenshots = gameImages.screenshot
        .slice(0, 5)
        .map(img => `${baseUrl}${img.filename}`);
    }

    return images;
  }

  /**
   * 从 API 数据提取元数据
   */
  private extractMetadata(game: TGDBGame, images: ScraperImageUrls): ScraperMetadata {
    // 解析评分（字符串转数字）
    let rating: number | undefined;
    if (game.rating) {
      const parsed = parseFloat(game.rating);
      if (!isNaN(parsed)) {
        rating = parsed;
      }
    }

    // 解析发布日期
    let releaseDate: string | undefined;
    if (game.release_date) {
      // TheGamesDB 日期格式可能是 YYYY-MM-DD 或其他格式
      releaseDate = this.normalizeReleaseDate(game.release_date);
    }

    return {
      title: game.game_title,
      titleEn: game.game_title,
      developer: game.developers?.[0],
      publisher: game.publishers?.[0],
      releaseDate,
      genres: game.genres,
      rating,
      description: game.overview,
      shortDescription: game.overview?.substring(0, 200),
      images,
      source: 'tgdb',
      raw: game
    };
  }

  /**
   * 标准化发布日期格式
   */
  private normalizeReleaseDate(date: string): string | undefined {
    if (!date) return undefined;

    // 尝试解析各种格式
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    // YYYY
    if (/^\d{4}$/.test(date)) {
      return date;
    }

    // 其他格式尝试解析
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().substring(0, 10);
    }

    return undefined;
  }

  /**
   * 匹配置信度计算
   */
  matchConfidence(result: ScrapeCandidate, query: string): number {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTitle = result.title.toLowerCase().trim();

    // 完全匹配
    if (normalizedQuery === normalizedTitle) return 100;

    // 包含匹配
    if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) return 80;

    // 词首匹配
    if (normalizedTitle.startsWith(normalizedQuery.slice(0, 3))) return 70;

    // 年份匹配加分
    if (result.year && normalizedQuery.includes(result.year)) {
      return 65;
    }

    return 50;
  }
}