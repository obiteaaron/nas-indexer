# Steam 本地缓存完整方案设计

> 设计日期: 2026-06-15
> 状态: 待实现

## 一、背景与目标

### 当前问题

1. **重复刮削**：多个游戏目录对应同一 Steam AppID 时，每个都单独调用 Steam API
2. **缓存不完整**：`steam_db` 表只存 AppID + 名称映射，不存完整元数据
3. **图片无缓存**：海报、截图每次都重新下载
4. **配置耦合**：游戏配置混在全局 config.json 中

### 目标

1. **完整本地缓存**：所有刮削结果（元数据 + 海报 + 截图）持久化存储
2. **多游戏共享**：同一 AppID 的多个游戏目录复用同一缓存
3. **永不过远程**：本地缓存后，除非手动刷新，不调用 Steam API
4. **配置内聚**：游戏配置独立，游戏模块功能内聚到游戏 TAB

---

## 二、数据库设计

### 扩展 steam_db 表

将现有 `steam_db` 表扩展为完整缓存表：

```sql
-- steam_db 表结构（扩展后）
CREATE TABLE steam_db (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_appid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  aliases TEXT DEFAULT '[]',
  
  -- 新增查询字段
  release_date TEXT,           -- 发行日期 YYYY-MM-DD
  genres TEXT,                 -- 类型 JSON 数组
  rating REAL,                 -- Metacritic 评分
  languages TEXT,              -- 语言 JSON 数组
  tags TEXT,                   -- 标签 JSON 数组
  
  -- 原始数据
  raw_data TEXT,               -- Steam API 完整返回 JSON
  
  -- 元信息
  notes TEXT,
  source TEXT DEFAULT 'manual',
  scraped_at DATETIME,
  updated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 新增索引
CREATE INDEX idx_steam_db_release_date ON steam_db(release_date);
CREATE INDEX idx_steam_db_rating ON steam_db(rating);
```

### 字段说明

| 字段 | 类型 | 用途 | 查询 |
|------|------|------|------|
| `steam_appid` | TEXT | Steam AppID | ✅ 主键 |
| `name` | TEXT | 中文名 | ✅ 名称匹配 |
| `name_en` | TEXT | 英文名 | ✅ 名称匹配 |
| `aliases` | TEXT | 别名 JSON | ✅ 别名匹配 |
| `release_date` | TEXT | 发行日期 | ✅ 按年份筛选 |
| `genres` | TEXT | 类型 JSON | ✅ 按类型筛选 |
| `rating` | REAL | 评分 | ✅ 按评分筛选 |
| `languages` | TEXT | 语言 JSON | ✅ 按语言筛选 |
| `tags` | TEXT | 标签 JSON | ✅ 按标签筛选 |
| `raw_data` | TEXT | 完整原始数据 | ❌ 仅存储 |

---

## 三、文件存储设计

### 目录结构

```
profiles/games/
├─ steam-cache/{appid}/       # Steam 缓存（按 AppID 组织）
│   ├─ header.jpg             # 横版海报 (header_image)
│   ├─ capsule.jpg            # 尖顶海报 (capsule_image)
│   ├─ background.jpg         # 背景/壁纸图
│   └─ screenshots/           # 截图目录
│       ├─ 1.jpg
│       ├─ 2.jpg
│       ├─ ...
│       └─ N.jpg              # 全部截图存储
│
├─ posters/{gameId}/          # 单游戏自定义图片（保留）
│   ├─ horizontal.jpg
│   ├─ vertical.jpg
│   ├─ background.jpg
│   └─ *.jpg                  # 备份文件
│
└─ backups/                   # 数据备份目录（保留）
```

### 图片来源优先级

游戏图片展示时：
1. 先检查 `posters/{gameId}/` 是否有用户自定义图片 → 显示自定义
2. 否则检查是否有 `steam_appid` → 显示 `steam-cache/{appid}/` 缓存图片
3. 都无 → 显示占位图或空白

### 固定路径规则

图片路径固定，不存数据库：
- Steam 缓存海报：`steam-cache/{appid}/header.jpg`
- Steam 缓存截图：`steam-cache/{appid}/screenshots/{index}.jpg`
- 自定义海报：`posters/{gameId}/horizontal.jpg`

---

## 四、刮削逻辑设计

### 刮削流程

```
scrapeGame(gameId):
  1. 获取游戏的 steam_appid
     - 已绑定：直接使用
     - 未绑定：搜索 Steam API 匹配
  
  2. 查 steam_db 缓存
     - 有缓存：
       - 从 raw_data 提取元数据写入 games 表
       - 检查 steam-cache/{appid}/ 图片完整性
       - 缺失图片：下载补充
     - 无缓存：
       - 调用 Steam API 获取详情
       - 存入 steam_db（所有字段 + raw_data）
       - 下载所有图片到 steam-cache/{appid}/
       - 写入 games 表
  
  3. 记录刮削完成
```

### 手动刷新

