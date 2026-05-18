/**
 * 游戏识别模块
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { gameDatabase } from './database';
import { hasLocalMetadata, readLocalMetadata, checkLocalPosters } from './metadata-manager';
import { cleanGameName } from './name-cleaner';
import type { Game, GameRules, GameScrapeConfig } from '../types';

/**
 * 尝试读取 steam_appid.txt 获取 appid
 */
function readSteamAppidFile(dirPath: string): string | null {
  try {
    const appidPath = path.join(dirPath, 'steam_appid.txt');
    if (fs.existsSync(appidPath)) {
      const content = fs.readFileSync(appidPath, 'utf-8').trim();
      if (content && /^\d+$/.test(content)) {
        logger.debug('[游戏识别] 读取 steam_appid.txt: %s -> %s', dirPath, content);
        return content;
      }
    }
  } catch {
    // 忽略读取错误
  }
  return null;
}

/**
 * 检查目录是否符合游戏特征
 */
function isGameDirectory(dirPath: string, rules: GameRules): boolean {
  // 排除规则检查
  for (const pattern of rules.excludePatterns) {
    if (dirPath.includes(pattern)) {
      logger.debug('[游戏识别] 路径被排除规则命中: %s (规则: %s)', dirPath, pattern);
      return false;
    }
  }

  // 目录名特征检查（如 [GOG]、[Steam]）
  const dirName = path.basename(dirPath);
  for (const pattern of rules.folderPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(dirName)) {
      logger.debug('[游戏识别] 目录名特征匹配: %s (模式: %s)', dirPath, pattern);
      return true;
    }
  }

  // 文件特征检查（.exe、steam_api.dll 等）
  try {
    const files = fs.readdirSync(dirPath);
    for (const indicator of rules.fileIndicators) {
      if (indicator.startsWith('.')) {
        if (files.some(f => f.toLowerCase().endsWith(indicator.toLowerCase()))) {
          logger.debug('[游戏识别] 文件特征匹配(扩展名): %s (特征: %s)', dirPath, indicator);
          return true;
        }
      } else {
        if (files.some(f => f.toLowerCase() === indicator.toLowerCase())) {
          logger.debug('[游戏识别] 文件特征匹配(文件名): %s (特征: %s)', dirPath, indicator);
          return true;
        }
      }
    }
  } catch (err) {
    logger.debug('[游戏识别] 目录读取失败: %s', dirPath);
    return false;
  }

  logger.debug('[游戏识别] 未匹配任何规则: %s', dirPath);
  return false;
}

/**
 * 判断目录是否在游戏库路径内（路径前缀或关键词命中）
 * 用于决定是否需要递归扫描子目录
 */
function isGameLibrary(dirPath: string, rules: GameRules): boolean {
  const normalizedPath = dirPath.replace(/\\/g, '/').toLowerCase();

  for (const prefix of rules.pathPrefixes) {
    const normalizedPrefix = prefix.replace(/\\/g, '/');
    if (normalizedPath.startsWith(normalizedPrefix.toLowerCase())) {
      return true;
    }
  }

  if (rules.pathKeywords && rules.pathKeywords.length > 0) {
    for (const keyword of rules.pathKeywords) {
      const patterns = [
        `/${keyword.toLowerCase()}/`,
        `/${keyword.toLowerCase()}`,
        `${keyword.toLowerCase()}/`
      ];
      for (const pattern of patterns) {
        if (normalizedPath.includes(pattern)) {
          return true;
        }
      }
    }
  }

  return false;
}

const MAX_SCAN_DEPTH = 3;

/**
 * 递归扫描目录，识别其中的游戏
 */
