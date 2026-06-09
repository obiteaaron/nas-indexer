/**
 * 配置相关类型定义
 */

export interface FileExtensionFilter {
  whitelist?: string[];
  blacklist?: string[];
}

export interface CategoryRule {
  [category: string]: string[];
}

export interface CategoryPathRule {
  pathPrefix: string;
  category: string;
}

export interface TrackingConfig {
  trackingEnabled: boolean;
  trackingLevel: 'minimal' | 'full';
}

export interface Config {
  storagePath: string;
  scanPaths: string[];
  scanTime: string;
  excludePatterns: string[];
  fileExtensionFilter: FileExtensionFilter;
  categories?: string[];
  categoryRules?: CategoryRule;
  categoryPathRules?: CategoryPathRule[];
  trackingConfig?: TrackingConfig;
  gamesEnabled?: boolean;
  gameScanPathsEnabled?: boolean;
  gameScanPaths?: string[];
  gamesRules?: import('./game').GameRules;
  gamesScrape?: import('./game').GameScrapeConfig;
  maxPosterBackups?: number;  // 每种海报类型最多保留的备份数
  proxyUrl?: string;  // HTTP 代理地址，用于 Steam API 刮削
}

export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  '$Recycle.Bin',
  'System Volume Information',
  '.git',
  'node_modules',
  '__pycache__',
  '.cache'
];

export const DEFAULT_SCAN_TIME: string = '0 3 * * *';