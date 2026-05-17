# NAS Indexer 游戏模块技术方案

> 版本：v1.4.0
> 日期：2026-05-17
> 状态：待实施

---

## 一、设计目标

为 nas-indexer 添加游戏海报墙功能，以 **files 为底座，games 为扩展** 的方式实现：

- 复用现有扫描引擎、文件管理、标签系统等基础设施
- 新增游戏识别、Steam 刮削、海报墙视图等特有功能
- 游戏与文件两种视图可切换，同一游戏目录在两种视角下展示不同信息

---

## 二、核心概念定义

### 游戏 = 目录

| 形态 | 说明 | 是否纳入 games 表 |
|------|------|-------------------|
| 已安装游戏目录 | `E:/Games/The Witcher 3/` | ✓ 游戏本身 |
| 便携版目录 | `E:/Portable/GameName/` | ✓ 游戏本身 |
| Steam 目录 | `D:/SteamLibrary/steamapps/common/xxx/` | ✓ 游戏本身 |
| 光盘镜像 (ISO) | `Game.iso` | ✗ 安装包，归 files 管理 |
| 压缩包 (ZIP) | `Game.zip` | ✗ 安装包，归 files 管理 |

**结论：games 表管理的是可运行的游戏（目录形式），ISO/压缩包属于"安装包"，在 files 视角中管理。**

---

## 三、架构设计

### 3.1 层级关系

```
┌─────────────────────────────────────────────────┐
│                    files 底座                    │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  扫描引擎    │  │  文件管理   │  │  标签系统 │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│  ┌─────────────┐  ┌─────────────┐               │
│  │  数据库基础  │  │  API 基础   │               │
│  └─────────────┘  └─────────────┘               │
└─────────────────────────────────────────────────┘
                         ▲
                         │ 扩展
                         │
┌─────────────────────────────────────────────────┐
│                   games 扩展层                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  游戏识别    │  │ Steam刮削   │  │  海报墙  │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│  ┌─────────────┐                                │
│  │  游戏元数据  │                                │
│  └─────────────┘                                │
└─────────────────────────────────────────────────┘
```

### 3.2 数据关系

```
files 表 ─────► 记录文件（原有，不变）
                   │
                   │ 软关联：path LIKE '游戏目录/%'
                   │
games 表 ─────► 记录游戏目录（新增，独立）
```

**说明：**
- `games.source_path` = 游戏目录路径（如 `E:/Games/The Witcher 3/`）
- 查看游戏目录下的文件：`SELECT * FROM files WHERE path LIKE 'E:/Games/The Witcher 3/%'`
- games 表**不强关联** files 表，两套数据独立存在

---

## 四、数据库设计

### 4.1 files 表（不变）

```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  ext TEXT,
  size INTEGER,
  category TEXT,          -- 可新增 '游戏文件' 分类
  modified_at DATETIME,
  scanned_at DATETIME,
  is_favorite INTEGER DEFAULT 0,
  scan_path TEXT
);
```

### 4.2 games 表（新增）

```sql
CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,  -- 游戏目录路径
  
  -- 基本信息
  title TEXT NOT NULL,
  title_en TEXT,
  original_name TEXT,                 -- 原始文件夹名
  
  -- Steam 信息
  steam_appid TEXT,
  
  -- 海报相关
  poster_url TEXT,                    -- 远程海报 URL（Steam）
  cover_url TEXT,                     -- 远程封面 URL
  poster_horizontal_path TEXT,        -- 本地横版海报路径
  poster_vertical_path TEXT,          -- 本地竖版海报路径
  poster_banner_path TEXT,            -- 本地横幅海报路径
  background_path TEXT,               -- 背景图路径
  has_local_poster INTEGER DEFAULT 0,
  
  -- 元数据
  developer TEXT,
  publisher TEXT,
  release_date TEXT,
  genres TEXT,                        -- JSON 数组
  rating REAL,
  description TEXT,
  short_description TEXT,
  languages TEXT,                     -- JSON 数组
  tags TEXT,                          -- JSON 数组
  notes TEXT,                         -- 用户备注
  screenshots TEXT,                   -- JSON 数组
  
  -- 状态
  metadata_source TEXT DEFAULT 'remote',
  metadata_path TEXT,                 -- 本地 game.json 路径
  scraped_at DATETIME,
  is_manually_edited INTEGER DEFAULT 0,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
```

