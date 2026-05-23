/**
 * 游戏识别模块 - 正则规则体系（支持文件和目录匹配）
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { gameDatabase } from './database';
import { hasLocalMetadata, readLocalMetadata, checkLocalPosters } from './metadata-manager';
import { cleanGameName } from './name-cleaner';
import type { Game, GameRules, GameScrapeConfig, GameRecognitionRule } from '../types';

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
 * 正则规则匹配结果
 */
interface RuleMatchResult {
  matched: boolean;
  gamePath: string | null;
  rule: GameRecognitionRule | null;
  matchedPath: string | null;  // 匹配到的原始路径（可能是文件）
  isFile: boolean;             // 匹配到的是文件还是目录
}

/**
 * 正则规则匹配
 * 匹配任意全路径（文件或目录），不区分类型
 */
function matchRecognitionRule(
  entryPath: string,
  isFile: boolean,
  rules: GameRules,
  scanRoot: string
): RuleMatchResult {
  // 黑名单检查
  const normalizedPathLower = entryPath.replace(/\\/g, '/').toLowerCase();
  for (const blacklist of rules.blacklistPatterns) {
    if (normalizedPathLower.includes(blacklist.toLowerCase())) {
      logger.debug('[游戏识别] 黑名单跳过: %s', entryPath);
      return { matched: false, gamePath: null, rule: null, matchedPath: null, isFile: false };
    }
  }

  const entryName = path.basename(entryPath);
  const normalizedPath = entryPath.replace(/\\/g, '/');

  // 按顺序执行正则规则（匹配完整路径）
  for (const rule of rules.recognitionRules) {
    if (!rule.enabled) continue;

    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(normalizedPath)) {
        // 计算层级偏移后的游戏目录
        // 如果匹配到文件，从文件所在目录开始计算偏移
        let gamePath = isFile ? path.dirname(entryPath) : entryPath;

        for (let i = 0; i < rule.levelOffset; i++) {
          const parent = path.dirname(gamePath);
          // 不能超出扫描根目录
          if (parent === gamePath || path.resolve(parent) === path.resolve(scanRoot)) {
            break;
          }
          gamePath = parent;
        }

        logger.info('[游戏识别] 正则匹配: %s → 游戏目录: %s (规则: %s, 偏移: %d, 类型: %s)',
          entryName, path.basename(gamePath), rule.pattern, rule.levelOffset, isFile ? '文件' : '目录');

        return { matched: true, gamePath, rule, matchedPath: entryPath, isFile };
      }
    } catch (err) {
      logger.warn('[游戏识别] 正则错误: %s', rule.pattern);
    }
  }

  return { matched: false, gamePath: null, rule: null, matchedPath: null, isFile: false };
}

/**
 * 创建游戏记录
 */
function createGameRecord(gamePath: string): Partial<Game> {
  const posters = checkLocalPosters(gamePath);
  const cleanTitle = cleanGameName(path.basename(gamePath));
  const appid = readSteamAppidFile(gamePath);

  return {
    source_path: gamePath,
    title: cleanTitle,
    original_name: path.basename(gamePath),
    steam_appid: appid || undefined,
    poster_horizontal_path: posters.horizontal || undefined,
    poster_vertical_path: posters.vertical || undefined,
    poster_banner_path: posters.banner || undefined,
    background_path: posters.background || undefined,
    has_local_poster: posters.horizontal || posters.vertical ? 1 : 0,
    metadata_source: 'regex',
    is_manually_edited: 0
  };
}

/**
 * 扫描单个路径（文件或目录）
 */
