/**
 * Steam 刮削模块
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { logger } from '../logger';
import { gameDatabase } from './database';
import { cleanGameName } from './name-cleaner';
import { resolveGameNames } from './name-resolver';
import { getStoragePath, loadConfig } from '../utils';
import { PosterService } from './poster-service';
import { ensureGamesDirs } from './storage';
import type { Game } from '../types';

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
 * 下载图片
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.warn('下载图片失败: %s', url);
    return null;
  }
}

/**
 * 刮削单个游戏
 */
export async function scrapeGame(gameId: number, downloadPosters: boolean = true): Promise<Game | null> {
  const game = gameDatabase.getGameById(gameId);
  if (!game) {
    logger.warn('游戏不存在: id %d', gameId);
    return null;
  }

  // 如果已经有 Steam appid，直接用
  let appid: number | null = null;
  if (game.steam_appid) {
    appid = parseInt(game.steam_appid);
  } else {
    // 搜索 Steam
    appid = await searchSteamGame(game.title);
  }

  if (!appid) {
    logger.info('无法找到 Steam appid: %s', game.title);
    return game;
  }

  // 获取详情
  const details = await getSteamDetails(appid);
  if (!details || !details.data) {
    logger.info('无法获取 Steam 详情: appid %d', appid);
    // 只保存 appid，不改变 metadata_source（仍为 'unknown'）
    // 这样前端仍显示"待刮削"，用户可重试刮削
    gameDatabase.updateGame(gameId, {
      steam_appid: String(appid)
    });
    return gameDatabase.getGameById(gameId);
  }

  const data = details.data;

  // 刮削成功后，将数据存入/更新 steam_db
  const existing = gameDatabase.getSteamDbByAppid(String(appid));
  const steamName = data.name;
  const dirName = game.original_name;

  // 使用统一的游戏名处理逻辑
  const resolved = resolveGameNames(
    steamName,
    dirName,
    existing ? existing.aliases || [] : []
  );

  if (existing) {
    // 已存在：更新对应字段
    gameDatabase.updateSteamDbEntry(existing.id!, {
      name: resolved.name,
      name_en: resolved.nameEn,
      aliases: resolved.aliases,
      source: 'scraper'
    });
    logger.info('Steam DB 更新: appid %d, name=%s, name_en=%s, aliases=%d',
      appid, resolved.name, resolved.nameEn || '-', resolved.aliases.length);
  } else {
    // 不存在：插入新条目
    gameDatabase.insertSteamDbEntry({
      steam_appid: String(appid),
      name: resolved.name,
      name_en: resolved.nameEn,
      aliases: resolved.aliases,
      source: 'scraper'
    });
    logger.info('Steam DB 缓存: appid %d, name=%s, name_en=%s',
      appid, resolved.name, resolved.nameEn || steamName);
  }

  // 智能处理 title 和 title_en（使用统一逻辑）
  const shouldUpdateTitle = !game.is_manually_edited;

  const updateData: Partial<Game> = {
    steam_appid: String(data.steam_appid),
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
    poster_url: data.header_image || undefined,
    cover_url: data.capsule_images?.[0]?.capsule || undefined,
    screenshots: data.screenshots ? JSON.stringify(data.screenshots.slice(0, 5).map(s => s.path_full)) : undefined,
    metadata_source: 'steam',  // 只有成功获取元数据才设置为 'steam'
    scraped_at: new Date().toISOString()  // 刮削完成时间
  };

  // 下载海报到 profiles/games/posters/{gameId}/
  if (downloadPosters && game.source_path) {
    try {
      const config = loadConfig();
      const storagePath = getStoragePath(config);
      ensureGamesDirs(storagePath);
      const posterService = new PosterService(storagePath);

      // 横版海报 (header_image)
      if (data.header_image) {
        const horizontalData = await downloadImage(data.header_image);
        if (horizontalData) {
          posterService.saveFromBuffer(game.id, 'horizontal', horizontalData);
        }
      }

      // 背景图
      if (data.background) {
        const backgroundData = await downloadImage(data.background);
        if (backgroundData) {
          posterService.saveFromBuffer(game.id, 'background', backgroundData);
        }
      }
    } catch (err) {
      logger.warn('下载海报失败: %s', game.title);
    }
  }

  // 更新数据库
  gameDatabase.updateGame(gameId, updateData);

  logger.info('刮削完成: %s (appid %d)', game.title, appid);
  return gameDatabase.getGameById(gameId);
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