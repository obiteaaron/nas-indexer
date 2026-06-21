# 非 Steam 游戏刮削方案设计

**日期**: 2026-06-22
**项目**: NAS Indexer
**状态**: 待用户审核

---

## 1. 需求背景

当前 NAS Indexer 只支持 Steam API 作为游戏元数据刮削源。对于以下类型的游戏无法自动刮削：

- GOG / Epic 等商业平台游戏
- 模拟器游戏（ROM）
- 破解版 / 重打包版游戏
- 独立游戏 / 小众游戏

需要扩展支持多数据源刮削。

---

## 2. 设计目标

1. **多数据源支持**: 接入 Steam、TheGamesDB、IGDB、Giant Bomb、本地 NFO 文件
2. **免注册优先**: 优先使用无需 API Key 的数据源
3. **单一数据源优先级**: 按预设顺序依次尝试，首个匹配成功即返回
4. **自动降级**: 匹配失败时无感降级，记录日志可追溯
5. **插件化架构**: 每个数据源独立插件，易于扩展和维护
6. **用户可配置**: 用户可启用/禁用数据源，配置 API Key

---

## 3. 数据源优先级

从高到低固定顺序：

| 顺序 | 数据源 | 认证要求 | 说明 |
|------|--------|----------|------|
| 1 | Steam | 无 | 已实现，数据质量最高 |
| 2 | TheGamesDB | 无 | 免费 API，无需注册 |
| 3 | 本地 NFO | 无 | 破解版自带，无需网络 |
| 4 | IGDB | 需注册 Twitch | 专业数据库，覆盖广 |
| 5 | Giant Bomb | 需 API Key | 游戏百科，数据丰富 |
| 6 | 手动输入 | 无 | 兜底方案 |

用户可在配置中启用/禁用某个数据源，但顺序固定。

---

## 4. 插件架构

### 4.1 核心接口

```typescript
interface ScraperPlugin {
  name: string;           // 插件标识: "steam", "tgdb", "nfo", "igdb", "giantbomb"
  displayName: string;    // 显示名称: "Steam", "TheGamesDB"
  priority: number;       // 内置优先级（固定，用户不可修改）
  requiresAuth: boolean;  // 是否需要 API Key
  enabled: boolean;       // 启用状态（用户可配置）

  // 核心方法
  search(query: string): Promise<ScrapeCandidate[]>;
  getDetails(id: string): Promise<GameMetadata>;
  downloadImages?(urls: ImageUrls): Promise<ImagePaths>;  // 可选，复用通用实现
  matchConfidence?(): number;  // 返回匹信度评分（可选）
}

interface ScrapeCandidate {
  id: string;             // 数据源内的唯一标识
  title: string;
  titleEn?: string;
  year?: string;
  thumbnail?: string;
  source: string;         // 数据源名称
}

interface GameMetadata {
  title?: string;
  titleEn?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;   // YYYY-MM-DD
  genres?: string[];      // JSON 数组
  rating?: number;
  description?: string;
  shortDescription?: string;
  languages?: string[];
  images?: ImageUrls;
  source: string;
  raw?: any;              // 原始 API 响应
}

interface ImageUrls {
  horizontal?: string;    // 横版海报 URL
  vertical?: string;      // 竖版海报 URL
  background?: string;    // 背景图 URL
  screenshots?: string[]; // 截图 URL 列表
}
```

### 4.2 目录结构

```
src/games/scraper-plugins/
├── base.ts              // 基类和接口定义
├── steam-plugin.ts      // Steam 插件（重构现有实现）
├── tgdb-plugin.ts       // TheGamesDB 插件
├── nfo-plugin.ts        // NFO 文件解析插件
├── igdb-plugin.ts       // IGDB 插件（后续实现）
├── giantbomb-plugin.ts  // Giant Bomb 插件（后续实现）
└── registry.ts          // 插件注册和管理

src/games/
├── scraper-manager.ts   // 刮削管理器（替代原 scraper.ts）
├── scraper.ts           // 保留，重构为调用 ScraperManager
```

### 4.3 插件注册机制

```typescript
// registry.ts
class ScraperRegistry {
  private plugins: Map<string, ScraperPlugin> = new Map();

  register(plugin: ScraperPlugin): void;
  get(name: string): ScraperPlugin | undefined;
  getEnabledPlugins(): ScraperPlugin[];  // 按 priority 排序
  getPluginStatus(): PluginStatus[];
}

// scraper-manager.ts
class ScraperManager {
  constructor(registry: ScraperRegistry, config: ScraperConfig);

  async scrape(gameId: number): Promise<ScrapeResult>;
  async scrapeWith(gameId: number, pluginName: string): Promise<ScrapeResult>;
  getScrapeLog(gameId: number): ScrapeLog;
}
```

### 4.4 刮削流程

