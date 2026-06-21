# 游戏自动按目录分组功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分组功能独立为单独模块，并实现自动按上一级目录分组功能

**Architecture:** 新建 `group-service.ts` 业务层 + `game-groups.ts` 路由，从 `games.ts` 迁移分组路由，在扫描流程中集成自动分组

**Tech Stack:** TypeScript, Express, SQLite, Vue 3

---

## 文件结构

### 新增文件
- `src/games/group-service.ts` - 分组业务逻辑层
- `src/routes/game-groups.ts` - 分组专用路由

### 修改文件
- `src/games/database.ts` - 新增 `getAllGamePaths()`, `getGroupByName()`, `addGamesToGroup()` 方法
- `src/types/game.ts` - 新增 `AutoGroupResult` 类型
- `src/types/games-config.ts` - 新增 `autoGroupOnScan` 配置项
- `src/server.ts` - 注册新路由，扫描后调用自动分组
- `src/routes/games.ts` - 移出分组相关路由（134-430行）
- `frontend/src/api/index.ts` - 适配新 API 端点
- `frontend/src/components/game/GameGroupManager.vue` - 适配新 API
- `frontend/src/components/game/GameGroupSidebar.vue` - 适配新 API

---

### Task 1: 新增类型定义

**Files:**
- Modify: `src/types/game.ts` (末尾新增)

- [ ] **Step 1: 在 game.ts 中添加 AutoGroupResult 类型**

```typescript
/**
 * 自动分组结果
 */
export interface AutoGroupResult {
  createdGroups: { name: string; gameCount: number }[];
  updatedGroups: { name: string; addedGames: number }[];
  totalGamesGrouped: number;
}
```

- [ ] **Step 2: 在 game.ts 中导出新类型**

在文件末尾确认 `AutoGroupResult` 已被导出（TypeScript 自动导出顶层声明）。

- [ ] **Step 3: Commit**

```bash
git add src/types/game.ts
git commit -m "feat(types): 新增 AutoGroupResult 类型定义"
```

---

### Task 2: 新增配置项

**Files:**
- Modify: `src/types/games-config.ts`

- [ ] **Step 1: 修改 GameScrapeConfig 接口**

找到 `src/types/game.ts` 中的 `GameScrapeConfig` 接口，添加新字段：

```typescript
export interface GameScrapeConfig {
  autoScrape: boolean;
  downloadPosters: boolean;
  scrapeOnIdentify: boolean;
  autoGroupOnScan: boolean;  // 新增：扫描时自动按目录分组
}
```

- [ ] **Step 2: 修改 DEFAULT_GAME_SCRAPE 默认值**

在 `src/types/game.ts` 中找到 `DEFAULT_GAME_SCRAPE`，添加新字段：

```typescript
export const DEFAULT_GAME_SCRAPE: GameScrapeConfig = {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true,
  autoGroupOnScan: true  // 默认启用
};
```

- [ ] **Step 3: 修改 GamesConfig 接口（games-config.ts）**

在 `src/types/games-config.ts` 中，`gamesScrape` 字段已经使用 `GameScrapeConfig` 类型，无需修改接口定义。

- [ ] **Step 4: 修改 DEFAULT_GAMES_CONFIG 默认值**

在 `src/types/games-config.ts` 的 `DEFAULT_GAMES_CONFIG` 中更新 `gamesScrape`：

```typescript
gamesScrape: {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true,
  autoGroupOnScan: true
},
```

- [ ] **Step 5: Commit**

```bash
git add src/types/game.ts src/types/games-config.ts
git commit -m "feat(config): 新增 autoGroupOnScan 配置项"
```

---

### Task 3: 数据库层新增方法

**Files:**
- Modify: `src/games/database.ts`

- [ ] **Step 1: 新增 getAllGamePaths 方法**

在 `GameDatabase` 类中添加方法（建议放在 `getStatistics()` 方法之前）：

```typescript
/**
 * 获取所有游戏的路径（用于分组分析）
 */
getAllGamePaths(): { id: number; source_path: string }[] {
  const result: QueryResult[] = database.db!.exec('SELECT id, source_path FROM games');
  if (result.length === 0) return [];
  return result[0].values.map(row => ({
    id: row[0] as number,
    source_path: row[1] as string
  }));
}
```

- [ ] **Step 2: 新增 getGroupByName 方法**

继续添加：

