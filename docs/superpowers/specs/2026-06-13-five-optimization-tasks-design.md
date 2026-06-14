# 五项优化任务设计文档

> 版本：v1.5.5
> 日期：2026-06-13
> 作者：Claude

---

## 概述

本文档定义了 nas-indexer v1.5.5 版本的五项优化任务设计方案。

---

## 任务清单

| # | 任务名称 | 优先级 | 改动范围 |
|---|----------|--------|---------|
| 1 | SteamDB → 游戏列表同步 | P1 | 后端 API + 数据库 |
| 2 | 日志本地时区 | P2 | 日志模块 |
| 3 | 扫描日志优化 | P3 | 游戏识别模块 |
| 4 | PKG 打包为 EXE | P2 | 构建配置 |
| 5 | 删除 P3 启发式规则 | P1 | 游戏识别 + 类型定义 |

---

## 任务 1：SteamDB → 游戏列表同步

### 背景

用户在 SteamDB 中编辑游戏名称（中文名/英文名）后，期望所有使用该 AppID 的游戏记录自动更新，保持数据一致性。

### 设计方案

**数据流**：
```
用户编辑 SteamDB → 后端 API → 更新 steam_db 表 → 查询关联游戏 → 批量更新 games 表
```

**API 修改**：

位置：`src/routes/games.ts` 第 1102-1129 行（`/steam-db/update/:id` 路由）

改动：在 `updateSteamDbEntry` 成功后，调用同步方法：
```typescript
// 更新 SteamDB
gameDatabase.updateSteamDbEntry(id, data);
const updated = gameDatabase.getSteamDbById(id);

// 新增：同步到关联游戏
if (updated && (data.name || data.name_en)) {
  const syncCount = gameDatabase.syncSteamDbToGames(
    updated.steam_appid,
    { name: data.name, name_en: data.name_en }
  );
  logger.info('SteamDB 同步: appid %s 更新了 %d 个游戏', updated.steam_appid, syncCount);
}
```

**数据库新增方法**：

位置：`src/games/database.ts`

方法签名：
```typescript
syncSteamDbToGames(steam_appid: string, updates: { name?: string; name_en?: string }): number
```

实现逻辑：
```typescript
syncSteamDbToGames(steam_appid: string, updates: { name?: string; name_en?: string }): number {
  const sql = 'UPDATE games SET title = ?, title_en = ? WHERE steam_appid = ?';
  const params = [
    updates.name || null,
    updates.name_en || null,
    steam_appid
  ];
  database.db!.run(sql, params);
  const changes = database.db!.exec('SELECT changes()');
  return changes[0]?.values[0]?.[0] as number || 0;
}
```

**错误处理**：

- SteamDB 更新失败 → 不触发同步
- 同步失败 → 记录 warn 日志，不影响 SteamDB 更新结果返回

**测试要点**：

1. 编辑 SteamDB，验证关联游戏是否更新
2. SteamDB 更新失败时，游戏不被修改
3. 无关联游戏时，同步返回 0

---

## 任务 2：日志本地时区

### 背景

当前日志使用 UTC 时间（`isoTime`），用户查看日志文件时不直观。

### 设计方案

**修改位置**：`src/logger.ts` 第 48 行

**改动**：

```typescript
// 当前代码
timestamp: pino.stdTimeFunctions.isoTime

// 修改为自定义本地时间函数
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

**输出效果**：

```json
// 修改前（UTC）
{"level":30,"time":"2026-06-13T07:30:00.000Z","msg":"扫描完成"}

// 修改后（本地时间，如北京时间）
{"level":30,"time":"2026-06-13 15:30:00","msg":"扫描完成"}
```

**注意事项**：

- 日志文件中不再是 ISO 8601 格式
- 多机器部署时，日志时间各自为本地时间（可接受）

---

## 任务 3：扫描日志优化

### 背景

扫描时，已存在的游戏也会打印日志，造成日志冗余。

### 设计方案

**修改位置**：`src/games/identifier.ts` 第 378-402 行

**改动逻辑**：

在 `matchRecognitionRule` 匹配成功后，添加存在性检查：

```typescript
const matchResult = matchRecognitionRule(entryPath, isFile, rules, scanRoot);
if (matchResult.matched && matchResult.gamePath) {
  const gamePath = matchResult.gamePath;
  const gamePathNormalized = path.resolve(gamePath);

  // 新增：检查是否已存在
  const existing = gameDatabase.getGameByPath(gamePathNormalized);
  if (existing) {
    // 已存在，只标记为已处理，不打印日志
    processedPaths.add(gamePathNormalized);
    processedPaths.add(normalizedPath);
    return games;  // 返回空数组
  }

  // 新游戏，继续原有流程并打印日志
  games.push(createGameRecord(gamePath));
  processedPaths.add(gamePathNormalized);
  processedPaths.add(normalizedPath);
  logger.info('识别游戏(正则匹配): %s [depth=%d]', path.basename(gamePath), depth);
  return games;
}
```

**效果对比**：

```log
// 修改前
识别游戏(正则匹配): Elden Ring [depth=2]
识别游戏(正则匹配): Minecraft [depth=1]
识别游戏(正则匹配): Elden Ring [depth=2]  ← 重复扫描时再次打印

// 修改后
识别游戏(正则匹配): Elden Ring [depth=2]
识别游戏(正则匹配): Minecraft [depth=1]
(第二次扫描时，已存在的游戏不打印)
```

---

## 任务 4：PKG 打包为 EXE

### 背景

用户希望将应用打包为独立 EXE，避免每次启动都编译。

### 设计方案

**步骤 1：安装依赖**

```bash
npm install pkg --save-dev
```

**步骤 2：编译流程**

PKG 打包前需要先编译 TypeScript：

```bash
npm run build          # 编译后端到 dist/
cd frontend && npm run build && cd ..  # 编译前端到 frontend/dist/
```

**步骤 3：package.json 新增脚本**

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
      "profiles/**/*",
      "frontend/dist/**/*"
    ]
  }
}
```

