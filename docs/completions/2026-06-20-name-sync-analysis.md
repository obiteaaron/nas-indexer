# 游戏名称同步机制分析

> 分析日期：2026-06-20
> 分析范围：游戏中英文名称在 `games` 表与 `steam_db` 表之间的同步机制

---

## 一、数据结构概览

| 表 | 中文名字段 | 英文名字段 | 说明 |
|---|---|---|---|
| **games** | `title` | `title_en` | 实际游戏记录 |
| **steam_db** | `name` | `name_en` | Steam 数据缓存/映射表 |

### games 表关键字段

```sql
-- src/games/database.ts:30-65
CREATE TABLE games (
  title TEXT NOT NULL,            -- 中文名称/主名称
  title_en TEXT,                  -- 英文名称
  original_name TEXT,             -- 原始目录名
  steam_appid TEXT,               -- Steam AppID（关联键）
  is_manually_edited INTEGER DEFAULT 0,  -- 手动编辑标记（保护字段）
  ...
)
```

### steam_db 表关键字段

```sql
-- src/games/database.ts:139-141
CREATE TABLE steam_db (
  name TEXT NOT NULL,             -- 中文名称
  name_en TEXT,                   -- 英文名称
  aliases TEXT DEFAULT '[]',      -- 别名列表（JSON 数组）
  steam_appid TEXT NOT NULL,      -- Steam AppID（主键）
  ...
)
```

---

## 二、数据流向分析

### 数据流图

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Steam 刮削    │────▶│    steam_db     │────▶│     games       │
│                 │     │  name/name_en   │     │  title/title_en │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         │                       │  ◀─── 无反向同步 ────  │
         │                       │                       │
         │                       │                       │
┌─────────────────┐              │                       │
│   路径提取      │──────────────┼───────────────────────▶
│ extractNames    │              │  (不更新 steam_db)
└─────────────────┘              │
                                 │
┌─────────────────┐              │
│  用户手动编辑   │──────────────┼───────────────────────▶
│  (games界面)    │              │  (不更新 steam_db)
└─────────────────┘              │
                                 │
┌─────────────────┐              │
│  用户手动编辑   │──────────────▶
│  (steam_db界面) │   (会同步到games，但无保护)
└─────────────────┘
```

### 数据流详解

| 数据流 | 方向 | 是否双向 | 保护机制 | 触发时机 |
|---|---|---|---|---|
| Steam 刮削 | Steam API → steam_db → games | 单向写入 | `title` 有保护，`title_en` 无保护 | 用户手动刮削/批量刮削 |
| Steam DB 编辑 | steam_db → games | 单向同步 | **无保护** | 用户在 Steam DB 界面编辑名称 |
| Games 编辑 | games 表更新 | 无同步 | 无 | 用户在游戏详情界面编辑名称 |
| 路径提取 | 路径解析 → games | 无同步 | **无保护** | 用户点击"重新提取名称" |

---

## 三、同步机制详解

### 3.1 Steam 刮削流程

**代码位置**：`src/games/scraper.ts:311-381`

```typescript
// 智能名称解析
const resolved = resolveGameNames(steamName, dirName, existing?.aliases || []);

// 存入 steam_db 缓存
const cacheData = {
  name: resolved.name,
  name_en: resolved.nameEn,
  aliases: resolved.aliases,
  ...
};

// 更新 games 表
const shouldUpdateTitle = !game.is_manually_edited;  // 只保护 title
const updateData = {
  title: shouldUpdateTitle ? resolved.name : game.title,
  title_en: resolved.nameEn || steamName,  // title_en 无保护！
  ...
};
```

**问题**：
- ✅ `title` 受 `is_manually_edited` 保护
- ❌ `title_en` **不受保护**，每次刮削都会覆盖

### 3.2 Steam DB → Games 同步

**代码位置**：`src/routes/steam-cache.ts:471-478` + `src/games/database.ts:1178-1213`

```typescript
// steam-cache.ts:471-478
if (updated && (data.name !== undefined || data.name_en !== undefined)) {
  const syncCount = gameDatabase.syncSteamDbToGames(
    updated.steam_appid,
    { name: data.name, name_en: data.name_en }
  );
}

