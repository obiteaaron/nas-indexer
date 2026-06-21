/**
 * 刮削器插件类型定义
 */

/**
 * 刮削候选结果
 */
export interface ScrapeCandidate {
  id: string;             // 数据源内的唯一标识
  title: string;
  titleEn?: string;
  year?: string;
  thumbnail?: string;
  source: string;         // 数据源名称
}

/**
 * 图片 URL 集合
 */
export interface ScraperImageUrls {
  horizontal?: string;    // 横版海报 URL
  vertical?: string;      // 竖版海报 URL
  background?: string;    // 背景图 URL
  screenshots?: string[]; // 截图 URL 列表
}

/**
 * 图片本地路径集合
 */
export interface ScraperImagePaths {
  horizontal?: string;
  vertical?: string;
  background?: string;
  screenshots?: string[];
}

/**
 * 刮削得到的游戏元数据
 */
export interface ScraperMetadata {
  title?: string;
  titleEn?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;   // YYYY-MM-DD
  genres?: string[];
  rating?: number;
  description?: string;
  shortDescription?: string;
  languages?: string[];
  images?: ScraperImageUrls;
  source: string;         // 数据源标识
  raw?: any;              // 原始 API 响应
}

/**
 * 刮削器插件接口
 */
export interface ScraperPlugin {
  name: string;           // 插件标识: "steam", "tgdb", "nfo"
  displayName: string;    // 显示名称: "Steam", "TheGamesDB"
  priority: number;       // 内置优先级（固定顺序）
  requiresAuth: boolean;  // 是否需要 API Key
  enabled: boolean;       // 启用状态

  // 核心方法
  search(query: string): Promise<ScrapeCandidate[]>;
  getDetails(id: string): Promise<ScraperMetadata | null>;
  downloadImages?(urls: ScraperImageUrls, gameId: number): Promise<ScraperImagePaths>;

  // 可选方法
  matchConfidence?(result: ScrapeCandidate, query: string): number;
}

/**
 * 刮削器配置
 */
export interface ScraperPluginConfig {
  enabled: boolean;
  clientId?: string;      // IGDB Client ID
  clientSecret?: string;  // IGDB Client Secret
  apiKey?: string;        // Giant Bomb API Key
}

/**
 * 刮削器系统配置
 */
export interface ScrapersConfig {
  priority: string[];     // 优先级顺序数组
  plugins: Record<string, ScraperPluginConfig>;
}

/**
 * 默认刮削器配置
 */
export const DEFAULT_SCRAPERS_CONFIG: ScrapersConfig = {
  priority: ['steam', 'tgdb', 'nfo', 'igdb', 'giantbomb'],
  plugins: {
    steam: { enabled: true },
    tgdb: { enabled: true },
    nfo: { enabled: true },
    igdb: { enabled: true, clientId: '', clientSecret: '' },
    giantbomb: { enabled: false, apiKey: '' }
  }
};

/**
 * 刮削器状态
 */
export interface ScraperStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  requiresAuth: boolean;
  hasAuthConfig: boolean;  // 是否已配置认证信息
}

/**
 * 刮削日志条目
 */
export interface ScrapeLogEntry {
  scraper: string;
  status: 'success' | 'failed';
  reason: string;
  time: string;           // ISO timestamp
}

/**
 * 刮削日志
 */
export interface ScrapeLog {
  gameId: number;
  gameName: string;
  attempts: ScrapeLogEntry[];
  finalSource?: string;
  scrapedAt?: string;
}

/**
 * 刮削结果
 */
export interface ScrapeResult {
  success: boolean;
  metadata?: ScraperMetadata;
  source?: string;
  log: ScrapeLogEntry[];
}