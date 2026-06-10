/**
 * 游戏识别模块 - 正则规则体系（支持文件和目录匹配）
 *
 * 游戏根目录识别优先级：
 * P1: steam_appid.txt向上查找（Steam游戏锚点）
 * P2: 启发式规则 + 层级偏移自适应
 * P3: 配置的levelOffset
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { gameDatabase } from './database';
// metadata-manager no longer used - game.json removed from design
import { cleanGameName } from './name-cleaner';
import type { Game, GameRules, GameScrapeConfig, GameRecognitionRule, HeuristicRulesConfig } from '../types';

/**
 * P0: 向上查找steam_appid.txt文件
 * Steam游戏的steam_appid.txt通常在游戏根目录，可作为锚点
 */
function findSteamAppidUpward(startDir: string, stopAtRoot: string): string | null {
  let current = startDir;
  const stopAt = path.resolve(stopAtRoot);

  // 向上查找，不超过扫描根目录
  while (current !== stopAt && current !== path.dirname(current)) {
    const appidPath = path.join(current, 'steam_appid.txt');
    if (fs.existsSync(appidPath)) {
      logger.debug('[智能识别] 找到steam_appid.txt锚点: %s', current);
      return current;
    }
    current = path.dirname(current);
  }

  return null;
}

/**
 * P0辅助：检查父目录是否已被用户确认
 * 用于跳过已确认游戏的子目录
 */
function checkParentConfirmed(dirPath: string, stopAt: string): boolean {
  let current = path.dirname(dirPath);
  while (current !== stopAt && current !== path.dirname(current)) {
    const game = gameDatabase.getGameByPath(current);
    if (game && game.is_root_manually_marked === 1) {
      logger.debug('[P0检查] 父目录已确认: %s', current);
      return true;
    }
    current = path.dirname(current);
  }
  return false;
}

/**
 * P0辅助：检查子目录是否已被用户确认
 * 用于跳过已确认游戏的父目录（避免重复识别）
 */
function checkChildConfirmed(parentPath: string): boolean {
  const results = gameDatabase.getGamesByPathPrefix(parentPath);
  const hasConfirmed = results.some(g => g.is_root_manually_marked === 1);
  if (hasConfirmed) {
    logger.debug('[P0检查] 子目录已确认: %s', parentPath);
  }
  return hasConfirmed;
}

/**
 * P2: 启发式规则判断游戏根目录（含层级偏移自适应）
 * 根据目录结构和exe位置自动判断
 *
 * 注意：Steam锚点（steam_appid.txt向上查找）在P1阶段处理，此函数处理其他启发式规则
 */
function findHeuristicRoot(
  initialGameDir: string,
  matchedPath: string,
  scanRoot: string,
  heuristicRules: HeuristicRulesConfig
): string {
  // matchedPath可能是文件或目录
  const isFile = !fs.statSync(matchedPath).isDirectory();

  // 获取匹配对象所在目录（作为基准目录）
  const matchedDir = isFile ? path.dirname(matchedPath) : matchedPath;
  const matchedDirName = path.basename(matchedDir).toLowerCase();

  // 规则1：如果匹配到exe文件，检查exe目录名与exe名是否相同
  if (isFile && heuristicRules.exeNameMatchEnabled) {
    const matchedFileName = path.basename(matchedPath, '.exe').toLowerCase();
    if (matchedDirName === matchedFileName || matchedDirName === matchedFileName.replace(/[^a-z0-9]/g, '')) {
      let result = matchedDir;
      for (let i = 0; i < heuristicRules.exeNameMatchOffset; i++) {
        const parent = path.dirname(result);
        if (parent === result || path.resolve(parent) === path.resolve(scanRoot)) {
          break;
        }
        result = parent;
      }
      if (result !== matchedDir) {
        logger.debug('[智能识别-P2.1] exe目录名与exe名相同，向上提升%d级: %s → %s',
          heuristicRules.exeNameMatchOffset, matchedDir, result);
        return result;
      }
    }
  }

  // 规则2：标准子目录层级偏移
  // 这些目录通常是游戏根目录下的标准子结构
  if (heuristicRules.subdirRulesEnabled) {
    const normalizedPath = matchedPath.replace(/\\/g, '/').toLowerCase();
    for (const rule of heuristicRules.subdirPatterns) {
      for (const pattern of rule.patterns) {
        const patternLower = pattern.toLowerCase();
        if (normalizedPath.includes(`/${patternLower}/`)) {
          let result = matchedDir;
          for (let i = 0; i < rule.offset; i++) {
            const parent = path.dirname(result);
            if (parent === result || path.resolve(parent) === path.resolve(scanRoot)) {
              break;
            }
            result = parent;
          }
          if (result !== matchedDir) {
            logger.debug('[智能识别-P2.2] 标准子目录%s，向上提升%d级: %s → %s',
              pattern, rule.offset, matchedDir, result);
            return result;
          }
        }
      }
    }
  }

  // 规则3：目录大小启发（游戏根目录通常较大）
  // 如果matchedDir很小，可能只是子目录，向上查找更大的父目录
  if (heuristicRules.sizeHeuristicEnabled) {
    try {
      const matchedDirSize = getDirectorySize(matchedDir);
      const thresholdBytes = heuristicRules.sizeThresholdMB * 1024 * 1024;

      if (matchedDirSize < thresholdBytes) {
        const parent = path.dirname(matchedDir);
        if (parent !== matchedDir && path.resolve(parent) !== path.resolve(scanRoot)) {
          const parentSize = getDirectorySize(parent);
          // 父目录明显更大，可能是根目录
          if (parentSize > matchedDirSize * heuristicRules.sizeRatioThreshold) {
            logger.debug('[智能识别-P2.3] 匹配目录过小(%dMB)，父目录更大(%dMB)，向上提升: %s → %s',
              Math.round(matchedDirSize / 1024 / 1024),
              Math.round(parentSize / 1024 / 1024),
              matchedDir, parent);
            return parent;
          }
        }
      }
    } catch {
      // 忽略大小计算错误
    }
  }

  return initialGameDir;
}