---

## 五、配置设计

### 5.1 全局开关

游戏模块默认关闭，用户可在设置中开启：

```javascript
// config.json 中的游戏配置
{
  // 全局开关（默认关闭）
  gamesEnabled: false,
  
  // 游戏识别规则（开启后生效）
  gamesRules: {
    // 路径前缀匹配（优先级最高）
    pathPrefixes: [
      'E:/Games/',
      'D:/SteamLibrary/steamapps/common/'
    ],
    
    // 文件特征（目录下存在这些文件则识别为游戏）
    fileIndicators: [
      '.exe',
      'steam_api.dll',
      'steam_api64.dll',
      'game.json'
    ],
    
    // 排除规则
    excludePatterns: [
      '$Recycle.Bin',
      'System Volume Information',
      '.git',
      'node_modules'
    ]
  },
  
  // 刮削配置
  gamesScrape: {
    autoScrape: true,           // 扫描后自动刮削
    downloadPosters: true,      // 下载海报到本地
    scrapeOnIdentify: true      // 识别新游戏时自动刮削
  }
}
```

### 5.2 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `gamesEnabled` | boolean | `false` | 游戏模块全局开关，关闭时不识别游戏、不显示游戏导航 |
| `gamesRules.pathPrefixes` | string[] | `[]` | 路径前缀，匹配的目录直接识别为游戏 |
| `gamesRules.fileIndicators` | string[] | 默认列表 | 文件特征，目录下存在这些文件则识别为游戏 |
| `gamesRules.excludePatterns` | string[] | 默认列表 | 排除规则，不识别这些目录 |
| `gamesScrape.autoScrape` | boolean | `true` | 扫描完成后自动刮削未刮削游戏 |
| `gamesScrape.downloadPosters` | boolean | `true` | 下载海报图片到游戏目录 |
| `gamesScrape.scrapeOnIdentify` | boolean | `true` | 新识别游戏时自动刮削 |

### 5.3 API 设计

| 接口 | 说明 |
|------|------|
| `GET /api/config/games` | 获取游戏模块配置 |
| `PUT /api/config/games` | 更新游戏模块配置 |

---

## 六、游戏识别流程

### 6.1 流程图

```
scanner.scanFiles() 
    │
    ├─► files 表：记录所有文件
    │
    └─► games.identifier.identify(scanRoot)  
            │
            │  遍历扫描目录的子目录
            │  匹配规则（path_prefix / 文件特征）
            │
            ▼
        games 表：新增游戏目录记录
            │
            ▼
        可选：自动刮削元数据
```

### 6.2 识别规则

**识别优先级：**

1. **game.json 存在（最高优先级）** → 直接读取元数据，无需刮削
2. **路径前缀匹配** → 根据配置的游戏目录路径识别
3. **文件特征匹配** → 目录下有 exe/steam_api.dll 等特征文件

```javascript
const DEFAULT_RULES = {
  // 优先级1：game.json 检测（最高优先级）
  // 目录下存在 game.json 则直接识别为游戏，并读取已有元数据
  metadataFile: 'game.json',
  
  // 优先级2：路径前缀匹配
  pathPrefixes: [
    'E:/Games/',
    'D:/SteamLibrary/steamapps/common/',
    'G:/游戏/'
  ],
  
  // 优先级3：文件特征（目录下存在这些文件则识别为游戏）
  fileIndicators: [
    '.exe',                // 有 exe 文件
    'steam_api.dll',       // Steam 游戏
    'steam_api64.dll',
    'steam_appid.txt',
  ],
  
  // 目录名特征（辅助判断，正则匹配）
  folderPatterns: [
    /\[GOG\]/i,
    /\[Steam\]/i,
  ],
  
  // 排除规则
  excludePatterns: [
    '$Recycle.Bin',
    'System Volume Information',
    '.git',
    'node_modules'
  ]
};
```

