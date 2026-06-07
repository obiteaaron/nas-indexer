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
 */
export interface HeuristicRulesConfig {
  // 规则1：exe目录名匹配
  exeNameMatchEnabled: boolean;     // 是否启用exe名与目录名相同判断
  exeNameMatchOffset: number;       // 向上提升层级（默认1）

  // 规则2：标准子目录层级偏移
  subdirPatterns: Array<{           // 子目录模式列表
    patterns: string[];             // 目录名模式（如 Binaries, Win32）
    offset: number;                 // 层级偏移
    description: string;            // 说明
  }>;
  subdirRulesEnabled: boolean;      // 是否启用标准子目录规则

  // 规则3：目录大小启发
  sizeHeuristicEnabled: boolean;    // 是否启用目录大小判断
  sizeThresholdMB: number;          // 小目录阈值（MB），小于此值可能需向上
  sizeRatioThreshold: number;       // 父目录大小倍数阈值（父目录>子目录*此值）

  // Steam锚点规则（固定启用）
  // steam_appid.txt向上查找始终启用，无需配置
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
 */
export const DEFAULT_HEURISTIC_RULES: HeuristicRulesConfig = {
  // 规则1：exe目录名匹配
  exeNameMatchEnabled: true,
  exeNameMatchOffset: 1,              // Game/Game.exe → Game/

  // 规则2：标准子目录层级偏移
  subdirRulesEnabled: true,
  subdirPatterns: [
    {
      patterns: ['Binaries', 'Binary', 'Bin', 'Win32', 'Win64'],
      offset: 1,
      description: '可执行文件标准子目录'
    },
    {
      patterns: ['Redist', 'Support', 'Common'],
      offset: 1,
      description: ' redistributable/support目录'
    },
    {
      patterns: ['Data', 'Assets', 'Resources'],
      offset: 0,
      description: '数据/资源目录（通常就是根目录）'
    }
  ],

  // 规则3：目录大小启发
  sizeHeuristicEnabled: true,
  sizeThresholdMB: 100,               // 小于此值可能只是子目录
  sizeRatioThreshold: 5,              // 父目录需大于子目录5倍

  // Steam锚点：steam_appid.txt向上查找始终启用（无需配置）
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