/**
 * 获取目录大小（粗略估算）
 */
function getDirectorySize(dirPath: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        try {
          size += fs.statSync(fullPath).size;
        } catch {}
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // 只扫描一层，避免递归过深
        try {
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile()) {
              try {
                size += fs.statSync(path.join(fullPath, subEntry.name)).size;
              } catch {}
            }
          }
        } catch {}
      }
    }
  } catch {}
  return size;
}

/**
 * 智能层级偏移：整合P1、P2、P3逻辑
 */
function smartLevelOffset(
  initialGameDir: string,
  matchedPath: string,
  rule: GameRecognitionRule,
  scanRoot: string,
  heuristicRules: HeuristicRulesConfig
): string {
  // P1: Steam锚点优先级最高（固定启用，无需配置）
  const steamRoot = findSteamAppidUpward(initialGameDir, scanRoot);
  if (steamRoot) {
    logger.info('[智能识别] P1成功 - steam_appid.txt锚点: %s', steamRoot);
    return steamRoot;
  }

  // P2: 启发式规则（含自适应）
  const heuristicRoot = findHeuristicRoot(initialGameDir, matchedPath, scanRoot, heuristicRules);
  if (heuristicRoot !== initialGameDir) {
    logger.info('[智能识别] P2成功 - 启发式判断: %s', heuristicRoot);
    return heuristicRoot;
  }

  // P3: 配置的levelOffset（兜底）
  let result = initialGameDir;
  for (let i = 0; i < rule.levelOffset; i++) {
    const parent = path.dirname(result);
    if (parent === result || path.resolve(parent) === path.resolve(scanRoot)) {
      break;
    }
    result = parent;
  }

  if (result !== initialGameDir) {
    logger.info('[智能识别] P3成功 - 配置levelOffset=%d: %s → %s',
      rule.levelOffset, initialGameDir, result);
  }

  return result;
}

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
 * 注意：此函数只做匹配，不应用偏移；偏移逻辑统一在 smartLevelOffset 中处理
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
        // 计算基准游戏目录（不应用偏移）
        // 如果匹配到文件，从文件所在目录开始；如果是目录，直接使用该目录
        const baseGamePath = isFile ? path.dirname(entryPath) : entryPath;

        logger.info('[游戏识别] 正则匹配: %s → 基准目录: %s (规则: %s, 类型: %s)',
          entryName, path.basename(baseGamePath), rule.pattern, isFile ? '文件' : '目录');

        // 智能层级偏移（P1/P2/P3统一处理）
        const gamePath = smartLevelOffset(baseGamePath, entryPath, rule, scanRoot, rules.heuristicRules);

        return { matched: true, gamePath, rule, matchedPath: entryPath, isFile };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn('[游戏识别] 正则匹配后续处理失败: %s - %s', rule.pattern, error.message);
      logger.debug('[游戏识别] 错误堆栈: %s', error.stack);
    }
  }

  return { matched: false, gamePath: null, rule: null, matchedPath: null, isFile: false };
}

/**
 * 创建游戏记录
 */
function createGameRecord(gamePath: string): Partial<Game> {
  const cleanTitle = cleanGameName(path.basename(gamePath));
  const appid = readSteamAppidFile(gamePath);

  return {
    source_path: gamePath,
    title: cleanTitle,
    original_name: path.basename(gamePath),
    steam_appid: appid || undefined,
    metadata_source: 'unknown',  // 元数据来源未知，待刮削
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

  // === P0: 用户确认优先级检查（最高优先级） ===

  // 1. 此目录本身已被用户确认 → 跳过
  const existing = gameDatabase.getGameByPath(normalizedPath);
  if (existing && existing.is_root_manually_marked === 1) {
    logger.debug('[P0] 路径已确认，跳过: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return games;
  }

  // 2. 父目录已被用户确认 → 跳过子目录
  if (!isFile && checkParentConfirmed(normalizedPath, scanRoot)) {
    logger.debug('[P0] 父目录已确认，跳过子目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return games;
  }

  // 3. 子目录已被用户确认 → 跳过父目录（避免重复识别）
  if (!isFile && checkChildConfirmed(normalizedPath)) {
    logger.debug('[P0] 子目录已确认，跳过父目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return games;
  }

  // === P1/P2/P3: 自动识别逻辑 ===
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

  // 通过 Steam DB 补全未识别的 steam_appid
  for (const game of games) {
    if (!game.steam_appid && game.original_name) {
      const match = gameDatabase.lookupSteamDbByName(game.original_name);
      if (match) {
        game.steam_appid = match.steam_appid;
        logger.info('Steam DB 匹配: %s -> appid %s (%s)', game.original_name, match.steam_appid, match.name);
      }
    }
  }

  // 保存到数据库
  const ids = saveGamesToDatabase(games, scrapeConfig.autoScrape);

  return { games, ids };
}