```typescript
/**
 * 根据名称查找分组
 */
getGroupByName(name: string): GameGroup | null {
  const result: QueryResult[] = database.db!.exec('SELECT * FROM game_groups WHERE name = ?', [name]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const cols = result[0].columns;
  const row = result[0].values[0];
  const group: Record<string, unknown> = {};
  cols.forEach((col, i) => { group[col] = row[i]; });
  return group as unknown as GameGroup;
}
```

- [ ] **Step 3: 新增 addGamesToGroup 方法**

继续添加（批量添加，忽略已存在的，返回实际添加数量）：

```typescript
/**
 * 批量添加游戏到分组（忽略已存在的，返回实际添加数量）
 */
addGamesToGroup(groupId: number, gameIds: number[]): number {
  let addedCount = 0;
  for (const gameId of gameIds) {
    // 检查是否已存在
    const existing: QueryResult[] = database.db!.exec(
      'SELECT 1 FROM game_group_items WHERE group_id = ? AND game_id = ?',
      [groupId, gameId]
    );
    if (existing.length === 0 || existing[0].values.length === 0) {
      // 不存在则添加
      const maxResult: QueryResult[] = database.db!.exec(
        'SELECT MAX(sort_order) as max_order FROM game_group_items WHERE group_id = ?',
        [groupId]
      );
      const maxOrder: number = maxResult.length > 0 && maxResult[0].values[0][0]
        ? (maxResult[0].values[0][0] as number)
        : 0;
      database.db!.run(
        'INSERT INTO game_group_items (group_id, game_id, sort_order) VALUES (?, ?, ?)',
        [groupId, gameId, maxOrder + 1]
      );
      addedCount++;
    }
  }
  if (addedCount > 0) {
    database.save();
  }
  return addedCount;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/games/database.ts
git commit -m "feat(database): 新增 getAllGamePaths, getGroupByName, addGamesToGroup 方法"
```

---

### Task 4: 新建分组业务层

**Files:**
- Create: `src/games/group-service.ts`

- [ ] **Step 1: 创建 group-service.ts 文件**