```
refreshSteamCache(appid, force = false):
  1. 调用 Steam API 获取最新数据
  2. 增量更新 steam_db：
     - 逐字段比对，有新值则更新
     - raw_data 更新为最新返回
  3. 增量下载图片：
     - 检查已有图片
     - 只下载新增的图片
     - 不删除已有图片（用户可能已自定义）
```

### 批量刷新

```
refreshAllSteamCache():
  1. 获取所有已绑定 AppID 的游戏列表
  2. 遍历调用 refreshSteamCache(appid)
  3. 进度回调：当前/总数/游戏名
  4. 避免请求过快：间隔 1 秒
```

---

## 五、配置拆分设计

### 文件拆分

```
profiles/
├─ config.json             # 全局配置（精简）
├─ games-config.json       # 游戏模块配置（独立）
└─ games.db                # 游戏数据库
```

### Config 接口（精简后）

```typescript
interface Config {
  // 全局配置
  storagePath: string;
  scanPaths: string[];
  scanTime: string;
  excludePatterns: string[];
  fileExtensionFilter: FileExtensionFilter;
  categories?: string[];
  categoryRules?: CategoryRule;
  categoryPathRules?: CategoryPathRule[];
  trackingConfig?: TrackingConfig;
  
  // 仅保留游戏模块开关
  gamesEnabled?: boolean;
}
```

### GamesConfig 接口（独立）

```typescript
interface GamesConfig {
  // 扫描配置
  gameScanPathsEnabled: boolean;
  gameScanPaths: string[];
  
  // 识别规则
  gamesRules: GameRules;
  
  // 刮削配置
  gamesScrape: GameScrapeConfig;
  
  // 图片配置
  maxPosterBackups: number;
  
  // Steam 配置
  proxyUrl: string;
}
```

### 配置迁移

首次加载 `games-config.json` 时：
1. 检查文件是否存在
2. 不存在则从旧 `config.json` 中提取游戏配置字段
3. 写入新的 `games-config.json`
4. 从 `config.json` 中移除游戏字段

---

## 六、前端页面设计

### 导航结构

```
导航栏：
├─ 首页
├─ 文件浏览
├─ 游戏（新增独立 TAB）
│   ├─ 游戏墙（默认）
│   ├─ Steam 管理
│   ├─ 分组管理
│   └─ 游戏设置
└─ 设置（仅保留全局配置 + 游戏开关）
```

### Steam 管理页面

**路径**: `/game/steam`

**页面布局**:
```
┌─────────────────────────────────────────────────────────┐
│  Steam 管理                                              │
├─────────────────────────────────────────────────────────┤
│  统计卡片                                                 │
│  ├─ 已缓存游戏: 156                                      │
│  ├─ 海报图片: 156 张 (45 MB)                             │
│  ├─ 截图图片: 780 张 (120 MB)                            │
│  └─ 总缓存大小: 165 MB                                   │
├─────────────────────────────────────────────────────────┤
│  操作按钮                                                 │
│  [刷新所有缓存]  [导入 Steam DB]  [导出 Steam DB]        │
├─────────────────────────────────────────────────────────┤
│  缓存列表                                                 │
│  ├─ 搜索框 + 筛选下拉                                    │
│  ├─ 表格: AppID | 中文名 | 英文名 | 缓存状态 | 操作      │
│  ├─ 缓存状态: ✅完整 / ⚠缺失图片 / ❌仅元数据            │
│  └─ 操作: [刷新] [删除] [详情]                           │
└─────────────────────────────────────────────────────────┘
```

**缓存详情弹窗**:
- 显示海报预览（header、capsule、background）
- 显示截图缩略图列表
- 显示完整元数据信息

### 游戏设置页面

**路径**: `/game/settings`

**页面布局**:
```
┌─────────────────────────────────────────────────────────┐
│  游戏设置                                                │
├─────────────────────────────────────────────────────────┤
│  扫描路径                                                 │
│  ├─ 启用独立扫描路径 [开关]                              │
│  ├─ 扫描路径列表                                         │
│  │   E:\Games  [删除]                                   │
│  │   F:\SteamLibrary  [删除]                            │
│  ├─ [添加路径]                                           │
│                                                         │
│  识别规则                                                 │
│  ├─ 正则规则列表（可编辑、添加、删除）                   │
│  ├─ 启发式规则                                          │
│  │   ├─ exe名匹配 [开关]                                │
│  │   ├─ 子目录规则 [开关]                               │
│  │   ├─ 目录大小启发 [开关]                             │
│                                                         │
│  刮削配置                                                 │
│  ├─ 自动刮削 [开关]                                     │
│  ├─ 刮削时下载海报 [开关]                               │
│  ├─ Steam API 代理: [输入框]                            │
│                                                         │
│  [保存配置]                                              │
└─────────────────────────────────────────────────────────┘
```

### 游戏详情页刷新入口

在游戏详情页操作区新增：
```
[编辑] [提升目录] [排除] [刷新 Steam 数据]
```

---

## 七、API 端点设计