// database.ts:1196
const sql = `UPDATE games SET ${fields.join(', ')} WHERE steam_appid = ?`;
// 缺少：AND is_manually_edited = 0
```

**问题**：
- ❌ **完全不检查 `is_manually_edited`**，会覆盖用户手动编辑的名称
- ❌ 一个 `steam_appid` 可能对应多个 `games` 记录，同步会影响所有游戏

### 3.3 Games → Steam DB（无同步）

**代码位置**：`src/routes/games.ts:185-202`

```typescript
router.post('/update/:id', async (req, res) => {
  const updateData: Partial<Game> = req.body;
  gameDatabase.updateGame(game.id, updateData);
  // 没有任何同步到 steam_db 的逻辑
});
```

**问题**：
- ❌ 用户在游戏界面修改 `title/title_en` 不会同步到 `steam_db`
- 导致两表数据不一致

### 3.4 路径提取名称

**代码位置**：`src/routes/games.ts:448-506`（单个）+ `src/routes/games.ts:374-443`（批量）

```typescript
// 单个提取 - games.ts:485-488
gameDatabase.updateGame(game.id, {
  title: extracted.title,
  title_en: extracted.titleEn
});
// 无 is_manually_edited 检查！

// 批量提取 - games.ts:411-415
if (extracted.titleEn && extracted.titleEn !== game.title) {  // 条件逻辑错误
  gameDatabase.updateGame(game.id, {
    title: extracted.title,
    title_en: extracted.titleEn
  });
}
// 同样无保护！
```

**问题**：
- ❌ 不检查 `is_manually_edited`，直接覆盖用户手动编辑的名称
- ❌ 不同步到 `steam_db`
- 🟢 批量提取条件 `titleEn !== game.title` 语义不够清晰（逻辑可工作，但命名易误解）

---

## 四、潜在数据不一致问题汇总

| 问题 | 位置 | 现象 | 严重程度 |
|---|---|---|---|
| Steam DB 编辑覆盖手动编辑 | `database.ts:1196` | `syncSteamDbToGames` 不检查 `is_manually_edited` | 🔴 高 |
| 刮削时 title_en 无保护 | `scraper.ts:368` | `title_en` 每次刮削都会覆盖 | 🔴 高 |
| 路径提取覆盖手动编辑 | `games.ts:485, 412` | `extract-names` 不检查 `is_manually_edited` | 🔴 高 |
| 路径提取不同步 steam_db | `games.ts` | 只更新 games，steam_db 保持原值 | 🟡 中 |
| Games 编辑不同步 Steam DB | `games.ts:185-202` | 用户在游戏界面修改名称不影响 steam_db | 🟡 中 |
| 路径提取条件语义不够清晰 | `games.ts:411` | `titleEn !== game.title` 比较的是"英文名≠中文名"，语义上可理解为"提取到了不同于当前中文名的英文名"，逻辑可工作但命名容易误解（建议改为更清晰的注释） | 🟢 低 |
| 前端无确认提示 | 前端各调用点 | 所有覆盖操作都无确认对话框 | 🟡 中 |

---

## 五、关键代码位置索引

| 功能 | 文件 | 关键行号 | 说明 |
|---|---|---|---|
| games 表 schema | `src/games/database.ts` | 35-37, 59 | `title`, `title_en`, `is_manually_edited` 定义 |
| steam_db 表 schema | `src/games/database.ts` | 139-141 | `name`, `name_en`, `aliases` 定义 |
| 名称智能解析 | `src/games/name-resolver.ts` | 204-242 | `resolveGameNames()` 函数 |
| 路径名称提取 | `src/games/name-resolver.ts` | 128-188 | `extractNamesFromPath()` 函数 |
| Steam 刮削更新 | `src/games/scraper.ts` | 364-368 | title 保护，title_en 无保护 |
| Steam DB → Games 同步 | `src/games/database.ts` | 1178-1213 | `syncSteamDbToGames()` 缺少保护 |
| Steam DB 编辑触发同步 | `src/routes/steam-cache.ts` | 471-478 | 调用同步函数 |
| Games 更新路由 | `src/routes/games.ts` | 185-202 | 无反向同步逻辑 |
| 单个游戏名称提取 | `src/routes/games.ts` | 485-488 | 无保护，不同步 |
| 批量名称提取 | `src/routes/games.ts` | 411-415 | 无保护，条件错误 |
| 前端单个提取调用 | `frontend/src/views/game/GameWallView.vue` | 920 | 无确认对话框 |
| 前端批量提取调用 | `frontend/src/views/game/GameWallView.vue` | 1635 | 无确认对话框 |

---

## 六、解决方案建议

### 6.1 立即修复（优先级最高）

#### 修复 1：syncSteamDbToGames 添加保护

**位置**：`src/games/database.ts:1196`

```typescript
// 当前
const sql = `UPDATE games SET ${fields.join(', ')} WHERE steam_appid = ?`;