```typescript
/**
 * 分组业务逻辑层
 */

import path from 'path';
import { gameDatabase } from './database';
import { getGameScanPathsFromConfig } from '../games-config';
import { logger } from '../logger';
import type { GameGroup, Game, GameQueryOptions, AutoGroupResult } from '../types';

class GroupService {
  /**
   * 自动按上一级目录分组
   * 仅针对"集合型"目录（≥2个游戏）
   * 跳过扫描根路径和根目录标识符
   */
  autoGroupByParentDirectory(scanRoots?: string[]): AutoGroupResult {
    // 1. 获取所有游戏路径
    const games = gameDatabase.getAllGamePaths();
    
    if (games.length === 0) {
      return {
        createdGroups: [],
        updatedGroups: [],
        totalGamesGrouped: 0
      };
    }

    // 2. 获取扫描根路径（用于过滤）
    const roots = scanRoots || getGameScanPathsFromConfig();
    const normalizedRoots = roots.map(r => 
      path.resolve(r).replace(/\\/g, '/').toLowerCase()
    );

    // 3. 按 parent_directory 分组
    const dirMap = new Map<string, number[]>();
    for (const game of games) {
      const parentDir = path.dirname(game.source_path);
      const gameIds = dirMap.get(parentDir) || [];
      gameIds.push(game.id);
      dirMap.set(parentDir, gameIds);
    }

    // 4. 筛选符合条件的目录
    const result: AutoGroupResult = {
      createdGroups: [],
      updatedGroups: [],
      totalGamesGrouped: 0
    };

    for (const [dirPath, gameIds] of dirMap.entries()) {
      // 必须有 ≥2 个游戏
      if (gameIds.length < 2) continue;

      // 获取目录名
      const groupName = path.basename(dirPath);

      // 跳过空名称和根目录标识符
      if (!groupName || groupName.match(/^[A-Za-z]:$|^[/\\]$/)) continue;

      // 跳过扫描根路径
      const normalizedDir = path.resolve(dirPath).replace(/\\/g, '/').toLowerCase();
      if (normalizedRoots.includes(normalizedDir)) continue;

      // 创建或更新分组
      const existingGroup = gameDatabase.getGroupByName(groupName);

      if (existingGroup) {
        // 已存在同名分组，追加未加入的游戏
        const addedCount = gameDatabase.addGamesToGroup(existingGroup.id, gameIds);
        if (addedCount > 0) {
          result.updatedGroups.push({ name: groupName, addedGames: addedCount });
          result.totalGamesGrouped += addedCount;
        }
      } else {
        // 创建新分组
        const newGroup = gameDatabase.createGroup(groupName);
        if (newGroup) {
          gameDatabase.addGamesToGroup(newGroup.id, gameIds);
          result.createdGroups.push({ name: groupName, gameCount: gameIds.length });
          result.totalGamesGrouped += gameIds.length;
        }
      }
    }

    logger.info('自动分组完成: 创建 %d 个分组, 更新 %d 个分组, 共 %d 个游戏',
      result.createdGroups.length,
      result.updatedGroups.length,
      result.totalGamesGrouped
    );

    return result;
  }

  // === 分组管理方法（封装数据库操作） ===

  getGroups(): GameGroup[] {
    return gameDatabase.getGroups();
  }

  getGroupById(id: number): GameGroup | null {
    return gameDatabase.getGroupById(id);
  }

  createGroup(name: string, pinned: boolean = false): GameGroup | null {
    return gameDatabase.createGroup(name, pinned ? 1 : 0);
  }

  updateGroup(id: number, data: { name?: string; pinned?: boolean; sort_order?: number }): boolean {
    return gameDatabase.updateGroup(id, {
      name: data.name,
      pinned: data.pinned ? 1 : 0,
      sort_order: data.sort_order
    });
  }

  deleteGroup(id: number): boolean {
    return gameDatabase.deleteGroup(id);
  }

  reorderGroups(items: { id: number; sort_order: number }[]): void {
    gameDatabase.reorderGroups(items);
  }

  // === 分组内游戏管理 ===

  getGroupGames(groupId: number, options?: GameQueryOptions): { games: Game[]; total: number } {
    const games = gameDatabase.getGroupGames(groupId, options);
    const total = gameDatabase.getGroupGameCount(groupId, options);
    return { games, total };
  }

  addGamesToGroup(groupId: number, gameIds: number[]): number {
    return gameDatabase.addGamesToGroup(groupId, gameIds);
  }

  removeGameFromGroup(groupId: number, gameId: number): boolean {
    return gameDatabase.removeGroupGame(groupId, gameId);
  }

  reorderGroupGames(groupId: number, items: { game_id: number; sort_order: number }[]): void {
    gameDatabase.reorderGroupGames(groupId, items);
  }

  getGamesNotInGroup(groupId: number): Game[] {
    return gameDatabase.getGamesNotInGroup(groupId);
  }

  // === 单个游戏的分组 ===

  getGroupsForGame(gameId: number): GameGroup[] {
    return gameDatabase.getGroupsForGame(gameId);
  }

  setGameGroups(gameId: number, groupIds: number[]): void {
    gameDatabase.setGameGroups(gameId, groupIds);
  }
}

export const groupService = new GroupService();
```

- [ ] **Step 2: Commit**

```bash
git add src/games/group-service.ts
git commit -m "feat: 新建分组业务层 group-service.ts"
```

---

### Task 5: 新建分组专用路由

**Files:**
- Create: `src/routes/game-groups.ts`

- [ ] **Step 1: 创建 game-groups.ts 路由文件**

