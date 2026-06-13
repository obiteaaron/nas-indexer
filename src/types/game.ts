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
  is_root_manually_marked: number;  // P0手动优先级标记

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
 * 启发式规则配置
 * @deprecated v1.5.5 删除 P3 规则，此类型保留以兼容配置文件，但字段不再生效
 */
export interface HeuristicRulesConfig {
  // 规则1：exe目录名匹配（已废弃）
  exeNameMatchEnabled?: boolean;     // 已废弃，不再生效
  exeNameMatchOffset?: number;       // 已废弃

  // 规则2：标准子目录层级偏移（已废弃）
  subdirPatterns?: Array<{           // 已废弃
    patterns: string[];
    offset: number;
    description: string;
  }>;
  subdirRulesEnabled?: boolean;      // 已废弃

  // 规则3：目录大小启发（已废弃）
  sizeHeuristicEnabled?: boolean;    // 已废弃
  sizeThresholdMB?: number;          // 已废弃
  sizeRatioThreshold?: number;       // 已废弃
}

/**
 * 游戏识别配置
 */
export interface GameRules {
  recognitionRules: GameRecognitionRule[];  // 正则规则列表
  heuristicRules: HeuristicRulesConfig;     // 启发式规则配置
  blacklistPatterns: string[];              // 黑名单：匹配的路径跳过识别
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
 * 游戏分组
 */
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

/**
 * 默认启发式规则配置
 * @deprecated v1.5.5 规则已删除，保留空对象以兼容配置
 */
export const DEFAULT_HEURISTIC_RULES: HeuristicRulesConfig = {
  // 所有规则已删除，配置不再生效
};

export const DEFAULT_GAME_RULES: GameRules = {
  recognitionRules: DEFAULT_RECOGNITION_RULES,
  heuristicRules: DEFAULT_HEURISTIC_RULES,
  blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
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

/**
 * Steam 数据库条目
 * 用于存储 Steam AppID 与游戏名称的映射关系，提升刮削成功率
 */
export interface SteamDbEntry {
  id?: number;               // ID 可选（导入导出时不需要）
  steam_appid: string;        // Steam AppID（唯一）
  name: string;               // 中文名称
  name_en?: string;           // 英文名称
  aliases: string[];          // 别名数组（JSON）
  notes?: string;             // 备注
  source: 'manual' | 'imported' | 'auto' | 'scraper';  // 来源
  created_at?: string;
  updated_at?: string;
}

/**
 * Steam 数据库导入结果
 */
export interface SteamDbImportResult {
  added: number;
  updated: number;
  skipped: number;
}