/**
 * 前端类型定义
 */

// API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 文件类型
export interface File {
  id: number;
  path: string;
  name: string;
  ext: string | null;
  size: number;
  category: string;
  modified_at: string | null;
  scanned_at: string | null;
  is_favorite: number;
  scan_path: string | null;
}

export interface Tag {
  id: number;
  group_id: number | null;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface TagGroup {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  tags?: Tag[];
}

export interface TagWithGroup extends Tag {
  group_name?: string;
  group_color?: string;
}

export interface TagStats extends TagWithGroup {
  file_count: number;
}

export interface FileWithTags extends File {
  tags?: TagWithGroup[];
  sizeFormatted?: string;
}

// 配置类型
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
  gamesRules?: GameRules;
  gamesScrape?: GameScrapeConfig;
  // 前端扩展属性
  thumbnailSizeLimit?: number;
}

// 统计类型
export interface StatisticsItem {
  category: string;
  count: number;
  totalSize: number;
  // 后端计算添加的属性
  size?: string;
  sizeBytes?: number;
  percent?: number | string;
}

export interface TotalStats {
  totalFiles: number;
  totalSize: number;
  // 后端计算添加的属性
  totalSizeBytes?: number;
}

export interface StatisticsResponse {
  meta: TotalStats;
  categories: StatisticsItem[];
}

// 追踪类型
export interface UserPreference {
  id: number;
  preference_type: 'category' | 'tag' | 'keyword';
  preference_key: string;
  preference_value: number;
  data_source: string;
  last_updated: string;
}

export interface Preferences {
  categories: UserPreference[];
  tags: UserPreference[];
  keywords: UserPreference[];
}

export interface Recommendation {
  id: number;
  rec_type: string;
  file_id: number;
  score: number;
  reason: string;
  created_at: string;
  expires_at: string | null;
  name?: string;
  path?: string;
  ext?: string;
  category?: string;
  size?: number;
  // 前端计算添加的属性
  sizeFormatted?: string;
}

export interface FileView {
  id: number;
  file_id: number;
  view_count: number;
  last_viewed_at: string;
  preview_count: number;
  play_duration: number;
  name?: string;
  path?: string;
  ext?: string;
  category?: string;
  size?: number;
}

// 前端特有类型
export interface Task {
  id: string;
  type: 'scan' | 'scan-path';
  status: 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  currentPath?: string;
  error?: string;
  result?: {
    totalFiles: number;
    totalSize: string;
  };
}

export interface StatusResponse {
  storagePath: string;
  hasData: boolean;
  totalFiles: number;
  totalSize: string;
  scheduled: boolean;
  nextScan: string;
}

export interface PathStatus {
  path: string;
  isAccessible: boolean;
  fileCount: number;
  latency: number;
  error?: string;
}

export interface PreviewResponse {
  path: string;
  name: string;
  ext: string | null;
  previewType: 'image' | 'video' | 'audio' | 'pdf' | 'unknown';
  previewUrl: string;
}

export interface FileFormData {
  category?: string;
  search?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
  minSize?: number | string;
  maxSize?: number | string;
  modifiedAfter?: string;
  modifiedBefore?: string;
}

export interface FilesResponse {
  files: File[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FileInfo {
  path: string;
  name: string;
  ext: string;
  size: number;
  sizeFormatted: string;
  category: string;
  created: Date;
  modified: Date;
  accessed: Date;
  parentDir: string;
  isDirectory: boolean;
  isFile: boolean;
}

// 游戏类型
export interface Game {
  id: number;
  source_path: string;
  title: string;
  title_en?: string;
  original_name?: string;
  steam_appid?: string;
  poster_url?: string;
  cover_url?: string;
  poster_horizontal_path?: string;
  poster_vertical_path?: string;
  poster_banner_path?: string;
  background_path?: string;
  has_local_poster: number;
  developer?: string;
  publisher?: string;
  release_date?: string;
  genres?: string;
  rating?: number;
  description?: string;
  short_description?: string;
  languages?: string;
  tags?: string;
  notes?: string;
  screenshots?: string;
  metadata_source: string;
  metadata_path?: string;
  scraped_at?: string;
  is_manually_edited: number;
  is_excluded?: number;
  created_at?: string;
  updated_at?: string;
  posterLocal?: string;
  genresArray?: string[];
}

export interface GameQueryOptions {
  genre?: string;
  year?: string;
  search?: string;
  scraped?: 'true' | 'false';
  excluded?: 'true' | 'false';
  orderBy?: 'title' | 'rating' | 'release_date' | 'scraped_at';
  orderDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

export interface GamesResponse {
  games: Game[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GameStatistics {
  totalGames: number;
  scrapedGames: number;
  unscrapedGames: number;
  excludedGames: number;
  byYear: { year: string; count: number }[];
  byGenre: { genre: string; count: number }[];
}

export interface GameRules {
  pathPrefixes: string[];
  pathKeywords: string[];
  fileIndicators: string[];
  excludePatterns: string[];
  folderPatterns: string[];
  metadataFile: string;
}

export interface GameScrapeConfig {
  autoScrape: boolean;
  downloadPosters: boolean;
  scrapeOnIdentify: boolean;
}

export interface GameConfig {
  gamesEnabled: boolean;
  gamesRules?: GameRules;
  gamesScrape?: GameScrapeConfig;
}

export interface SteamSearchItem {
  id: number;
  name: string;
  tiny_image: string;
  metacritic_score?: number;
}