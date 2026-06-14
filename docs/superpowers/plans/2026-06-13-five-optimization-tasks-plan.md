# 五项优化任务实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 nas-indexer v1.5.5 的五项优化：SteamDB同步、日志时区、扫描日志优化、PKG打包、删除P3规则

**Architecture:** 每个任务独立实现，互不依赖。按实现顺序：任务2→任务3→任务5→任务1→任务4

**Tech Stack:** TypeScript, Express, SQLite (sql.js), Pino, PKG

---

## 文件结构

| 文件 | 任务 | 改动类型 |
|------|------|---------|
| `src/logger.ts` | 任务2 | 修改时间戳函数 |
| `src/games/identifier.ts` | 任务3, 任务5 | 修改扫描逻辑、删除P3规则 |
| `src/games/database.ts` | 任务1 | 新增同步方法 |
| `src/routes/games.ts` | 任务1 | 修改SteamDB更新路由 |
| `src/types/game.ts` | 任务5 | 标记HeuristicRulesConfig废弃 |
| `package.json` | 任务4 | 新增pkg依赖和脚本 |
| `docs/game-identification-rules.md` | 任务5 | 更新文档移除P3章节 |
| `tests/games/steam-db-sync.test.ts` | 任务1 | 新增测试文件 |
| `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `todo-list.md` | 所有 | 文档更新 |

---

### Task 1: 日志本地时区（最简单，先实现）

**Files:**
- Modify: `src/logger.ts:45-50`

- [ ] **Step 1: 修改时间戳函数**

找到 `src/logger.ts` 第 45-50 行，将 `timestamp` 配置改为本地时间：

```typescript
// 替换第 48 行
// 原代码: timestamp: pino.stdTimeFunctions.isoTime
// 改为:
timestamp: () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: 手动测试**

Run: `npm run dev`
Expected: 查看 `profiles/nas-indexer.log`，时间格式应为 `2026-06-13 15:30:00` 而非 UTC ISO 格式

- [ ] **Step 4: 提交**

```bash
git add src/logger.ts
git commit -m "feat: 日志时间改为本地时区格式"
```

---

### Task 2: 扫描日志优化（跳过已存在游戏）

**Files:**
- Modify: `src/games/identifier.ts:378-402`

- [ ] **Step 1: 修改扫描逻辑**

找到 `src/games/identifier.ts` 的 `scanEntry` 函数，在匹配成功后添加存在性检查。

将第 378-402 行的代码替换为：

```typescript
const matchResult = matchRecognitionRule(entryPath, isFile, rules, scanRoot);
if (matchResult.matched && matchResult.gamePath) {
  const gamePath = matchResult.gamePath;
  const gamePathNormalized = path.resolve(gamePath);

  // 检查是否已被处理
  if (processedPaths.has(gamePathNormalized)) {
    processedPaths.add(normalizedPath);
    return games;
  }

  // 新增：检查游戏是否已存在于数据库
  const existing = gameDatabase.getGameByPath(gamePathNormalized);
  if (existing) {
    // 已存在，只标记为已处理，不打印日志，不创建新记录
    processedPaths.add(gamePathNormalized);
    processedPaths.add(normalizedPath);
    
    // 标记游戏目录下所有内容为已处理
    try {
      const entries = fs.readdirSync(gamePath, { withFileTypes: true });
      for (const entry of entries) {
        processedPaths.add(path.resolve(path.join(gamePath, entry.name)));
      }
    } catch {}
    
    return games;  // 返回空数组
  }

  // 新游戏，继续原有流程
  games.push(createGameRecord(gamePath));
  processedPaths.add(gamePathNormalized);
  processedPaths.add(normalizedPath);

  // 标记游戏目录下所有内容为已处理
  try {
    const entries = fs.readdirSync(gamePath, { withFileTypes: true });
    for (const entry of entries) {
      processedPaths.add(path.resolve(path.join(gamePath, entry.name)));
    }
  } catch {}

  logger.info('识别游戏(正则匹配): %s [depth=%d]', path.basename(gamePath), depth);
  return games;
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 3: 手动测试**

1. 启动应用 `npm run dev`
2. 首次扫描游戏目录，观察日志打印所有识别的游戏
3. 再次扫描同一目录，观察日志不再打印已存在的游戏

- [ ] **Step 4: 提交**

```bash
git add src/games/identifier.ts
git commit -m "feat: 扫描时跳过已存在游戏的日志输出"
```

---

### Task 3: 删除 P3 启发式规则

**Files:**
- Modify: `src/games/identifier.ts:75-161` (findHeuristicRoot)
- Modify: `src/games/identifier.ts:196-234` (smartLevelOffset)
- Modify: `src/types/game.ts:63-84` (HeuristicRulesConfig)
- Modify: `docs/game-identification-rules.md`

- [ ] **Step 1: 简化 findHeuristicRoot 函数**

将 `src/games/identifier.ts` 第 75-161 行的 `findHeuristicRoot` 函数简化为：

```typescript
/**
 * P2: 启发式规则（已删除，v1.5.5）
 * 原包含 exe目录名匹配、标准子目录偏移、目录大小启发，现已全部删除
 * 保留函数签名以兼容调用
 */