**game.json 快速识别的意义：**

| 场景 | 说明 |
|------|------|
| 目录移动后重新扫描 | 已刮削的游戏移动到新位置，系统自动识别并加载已有元数据 |
| 用户手动配置 | 用户在目录下创建 game.json，系统自动识别为游戏 |
| 跨路径迁移 | 游戏从一个路径移动到另一个路径，无需重新刮削 |

### 6.3 识别逻辑伪代码

```javascript
async function identifyGames(scanRoot, rules) {
  const games = [];
  
  // 遍历扫描根目录的子目录
  const subDirs = await getSubDirectories(scanRoot);
  
  for (const dir of subDirs) {
    // 排除规则检查
    if (rules.excludePatterns.some(p => dir.includes(p))) {
      continue;
    }
    
    // 优先级1：game.json 存在 → 直接读取元数据
    const gameJsonPath = path.join(dir, rules.metadataFile);
    if (fs.existsSync(gameJsonPath)) {
      const metadata = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
      games.push({
        source_path: dir,
        title: metadata.title || path.basename(dir),
        steam_appid: metadata.steam_appid,
        ...metadata,
        metadata_source: 'local',
        metadata_path: gameJsonPath
      });
      continue;
    }
    
    // 优先级2：路径前缀匹配
    if (rules.pathPrefixes.some(prefix => dir.startsWith(prefix))) {
      games.push({
        source_path: dir,
        title: path.basename(dir),
        metadata_source: 'unknown'
      });
      continue;
    }
    
    // 优先级3：文件特征匹配
    const files = await getFilesInDirectory(dir);
    if (rules.fileIndicators.some(indicator => 
      files.some(f => f.endsWith(indicator))
    )) {
      games.push({
        source_path: dir,
        title: path.basename(dir),
        metadata_source: 'unknown'
      });
      continue;
    }
  }
  
  return games;
}
```

---

## 七、Steam 刮削流程

### 7.1 刮削来源

| 来源 | API | 数据 |
|------|-----|------|
| Steam Store | `https://store.steampowered.com/api/appdetails?appids={appid}` | 海报、元数据 |
| SteamGridDB | `https://www.steamgriddb.com/api/v2/grids/steam/{appid}` | 多种海报尺寸 |

### 7.2 刮削逻辑

```
1. 清理文件夹名 → 得到搜索关键词
2. Steam 搜索 → 匹配最接近的游戏 → 获取 appid
3. 获取详情 → 提取元数据（标题、开发商、发行日期、类型等）
4. 下载海报 → 保存到游戏源目录
5. 写入 game.json → 保存元数据到游戏源目录
6. 更新 games 表 → 记录本地文件路径
```

### 7.3 存储位置

**刮削结果存储在游戏源目录中**（方案 A），实现便携性：

```
E:/Games/The Witcher 3/
├── The Witcher 3.exe          # 游戏主程序
├── content/
├── ...
├── game.json                  # 游戏元数据（刮削或手动编辑）
├── poster-horizontal.jpg      # 横版海报（460x215）
├── poster-vertical.jpg        # 竖版封面（600x900）
├── poster-banner.jpg          # 横幅海报（可选）
└── background.jpg             # 背景图（可选）
```

**文件命名规范：**

| 文件 | 命名 | 说明 |
|------|------|------|
| 元数据 | `game.json` | JSON 格式，包含所有元数据字段 |
| 横版海报 | `poster-horizontal.jpg` | Steam 主海报，460x215 比例 |
| 竖版封面 | `poster-vertical.jpg` | Steam 封面，600x900 比例 |
| 横幅海报 | `poster-banner.jpg` | 自定义横幅，800x200 比例 |
| 背景图 | `background.jpg` | 游戏背景图，1920x1080 比例 |

