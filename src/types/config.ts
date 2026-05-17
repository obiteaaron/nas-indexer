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