```typescript
/**
 * 游戏分组 API 路由（独立模块）
 */

import express, { Router, Request, Response } from 'express';
import { gameDatabase } from '../games/database';
import { groupService } from '../games/group-service';
import { logger } from '../logger';
import type { GameGroup, Game, GameQueryOptions } from '../types';

const router: Router = express.Router();

/**
 * 初始化游戏数据库（确保表已创建）
 */
async function initGameDatabase(): Promise<void> {
  await gameDatabase.init();
  gameDatabase.createGameTables();
}

/**
 * 获取所有分组
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const groups: GameGroup[] = groupService.getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建分组
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { name, pinned } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: '分组名称不能为空' });
      return;
    }
    const group: GameGroup | null = groupService.createGroup(name, pinned);
    if (!group) {
      res.status(400).json({ success: false, error: '创建分组失败' });
      return;
    }
    res.json({ success: true, data: group });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新分组
 */
router.post('/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.updateGroup(group.id, req.body);
    res.json({ success: true, data: groupService.getGroupById(group.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除分组
 */
router.post('/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.deleteGroup(group.id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分组排序
 */
router.post('/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { items }: { items: Array<{ id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    groupService.reorderGroups(items);
    res.json({ success: true, data: groupService.getGroups() });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取分组内游戏
 */
router.get('/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { genre, year, search, scraped, favorite, orderBy = 'title', orderDir = 'ASC', page = '1', pageSize = '50' } = req.query;
    const options: GameQueryOptions = {
      genre: genre as string,
      year: year as string,
      search: search as string,
      scraped: scraped as 'true' | 'false' | undefined,
      favorite: favorite as 'true' | 'false' | undefined,
      orderBy: orderBy as 'title' | 'rating' | 'release_date',
      orderDir: orderDir as 'ASC' | 'DESC',
      limit: parseInt(pageSize as string),
      offset: (parseInt(page as string) - 1) * parseInt(pageSize as string)
    };
    const { games, total } = groupService.getGroupGames(group.id, options);
    res.json({
      success: true,
      data: {
        games,
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加游戏到分组
 */
router.post('/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { game_ids }: { game_ids: number[] } = req.body;
    if (!game_ids || !Array.isArray(game_ids)) {
      res.status(400).json({ success: false, error: 'game_ids 必须为数组' });
      return;
    }
    const addedCount = groupService.addGamesToGroup(group.id, game_ids);
    res.json({ success: true, data: { addedCount, addedIds: game_ids } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 从分组移除游戏
 */
router.post('/:id/games/remove/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.removeGameFromGroup(group.id, parseInt(req.params.gameId as string));
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 组内游戏排序
 */
router.post('/:id/games/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { items }: { items: Array<{ game_id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    groupService.reorderGroupGames(group.id, items);
    res.json({ success: true, data: groupService.getGroupGames(group.id).games });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取不在分组中的游戏（用于添加弹窗的候选列表）
 */
router.get('/:id/games/candidates', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const games: Game[] = groupService.getGamesNotInGroup(group.id);
    res.json({ success: true, data: games });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个游戏所属的分组列表
 */
router.get('/game/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.gameId as string);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    // 验证游戏是否存在
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const groups: GameGroup[] = groupService.getGroupsForGame(gameId);
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    logger.error('获取游戏分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 设置游戏分组（覆盖式：移出所有分组，添加到指定分组）
 */
router.post('/game/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.gameId as string);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    // 验证游戏是否存在
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { group_ids } = req.body;
    if (!Array.isArray(group_ids)) {
      res.status(400).json({ success: false, error: 'group_ids 必须为数组' });
      return;
    }

    // 验证所有分组 ID 都存在
    const validGroupIds: number[] = [];
    for (const id of group_ids) {
      const numId = Number(id);
      if (!isNaN(numId)) {
        const group = groupService.getGroupById(numId);
        if (group) {
          validGroupIds.push(numId);
        }
      }
    }

    groupService.setGameGroups(gameId, validGroupIds);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('设置游戏分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动触发自动分组
 */
router.post('/auto-group', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { scanRoots } = req.body;
    const result = groupService.autoGroupByParentDirectory(scanRoots);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    logger.error('自动分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/game-groups.ts
git commit -m "feat: 新建分组专用路由 game-groups.ts"
```

---

### Task 6: 从 games.ts 移出分组路由

**Files:**
- Modify: `src/routes/games.ts`

- [ ] **Step 1: 移除分组路由代码**

删除以下路由（第 134-430 行中的分组相关部分）：
- `router.get('/groups', ...)` (第 134-143 行)
- `router.post('/groups', ...)` (第 148-166 行)
- `router.post('/groups/update/:id', ...)` (第 171-185 行)
- `router.post('/groups/delete/:id', ...)` (第 190-204 行)
- `router.post('/groups/reorder', ...)` (第 209-223 行)
- `router.get('/groups/:id/games', ...)` (第 228-264 行)
- `router.post('/groups/:id/games', ...)` (第 269-293 行)
- `router.post('/groups/:id/games/remove/:gameId', ...)` (第 298-312 行)
- `router.post('/groups/:id/games/reorder', ...)` (第 317-336 行)
- `router.get('/groups/:id/games/candidates', ...)` (第 341-355 行)
- `router.get('/:id/groups', ...)` (第 362-385 行)
- `router.post('/:id/groups', ...)` (第 390-431 行)

- [ ] **Step 2: 移除 GameGroup 类型导入（如有）**