**优点：**
- 游戏目录整体移动时，元数据和海报一起带走
- 用户可手动编辑 `game.json` 或上传海报
- 删除游戏目录时，元数据自然清理，无残留

**game.json 示例：**

```json
{
  "title": "The Witcher 3: Wild Hunt",
  "title_en": "The Witcher 3: Wild Hunt",
  "developer": "CD Projekt RED",
  "publisher": "CD Projekt",
  "release_date": "2015-05-19",
  "genres": ["RPG", "Action", "Open World"],
  "rating": 9.5,
  "description": "《巫师3：狂猎》是一款...",
  "steam_appid": "292030",
  "languages": ["English", "中文", "Polish"],
  "metadata_source": "steam",
  "scraped_at": "2026-05-17T22:30:00"
}
```

### 7.4 游戏名清理规则

```javascript
// 去除常见干扰词
const CLEAN_RULES = {
  remove: [
    /\[.*?\]/g,          // [GOG], [Steam], [CRACK] 等
    /\(.*?\)/g,          // (v1.0), (中文版) 等
    /\.v\d+.*$/i,        // .v1.0.0 版本号
    /-\d+$/,             // -12345 尾部数字
    /_steam$/i,
    /_gog$/i,
  ],
  trim: true
};
```

---

## 八、API 设计

### 8.1 游戏 API（新增）

| 接口 | 说明 |
|------|------|
| `GET /api/games` | 游戏列表（分页、筛选：genre/year/search） |
| `GET /api/games/:id` | 游戏详情（含目录下文件列表） |
| `PUT /api/games/:id` | 更新游戏元数据 |
| `DELETE /api/games/:id` | 删除游戏 |
| `POST /api/games/:id/scrape` | 刮削单个游戏 |
| `POST /api/games/scrape/batch` | 批量刮削未刮削游戏 |
| `POST /api/games/:id/poster/:type` | 上传海报（type: horizontal/vertical/banner/background） |
| `GET /api/games/:id/poster/:type` | 获取海报 |
| `GET /api/games/:id/files` | 游戏目录下的文件列表 |
| `POST /api/games/:id/open` | 打开游戏目录 |
| `GET /api/games/statistics` | 游戏统计（总数、已刮削、按年份/类型分布） |
| `GET /api/games/genres` | 类型列表 |
| `GET /api/games/years` | 年份列表 |

### 8.2 配置 API

| 接口 | 说明 |
|------|------|
| `GET /api/games/rules` | 获取识别规则 |
| `PUT /api/games/rules` | 更新识别规则 |

---

## 九、后端改造范围

### 9.1 目录结构

```
src/
├── server.js              # 主入口（新增 games 路由注册）
├── database.js            # 主数据库（新增 games/game_rules 表）
├── scanner.js             # 扫描引擎（扩展：完成后触发游戏识别）
├── routes/
│   ├── files.js           # 文件API（不变）
│   ├── games.js           # 游戏API（新增）
│   ├── scan.js            # 扫描API（扩展）
│   └── ...                # 其他路由（不变）
├── games/                 # 游戏扩展模块
│   ├── identifier.js      # 游戏识别逻辑
│   ├── scraper.js         # Steam 刮削
│   ├── name-cleaner.js    # 游戏名清理
│   └── database.js        # 游戏数据库操作（注入主db）
└── ...
```

