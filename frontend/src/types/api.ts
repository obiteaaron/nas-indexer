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
  gameScanPathsEnabled?: boolean;
  gameScanPaths?: string[];
  gamesRules?: GameRules;
  gamesScrape?: GameScrapeConfig;
  proxyUrl?: string;  // HTTP 代理地址，用于 Steam API 刮削
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
  type: 'scan' | 'scan-path' | 'game-scrape';
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
  has_local_poster?: number; // 已废弃，海报现在集中存储在 profiles/games/posters/{id}/
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
  is_favorite?: number;
  is_root_manually_marked?: number;
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
  favorite?: 'true' | 'false';
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
  favoriteGames: number;
  byYear: { year: string; count: number }[];
  byGenre: { genre: string; count: number }[];
}

export interface GameGroup {
  id: number;
  name: string;
  pinned: number;
  sort_order: number;
  game_count?: number;
  created_at?: string;
}

export interface GameGroupItem {
  id: number;
  group_id: number;
  game_id: number;
  sort_order: number;
  created_at?: string;
  game?: Game;
}

export interface PosterBackup {
  filename: string;
  type: 'horizontal' | 'vertical' | 'banner' | 'background';
  createdAt: string;
  size: number;
}

export interface GameRecognitionRule {
  pattern: string;
  levelOffset: number;
  enabled: boolean;
  description?: string;
}

export interface HeuristicRulesConfig {
  // 规则1：exe目录名匹配
  exeNameMatchEnabled: boolean;
  exeNameMatchOffset: number;

  // 规则2：标准子目录层级偏移
  subdirPatterns: Array<{
    patterns: string[];
    offset: number;
    description: string;
  }>;
  subdirRulesEnabled: boolean;

  // 规则3：目录大小启发
  sizeHeuristicEnabled: boolean;
  sizeThresholdMB: number;
  sizeRatioThreshold: number;
}

export interface GameRules {
  recognitionRules: GameRecognitionRule[];
  heuristicRules: HeuristicRulesConfig;
  blacklistPatterns: string[];
  maxScanDepth: number;
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

// Steam DB 类型
export interface SteamDbEntry {
  id?: number;
  steam_appid: string;
  name: string;
  name_en?: string;
  aliases: string[];
  notes?: string;
  source: 'manual' | 'imported' | 'auto' | 'scraper';
  created_at?: string;
  updated_at?: string;
}

export interface SteamDbListResponse {
  entries: SteamDbEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SteamDbImportResult {
  added: number;
  updated: number;
  skipped: number;
}