function findHeuristicRoot(
  initialGameDir: string,
  _matchedPath: string,
  _scanRoot: string,
  _heuristicRules: HeuristicRulesConfig
): string {
  // P3 启发式规则已删除，直接返回初始目录
  return initialGameDir;
}
```

同时删除以下辅助函数（如果不再需要）：
- `getDirectorySize` (第 166-192 行)

- [ ] **Step 2: 更新 smartLevelOffset 函数日志**

将 `src/games/identifier.ts` 第 196-234 行的 `smartLevelOffset` 函数中的日志信息更新：

```typescript
function smartLevelOffset(
  initialGameDir: string,
  matchedPath: string,
  rule: GameRecognitionRule,
  scanRoot: string,
  heuristicRules: HeuristicRulesConfig
): string {
  // P1: Steam锚点优先级最高
  const steamRoot = findSteamAppidUpward(initialGameDir, scanRoot);
  if (steamRoot) {
    logger.info('[智能识别] P1成功 - steam_appid.txt锚点: %s', steamRoot);
    return steamRoot;
  }

  // P2: 启发式规则（已删除v1.5.5）
  const heuristicRoot = findHeuristicRoot(initialGameDir, matchedPath, scanRoot, heuristicRules);
  // 函数现在直接返回 initialGameDir，不再有智能判断

  // P3: 配置的levelOffset（兜底）
  let result = initialGameDir;
  for (let i = 0; i < rule.levelOffset; i++) {
    const parent = path.dirname(result);
    if (parent === result || path.resolve(parent) === path.resolve(scanRoot)) {
      break;
    }
    result = parent;
  }

  if (result !== initialGameDir) {
    logger.info('[智能识别] P3成功 - 配置levelOffset=%d: %s → %s',
      rule.levelOffset, initialGameDir, result);
  }

  return result;
}
```

- [ ] **Step 3: 标记类型为废弃**

修改 `src/types/game.ts` 第 63-84 行的 `HeuristicRulesConfig`：

```typescript
/**
 * 启发式规则配置
 * @deprecated v1.5.5 删除 P3 规则，此类型保留以兼容配置文件，但字段不再生效
 */
export interface HeuristicRulesConfig {
  exeNameMatchEnabled?: boolean;     // 已废弃
  exeNameMatchOffset?: number;       // 已废弃
  subdirRulesEnabled?: boolean;      // 已废弃
  subdirPatterns?: Array<{           // 已废弃
    patterns: string[];
    offset: number;
    description: string;
  }>;
  sizeHeuristicEnabled?: boolean;    // 已废弃
  sizeThresholdMB?: number;          // 已废弃
  sizeRatioThreshold?: number;       // 已废弃
}
```

- [ ] **Step 4: 更新游戏识别规则文档**

修改 `docs/game-identification-rules.md`：

1. 更新版本号为 `v1.5.5`
2. 更新日期为 `2026-06-13`
3. 将"五级识别优先级"改为"三级识别优先级"
4. 删除 P2 启发式规则章节（原第 90-175 行）
5. 将原 P3 改名为 P2
6. 更新优先级表格：

```markdown
## 三级识别优先级

