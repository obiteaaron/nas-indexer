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
  // 全局配置
  storagePath: string;
  scanPaths: string[];
  scanTime: string;
  excludePatterns: string[];
  fileExtensionFilter: FileExtensionFilter;
  categories?: string[];
  categoryRules?: CategoryRule;
  categoryPathRules?: CategoryPathRule[];
  trackingConfig?: TrackingConfig;

  // 仅保留游戏模块开关（详细配置已移至 games-config.json）
  gamesEnabled?: boolean;

  // 预览开关配置
  thumbnailPreviewEnabled?: boolean;  // 是否启用图片缩略图预览
  thumbnailSizeLimit?: number;        // 图片预览大小限制（MB），0 表示不限制
  videoPreviewEnabled?: boolean;      // 是否启用视频元数据显示（时长、分辨率）

  // 以下字段已废弃，保留类型定义以支持迁移读取
  gameScanPathsEnabled?: boolean;
  gameScanPaths?: string[];
  gamesRules?: import('./game').GameRules;
  gamesScrape?: import('./game').GameScrapeConfig;
  maxPosterBackups?: number;
  proxyUrl?: string;
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