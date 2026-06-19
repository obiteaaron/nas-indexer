/**
 * 游戏模块独立配置类型定义
 */

import type { GameRules, GameScrapeConfig } from './game';

export interface GamesConfig {
  // 扫描配置
  gameScanPathsEnabled: boolean;
  gameScanPaths: string[];

  // 识别规则
  gamesRules: GameRules;

  // 刮削配置
  gamesScrape: GameScrapeConfig;

  // 图片配置
  maxPosterBackups: number;

  // Steam 配置
  proxyUrl: string;
}

export const DEFAULT_GAMES_CONFIG: GamesConfig = {
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: {
    recognitionRules: [
      { pattern: '\\[GOG\\]$', levelOffset: 0, enabled: true, description: 'GOG 版游戏' },
      { pattern: '\\[Steam\\]$', levelOffset: 0, enabled: true, description: 'Steam 版游戏' },
      { pattern: '\\[CRACK\\]$', levelOffset: 0, enabled: true, description: '破解版游戏' },
      { pattern: 'FitGirl.*Repack$', levelOffset: 1, enabled: true, description: 'FitGirl 压缩包' },
      { pattern: '/steamapps/', levelOffset: 0, enabled: true, description: 'Steam 游戏库' },
      { pattern: '/games/', levelOffset: 0, enabled: true, description: '通用游戏目录' },
    ],
    heuristicRules: {},
    blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
    maxScanDepth: 3
  },
  gamesScrape: {
    autoScrape: true,
    downloadPosters: true,
    scrapeOnIdentify: true,
    autoGroupOnScan: true
  },
  maxPosterBackups: 5,
  proxyUrl: ''
};