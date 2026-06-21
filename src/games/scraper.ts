/**
 * Steam 刮削模块
 * 提供刮削入口和代理配置功能
 */

import fs from 'fs';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { logger } from '../logger';
import { gameDatabase } from './database';
import { resolveGameNames } from './name-resolver';
import { getStoragePath, loadConfig } from '../utils';
import { ensurePosterDir, getPosterPath } from './storage';
import { SteamCacheService, getSteamCacheDir } from './steam-cache-service';
import { scraperManager } from './scraper-plugins';
import type { Game, SteamDbEntry } from '../types';

/**
 * Steam 搜索结果项
 */
export interface SteamSearchItem {
  id: number;
  name: string;
  tiny_image: string;
  metacritic_score?: number;
}

const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

// 代理 Agent（全局）
let proxyAgent: ProxyAgent | undefined;

/**
 * 初始化代理（根据配置）
 */
export function initProxy(): void {
  const config = loadConfig();
  const proxyUrl = config.proxyUrl;

  if (proxyUrl && proxyUrl.trim()) {
    proxyAgent = new ProxyAgent(proxyUrl.trim());
    setGlobalDispatcher(proxyAgent);
    logger.info('[Steam刮削] 已启用代理: %s', proxyUrl.trim());
  } else {
    proxyAgent = undefined;
    logger.info('[Steam刮削] 未配置代理，使用直连');
  }
}

/**
 * 获取当前代理状态
 */
export function getProxyStatus(): { enabled: boolean; url?: string } {
  if (proxyAgent) {
    const config = loadConfig();
    return { enabled: true, url: config.proxyUrl };
  }
  return { enabled: false };
}

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
  };
}

/**
 * 搜索 Steam 游戏，返回完整候选列表（供手动选择）
 */
export async function searchSteamCandidates(query: string): Promise<SteamSearchItem[]> {
  try {
    const searchUrl = `${STEAM_SEARCH_URL}?term=${encodeURIComponent(query)}&l=schinese&cc=CN`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      logger.warn('Steam 搜索请求失败: %s', query);
      return [];
    }

    const result = (await response.json()) as SteamSearchResult;

    if (!result.items || result.items.length === 0) {
      logger.info('Steam 搜索无结果: %s', query);
      return [];
    }

    return result.items.map(item => ({
      id: item.id,
      name: item.name,
      tiny_image: item.tiny_image,
      metacritic_score: item.metascore ? parseInt(item.metascore) : undefined
    }));
  } catch (err) {
    const error = err as Error;
    logger.error('Steam 搜索失败: %s - %s', query, error.message);
    return [];
  }
}

/**
 * 将 Steam 缓存图片复制到游戏海报目录
 * steam-cache/{appid}/ -> posters/{gameId}/
 */
export function copySteamCacheToPosters(storagePath: string, appid: string, gameId: number): void {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  if (!fs.existsSync(cacheDir)) {
    logger.warn('Steam 缓存目录不存在，无法复制海报: appid %s', appid);
    return;
  }

  ensurePosterDir(storagePath, gameId);

  // 图片映射: steam-cache 文件名 -> posters 文件名
  const imageMap: Record<string, string> = {
    'header.jpg': 'horizontal.jpg',    // 横版海报
    'capsule.jpg': 'vertical.jpg',     // 竖版海报 (capsule)
    'background.jpg': 'background.jpg' // 背景图
  };

  for (const [cacheFile, posterFile] of Object.entries(imageMap)) {
    const cachePath = path.join(cacheDir, cacheFile);
    const posterPath = getPosterPath(storagePath, gameId, posterFile.replace('.jpg', '') as 'horizontal' | 'vertical' | 'banner' | 'background');

    if (fs.existsSync(cachePath)) {
      // 只有目标不存在时才复制，避免覆盖用户手动上传的海报
      if (!fs.existsSync(posterPath)) {
        fs.copyFileSync(cachePath, posterPath);
        logger.info('复制 Steam 缓存海报: %s -> gameId=%d %s', cacheFile, gameId, posterFile);
      } else {
        logger.debug('海报已存在，跳过复制: gameId=%d %s', gameId, posterFile);
      }
    }
  }
}

/**
 * 刮削单个游戏（使用插件系统）
 */
export async function scrapeGame(gameId: number, downloadPosters: boolean = true): Promise<Game | null> {
  return scraperManager.scrape(gameId, downloadPosters);
}

/**
 * 使用指定 Steam AppID 刮削游戏
 */
export async function scrapeGameWithAppid(gameId: number, appid: number, downloadPosters: boolean = true): Promise<Game | null> {
  return scraperManager.scrapeWithCandidate(gameId, 'steam', String(appid), downloadPosters);
}

/**
 * 强制刷新 Steam 缓存（手动触发）
 * 刷新时保留已有的中文名/英文名，只更新元数据和图片
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

  // 刷新策略：保留已有的 name 和 name_en，只更新元数据
  const cacheData: Partial<SteamDbEntry> = {
    // 保留已有的名称（不覆盖）
    name: existing?.name || undefined,
    name_en: existing?.name_en || undefined,
    aliases: existing?.aliases || [],
    // 更新元数据
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

  // 如果是新条目，需要解析名称
  if (!existing) {
    const resolved = resolveGameNames(steamName, '', []);
    cacheData.name = resolved.name;
    cacheData.name_en = resolved.nameEn;
    cacheData.aliases = resolved.aliases;
    gameDatabase.insertSteamDbEntry({
      steam_appid: appid,
      ...cacheData
    });
  } else {
    gameDatabase.updateSteamDbFull(appid, cacheData);
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

/**
 * 批量刮削未刮削的游戏（使用插件系统）
 */
export async function scrapeUnscrapedGames(
  downloadPosters: boolean = true,
  onProgress?: (current: number, total: number, gameTitle: string) => void
): Promise<number[]> {
  return scraperManager.scrapeUnscrapedGames(downloadPosters, onProgress);
}

/**
 * 获取 Steam 游戏详情（内部方法）
 */
async function getSteamDetails(appid: number): Promise<SteamAppDetails | null> {
  try {
    const detailsUrl = `${STEAM_DETAILS_URL}?appids=${appid}&l=schinese`;
    const response = await fetch(detailsUrl);

    if (!response.ok) {
      logger.warn('Steam 详情请求失败: appid %d', appid);
      return null;
    }

    const result = await response.json() as Record<string, SteamAppDetails>;
    const appDetails = result[String(appid)];

    if (!appDetails || !appDetails.success || !appDetails.data) {
      logger.info('Steam 详情无数据: appid %d', appid);
      return null;
    }

    return appDetails;
  } catch (err) {
    const error = err as Error;
    logger.error('Steam 详情获取失败: appid %d - %s', appid, error.message);
    return null;
  }
}