### 9.2 改造清单

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | database.js | 新增 games 表 |
| 2 | utils.js | 配置新增 gamesEnabled/gamesRules/gamesScrape |
| 3 | games/identifier.js | 创建游戏识别逻辑 |
| 4 | games/scraper.js | 创建 Steam 刮削（可移植 game-indexer 的实现） |
| 5 | games/name-cleaner.js | 创建游戏名清理 |
| 6 | games/metadata-manager.js | 创建元数据管理（读写 game.json） |
| 7 | games/database.js | 创建游戏数据库操作类 |
| 8 | routes/games.js | 创建游戏 API 路由 |
| 9 | scanner.js | 扫描完成后调用 identifier.identify() |
| 10 | routes/scan.js | 扫描 API 返回增加游戏识别状态 |
| 11 | server.js | 注册 games 路由 |
| 6 | routes/games.js | 创建游戏 API 路由 |
| 7 | scanner.js | 扫描完成后调用 identifier.identify() |
| 8 | routes/scan.js | 扫描 API 返回增加游戏识别状态 |
| 9 | server.js | 注册 games 路由 |

---

## 十、前端改造范围

### 10.1 目录结构

```
frontend/src/
├── router/index.js        # 新增 /games 路由
├── views/
│   ├── GameWallView.vue   # 海报墙主页（新增）
│   ├── GameDetailView.vue # 游戏详情弹窗（新增）
│   ├── GameSettings.vue   # 游戏设置页（可选）
│   └── ...                # 其他视图（不变）
├── components/
│   ├── GameCard.vue       # 游戏卡片组件（新增）
│   ├── GameModal.vue      # 游戏详情弹窗（新增）
│   ├── PosterUpload.vue   # 海报上传组件（新增）
│   ├── PosterTabs.vue     # 海报类型切换（新增）
│   ├── GameFilterBar.vue  # 游戏筛选栏（新增）
│   ├── ProgressPanel.vue  # 进度面板（新增）
│   └── ...                # 其他组件（不变）
├── api/
│   ├── index.js           # 新增 games 相关方法
│   └── games.js           # 游戏 API 封装（新增）
└── App.vue                # 导航新增"游戏海报墙"
```

### 10.2 改造清单

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1 | router/index.js | 新增 /games 路由 |
| 2 | api/games.js | 创建游戏 API 封装 |
| 3 | api/index.js | 导出 games API |
| 4 | components/GameCard.vue | 创建游戏卡片 |
| 5 | components/GameModal.vue | 创建详情弹窗 |
| 6 | components/PosterUpload.vue | 创建海报上传 |
| 7 | components/GameFilterBar.vue | 创建筛选栏 |
| 8 | components/ProgressPanel.vue | 创建进度面板 |
| 9 | views/GameWallView.vue | 创建海报墙主页 |
| 10 | views/GameDetailView.vue | 创建详情页（或复用 Modal） |
| 11 | App.vue | 导航新增"游戏海报墙" |

---

## 十一、复用关系总结

| files 底座功能 | games 扩展复用方式 |
|----------------|-------------------|
| 扫描引擎 | 扫描完成后，触发游戏目录识别 |
| files 表 | 查询游戏目录下的文件：`path LIKE '游戏目录/%'` |
| 文件管理 | 游戏详情页展示目录内文件列表，可打开目录 |
| 标签系统 | 可给游戏打标签（games 表新增 tags 字段） |
| 追踪系统 | 可追踪游戏访问（games 表新增 view_count） |
| SSE 推送 | 扫描/刮削进度推送 |

---

## 十二、实施计划

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| 阶段一 | 数据库改造 + 游戏识别 | 1 天 |
| 阶段二 | Steam 刮削 + 后端 API | 1 天 |
| 阶段三 | 前端海报墙视图 | 1 天 |
| 阶段四 | 测试 + 优化 | 0.5 天 |

---

## 十三、版本规划

| 版本 | 功能 |
|------|------|
| v1.4.0 | 游戏识别 + 海报墙基础功能 |
| v1.4.1 | Steam 刮削优化 + 批量刮削 |
| v1.4.2 | 本地元数据支持（game.json） |
| v1.5.0 | 多刮削源支持（IGDB、开源数据库） |

---

## 十四、参考资料

- Steam API：https://developer.valvesoftware.com/wiki/Steam_Web_API
- SteamGridDB API：https://www.steamgriddb.com/api
- game-indexer 原有实现：刮削逻辑可复用