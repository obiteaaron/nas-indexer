/**
 * 游戏模块类型定义
 */

export interface Game {
  id: number;
  source_path: string;

  // 基本信息
  title: string;
  title_en?: string;
  original_name?: string;

  // Steam 信息
  steam_appid?: string;

  // 海报相关
  poster_url?: string;
  cover_url?: string;
  poster_horizontal_path?: string;
  poster_vertical_path?: string;
  poster_banner_path?: string;
  background_path?: string;
  has_local_poster: number;

  // 元数据
  developer?: string;
  publisher?: string;
  release_date?: string;
  genres?: string; // JSON 数组
  rating?: number;
  description?: string;
  short_description?: string;
  languages?: string; // JSON 数组
  tags?: string; // JSON 数组
  notes?: string;
  screenshots?: string; // JSON 数组

  // 状态
  metadata_source: string;
  metadata_path?: string;
  scraped_at?: string;
  is_manually_edited: number;
  is_excluded: number;
  is_favorite: number;

  created_at?: string;
  updated_at?: string;

  // 前端计算字段
  posterLocal?: string;
  genresArray?: string[];
}

/**
 * 游戏识别规则（正则表达式）
 */
export interface GameRecognitionRule {
  pattern: string;      // 正则表达式，匹配目录名
  levelOffset: number;  // 层级偏移：0=匹配目录本身，1=父目录，2=祖父目录
  enabled: boolean;     // 启用开关
  description?: string; // 规则说明（前端显示）
}

/**
 * 游戏识别配置
 */
export interface GameRules {
  recognitionRules: GameRecognitionRule[];  // 正则规则列表
  blacklistPatterns: string[];              // 黑名单：匹配的路径跳过识别
  metadataFile: string;                     // 本地元数据文件名
  maxScanDepth: number;                     // 递归深度限制
}

export interface GameScrapeConfig {
  autoScrape: boolean;
  downloadPosters: boolean;
  scrapeOnIdentify: boolean;
}

export interface GameConfig {
  gamesEnabled: boolean;
  gamesRules: GameRules;
  gamesScrape: GameScrapeConfig;
}

export interface GameQueryOptions {
  genre?: string;
  year?: string;
  search?: string;
  scraped?: string;
  excluded?: 'true' | 'false' | 'only';
  favorite?: 'true' | 'false' | undefined;
  orderBy?: 'title' | 'rating' | 'release_date' | 'scraped_at';
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
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

/**
 * 默认识别规则
 */
export const DEFAULT_RECOGNITION_RULES: GameRecognitionRule[] = [
  { pattern: '\\[GOG\\]$',           levelOffset: 0, enabled: true, description: 'GOG 版游戏（目录名结尾）' },
  { pattern: '\\[Steam\\]$',         levelOffset: 0, enabled: true, description: 'Steam 版游戏（目录名结尾）' },
  { pattern: '\\[CRACK\\]$',         levelOffset: 0, enabled: true, description: '破解版游戏（目录名结尾）' },
  { pattern: 'FitGirl.*Repack$',     levelOffset: 1, enabled: true, description: 'FitGirl 压缩包 → 父目录' },
  { pattern: '/steamapps/',          levelOffset: 0, enabled: true, description: 'Steam 游戏库目录' },
  { pattern: '/games/',              levelOffset: 0, enabled: true, description: '通用游戏目录名' },
];

export const DEFAULT_GAME_RULES: GameRules = {
  recognitionRules: DEFAULT_RECOGNITION_RULES,
  blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
  metadataFile: 'game.json',
  maxScanDepth: 3
};

export const DEFAULT_GAME_SCRAPE: GameScrapeConfig = {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  gamesEnabled: false,
  gamesRules: DEFAULT_GAME_RULES,
  gamesScrape: DEFAULT_GAME_SCRAPE
};