### 新增端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/steam-cache/stats` | GET | 获取缓存统计 |
| `/api/steam-cache/list` | GET | 获取缓存列表（分页、搜索） |
| `/api/steam-cache/:appid` | GET | 获取单个缓存详情 |
| `/api/steam-cache/:appid/refresh` | POST | 强制刷新单个 AppID |
| `/api/steam-cache/:appid` | DELETE | 删除单个缓存 |
| `/api/steam-cache/refresh-all` | POST | 批量刷新所有缓存 |
| `/api/steam-cache/images/:appid` | GET | 获取缓存图片列表 |
| `/api/games-config` | GET | 获取游戏配置 |
| `/api/games-config` | PUT | 保存游戏配置 |

### 图片服务

Steam 缓存图片通过静态文件服务访问：
```
GET /static/games/steam-cache/{appid}/header.jpg
GET /static/games/steam-cache/{appid}/screenshots/{index}.jpg
```

---

## 八、实现顺序

### Phase 1: 数据库与配置

1. 扩展 steam_db 表结构
2. 新建 games-config.ts 模块
3. 配置迁移逻辑

### Phase 2: 刮削逻辑重构

1. 重构 scraper.ts 刮削流程
2. 新增 steam-cache-service.ts 图片管理
3. 本地优先 + 缺失补齐逻辑

### Phase 3: 后端 API

1. 新增 Steam 缓存相关 API
2. 新增游戏配置 API
3. 图片静态服务路径调整

### Phase 4: 前端页面重构

#### 4.1 前端目录结构规范

**模块化原则**：所有 Game 模块相关文件统一放入 `game/` 子目录，文件名使用 `Game` 前缀。

```
frontend/src/
├─ views/
│   └─ game/                    # Game 模块视图目录
│       ├─ GameWallView.vue     # 游戏墙
│       ├─ GameSteamView.vue    # Steam 管理
│       ├─ GameSettingsView.vue # 游戏设置
│       └─ GameGroupsView.vue   # 分组管理
│
├─ components/
│   └─ game/                    # Game 模块组件目录
│       ├─ GameCard.vue
│       ├─ GameFilterBar.vue
│       ├─ GameStatsBar.vue
│       ├─ GameDetailModal.vue
│       ├─ GameEditModal.vue
│       ├─ GameAddModal.vue
│       ├─ GameSteamSearchModal.vue
│       ├─ GameGroupSidebar.vue
│       └─ GameGroupManager.vue
│
├─ composables/
│   └─ game/                    # Game 模块 Composables 目录
│       ├─ useGameList.ts
│       ├─ useGameFilters.ts
│       ├─ useGameGroups.ts
│       ├─ useGameSteamSearch.ts
│       ├─ useGamePoster.ts
│       └─ useGameToast.ts
│
└─ types/
    └─ game.ts                  # Game 模块类型定义
```

#### 4.2 GameWallView.vue 模块化拆分

当前 GameWallView.vue 有 1923 行，过于庞大，需要模块化拆分。

**Composables（逻辑层）**：

| 文件 | 内容 |
|------|------|
| `composables/game/useGameList.ts` | 游戏列表加载、刷新、分页 |
| `composables/game/useGameFilters.ts` | 搜索、筛选、排序 |
| `composables/game/useGameGroups.ts` | 分组选择、分组操作 |
| `composables/game/useGameSteamSearch.ts` | Steam 搜索、绑定 |
| `composables/game/useGamePoster.ts` | 海报上传、下载、备份 |
| `composables/game/useGameToast.ts` | Toast 通知 |

**子组件（模板层）**：

| 文件 | 内容 |
|------|------|
| `components/game/GameDetailModal.vue` | 游戏详情模态框 |
| `components/game/GameEditModal.vue` | 编辑游戏模态框 |
| `components/game/GameAddModal.vue` | 添加游戏模态框 |
| `components/game/GameSteamSearchModal.vue` | Steam 搜索模态框 |
| `components/game/GameFilterBar.vue` | 筛选栏组件 |
| `components/game/GameStatsBar.vue` | 统计栏组件 |

**拆分后 GameWallView.vue 预估行数**：~200-300 行

#### 4.3 新增游戏 TAB 导航结构

1. 新增 `/game` 路由入口
2. 新增子路由：
   - `/game/wall` - 游戏墙（默认）
   - `/game/steam` - Steam 管理
   - `/game/groups` - 分组管理
   - `/game/settings` - 游戏设置

#### 4.3 新增 Steam 管理页面

- 统计卡片（缓存数量、图片占用）
- 操作按钮（刷新全部、导入导出）
- 缓存列表（搜索、筛选、单条刷新/删除）
- 缓存详情弹窗（海报预览、截图预览）

#### 4.4 新增游戏设置页面

- 扫描路径配置
- 识别规则配置
- 刮削配置
- Steam 代理配置

#### 4.5 调整全局设置页

- 移除游戏扫描规则、刮削配置等
- 仅保留游戏模块开关（gamesEnabled）

---

## 九、参考资料

- 成熟产品设计借鉴：Steam Collections（库内功能）、Playnite 侧边栏导航
- 模块内聚原则：功能与模块绑定，配置与模块绑定