function scanEntry(
  entryPath: string,
  isFile: boolean,
  rules: GameRules,
  processedPaths: Set<string>,
  depth: number,
  scanRoot: string
): Partial<Game>[] {
  const games: Partial<Game>[] = [];

  if (depth > rules.maxScanDepth) return games;

  const normalizedPath = path.resolve(entryPath);
  if (processedPaths.has(normalizedPath)) return games;

  // 文件不检查 game.json（只有目录可能有）
  if (!isFile) {
    // P1: 本地元数据 (game.json)
    if (hasLocalMetadata(entryPath)) {
      const localMeta = readLocalMetadata(entryPath);
      if (localMeta) {
        const posters = checkLocalPosters(entryPath);
        games.push({
          source_path: entryPath,
          title: localMeta.title || path.basename(entryPath),
          title_en: localMeta.title_en,
          original_name: path.basename(entryPath),
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
          metadata_path: path.join(entryPath, 'game.json'),
          is_manually_edited: 0
        });
        processedPaths.add(normalizedPath);
        logger.info('识别游戏(本地元数据): %s [depth=%d]', localMeta.title || path.basename(entryPath), depth);
        return games;
      }
    }
  }

  // P2: 正则规则匹配（文件和目录都可以匹配）
  const matchResult = matchRecognitionRule(entryPath, isFile, rules, scanRoot);
  if (matchResult.matched && matchResult.gamePath) {
    const gamePath = matchResult.gamePath;
    const gamePathNormalized = path.resolve(gamePath);

    // 检查是否已被处理
    if (processedPaths.has(gamePathNormalized)) {
      processedPaths.add(normalizedPath);
      return games;
    }

    games.push(createGameRecord(gamePath));
    processedPaths.add(gamePathNormalized);
    processedPaths.add(normalizedPath);

    // 标记游戏目录下所有内容为已处理（阻止重复识别）
    try {
      const entries = fs.readdirSync(gamePath, { withFileTypes: true });
      for (const entry of entries) {
        processedPaths.add(path.resolve(path.join(gamePath, entry.name)));
      }
    } catch {}

    logger.info('识别游戏(正则匹配): %s [depth=%d]', path.basename(gamePath), depth);
    return games;
  }

  // P3: 如果是目录且未匹配，递归扫描子内容
  if (!isFile) {
    try {
      const entries = fs.readdirSync(entryPath, { withFileTypes: true });

      for (const entry of entries) {
        const childPath = path.join(entryPath, entry.name);
        const childIsFile = entry.isFile();
        games.push(...scanEntry(childPath, childIsFile, rules, processedPaths, depth + 1, scanRoot));
      }
    } catch (err) {
      logger.debug('[游戏识别] 目录读取失败: %s', entryPath);
    }
  }

  return games;
}

/**
 * 识别扫描路径下的游戏
 */
export async function identifyGames(scanRoots: string[], rules: GameRules): Promise<Partial<Game>[]> {
  const games: Partial<Game>[] = [];
  const processedPaths = new Set<string>();

  // 按路径深度降序排列，子目录先扫描，父目录后扫描
  const sortedRoots = [...scanRoots].sort((a, b) => {
    const depthA = path.resolve(a).split(path.sep).length;
    const depthB = path.resolve(b).split(path.sep).length;
    return depthB - depthA;
  });
  logger.debug('扫描路径按深度排序（深→浅）: %j', sortedRoots);

  for (const scanRoot of sortedRoots) {
    if (!fs.existsSync(scanRoot)) {
      logger.warn('扫描路径不存在: %s', scanRoot);
      continue;
    }

    logger.info('开始识别游戏: %s', scanRoot);

    // 扫描根目录本身
    const rootStat = fs.statSync(scanRoot);
    games.push(...scanEntry(scanRoot, !rootStat.isDirectory(), rules, processedPaths, 0, scanRoot));

    // 如果根目录是目录，扫描其子内容
    if (rootStat.isDirectory()) {
      try {
        const entries = fs.readdirSync(scanRoot, { withFileTypes: true });

        for (const entry of entries) {
          const childPath = path.join(scanRoot, entry.name);
          games.push(...scanEntry(childPath, entry.isFile(), rules, processedPaths, 1, scanRoot));
        }
      } catch (err) {
        const error = err as Error;
        logger.error('扫描目录失败: %s - %s', scanRoot, error.message);
      }
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