function scanDirectory(
  dirPath: string,
  rules: GameRules,
  processedPaths: Set<string>,
  depth: number
): Partial<Game>[] {
  const games: Partial<Game>[] = [];

  if (depth > MAX_SCAN_DEPTH) return games;

  const normalizedPath = path.resolve(dirPath);
  if (processedPaths.has(normalizedPath)) return games;

  // 优先级1: game.json 存在
  if (hasLocalMetadata(dirPath)) {
    const localMeta = readLocalMetadata(dirPath);
    if (localMeta) {
      const posters = checkLocalPosters(dirPath);
      games.push({
        source_path: dirPath,
        title: localMeta.title || path.basename(dirPath),
        title_en: localMeta.title_en,
        original_name: path.basename(dirPath),
        steam_appid: localMeta.steam_appid,
        poster_horizontal_path: posters.horizontal || undefined,
        poster_vertical_path: posters.vertical || undefined,
        poster_banner_path: posters.banner || undefined,
        background_path: posters.background || undefined,
        has_local_poster: posters.horizontal || posters.vertical ? 1 : 0,
        developer: localMeta.developer,
        publisher: localMeta.publisher,
        release_date: localMeta.release_date,
        genres: localMeta.genres ? JSON.stringify(localMeta.genres) : undefined,
        rating: localMeta.rating,
        description: localMeta.description,
        short_description: localMeta.short_description,
        languages: localMeta.languages ? JSON.stringify(localMeta.languages) : undefined,
        tags: localMeta.tags ? JSON.stringify(localMeta.tags) : undefined,
        metadata_source: 'local',
        metadata_path: path.join(dirPath, 'game.json'),
        is_manually_edited: 0
      });
      processedPaths.add(normalizedPath);
      logger.info('识别游戏(本地元数据): %s [depth=%d]', localMeta.title || path.basename(dirPath), depth);
      return games;
    }
  }

  // 优先级2: 目录名特征 + 文件特征 → 确认是游戏
  if (isGameDirectory(dirPath, rules)) {
    const posters = checkLocalPosters(dirPath);
    const cleanTitle = cleanGameName(path.basename(dirPath));
    const appid = readSteamAppidFile(dirPath);
    games.push({
      source_path: dirPath,
      title: cleanTitle,
      original_name: path.basename(dirPath),
      steam_appid: appid || undefined,
      poster_horizontal_path: posters.horizontal || undefined,
      poster_vertical_path: posters.vertical || undefined,
      poster_banner_path: posters.banner || undefined,
      background_path: posters.background || undefined,
      has_local_poster: posters.horizontal || posters.vertical ? 1 : 0,
      metadata_source: 'unknown',
      is_manually_edited: 0
    });
    processedPaths.add(normalizedPath);
    logger.info('识别游戏(特征匹配): %s%s [depth=%d]', cleanTitle, appid ? ` (appid: ${appid})` : '', depth);
    return games;
  }

  // 优先级3: 路径在游戏库内 → 递归子目录
  if (isGameLibrary(dirPath, rules)) {
    logger.debug('[游戏识别] 路径在游戏库内，递归扫描: %s [depth=%d]', dirPath, depth);
    try {
      const subDirs = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(dirPath, dirent.name));

      for (const subDir of subDirs) {
        games.push(...scanDirectory(subDir, rules, processedPaths, depth + 1));
      }
    } catch (err) {
      logger.debug('[游戏识别] 目录读取失败: %s', dirPath);
    }
  }

  return games;
}

/**
 * 识别扫描路径下的游戏目录
 */
export async function identifyGames(scanRoots: string[], rules: GameRules): Promise<Partial<Game>[]> {
  const games: Partial<Game>[] = [];
  const processedPaths = new Set<string>();

  for (const scanRoot of scanRoots) {
    if (!fs.existsSync(scanRoot)) {
      logger.warn('扫描路径不存在: %s', scanRoot);
      continue;
    }

    logger.info('开始识别游戏目录: %s', scanRoot);

    // 先检查 scanRoot 本身
    games.push(...scanDirectory(scanRoot, rules, processedPaths, 0));

    // 再扫描子目录（depth=1 起）
    try {
      const subDirs = fs.readdirSync(scanRoot, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(scanRoot, dirent.name));

      for (const subDir of subDirs) {
        games.push(...scanDirectory(subDir, rules, processedPaths, 1));
      }
    } catch (err) {
      const error = err as Error;
      logger.error('扫描目录失败: %s - %s', scanRoot, error.message);
    }
  }

  return games;
}

/**
 * 将识别的游戏写入数据库
 */
export function saveGamesToDatabase(games: Partial<Game>[], _autoScrape: boolean = false): number[] {
  const ids: number[] = [];

  for (const game of games) {
    const id = gameDatabase.insertGame(game);
    if (id > 0) {
      ids.push(id);
    }
  }

  logger.info('保存游戏到数据库: %d 个', ids.length);
  return ids;
}

/**
 * 执行完整的游戏识别流程
 */
export async function runIdentification(
  scanRoots: string[],
  rules: GameRules,
  scrapeConfig: GameScrapeConfig
): Promise<{ games: Partial<Game>[]; ids: number[] }> {
  // 创建游戏表（如果不存在）
  gameDatabase.createGameTables();

  // 识别游戏目录
  const games = await identifyGames(scanRoots, rules);

  // 通过别名表补全未识别的 steam_appid
  for (const game of games) {
    if (!game.steam_appid && game.original_name) {
      const aliasAppid = gameDatabase.lookupAlias(game.original_name);
      if (aliasAppid) {
        game.steam_appid = aliasAppid;
        logger.info('别名匹配: %s -> appid %s', game.original_name, aliasAppid);
      }
    }
  }

  // 保存到数据库
  const ids = saveGamesToDatabase(games, scrapeConfig.autoScrape);

  return { games, ids };
}