```
用户触发刮削
    ↓
ScraperManager.scrape(gameId)
    ↓
获取游戏名称（title / original_name）
    ↓
遍历已启用的插件（按 priority 排序）
    ↓
插件.search(query) → 候选列表
    ↓
候选匹配 → 插件.getDetails(id) → 元数据
    ↓
匹配成功？
    ├── 是 → 保存元数据 + 下载图片 + 记录日志 → 返回结果
    └否 → 记录失败原因 → 继续下一个插件
    ↓
全部失败？
    ├── 是 → 标记为"未刮削" + 返回空结果
    └否 → （已在成功时返回）
```

---

## 5. 配置系统

### 5.1 配置文件结构

扩展 `games-config.default.json`:

```json
{
  "scrapers": {
    "priority": ["steam", "tgdb", "nfo", "igdb", "giantbomb"],
    "plugins": {
      "steam": {
        "enabled": true
      },
      "tgdb": {
        "enabled": true
      },
      "nfo": {
        "enabled": true
      },
      "igdb": {
        "enabled": true,
        "clientId": "",
        "clientSecret": ""
      },
      "giantbomb": {
        "enabled": false,
        "apiKey": ""
      }
    }
  }
}
```

### 5.2 配置加载优先级

API Key 字段按以下优先级加载：

1. **环境变量**（最高优先级，安全）
   - `IGDB_CLIENT_ID` → `scrapers.plugins.igdb.clientId`
   - `IGDB_CLIENT_SECRET` → `scrapers.plugins.igdb.clientSecret`
   - `GIANTBOMB_API_KEY` → `scrapers.plugins.giantbomb.apiKey`

2. **配置文件** `games-config.json`

3. **UI 设置页面** 可修改配置文件

### 5.3 配置加载实现

```typescript
function loadScraperConfig(): ScraperConfig {
  const fileConfig = loadConfigFile('games-config.json');
  const envOverrides = {
    igdb: {
      clientId: process.env.IGDB_CLIENT_ID,
      clientSecret: process.env.IGDB_CLIENT_SECRET,
    },
    giantbomb: {
      apiKey: process.env.GIANTBOMB_API_KEY,
    },
  };

  // 合并：环境变量覆盖配置文件
  return mergeConfig(fileConfig.scrapers, envOverrides);
}
```

---

## 6. 本地 NFO 文件解析

### 6.1 文件查找策略

从游戏目录向上查找 `*.nfo` 文件：

```typescript
function findNfoFile(gamePath: string, scanRoot: string): string | null {
  let currentDir = gamePath;
  let depth = 0;

  while (currentDir !== scanRoot && depth < 3) {
    const nfoFiles = fs.readdirSync(currentDir)
      .filter(f => f.endsWith('.nfo'));

    if (nfoFiles.length > 0) {
      // 优先选择: game.nfo, 与目录同名的 .nfo
      return selectBestNfo(nfoFiles, currentDir);
    }

    currentDir = path.dirname(currentDir);
    depth++;
  }

  return null;
}
```

### 6.2 NFO 格式解析

支持两种主流格式：

**格式一：键值对格式**
```
Title: 赛博朋克2077
Developer: CD Projekt Red
Publisher: CD Projekt
Release Date: 2020-12-10
Genre: RPG, Action
Rating: 90
Description: 在夜之城...
```

**格式二：XML 格式（xbmc/Kodi 标准）**
```xml
<game>
  <title>赛博朋克2077</title>
  <developer>CD Projekt Red</developer>
  <publisher>CD Projekt</publisher>
  <releasedate>2020-12-10</releasedate>
  <genre>RPG</genre>
  <genre>Action</genre>
  <rating>90</rating>
</game>
```

### 6.3 字段映射

| NFO 字段 | 数据库字段 | 转换说明 |
|----------|-----------|----------|
| Title / title | title | 直接映射 |
| Developer | developer | 直接映射 |
| Publisher | publisher | 直接映射 |
| Release Date / releasedate | release_date | 格式化为 YYYY-MM-DD |
| Genre / genre | genres | 分割逗号，转为 JSON 数组 |
| Rating / rating | rating | 数值类型 |
| Description | description | 直接映射 |

### 6.4 图片处理

同目录查找海报图：

```typescript
function findLocalPoster(nfoDir: string): ImagePaths {
  const candidates = ['poster.jpg', 'cover.jpg', 'banner.jpg', 'folder.jpg'];
  const images: ImagePaths = {};

  for (const name of candidates) {
    const fullPath = path.join(nfoDir, name);
    if (fs.existsSync(fullPath)) {
      // 复制到 posters/{gameId}/ 目录
      images.horizontal = copyToPosterDir(fullPath, gameId, 'horizontal');
    }
  }

  return images;
}
```

---

## 7. API 接口

### 7.1 新增端点（不修改现有 API）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/games/scrapers/list` | 获取可用刮削器列表及状态 |
| PATCH | `/api/games/scrapers/config` | 更新刮削器配置 |
| POST | `/api/games/:id/scrape-with` | 指定刮削器重新刮削 |
| GET | `/api/games/:id/scrape-log` | 获取刮削日志 |

### 7.2 响应结构

