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

  created_at?: string;
  updated_at?: string;

  // 前端计算字段
  posterLocal?: string;
  genresArray?: string[];
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
  gamesRules: GameRules;
  gamesScrape: GameScrapeConfig;
}

export interface GameQueryOptions {
  genre?: string;
  year?: string;
  search?: string;
  scraped?: string;
  orderBy?: 'title' | 'rating' | 'release_date' | 'scraped_at';
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface GameStatistics {
  totalGames: number;
  scrapedGames: number;
  unscrapedGames: number;
  byYear: { year: string; count: number }[];
  byGenre: { genre: string; count: number }[];
}

export const DEFAULT_GAME_RULES: GameRules = {
  pathPrefixes: [],
  pathKeywords: ['steamapps', 'steam_library', 'steamlibrary', 'games', 'game'],
  fileIndicators: ['.exe', 'steam_api.dll', 'steam_api64.dll', 'steam_appid.txt'],
  excludePatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
  folderPatterns: ['\\[GOG\\]', '\\[Steam\\]'],
  metadataFile: 'game.json'
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