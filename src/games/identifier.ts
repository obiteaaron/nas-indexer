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
import { extractNamesFromPath } from './name-resolver';
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
 * 检查父目录是否已是游戏目录
 * 用于跳过已存在游戏的子目录
 */
function checkParentIsGame(dirPath: string, stopAt: string): boolean {
  let current = path.dirname(dirPath);
  while (current !== stopAt && current !== path.dirname(current)) {
    const game = gameDatabase.getGameByPath(current);
    if (game) {
      logger.debug('[跳过检查] 父目录已是游戏: %s', current);
      return true;
    }
    current = path.dirname(current);
  }
  return false;
}

/**
 * 检查子目录是否已是游戏目录
 * 用于跳过已存在游戏的父目录（避免重复识别）
 */
function checkChildIsGame(parentPath: string): boolean {
  const results = gameDatabase.getGamesByPathPrefix(parentPath);
  if (results.length > 0) {
    logger.debug('[跳过检查] 子目录已是游戏: %s (共 %d 个)', parentPath, results.length);
  }
  return results.length > 0;
}

// P2 启发式规则已删除（v1.5.5）
// 原函数 findHeuristicRoot 已移除

/**
 * 智能层级偏移：整合P1、P2逻辑（v1.5.5 简化为两级）
 */
function smartLevelOffset(
  initialGameDir: string,
  _matchedPath: string,
  rule: GameRecognitionRule,
  scanRoot: string,
  _heuristicRules: HeuristicRulesConfig
): SmartOffsetResult {
  // P1: Steam锚点优先级最高（固定启用，无需配置）
  const steamRoot = findSteamAppidUpward(initialGameDir, scanRoot);
  if (steamRoot) {
    logger.debug('[智能识别] P1成功 - steam_appid.txt锚点: %s', steamRoot);
    return { gamePath: steamRoot, method: 'steam_anchor', detail: 'steam_appid.txt' };
  }

  // P2: 启发式规则（已删除v1.5.5）
  // 原调用 findHeuristicRoot，现已删除，直接跳过

  // P3: 配置的levelOffset（现为P2，兜底）
  let result = initialGameDir;
  for (let i = 0; i < rule.levelOffset; i++) {
    const parent = path.dirname(result);
    if (parent === result || path.resolve(parent) === path.resolve(scanRoot)) {
      break;
    }
    result = parent;
  }

  if (result !== initialGameDir) {
    logger.debug('[智能识别] P2成功 - 配置levelOffset=%d: %s → %s',
      rule.levelOffset, initialGameDir, result);
    return { gamePath: result, method: 'level_offset', detail: `levelOffset=${rule.levelOffset}` };
  }

  return { gamePath: result, method: 'none' };
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
 * 智能层级偏移结果
 */
interface SmartOffsetResult {
  gamePath: string;
  method: 'steam_anchor' | 'level_offset' | 'none';
  detail?: string;  // 具体信息，如 "steam_appid.txt" 或 "levelOffset=1"
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
  offsetResult?: SmartOffsetResult;  // 智能偏移结果
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
    // 黑名单路径也需要标准化（统一使用 / 分隔符）
    const normalizedBlacklist = blacklist.replace(/\\/g, '/').toLowerCase();
    if (normalizedPathLower.includes(normalizedBlacklist)) {
      logger.debug('[游戏识别] 黑名单跳过: %s (匹配: %s)', entryPath, blacklist);
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

        logger.debug('[游戏识别] 正则匹配: %s → 基准目录: %s (规则: %s, 类型: %s)',
          entryName, path.basename(baseGamePath), rule.pattern, isFile ? '文件' : '目录');

        // 智能层级偏移（P1/P2统一处理）
        const offsetResult = smartLevelOffset(baseGamePath, entryPath, rule, scanRoot, rules.heuristicRules);

        return { matched: true, gamePath: offsetResult.gamePath, rule, matchedPath: entryPath, isFile, offsetResult };
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
 * 使用路径提取中英文名称
 */
function createGameRecord(gamePath: string, scanRoot: string): Partial<Game> {
  // 使用路径提取中英文名称
  const extracted = extractNamesFromPath(gamePath, scanRoot);
  const appid = readSteamAppidFile(gamePath);

  // 记录提取结果日志
  if (extracted.titleEn) {
    logger.info('[路径名称提取] 成功: "%s" → 中文="%s", 英文="%s" (%s)',
      extracted.originalName, extracted.title, extracted.titleEn,
      extracted.source.detail || '无详情');
  }

  return {
    source_path: gamePath,
    title: extracted.title,
    title_en: extracted.titleEn || undefined,
    original_name: extracted.originalName,
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

  // === 跳过已存在游戏目录检查 ===

  // 1. 此目录本身已是游戏目录 → 跳过
  const existing = gameDatabase.getGameByPath(normalizedPath);
  if (existing) {
    logger.debug('[跳过] 路径已是游戏目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return games;
  }

  // 2. 父目录已是游戏目录 → 跳过子目录
  if (!isFile && checkParentIsGame(normalizedPath, scanRoot)) {
    logger.debug('[跳过] 父目录已是游戏，跳过子目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return games;
  }

  // 3. 子目录已是游戏目录 → 跳过父目录（避免重复识别）
  if (!isFile && checkChildIsGame(normalizedPath)) {
    logger.debug('[跳过] 子目录已是游戏，跳过父目录: %s', normalizedPath);
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

    // 新增：检查游戏是否已存在于数据库（跳过日志输出）
    const existingGame = gameDatabase.getGameByPath(gamePathNormalized);
    if (existingGame) {
      // 已存在，只标记为已处理，不创建新记录，不打印日志
      processedPaths.add(gamePathNormalized);
      processedPaths.add(normalizedPath);

      // 标记游戏目录下所有内容为已处理
      try {
        const entries = fs.readdirSync(gamePath, { withFileTypes: true });
        for (const entry of entries) {
          processedPaths.add(path.resolve(path.join(gamePath, entry.name)));
        }
      } catch {}

      return games;  // 返回空数组
    }

    // 新游戏，创建记录并打印日志
    games.push(createGameRecord(gamePath, scanRoot));
    processedPaths.add(gamePathNormalized);
    processedPaths.add(normalizedPath);

    // 标记游戏目录下所有内容为已处理（阻止重复识别）
    try {
      const entries = fs.readdirSync(gamePath, { withFileTypes: true });
      for (const entry of entries) {
        processedPaths.add(path.resolve(path.join(gamePath, entry.name)));
      }
    } catch {}

    // 构建丰富的日志信息
    const logParts: string[] = [path.basename(gamePath)];
    logParts.push(`规则=${matchResult.rule?.pattern || 'unknown'}`);
    logParts.push(`类型=${matchResult.isFile ? '文件' : '目录'}`);
    if (matchResult.offsetResult) {
      if (matchResult.offsetResult.method === 'steam_anchor') {
        logParts.push(`识别=Steam锚点`);
      } else if (matchResult.offsetResult.method === 'level_offset') {
        logParts.push(`识别=${matchResult.offsetResult.detail}`);
      }
    }
    logParts.push(`depth=${depth}`);
    // 显示原始扫描路径（当与游戏根目录不同时）
    const entryPathNormalized = path.resolve(entryPath);
    if (entryPathNormalized !== gamePathNormalized) {
      logParts.push(`原始=${path.basename(entryPath)}`);
    }

    logger.info('识别游戏: %s', logParts.join(', '));
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