**GET `/api/games/scrapers/list`**
```typescript
interface ScraperListResponse {
  scrapers: [
    {
      name: "steam";
      displayName: "Steam";
      enabled: true;
      requiresAuth: false;
      hasAuthConfig: true;  // 是否已配置认证信息
    },
    {
      name: "tgdb";
      displayName: "TheGamesDB";
      enabled: true;
      requiresAuth: false;
      hasAuthConfig: true;
    },
    {
      name: "igdb";
      displayName: "IGDB";
      enabled: true;
      requiresAuth: true;
      hasAuthConfig: false;  // 未配置 API Key
    },
    // ...
  ];
}
```

**GET `/api/games/:id/scrape-log`**
```typescript
interface ScrapeLog {
  gameId: number;
  gameName: string;
  attempts: [
    {
      scraper: "steam";
      status: "failed";
      reason: "No match found";
      time: "2024-01-01T10:00:00Z";
    },
    {
      scraper: "tgdb";
      status: "success";
      reason: "";
      time: "2024-01-01T10:01:00Z";
    }
  ];
  finalSource: "tgdb";
  scrapedAt: string;
}
```

### 7.3 现有 API 兼容性

保持现有 API 不变：

- `POST /api/games/:id/scrape` — 内部调用 ScraperManager，行为不变
- `POST /api/games/scrape/batch` — 批量刮削逻辑不变
- `GET /api/games/steam/search` — 保留，Steam 搜索功能不变
- `POST /api/games/:id/bind-steam` — 保留，手动绑定 Steam 功能不变

---

## 8. 前端交互

### 8.1 游戏设置页面新增

**「刮削器配置」区域**：

- 列表显示所有刮削器状态
- 启用/禁用开关按钮
- 未配置 API Key 的刮削器显示警告图标
- 点击「配置」弹出 API Key 输入对话框

**API Key 配置对话框**：

- 输入框：Client ID / Client Secret / API Key（按刮削器类型）
- 提示链接：「从 Twitch Developer 获取」、「从 Giant Bomb 获取」
- 保存按钮 → 调用 `PATCH /api/games/scrapers/config`

### 8.2 游戏详情页新增

**元数据来源显示**：

- 在元数据区域显示：「元数据来源：TheGamesDB」
- 点击可展开刮削日志弹窗
- 日志弹窗显示尝试过程：哪些刮削器、失败原因、最终成功

### 8.3 不修改现有布局

- 海报墙、筛选、分组等功能保持不变
- 新增内容只在「设置」和「详情」页面补充

---

## 9. 实现计划

### 第一阶段：架构搭建

1. 创建插件接口和基类 (`base.ts`)
2. 创建插件注册中心 (`registry.ts`)
3. 创建刮削管理器 (`scraper-manager.ts`)
4. 扩展配置文件结构
5. 新增 API 端点（基础框架）

### 第二阶段：Steam 插件重构

1. 将现有 `scraper.ts` 重构为 `steam-plugin.ts`
2. 保持 Steam 功能不变，符合插件接口
3. 测试现有刮削流程兼容性

### 第三阶段：TheGamesDB 插件

1. 研究 TheGamesDB API（免费，无需认证）
2. 实现 `tgdb-plugin.ts`
3. 测试匹配和降级逻辑

### 第四阶段：NFO 插件

1. 实现 NFO 文件查找逻辑
2. 实现键值对和 XML 格式解析
3. 实现本地图片复制逻辑
4. 测试 `nfo-plugin.ts`

### 第五阶段：前端集成

1. 游戏设置页面新增刮削器配置区域
2. 游戏详情页显示元数据来源和日志
3. API Key 配置对话框

### 第六阶段：IGDB 和 Giant Bomb（后续）

1. 研究 IGDB API（需 Twitch 注册）
2. 实现 `igdb-plugin.ts`
3. 研究 Giant Bomb API
4. 实现 `giantbomb-plugin.ts`

---

## 10. 技术要点

### 10.1 代理支持

现有代理配置 (`config.proxyUrl`) 应继续对所有网络请求生效：

```typescript
// 插件基类提供统一请求方法
class BaseScraperPlugin {
  protected async fetch(url: string): Promise<Response> {
    const proxy = config.proxyUrl;
    if (proxy) {
      // 使用代理请求
    }
    return fetch(url);
  }
}
```

### 10.2 错误处理

- 网络超时：记录日志，继续下一个插件
- API 错误：记录日志，继续下一个插件
- 认证失败：标记该插件为"不可用"，提示用户检查配置

### 10.3 日志存储

刮削日志存储在数据库：

```sql
CREATE TABLE scrape_logs (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  scraper TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'success' / 'failed'
  reason TEXT,
  time TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);
```

---

## 11. 风险和注意事项

1. **API 限流**: TheGamesDB、IGDB 都有请求频率限制，需实现请求队列或缓存
2. **名称匹配准确性**: 不同数据源的命名规范不同，需要智能匹配算法
3. **NFO 文件质量**: 破解版 NFO 文件质量参差不齐，可能需要人工校验
4. **向后兼容**: 重构过程中必须保持现有 Steam 刮削功能不变

---

## 12. 待确认事项

- [ ] IGDB API 注册流程文档链接
- [ ] Giant Bomb API Key 申请流程文档链接
- [ ] 名称匹配算法的具体策略（相似度阈值）