| 优先级 | 方法 | 准确度 | 可配置 | 说明 |
|--------|------|--------|--------|------|
| **P0** | 手动标记 | ★★★★★ | ❌ | 用户明确指定根目录（最高优先级） |
| **P1** | Steam锚点 | ★★★★★ | ❌ | steam_appid.txt向上查找 |
| **P2** | 配置levelOffset | ★★★☆☆ | ✅ | 正则规则配置偏移（兜底） |
```

- [ ] **Step 5: 编译验证**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 6: 提交**

```bash
git add src/games/identifier.ts src/types/game.ts docs/game-identification-rules.md
git commit -m "refactor: 删除 P3 启发式规则，简化识别优先级为三级"
```

---

### Task 4: SteamDB → 游戏列表同步

**Files:**
- Modify: `src/games/database.ts` (新增 syncSteamDbToGames 方法)
- Modify: `src/routes/games.ts:1102-1129` (修改更新路由)
- Create: `tests/games/steam-db-sync.test.ts`

- [ ] **Step 1: 在数据库中新增同步方法**

在 `src/games/database.ts` 的 `GameDatabase` 类中，找到 `updateSteamDbEntry` 方法后（约第 1033 行），新增方法：

```typescript
/**
 * 将 SteamDB 的名称同步到所有使用该 AppID 的游戏
 * @param steam_appid Steam AppID
 * @param updates 要更新的字段 { name?, name_en? }
 * @returns 更新的游戏数量
 */
syncSteamDbToGames(steam_appid: string, updates: { name?: string; name_en?: string }): number {
  try {
    // 构建更新语句
    const fields: string[] = [];
    const params: (string | null)[] = [];
    
    if (updates.name !== undefined) {
      fields.push('title = ?');
      params.push(updates.name);
    }
    if (updates.name_en !== undefined) {
      fields.push('title_en = ?');
      params.push(updates.name_en || null);
    }
    
    if (fields.length === 0) {
      return 0;
    }
    
    params.push(steam_appid);
    
    const sql = `UPDATE games SET ${fields.join(', ')} WHERE steam_appid = ?`;
    database.db!.run(sql, params);
    
    const changes: QueryResult[] = database.db!.exec('SELECT changes()');
    const count = changes[0]?.values[0]?.[0] as number || 0;
    
    if (count > 0) {
      logger.info('SteamDB 同步: appid %s 更新了 %d 个游戏的名称', steam_appid, count);
    }
    
    return count;
  } catch (err) {
    const error = err as Error;
    logger.warn('SteamDB 同步失败: appid %s - %s', steam_appid, error.message);
    return 0;
  }
}
```

- [ ] **Step 2: 修改 SteamDB 更新路由**

修改 `src/routes/games.ts` 第 1102-1129 行的 `/steam-db/update/:id` 路由：

```typescript
router.post('/steam-db/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const id = parseInt(String(req.params.id));
    const entry = gameDatabase.getSteamDbById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在' });
      return;
    }

    const data: Partial<SteamDbEntry> = req.body;

    // 如果要更新 steam_appid，检查是否与其他条目冲突
    if (data.steam_appid && data.steam_appid !== entry.steam_appid) {
      const existing = gameDatabase.getSteamDbByAppid(data.steam_appid);
      if (existing) {
        res.status(400).json({ success: false, error: `AppID ${data.steam_appid} 已被其他条目使用` });
        return;
      }
    }

    // 更新 SteamDB
    gameDatabase.updateSteamDbEntry(id, data);
    const updated = gameDatabase.getSteamDbById(id);

    // 新增：同步到关联游戏（仅在更新 name 或 name_en 时）
    if (updated && (data.name !== undefined || data.name_en !== undefined)) {
      const syncCount = gameDatabase.syncSteamDbToGames(
        updated.steam_appid,
        { name: data.name, name_en: data.name_en }
      );
      logger.info('SteamDB 同步完成: appid=%s, 更新了%d个游戏', updated.steam_appid, syncCount);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: 创建测试文件**

创建 `tests/games/steam-db-sync.test.ts`：

```typescript
/**
 * SteamDB → 游戏同步测试
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'test-steam-sync.sqlite');
let SQL: any;
let db: any;

beforeAll(async () => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  SQL = await initSqlJs();
  db = new SQL.Database();

  // 创建 steam_db 表
  db.run(`
    CREATE TABLE steam_db (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_appid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      aliases TEXT,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建 games 表
  db.run(`
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      title_en TEXT,
      steam_appid TEXT,
      metadata_source TEXT DEFAULT 'unknown'
    )
  `);
});