检查文件顶部的 import，确保只保留游戏相关的类型导入。`GameGroup` 如果还在使用，可以移除。

- [ ] **Step 3: Commit**

```bash
git add src/routes/games.ts
git commit -m "refactor(routes): 从 games.ts 移出分组路由"
```

---

### Task 7: 注册新路由到 server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 导入新路由**

在路由导入区域（第 18-29 行后）添加：

```typescript
import gameGroupsRouter from './routes/game-groups';
```

- [ ] **Step 2: 注册路由**

在 API Routes 区域（第 133-144 行）添加：

```typescript
app.use('/api/game-groups', gameGroupsRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): 注册 game-groups 路由"
```

---

### Task 8: 扫描流程集成自动分组

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 导入 group-service**

在文件顶部导入区域添加：

```typescript
import { groupService } from './games/group-service';
```

- [ ] **Step 2: 在 runScan 函数中添加自动分组逻辑**

在 `runScan` 函数中，找到游戏识别完成后的位置（约第 81-98 行之间），在自动刮削完成后添加：

```typescript
// 自动分组（在刮削之后）
if (scrapeConfig.autoGroupOnScan && ids.length > 0) {
  if (onProgress) {
    onProgress({
      phase: 'grouping',
      pathIndex: 0,
      totalPaths: 1,
      progress: 99,
      path: '',
      message: '正在自动分组...'
    });
  }

  const groupResult = groupService.autoGroupByParentDirectory(config.scanPaths);
  logger.info('自动分组完成: 创建 %d 个分组, 更新 %d 个分组',
    groupResult.createdGroups.length,
    groupResult.updatedGroups.length
  );
}
```

插入位置：在 `scrapeUnscrapedGames` 调用之后，`catch` 块之前。

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat(scan): 扫描完成后自动按目录分组"
```

---

### Task 9: 前端 API 适配

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 修改分组 API 端点**

找到游戏分组 API 区域（第 496-570 行），修改以下函数：

```typescript
// === 游戏分组 API ===

export function getGameGroups(): Promise<ApiResponse<GameGroup[]>> {
  return cachedGet<GameGroup[]>('/game-groups')
}