**步骤 4：输出**

打包后的文件结构：
```
dist-exe/
├── nas-indexer.exe    # 主程序
├── profiles/          # 数据目录（外部）
└── frontend/dist/     # 前端静态文件
```

**注意事项**：

1. **SQLite 数据库**：无法打包进 EXE，需要外部 `profiles/` 目录
2. **前端资源**：需要单独打包并放置在 `frontend/dist/`
3. **启动脚本**：创建 `start.bat` 配合 EXE 使用

**启动脚本示例**：

```bat
@echo off
cd dist-exe
nas-indexer.exe
pause
```

**分发方式**：

将 `dist-exe/` 目录打包为 ZIP 分发，用户解压后运行 `nas-indexer.exe`。

---

## 任务 5：删除 P3 启发式规则

### 背景

P3 启发式规则（exe目录名匹配、标准子目录偏移、目录大小启发）识别逻辑不可预测，用户希望删除。

### 设计方案

**修改范围**：

1. `src/games/identifier.ts` - 删除 `findHeuristicRoot` 函数中的三个规则
2. `src/types/game.ts` - 简化 `HeuristicRulesConfig` 类型

**identifier.ts 改动**：

删除 `findHeuristicRoot` 函数（第 75-161 行），或改为空函数：

```typescript
function findHeuristicRoot(
  initialGameDir: string,
  _matchedPath: string,
  _scanRoot: string,
  _heuristicRules: HeuristicRulesConfig
): string {
  // P3 已删除，直接返回初始目录
  return initialGameDir;
}
```

**smartLevelOffset 改动**（第 196-234 行）：

```typescript
function smartLevelOffset(
  initialGameDir: string,
  matchedPath: string,
  rule: GameRecognitionRule,
  scanRoot: string,
  heuristicRules: HeuristicRulesConfig
): string {
  // P1: Steam 锚点（保留）
  const steamRoot = findSteamAppidUpward(initialGameDir, scanRoot);
  if (steamRoot) {
    logger.info('[智能识别] P1成功 - steam_appid.txt锚点: %s', steamRoot);
    return steamRoot;
  }

  // P2 已删除（原 P3 启发式规则）

  // P3（原配置 levelOffset）：兜底
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

**types/game.ts 改动**：

将 `HeuristicRulesConfig` 类型简化为空（或保留但标记 deprecated）：

```typescript
/**
 * 启发式规则配置（已废弃，v1.5.5 删除 P3 规则）
 * @deprecated 保留类型定义以兼容配置文件
 */
export interface HeuristicRulesConfig {
  // 所有字段已废弃，不再生效
  exeNameMatchEnabled?: boolean;
  exeNameMatchOffset?: number;
  subdirRulesEnabled?: boolean;
  subdirPatterns?: Array<{
    patterns: string[];
    offset: number;
    description: string;
  }>;
  sizeHeuristicEnabled?: boolean;
  sizeThresholdMB?: number;
  sizeRatioThreshold?: number;
}
```

**优先级调整**：

删除后，识别优先级变为：
| 优先级 | 方法 | 说明 |
|--------|------|------|
| P0 | 手动标记 | 用户确认的目录（最高） |
| P1 | Steam 锚点 | steam_appid.txt 向上查找 |
| P2 | levelOffset | 配置的层级偏移（兜底） |

**文档更新**：

需要更新 `docs/game-identification-rules.md`，移除 P3 相关章节。

---

## 实现顺序

建议按以下顺序实现：

1. **任务 2**：日志时区（独立，无依赖）
2. **任务 3**：扫描日志优化（独立）
3. **任务 5**：删除 P3 规则（会影响识别行为）
4. **任务 1**：SteamDB 同步（数据库改动）
5. **任务 4**：PKG 打包（构建配置）

---

## 风险评估

| 任务 | 风险 | 缓解措施 |
|------|------|---------|
| 1 | SteamDB 更新影响多条游戏 | 仅更新 title/title_en，不影响其他字段 |
| 2 | 日志格式变化 | 仅影响日志文件，不影响功能 |
| 3 | 扫描结果可能遗漏 | 用户可通过 UI 查看完整列表 |
| 5 | 识别能力下降 | 用户可配置正则规则 levelOffset 补偿 |

---

## 测试计划

### 任务 1 测试

1. 创建 SteamDB 条目（appid: 123, name: "游戏A")
2. 创建游戏记录，steam_appid = 123
3. 编辑 SteamDB name 为 "游戏B"
4. 验证游戏 title 自动更新为 "游戏B"

### 任务 2 测试

1. 运行应用，查看日志文件
2. 验证时间格式为本地时间

### 任务 3 测试

1. 首次扫描，验证所有新游戏打印日志
2. 再次扫描，验证已存在游戏不打印日志

### 任务 4 测试

1. 执行 `npm run build:exe`
2. 运行 `nas-indexer.exe`
3. 验证功能正常

### 任务 5 测试

1. 扫描游戏目录
2. 验证识别结果不再受启发式规则影响
3. 验证 levelOffset 配置仍然生效

---

## 参考资料

- 游戏识别规则文档：`docs/game-identification-rules.md`
- 游戏模块设计：`docs/games-module-design.md`
- 类型定义：`src/types/game.ts`
- 识别模块：`src/games/identifier.ts`