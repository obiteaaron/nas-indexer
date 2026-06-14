/**
 * 游戏模块独立配置管理
 */

import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { loadConfig, getStoragePath, ensureStorageDir } from './utils';
import type { GamesConfig } from './types/games-config';
import { DEFAULT_GAMES_CONFIG } from './types/games-config';

const GAMES_CONFIG_FILE = 'games-config.json';

/**
 * 获取游戏配置文件路径
 */
function getGamesConfigPath(): string {
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  return path.join(storagePath, GAMES_CONFIG_FILE);
}

/**
 * 加载游戏配置
 * 首次加载时自动从旧 config.json 迁移
 */
function loadGamesConfig(): GamesConfig {
  const configPath = getGamesConfigPath();

  // 如果 games-config.json 已存在，直接加载
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const merged: GamesConfig = {
        ...DEFAULT_GAMES_CONFIG,
        ...raw,
        gamesRules: {
          ...DEFAULT_GAMES_CONFIG.gamesRules,
          ...(raw.gamesRules || {}),
          heuristicRules: {
            ...DEFAULT_GAMES_CONFIG.gamesRules.heuristicRules,
            ...(raw.gamesRules?.heuristicRules || {})
          }
        },
        gamesScrape: {
          ...DEFAULT_GAMES_CONFIG.gamesScrape,
          ...(raw.gamesScrape || {})
        }
      };
      logger.debug('加载游戏配置: %s', configPath);
      return merged;
    } catch (err) {
      const error = err as Error;
      logger.error('加载游戏配置失败: %s', error.message);
      return DEFAULT_GAMES_CONFIG;
    }
  }

  // 不存在：尝试从旧 config.json 迁移
  const oldConfig = loadConfig();
  const migrated: GamesConfig = {
    gameScanPathsEnabled: oldConfig.gameScanPathsEnabled ?? DEFAULT_GAMES_CONFIG.gameScanPathsEnabled,
    gameScanPaths: oldConfig.gameScanPaths ?? DEFAULT_GAMES_CONFIG.gameScanPaths,
    gamesRules: oldConfig.gamesRules ?? DEFAULT_GAMES_CONFIG.gamesRules,
    gamesScrape: oldConfig.gamesScrape ?? DEFAULT_GAMES_CONFIG.gamesScrape,
    maxPosterBackups: oldConfig.maxPosterBackups ?? DEFAULT_GAMES_CONFIG.maxPosterBackups,
    proxyUrl: oldConfig.proxyUrl ?? DEFAULT_GAMES_CONFIG.proxyUrl
  };

  // 保存新的 games-config.json
  saveGamesConfig(migrated);
  logger.info('游戏配置已迁移: %s', configPath);

  return migrated;
}

/**
 * 保存游戏配置
 */
function saveGamesConfig(config: GamesConfig): boolean {
  const configPath = getGamesConfigPath();
  try {
    ensureStorageDir(loadConfig());
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.info('游戏配置已保存: %s', configPath);
    return true;
  } catch (err) {
    const error = err as Error;
    logger.error('保存游戏配置失败: %s', error.message);
    return false;
  }
}

/**
 * 获取游戏扫描路径
 */
function getGameScanPathsFromConfig(): string[] {
  const gamesConfig = loadGamesConfig();
  if (gamesConfig.gameScanPathsEnabled && gamesConfig.gameScanPaths.length > 0) {
    return gamesConfig.gameScanPaths;
  }
  // 兜底：使用全局扫描路径
  return loadConfig().scanPaths;
}

export {
  loadGamesConfig,
  saveGamesConfig,
  getGameScanPathsFromConfig,
  DEFAULT_GAMES_CONFIG
};