export function createGameGroup(data: { name: string; pinned?: number }): Promise<ApiResponse<GameGroup>> {
  clearCache('/game-groups')
  return request<GameGroup>('/game-groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateGameGroup(id: number, data: { name?: string; pinned?: number; sort_order?: number }): Promise<ApiResponse<GameGroup>> {
  clearCache('/game-groups')
  return request<GameGroup>('/game-groups/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteGameGroup(id: number): Promise<ApiResponse<void>> {
  clearCache('/game-groups')
  return request<void>('/game-groups/delete/' + id, { method: 'POST' })
}

export function reorderGameGroups(items: Array<{ id: number; sort_order: number }>): Promise<ApiResponse<GameGroup[]>> {
  clearCache('/game-groups')
  return request<GameGroup[]>('/game-groups/reorder', { method: 'POST', body: JSON.stringify({ items }) })
}

export function getGroupGames(groupId: number, params: Record<string, string | number | undefined> = {}): Promise<ApiResponse<GamesResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<GamesResponse>('/game-groups/' + groupId + '/games?' + query)
}

export function addGamesToGroup(groupId: number, gameIds: number[]): Promise<ApiResponse<{ addedCount: number; addedIds: number[] }>> {
  clearCache('/game-groups')
  return request<{ addedCount: number; addedIds: number[] }>('/game-groups/' + groupId + '/games', {
    method: 'POST',
    body: JSON.stringify({ game_ids: gameIds })
  })
}

export function removeGameFromGroup(groupId: number, gameId: number): Promise<ApiResponse<void>> {
  clearCache('/game-groups')
  return request<void>('/game-groups/' + groupId + '/games/remove/' + gameId, { method: 'POST' })
}

export function reorderGroupGames(groupId: number, items: Array<{ game_id: number; sort_order: number }>): Promise<ApiResponse<Game[]>> {
  clearCache('/game-groups')
  return request<Game[]>('/game-groups/' + groupId + '/games/reorder', { method: 'POST', body: JSON.stringify({ items }) })
}

export function getGamesNotInGroup(groupId: number): Promise<ApiResponse<Game[]>> {
  return request<Game[]>('/game-groups/' + groupId + '/games/candidates')
}

export function getGameGroupsForGame(gameId: number): Promise<ApiResponse<GameGroup[]>> {
  return request<GameGroup[]>('/game-groups/game/' + gameId)
}

export function setGameGroups(gameId: number, groupIds: number[]): Promise<ApiResponse<void>> {
  clearCache('/game-groups')
  return request<void>('/game-groups/game/' + gameId, {
    method: 'POST',
    body: JSON.stringify({ group_ids: groupIds })
  })
}
```

- [ ] **Step 2: 新增自动分组 API**

在分组 API 区域末尾添加：

```typescript
/**
 * 手动触发自动按目录分组
 */
export function autoGroupGames(): Promise<ApiResponse<{
  createdGroups: { name: string; gameCount: number }[];
  updatedGroups: { name: string; addedGames: number }[];
  totalGamesGrouped: number;
}>> {
  clearCache('/game-groups')
  return request('/game-groups/auto-group', { method: 'POST' })
}
```

- [ ] **Step 3: 新增 AutoGroupResult 类型到前端 types**

在 `frontend/src/types/index.ts` 中添加：

```typescript
export interface AutoGroupResult {
  createdGroups: { name: string; gameCount: number }[];
  updatedGroups: { name: string; addedGames: number }[];
  totalGamesGrouped: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/index.ts frontend/src/types/index.ts
git commit -m "feat(frontend): 适配分组 API 新端点，新增自动分组 API"
```

---

### Task 10: 前端组件适配

**Files:**
- Modify: `frontend/src/components/game/GameGroupManager.vue`
- Modify: `frontend/src/components/game/GameGroupSidebar.vue`

- [ ] **Step 1: 检查 GameGroupManager.vue**

检查该组件中是否有直接调用 `/games/groups` 的代码，确认已通过 `api/index.ts` 的函数调用，API 层已适配。

- [ ] **Step 2: 检查 GameGroupSidebar.vue**

同上，确认 API 调用已通过 api 层。

- [ ] **Step 3: Commit（如有修改）**

```bash
git add frontend/src/components/game/
git commit -m "fix(frontend): 分组组件适配新 API 端点"
```

---

### Task 11: 前端配置 UI（可选）

**Files:**
- Modify: 游戏设置相关组件（需定位）

- [ ] **Step 1: 定位游戏设置组件**

查找游戏配置相关的 Vue 组件，确认是否有刮削配置的 UI 界面。

- [ ] **Step 2: 添加配置开关 UI**

在刮削配置区域添加：
- "扫描时自动按目录分组" checkbox
- 绑定到 `gamesScrape.autoGroupOnScan` 配置项

- [ ] **Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat(frontend): 新增自动分组配置开关 UI"
```

---

### Task 12: 验证与测试

**Files:**
- 无文件修改

- [ ] **Step 1: 编译后端**

```bash
cd D:/workspace-share/nas-indexer
npm run build
```

Expected: 编译成功，无错误

- [ ] **Step 2: 编译前端**

```bash
cd frontend
npm run build
```

Expected: 编译成功，无错误

- [ ] **Step 3: 启动服务器测试**

```bash
npm run dev
```

Expected: 服务器启动，访问 http://localhost:3000

- [ ] **Step 4: 手动测试分组功能**

1. 访问分组管理页面，测试：
   - 创建分组
   - 删除分组
   - 添加游戏到分组
   - 移出游戏
   
2. 测试自动分组 API：
   - POST `/api/game-groups/auto-group`
   - 检查返回结果是否正确

- [ ] **Step 5: Commit 最终版本**

```bash
git add -A
git commit -m "feat: 游戏自动按目录分组功能完成"
```

---

## Self-Review Checklist

### 1. Spec Coverage
- ✅ 自动分组核心算法实现 (Task 4)
- ✅ 配置项 autoGroupOnScan (Task 2)
- ✅ 扫描流程集成 (Task 8)
- ✅ 分组路由独立化 (Task 5, 6, 7)
- ✅ 前端 API 适配 (Task 9)
- ✅ 数据库方法新增 (Task 3)
- ✅ 类型定义 (Task 1)

### 2. Placeholder Scan
- 无 TBD、TODO 占位符

### 3. Type Consistency
- `AutoGroupResult` 类型在 `src/types/game.ts` 和 `frontend/src/types/index.ts` 中定义一致
- API 端点使用 `/game-groups`，前端 API 函数已适配