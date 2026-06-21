# Steam DB 重设计计划

## Context

现有的 `game_aliases` 表设计存在局限性：一个 `folder_name` 只能对应一个 `steam_appid`，无法反向查询。同一个 Steam 游戏（如 Elden Ring）可能有多个不同的文件夹名（"Elden Ring", "艾尔登法环", "ER"），当前设计无法有效管理这些多名称映射。

目标：重新设计为 `steam_db` 表，支持一个 appid 对应主名称 + 多别名，并提供前端 CRUD 和批量导入导出功能，提升刮削成功率。

---

## 1. 数据库设计

### 新表结构 (steam_db)

```sql
CREATE TABLE IF NOT EXISTS steam_db (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_appid TEXT NOT NULL UNIQUE,     -- Steam AppID（唯一）
  name TEXT NOT NULL,                   -- 中文名称（如 "艾尔登法环"）
  name_en TEXT,                         -- 英文名称（如 "Elden Ring"）
  aliases TEXT DEFAULT '[]',            -- JSON 数组别名（如 ["ER", "eldenring"]）
  notes TEXT,                           -- 备注
  source TEXT DEFAULT 'manual',         -- 来源：manual/imported/auto/scraper
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
)
```

索引：
- `idx_steam_db_appid ON steam_db(steam_appid)`
- `idx_steam_db_name ON steam_db(name)`

### 数据库方法 (src/games/database.ts)

新增方法：
- `createSteamDbTables()` - 建表
- `insertSteamDbEntry(data)` - 插入
- `getSteamDbById(id)` / `getSteamDbByAppid(appid)` - 查询
- `getAllSteamDbEntries()` - 列表
- `updateSteamDbEntry(id, data)` - 更新
- `deleteSteamDbEntry(id)` - 删除
- `lookupSteamDbByName(name)` - 核心查找方法（匹配 name、name_en 或任意 aliases）
- `exportSteamDb()` / `importSteamDb(entries, mode)` - 导入导出
- `migrateAliasesToSteamDb()` - 从 game_aliases 迁移

---

## 2. 后端 API 设计

新增路由（在 src/routes/games.ts），采用动词化 POST URL：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/games/steam-db/list` | GET | 列表（支持 search, orderBy 参数） |
| `/api/games/steam-db/get/:id` | GET | 单条查询 |
| `/api/games/steam-db/create` | POST | 创建 |
| `/api/games/steam-db/update/:id` | POST | 更新 |
| `/api/games/steam-db/delete/:id` | POST | 删除 |
| `/api/games/steam-db/export` | GET | 导出 JSON |
| `/api/games/steam-db/import` | POST | 导入 JSON（mode: merge/overwrite） |
| `/api/games/steam-db/lookup` | GET | 按名称查找 appid（参数：name） |
| `/api/games/steam-db/migrate` | POST | 从 game_aliases 迁移数据 |

---

## 3. 前端设计

### 位置：SettingsView.vue 新增 Tab，由游戏模块开关控制

在现有 tabs 数组中新增 Steam 数据库 Tab，显隐由 `gamesEnabled` 开关统一控制：

```typescript
const tabs = [
  { key: 'scan', label: '扫描配置' },
  { key: 'category', label: '分类规则' },
  { key: 'display', label: '偏好与显示' },
  { key: 'games', label: '游戏模块' },
  { key: 'steam-db', label: 'Steam 数据库' },  // 新增，与游戏模块同开关
  { key: 'status', label: '系统状态' },
]

// Tab 显隐逻辑：steam-db 与 games 共用 gamesEnabled 开关
```

### 显隐规则

- `gamesEnabled = true` → 显示"游戏模块"和"Steam 数据库"两个 Tab
- `gamesEnabled = false` → 隐藏这两个 Tab

### UI 结构（Steam 数据库 Tab）

```
Steam 数据库 Tab
├─ 工具栏：[添加记录] [导入JSON] [导出JSON] [迁移旧数据]
├─ 搜索/排序栏
├─ 记录列表（卡片式）
│   ├─ AppID + 中文名 + 英文名
│   ├─ 别名标签（逗号分隔显示）
│   ├─ 备注 + 来源
│   └─ 操作：[编辑] [删除]
└─ 添加/编辑弹窗（Modal）
    ├─ Steam AppID 输入
    ├─ 中文名输入
    ├─ 英文名输入
    ├─ 别名输入（逗号分隔）
    ├─ 备注
    └─ [取消] [保存]
```

### 导入弹窗

- JSON 文本输入框（支持粘贴）
- 模式选择：合并（跳过重复） / 覆盖
- 导入结果提示：新增 X 条，更新 Y 条，跳过 Z 条

---

## 4. 识别流程集成

修改 `src/games/identifier.ts` 的 `runIdentification()` 函数：

```typescript
// 替换 lookupAlias 为 lookupSteamDbByName
for (const game of games) {
  if (!game.steam_appid && game.original_name) {
    const match = gameDatabase.lookupSteamDbByName(game.original_name);
    if (match) {
      game.steam_appid = match.steam_appid;
      logger.info('Steam DB 匹配: %s -> appid %s (%s)', game.original_name, match.steam_appid, match.name);
    }
  }
}
```

---

## 5. 数据迁移

从 game_aliases 迁移到 steam_db：

1. 按 steam_appid 分组所有 folder_name
2. 根据名称特征判断中文名或英文名（含中文字符 → name，否则 → name_en 或 aliases）
3. source 取 manual 优先，否则 auto
4. 迁移完成后保留 game_aliases 表（标记废弃）

---

## 6. 实现顺序

### Phase 1: 后端数据库层
- `src/types/game.ts` - 新增 SteamDbEntry 类型
- `src/games/database.ts` - 建表 + 所有 CRUD/查询方法

### Phase 2: 后端 API 层
- `src/routes/games.ts` - 新增 steam-db 相关路由

### Phase 3: 识别流程集成
- `src/games/identifier.ts` - 使用新的 lookupSteamDbByName

### Phase 4: 前端类型和 API
- `frontend/src/types/api.ts` - SteamDbEntry 类型
- `frontend/src/api/index.ts` - steam-db API 函数

### Phase 5: 前端 UI
- `frontend/src/views/SettingsView.vue` - 新 Tab + CRUD UI

---

## 7. 关键文件

- `src/games/database.ts` - 数据库方法和建表
- `src/games/identifier.ts` - 识别流程集成
- `src/routes/games.ts` - API 路由
- `frontend/src/views/SettingsView.vue` - 前端 UI
- `frontend/src/api/index.ts` - 前端 API 函数
- `frontend/src/types/api.ts` - 前端类型定义

---

## 8. 验证方案

1. **数据库建表测试**：启动服务，检查 steam_db 表创建
2. **CRUD 测试**：前端添加/编辑/删除记录，验证数据库操作
3. **导入导出测试**：导出 JSON，再导入验证数据完整
4. **迁移测试**：从 game_aliases 迁移，验证数据正确分组
5. **识别流程测试**：添加 steam_db 记录后，重新识别游戏，验证 appid 自动匹配