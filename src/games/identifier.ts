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

  const normalizedPath = dirPath.replace(/\\/g, '/').toLowerCase();

  // 路径前缀匹配（优先级最高）
  for (const prefix of rules.pathPrefixes) {
    const normalizedPrefix = prefix.replace(/\\/g, '/');
    if (normalizedPath.startsWith(normalizedPrefix.toLowerCase())) {
      logger.debug('[游戏识别] 路径前缀匹配: %s (前缀: %s)', dirPath, prefix);
      return true;
    }
  }

  // 路径关键词匹配
  if (rules.pathKeywords && rules.pathKeywords.length > 0) {
    for (const keyword of rules.pathKeywords) {
      // 关键词需要作为路径的一部分，避免误识别（如 game-docs）
      // 使用分隔符确保关键词是独立的路径部分
      const patterns = [
        `/${keyword.toLowerCase()}/`,
        `/${keyword.toLowerCase()}`,
        `${keyword.toLowerCase()}/`
      ];
      for (const pattern of patterns) {
        if (normalizedPath.includes(pattern)) {
          logger.debug('[游戏识别] 路径关键词匹配: %s (关键词: %s, 模式: %s)', dirPath, keyword, pattern);
          return true;
        }
      }
    }
  }

  // 目录名特征检查（优先于文件特征，成本更低）
  const dirName = path.basename(dirPath);
  for (const pattern of rules.folderPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(dirName)) {
      logger.debug('[游戏识别] 目录名特征匹配: %s (模式: %s)', dirPath, pattern);
      return true;
    }
  }

  // 文件特征检查（成本最高，放最后）
  try {
    const files = fs.readdirSync(dirPath);
    for (const indicator of rules.fileIndicators) {
      // 检查是否有匹配的特征文件
      if (indicator.startsWith('.')) {
        // 扩展名匹配
        if (files.some(f => f.toLowerCase().endsWith(indicator.toLowerCase()))) {
          logger.debug('[游戏识别] 文件特征匹配(扩展名): %s (特征: %s)', dirPath, indicator);
          return true;
        }
      } else {
        // 文件名匹配
        if (files.some(f => f.toLowerCase() === indicator.toLowerCase())) {
          logger.debug('[游戏识别] 文件特征匹配(文件名): %s (特征: %s)', dirPath, indicator);
          return true;
        }
      }
    }
  } catch (err) {
    // 目录读取失败，可能权限问题
    logger.debug('[游戏识别] 目录读取失败: %s', dirPath);
    return false;
  }

  logger.debug('[游戏识别] 未匹配任何规则: %s', dirPath);
  return false;
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

    // 检查 scanRoot 本身是否是一个游戏目录
    const normalizedScanRoot = path.resolve(scanRoot);
    if (!processedPaths.has(normalizedScanRoot)) {
      // 优先级1: game.json 存在
      if (hasLocalMetadata(scanRoot)) {
        const localMeta = readLocalMetadata(scanRoot);
        if (localMeta) {
          const posters = checkLocalPosters(scanRoot);
          const game = {
            source_path: scanRoot,
            title: localMeta.title || path.basename(scanRoot),
            title_en: localMeta.title_en,
            original_name: path.basename(scanRoot),
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
            metadata_path: path.join(scanRoot, 'game.json'),
            is_manually_edited: 0
          };
          games.push(game);
          processedPaths.add(normalizedScanRoot);
          logger.info('识别游戏(本地元数据-根目录): %s', game.title);
        }
      }

      // 优先级2: 路径特征匹配（排除 game.json 已处理的情况）
      if (!processedPaths.has(normalizedScanRoot) && isGameDirectory(scanRoot, rules)) {
        const posters = checkLocalPosters(scanRoot);
        const cleanTitle = cleanGameName(path.basename(scanRoot));
        const game = {
          source_path: scanRoot,
          title: cleanTitle,
          original_name: path.basename(scanRoot),
          poster_horizontal_path: posters.horizontal || undefined,
          poster_vertical_path: posters.vertical || undefined,
          poster_banner_path: posters.banner || undefined,
          background_path: posters.background || undefined,
          has_local_poster: posters.horizontal || posters.vertical ? 1 : 0,
          metadata_source: 'unknown',
          is_manually_edited: 0
        };
        games.push(game);
        processedPaths.add(normalizedScanRoot);
        logger.info('识别游戏(特征匹配-根目录): %s', game.title);
      }
    }

    // 遍历扫描根目录的子目录
    try {
      const subDirs = fs.readdirSync(scanRoot, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(scanRoot, dirent.name));

      for (const subDir of subDirs) {
        // 优先级1: game.json 存在 -> 直接读取元数据
        if (hasLocalMetadata(subDir)) {
          const localMeta = readLocalMetadata(subDir);
          if (localMeta) {
            const posters = checkLocalPosters(subDir);
            const game = {
              source_path: subDir,
              title: localMeta.title || path.basename(subDir),
              title_en: localMeta.title_en,
              original_name: path.basename(subDir),
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
              metadata_path: path.join(subDir, 'game.json'),
              is_manually_edited: 0
            };
            games.push(game);
            logger.info('识别游戏(本地元数据): %s', game.title);
            continue;
          }
        }

        // 优先级2 & 3: 路径前缀或文件特征匹配
        if (isGameDirectory(subDir, rules)) {
          const posters = checkLocalPosters(subDir);
          const cleanTitle = cleanGameName(path.basename(subDir));
          const game = {
            source_path: subDir,
            title: cleanTitle,
            original_name: path.basename(subDir),
            poster_horizontal_path: posters.horizontal || undefined,
            poster_vertical_path: posters.vertical || undefined,
            poster_banner_path: posters.banner || undefined,
            background_path: posters.background || undefined,
            has_local_poster: posters.horizontal || posters.vertical ? 1 : 0,
            metadata_source: 'unknown',
            is_manually_edited: 0
          };
          games.push(game);
          logger.info('识别游戏(特征匹配): %s', game.title);
        }
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

  // 保存到数据库
  const ids = saveGamesToDatabase(games, scrapeConfig.autoScrape);

  return { games, ids };
}