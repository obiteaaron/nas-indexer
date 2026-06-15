/**
 * Steam 刮削模块
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { logger } from '../logger';
import { gameDatabase } from './database';
import { cleanGameName } from './name-cleaner';
import { resolveGameNames } from './name-resolver';
import { getStoragePath, loadConfig } from '../utils';
import { ensureGamesDirs } from './storage';
import { SteamCacheService } from './steam-cache-service';
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
 * 在 Steam 搜索游戏（自动匹配最佳结果）
 */
async function searchSteamGame(title: string): Promise<number | null> {
  try {
    const candidates = await searchSteamCandidates(title);

    if (candidates.length === 0) {
      return null;
    }

    // 找最匹配的结果（名称最接近）
    const cleanTitle = cleanGameName(title).toLowerCase();
    for (const item of candidates) {
      const itemName = item.name.toLowerCase();
      // 简单匹配：名称包含或相近
      if (itemName.includes(cleanTitle) || cleanTitle.includes(itemName)) {
        logger.info('Steam 搜索匹配: %s -> appid %d', title, item.id);
        return item.id;
      }
    }

    // 默认取第一个结果
    const firstMatch = candidates[0].id;
    logger.info('Steam 搜索取首个: %s -> appid %d', title, firstMatch);
    return firstMatch;
  } catch (err) {
    const error = err as Error;
    logger.error('Steam 搜索失败: %s - %s', title, error.message);
    return null;
  }
}

/**
 * 获取 Steam 游戏详情
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
  // 如果 existing 不存在或 name/name_en 为空，则使用 resolveGameNames 计算
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
 * 批量刮削未刮削的游戏
 */
export async function scrapeUnscrapedGames(
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
    const result = await scrapeGame(game.id, downloadPosters);
    if (result && result.metadata_source !== 'unknown') {
      scrapedIds.push(game.id);
    }
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info('批量刮削完成: %d 个游戏', scrapedIds.length);
  return scrapedIds;
}