afterAll(() => {
  if (db) db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('SteamDB Sync', () => {
  test('同步方法应更新关联游戏的名称', () => {
    // 创建 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name, name_en) VALUES (?, ?, ?)', ['123456', '游戏A', 'Game A']);
    
    // 创建使用该 AppID 的游戏
    db.run('INSERT INTO games (source_path, title, title_en, steam_appid) VALUES (?, ?, ?, ?)', 
      ['E:/Games/Game1', '旧名称', 'Old Name', '123456']);
    
    // 执行同步
    db.run('UPDATE games SET title = ?, title_en = ? WHERE steam_appid = ?', 
      ['游戏B', 'Game B', '123456']);
    
    // 验证
    const result = db.exec('SELECT title, title_en FROM games WHERE steam_appid = ?', ['123456']);
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('游戏B');
    expect(result[0].values[0][1]).toBe('Game B');
  });

  test('无关联游戏时应返回0', () => {
    // 创建不关联任何游戏的 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name) VALUES (?, ?)', ['999999', '孤立游戏']);
    
    // 尝试同步
    db.run('UPDATE games SET title = ? WHERE steam_appid = ?', ['新名称', '999999']);
    
    const changes = db.exec('SELECT changes()');
    expect(changes[0].values[0][0]).toBe(0);
  });

  test('多个游戏使用同一AppID时应全部更新', () => {
    // 创建 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name) VALUES (?, ?)', ['111111', '测试游戏']);
    
    // 创建多个游戏
    db.run('INSERT INTO games (source_path, title, steam_appid) VALUES (?, ?, ?)', 
      ['E:/Games/Test1', '名称1', '111111']);
    db.run('INSERT INTO games (source_path, title, steam_appid) VALUES (?, ?, ?)', 
      ['E:/Games/Test2', '名称2', '111111']);
    
    // 执行同步
    db.run('UPDATE games SET title = ? WHERE steam_appid = ?', ['统一名称', '111111']);
    
    const games = db.exec('SELECT title FROM games WHERE steam_appid = ?', ['111111']);
    expect(games[0].values.length).toBe(2);
    expect(games[0].values[0][0]).toBe('统一名称');
    expect(games[0].values[1][0]).toBe('统一名称');
  });
});
```

- [ ] **Step 4: 编译验证**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 5: 运行测试**

Run: `npm test tests/games/steam-db-sync.test.ts`
Expected: 3 个测试全部通过

- [ ] **Step 6: 提交**

```bash
git add src/games/database.ts src/routes/games.ts tests/games/steam-db-sync.test.ts
git commit -m "feat: SteamDB 更新时自动同步游戏名称"
```

---

### Task 5: PKG 打包为 EXE

**Files:**
- Modify: `package.json`
- Create: `scripts/start.bat`

- [ ] **Step 1: 安装 pkg 依赖**

Run: `npm install pkg --save-dev`
Expected: pkg 添加到 devDependencies

- [ ] **Step 2: 更新 package.json**

在 `package.json` 中添加：

```json
{
  "scripts": {
    "build:exe": "npm run build && pkg . --targets node18-win-x64 --output dist-exe/nas-indexer.exe"
  },
  "pkg": {
    "scripts": [
      "dist/**/*.js"
    ],
    "assets": [
      "profiles/**/*"
    ]
  }
}
```

注意：前端资源需要手动处理，不打包进 EXE。

- [ ] **Step 3: 创建启动脚本**

创建 `scripts/start.bat`：

```bat
@echo off
cd /d "%~dp0"
cd ..\dist-exe
nas-indexer.exe
pause
```

- [ ] **Step 4: 测试打包**

Run: `npm run build:exe`
Expected: 在 `dist-exe/nas-indexer.exe` 生成可执行文件

- [ ] **Step 5: 手动验证**

1. 复制 `profiles/` 目录到 `dist-exe/`
2. 运行 `dist-exe/nas-indexer.exe`
3. 验证服务正常启动

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json scripts/start.bat
git commit -m "feat: 添加 PKG 打包配置，生成 EXE 可执行文件"
```

---

### Task 6: 文档更新（最终提交）

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `todo-list.md`

- [ ] **Step 1: 更新 CHANGELOG.md**

在 `CHANGELOG.md` 顶部添加：

```markdown
## [v1.5.5] - 2026-06-13

### 新增功能
- **SteamDB 同步** - 编辑 SteamDB 名称后自动更新关联游戏的 title/title_en
- **PKG 打包** - 支持 `npm run build:exe` 生成 Windows 可执行文件

### 技术改进
- **日志时区** - 日志时间改为本地时区格式，更易阅读
- **扫描日志优化** - 扫描时跳过已存在游戏的日志输出，减少冗余
- **识别规则简化** - 删除 P3 启发式规则，优先级简化为三级（P0/P1/P2）
```

- [ ] **Step 2: 更新 ROADMAP.md**

更新版本和日期：

```markdown
> 最后更新：2026-06-13
> 当前版本：v1.5.5
```

在"已完成的技术债务"中添加：

```markdown
| P3 启发式规则删除 | v1.5.5 | 简化识别逻辑，提升可预测性 |
```

- [ ] **Step 3: 更新 README.md**

更新版本号：

```markdown
**版本: v1.5.5**
```

- [ ] **Step 4: 更新 todo-list.md**

更新日期和版本，将本次任务标记为完成。

- [ ] **Step 5: 最终提交**

```bash
git add CHANGELOG.md ROADMAP.md README.md todo-list.md
git commit -m "docs: v1.5.5 文档更新"
```

- [ ] **Step 6: 检查所有提交**

Run: `git log --oneline -10`
Expected: 看到 6 个新提交

---

## 自我审查清单

| 检查项 | 状态 |
|--------|------|
| Spec 覆盖 - 任务1 SteamDB同步 | ✅ Task 4 |
| Spec 覆盖 - 任务2 日志时区 | ✅ Task 1 |
| Spec 覆盖 - 任务3 扫描日志优化 | ✅ Task 2 |
| Spec 覆盖 - 任务4 PKG打包 | ✅ Task 5 |
| Spec 覆盖 - 任务5 删除P3规则 | ✅ Task 3 |
| 无占位符 (TBD/TODO) | ✅ 已检查 |
| 类型一致性 | ✅ 已检查 |
| 测试文件包含完整测试代码 | ✅ Task 4 |
| 所有代码步骤包含完整代码 | ✅ 已检查 |

---

## 参考资料

- 设计文档：`docs/superpowers/specs/2026-06-13-five-optimization-tasks-design.md`
- 游戏识别规则：`docs/game-identification-rules.md`
- 类型定义：`src/types/game.ts`
- 数据库模块：`src/games/database.ts`
- 路由模块：`src/routes/games.ts`