// 修复后
const sql = `UPDATE games SET ${fields.join(', ')} WHERE steam_appid = ? AND is_manually_edited = 0`;
```

#### 修复 2：刮削时 title_en 添加保护

**位置**：`src/games/scraper.ts:368`

```typescript
// 当前
title_en: resolved.nameEn || steamName,

// 修复后
title_en: shouldUpdateTitle ? (resolved.nameEn || steamName) : game.title_en,
```

#### 修复 3：路径提取添加保护

**位置**：`src/routes/games.ts:485` + `src/routes/games.ts:412`

```typescript
// 添加检查
if (!game.is_manually_edited) {
  gameDatabase.updateGame(game.id, {
    title: extracted.title,
    title_en: extracted.titleEn
  });
}
```

#### 修复 4：批量提取条件语义优化（可选）

**位置**：`src/routes/games.ts:411`

当前条件逻辑可以正常工作，但语义不够清晰：

```typescript
// 当前（逻辑正确但命名易误解）
if (extracted.titleEn && extracted.titleEn !== game.title)

// 实际意图：提取到了英文名，且这个英文名不是当前的中文名
// 建议：添加注释说明
if (extracted.titleEn && extracted.titleEn !== game.title) {
  // 条件意图：提取到的英文名 ≠ 当前中文名，说明确实需要添加英文名
  // 注意：筛选条件已限定 title_en 为空，所以只需检查是否"有意义的新英文名"
}
```

### 6.2 中期改进

#### 改进 1：添加 Games → Steam DB 可选同步

在 `games.ts` 更新路由中添加可选同步参数：

```typescript
router.post('/update/:id', async (req, res) => {
  const { syncToSteamDb } = req.body;  // 新增参数

  gameDatabase.updateGame(game.id, updateData);

  if (syncToSteamDb && game.steam_appid) {
    // 可选同步到 steam_db（需要用户明确确认）
    gameDatabase.updateSteamDbEntry(...);
  }
});
```

#### 改进 2：添加确认机制

前端在执行覆盖操作前显示确认对话框：

```
当前名称：艾尔登法环 / Elden Ring
提取结果：黑暗之魂3 / Dark Souls III

⚠️ 这将覆盖现有名称，是否继续？
[取消] [确认覆盖]
```

### 6.3 长期优化方案

#### 方案 A：重构数据模型

明确区分"权威数据源"和"本地覆盖"：

```
steam_db.name/name_en → 权威数据（来自 Steam）
games.title/title_en → 本地覆盖（用户自定义）

显示时：优先使用本地覆盖，无覆盖时使用权威数据
```

#### 方案 B：引入独立的本地名称字段

```sql
ALTER TABLE games ADD COLUMN local_title TEXT;
ALTER TABLE games ADD COLUMN local_title_en TEXT;

-- title/title_en 变为视图计算字段
-- 显示逻辑：local_title ?? steam_db.name
```

---

## 七、总结

当前系统中存在三条独立的数据流（Steam 刮削、Steam DB 编辑、路径提取），彼此之间缺乏协调，且 `is_manually_edited` 保护机制不完整，导致多处代码会绕过保护直接覆盖用户手动编辑的数据。

**核心问题**：
1. Steam DB → Games 同步不检查保护标记
2. 刮削和路径提取时 `title_en` 不受保护
3. Games 表编辑完全不反向同步到 Steam DB

**推荐优先修复顺序**：
1. 🔴 `syncSteamDbToGames` 添加 `is_manually_edited = 0` 条件
2. 🔴 刮削时 `title_en` 使用 `shouldUpdateTitle` 保护
3. 🔴 路径提取添加 `is_manually_edited` 检查
4. 🟢 批量提取条件语义优化（添加注释说明）
5. 🟡 前端确认机制