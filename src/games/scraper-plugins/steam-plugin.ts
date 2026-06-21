/**
 * Steam 刮削插件
 * 调用 Steam Store API 进行游戏搜索和详情获取
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger';
import { gameDatabase } from '../database';
import { cleanGameName } from '../name-cleaner';
import { resolveGameNames } from '../name-resolver';
import { getStoragePath, loadConfig } from '../../utils';
import { SteamCacheService, getSteamCacheDir } from '../steam-cache-service';
import { ensureGamesDirs, ensurePosterDir, getPosterPath } from '../storage';
import { BaseScraperPlugin } from './base';
import type {
  ScrapeCandidate,
  ScraperMetadata,
  ScraperImageUrls
} from '../../types/scraper';
import type { SteamDbEntry } from '../../types';

const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

/**
 * Steam 搜索结果响应结构
 */
interface SteamSearchResult {
  total: number;
  items: Array<{
    id: number;
    name: string;
    price: { final: number };
    tiny_image: string;
    metascore?: string;
  }>;
}

/**
 * Steam 详情响应结构
 */
interface SteamAppDetails {
  success: boolean;
  data?: SteamAppData;
}

/**
 * Steam App 详情数据结构（非可选）
 */
interface SteamAppData {
  steam_appid: number;
  name: string;
  short_description: string;
  detailed_description: string;
  developers: string[];
  publishers: string[];
  release_date: { date: string };
  genres: Array<{ id: string; description: string }>;
  header_image: string;
  capsule_images: Array<{ id: string; capsule: string }>;
  screenshots: Array<{ id: number; path_thumbnail: string; path_full: string }>;
  background: string;
  background_raw: string;
  movies?: Array<{ id: number; thumbnail: string; mp4: { max: string } }>;
  metacritic?: { score: number; url: string };
  recommendations?: { total: number };
  supported_languages: string;
  type: string;
  is_free: boolean;
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
        logger.warn('[Steam] 搜索请求失败: %s (status %d)', query, response.status);
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
        year: undefined,
        source: 'steam'
      }));
    } catch (err) {
      const error = err as Error;
      logger.error('[Steam] 搜索失败: %s - %s', query, error.message);
      return [];
    }
  }

  /**
   * 获取游戏详情
   * 支持本地缓存优先
   */
  async getDetails(appid: string): Promise<ScraperMetadata | null> {
    // 1. 先查本地缓存
    const cached = gameDatabase.getSteamDbByAppid(appid);
    if (cached && cached.raw_data) {
      logger.info('[Steam] 使用本地缓存: appid %s', appid);
      try {
        const rawData = JSON.parse(cached.raw_data);
        return this.extractMetadataFromCache(rawData, cached);
      } catch (err) {
        logger.warn('[Steam] 缓存解析失败，重新刮削: appid %s', appid);
      }
    }

    // 2. 从远程 API 获取
    return await this.fetchDetailsFromApi(appid);
  }

  /**
   * 从 Steam API 获取详情
   */
  private async fetchDetailsFromApi(appid: string): Promise<ScraperMetadata | null> {
    try {
      const detailsUrl = `${STEAM_DETAILS_URL}?appids=${appid}&l=schinese`;
      const response = await this.fetch(detailsUrl);

      if (!response.ok) {
        logger.warn('[Steam] 详情请求失败: appid %s (status %d)', appid, response.status);
        return null;
      }

      const result = await response.json() as Record<string, SteamAppDetails>;
      const appDetails = result[appid];

      if (!appDetails || !appDetails.success || !appDetails.data) {
        logger.info('[Steam] 详情无数据: appid %s', appid);
        return null;
      }

      const data = appDetails.data;

      // 存入缓存
      this.saveToSteamDb(appid, data);

      // 返回元数据
      return this.extractMetadataFromApi(data);
    } catch (err) {
      const error = err as Error;
      logger.error('[Steam] 详情获取失败: appid %s - %s', appid, error.message);
      return null;
    }
  }

  /**
   * 从 API 数据提取元数据
   */
  private extractMetadataFromApi(data: SteamAppData): ScraperMetadata {
    return {
      title: data.name,
      titleEn: data.name,
      developer: data.developers?.[0],
      publisher: data.publishers?.[0],
      releaseDate: data.release_date?.date,
      genres: data.genres?.map(g => g.description),
      rating: data.metacritic?.score,
      description: data.detailed_description,
      shortDescription: data.short_description,
      languages: data.supported_languages?.split(',').map(l => l.trim()),
      images: {
        horizontal: data.header_image,
        vertical: data.capsule_images?.[0]?.capsule,
        background: data.background,
        screenshots: data.screenshots?.slice(0, 5).map(s => s.path_full)
      },
      source: 'steam',
      raw: data
    };
  }

  /**
   * 从缓存数据提取元数据
   */
  private extractMetadataFromCache(rawData: any, cached: SteamDbEntry): ScraperMetadata {
    return {
      title: cached.name,
      titleEn: cached.name_en || rawData.name,
      developer: cached.developer || rawData.developers?.[0],
      publisher: cached.publisher || rawData.publishers?.[0],
      releaseDate: cached.release_date || rawData.release_date?.date,
      genres: cached.genres ? JSON.parse(cached.genres) : rawData.genres?.map(g => g.description),
      rating: cached.rating || rawData.metacritic?.score,
      description: rawData.detailed_description,
      shortDescription: cached.short_description || rawData.short_description,
      languages: cached.languages?.split(',').map(l => l.trim()),
      images: {
        horizontal: rawData.header_image,
        vertical: rawData.capsule_images?.[0]?.capsule,
        background: rawData.background,
        screenshots: rawData.screenshots?.slice(0, 5).map(s => s.path_full)
      },
      source: 'steam',
      raw: rawData
    };
  }

  /**
   * 存入 Steam DB 缓存
   */
  private saveToSteamDb(appid: string, data: SteamAppData): void {
    const existing = gameDatabase.getSteamDbByAppid(appid);
    const steamName = data.name;

    const resolved = resolveGameNames(
      steamName,
      '',
      existing ? existing.aliases || [] : []
    );

    const cacheData: Partial<SteamDbEntry> = {
      steam_appid: appid,
      name: resolved.name,
      name_en: resolved.nameEn,
      aliases: resolved.aliases,
      release_date: data.release_date?.date,
      genres: data.genres ? JSON.stringify(data.genres.map(g => g.description)) : undefined,
      rating: data.metacritic?.score,
      languages: data.supported_languages,
      developer: data.developers?.[0] || undefined,
      publisher: data.publishers?.[0] || undefined,
      short_description: data.short_description || undefined,
      raw_data: JSON.stringify(data),
      source: 'scraper',
      scraped_at: new Date().toISOString()
    };

    if (existing) {
      gameDatabase.updateSteamDbFull(appid, cacheData);
    } else {
      gameDatabase.insertSteamDbEntry(cacheData);
    }

    logger.info('[Steam] 已缓存: appid %s - %s', appid, data.name);
  }

  /**
   * 匹配置信度计算
   */
  matchConfidence(result: ScrapeCandidate, query: string): number {
    const normalizedQuery = cleanGameName(query).toLowerCase();
    const normalizedTitle = result.title.toLowerCase();

    // 完全匹配
    if (normalizedQuery === normalizedTitle) return 100;

    // 包含匹配
    if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) return 85;

    // 词首匹配
    if (normalizedTitle.startsWith(normalizedQuery.slice(0, 3))) return 70;

    return 50;
  }

  /**
   * 下载图片到 Steam 缓存目录，然后复制到游戏海报目录
   */
  async downloadImagesWithSteamCache(urls: ScraperImageUrls, gameId: number, appid: string): Promise<void> {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensureGamesDirs(storagePath);

    // 下载到 Steam 缓存目录
    const cacheService = new SteamCacheService(storagePath);
    await cacheService.downloadAllImages(appid, {
      header_image: urls.horizontal,
      capsule_image: urls.vertical,
      background: urls.background,
      screenshots: urls.screenshots
    });

    // 复制到游戏海报目录
    this.copySteamCacheToPosters(storagePath, appid, gameId);
  }

  /**
   * 将 Steam 缓存图片复制到游戏海报目录
   */
  private copySteamCacheToPosters(storagePath: string, appid: string, gameId: number): void {
    const cacheDir = getSteamCacheDir(storagePath, appid);
    if (!fs.existsSync(cacheDir)) {
      logger.warn('[Steam] 缓存目录不存在，无法复制海报: appid %s', appid);
      return;
    }

    ensurePosterDir(storagePath, gameId);

    // 图片映射: steam-cache 文件名 -> posters 文件名
    const imageMap: Record<string, string> = {
      'header.jpg': 'horizontal.jpg',
      'capsule.jpg': 'vertical.jpg',
      'background.jpg': 'background.jpg'
    };

    for (const [cacheFile, posterFile] of Object.entries(imageMap)) {
      const cachePath = path.join(cacheDir, cacheFile);
      const posterPath = getPosterPath(storagePath, gameId, posterFile.replace('.jpg', '') as 'horizontal' | 'vertical' | 'banner' | 'background');

      if (fs.existsSync(cachePath)) {
        if (!fs.existsSync(posterPath)) {
          fs.copyFileSync(cachePath, posterPath);
          logger.info('[Steam] 复制海报: %s -> gameId=%d %s', cacheFile, gameId, posterFile);
        } else {
          logger.debug('[Steam] 海报已存在，跳过: gameId=%d %s', gameId, posterFile);
        }
      }
    }
  }
}