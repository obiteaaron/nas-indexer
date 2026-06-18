# 游戏自动分组功能设计

**日期：** 2026-06-19
**状态：** 设计已确认，待实现

## 问题背景

当前游戏分组功能存在以下问题：

1. **分组功能耦合在游戏路由中** - 所有分组相关的路由都在 `games.ts` 中，代码组织不够清晰
2. **缺少自动分组能力** - 用户需要手动创建分组并逐个添加游戏，对于"合集型"目录下的多个游戏，操作繁琐
3. **无法利用目录结构信息** - 游戏的 `source_path` 包含目录层级信息，但未能用于自动分组

## 设计目标

1. **将分组功能独立为单独模块** - 新建 `group-service.ts` 和 `game-groups.ts` 路由
2. **实现自动按目录分组** - 根据上一级目录自动识别并创建分组
3. **提供灵活的触发方式** - 扫描时自动执行 + 手动触发按钮
4. **可配置开关** - 用户可选择是否在扫描时自动分组

## 核心算法

### 分组逻辑

```
输入: 所有游戏的 source_path 列表 + 扫描根路径列表
输出: 自动创建/更新的分组

步骤:
1. 遍历所有游戏，提取每个游戏的 parent_directory (上一级目录)
2. 按 parent_directory 分组，统计每个目录下的游戏数量
3. 筛选出游戏数量 ≥ 2 的目录（"集合型"目录）
4. 过滤掉不符合条件的目录：
   - basename 为空或为根目录标识符（如 E:、/、\）
   - parent_directory 等于任一扫描根路径
5. 对于每个符合条件的目录：
   a. 分组名称 = 目录名 (basename)
   b. 检查是否存在同名分组
   c. 不存在 → 创建新分组，添加所有游戏
   d. 已存在 → 将未加入该分组的游戏添加进去（不重复添加）
```

### 示例

| 游戏 | source_path | parent_directory | 目录名 |
|------|-------------|------------------|--------|
| 游戏A | E:\Games\合集\游戏A | E:\Games\合集 | 合集 |
| 游戏B | E:\Games\合集\游戏B | E:\Games\合集 | 合集 |
| 游戏C | E:\Games\合集\游戏C | E:\Games\合集 | 合集 |
| 游戏D | E:\Games\单机\游戏D | E:\Games\单机 | 单机 |

**结果：**
- "合集" 目录有 3 个游戏 → 创建"合集"分组，添加游戏 A、B、C
- "单机" 目录只有 1 个游戏 → 不创建分组（不符合 ≥2 条件）

## 文件结构变更

### 新增文件

```
src/
├── games/
│   └── group-service.ts     # 分组业务逻辑层
│
├── routes/
│   └── game-groups.ts       # 分组专用路由
```

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `src/types/games-config.ts` | 新增 `autoGroupOnScan` 配置项 |
| `src/scanner.ts` | 扫描完成后调用自动分组（根据配置） |
| `src/routes/games.ts` | 移出分组相关路由 |
| `frontend/src/api/index.ts` | 新增/修改分组 API，适配新端点 |
| 前端分组相关组件 | 适配新 API 端点 |

## API 设计

### 端点变更

所有分组相关路由迁移到 `/game-groups`：

| 原端点 | 新端点 | 说明 |
|--------|--------|------|
| `GET /games/groups` | `GET /game-groups` | 获取所有分组 |
| `POST /games/groups` | `POST /game-groups` | 创建分组 |
| `POST /games/groups/update/:id` | `POST /game-groups/update/:id` | 更新分组 |
| `POST /games/groups/delete/:id` | `POST /game-groups/delete/:id` | 删除分组 |
| `POST /games/groups/reorder` | `POST /game-groups/reorder` | 重排序分组 |
| `GET /games/groups/:id/games` | `GET /game-groups/:id/games` | 获取分组内游戏 |
| `POST /games/groups/:id/games` | `POST /game-groups/:id/games` | 添加游戏到分组 |
| `POST /games/groups/:id/games/remove/:gameId` | `POST /game-groups/:id/games/remove/:gameId` | 移出游戏 |
| `POST /games/groups/:id/games/reorder` | `POST /game-groups/:id/games/reorder` | 重排序分组内游戏 |
| `GET /games/groups/:id/games/candidates` | `GET /game-groups/:id/games/candidates` | 获取可添加的游戏候选 |
| `GET /games/:id/groups` | `GET /game-groups/game/:gameId` | 获取单个游戏所属分组 |
| `POST /games/:id/groups` | `POST /game-groups/game/:gameId` | 设置单个游戏分组 |
| (新增) | `POST /game-groups/auto-group` | 手动触发自动分组 |

### 新增 API 返回结构

```typescript
interface AutoGroupResult {
  createdGroups: { name: string; gameCount: number }[];
  updatedGroups: { name: string; addedGames: number }[];
  totalGamesGrouped: number;
}
```

## 模块设计

### group-service.ts

```typescript
import { gameDatabase } from './database';
import path from 'path';

interface AutoGroupResult {
  createdGroups: { name: string; gameCount: number }[];
  updatedGroups: { name: string; addedGames: number }[];
  totalGamesGrouped: number;
}

class GroupService {
  /**
   * 自动按上一级目录分组
   * 仅针对"集合型"目录（≥2个游戏）
   * 跳过扫描根路径和根目录标识符
   */
  autoGroupByParentDirectory(scanRoots?: string[]): AutoGroupResult {
    // 1. 获取所有游戏路径
    const games = gameDatabase.getAllGamePaths();
    
    // 2. 获取扫描根路径（用于过滤）
    const roots = scanRoots || getScanRoots();
    const normalizedRoots = roots.map(r => path.resolve(r).replace(/\\/g, '/').toLowerCase());
    
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
    let addedCount = 0;
    for (const gameId of gameIds) {
      if (gameDatabase.addGroupGame(groupId, gameId)) {
        addedCount++;
      }
    }
    return addedCount;
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

### database.ts 新增方法

```typescript
// 获取所有游戏的路径（用于分组分析）
getAllGamePaths(): { id: number; source_path: string }[] {
  const result = database.db!.exec('SELECT id, source_path FROM games');
  if (result.length === 0) return [];
  return result[0].values.map(row => ({
    id: row[0] as number,
    source_path: row[1] as string
  }));
}

// 根据名称查找分组
getGroupByName(name: string): GameGroup | null {
  const result = database.db!.exec('SELECT * FROM game_groups WHERE name = ?', [name]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const cols = result[0].columns;
  const row = result[0].values[0];
  const group: Record<string, unknown> = {};
  cols.forEach((col, i) => { group[col] = row[i]; });
  return group as unknown as GameGroup;
}

// 批量添加游戏到分组（忽略已存在的，返回实际添加数量）
addGamesToGroup(groupId: number, gameIds: number[]): number {
  let addedCount = 0;
  for (const gameId of gameIds) {
    // 检查是否已存在
    const existing = database.db!.exec(
      'SELECT 1 FROM game_group_items WHERE group_id = ? AND game_id = ?',
      [groupId, gameId]
    );
    if (existing.length === 0 || existing[0].values.length === 0) {
      // 不存在则添加
      const maxResult = database.db!.exec(
        'SELECT MAX(sort_order) as max_order FROM game_group_items WHERE group_id = ?',
        [groupId]
      );
      const maxOrder = maxResult.length > 0 && maxResult[0].values[0][0]
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

## 配置项

### 新增配置

```typescript
// src/types/games-config.ts
export interface GameScrapeConfig {
  autoScrape: boolean;
  downloadPosters: boolean;
  scrapeOnIdentify: boolean;
  autoGroupOnScan: boolean;  // 新增：扫描时自动按目录分组
}

export const DEFAULT_GAME_SCRAPE: GameScrapeConfig = {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true,
  autoGroupOnScan: true  // 默认启用
};
```

### 前端配置 UI

在游戏设置页面新增：
- "扫描时自动按目录分组" checkbox

## 扫描流程集成

```typescript
// src/scanner.ts
import { groupService } from './games/group-service';
import { getGameConfig } from './games-config';

async function runGameScan(rootPath: string) {
  // ... 现有的扫描逻辑 ...
  
  // 扫描完成后，根据配置决定是否自动分组
  const config = getGameConfig();
  if (config.gamesScrape.autoGroupOnScan) {
    const result = groupService.autoGroupByParentDirectory();
    logger.info('自动分组完成: 创建 %d 个分组, 更新 %d 个分组, 共 %d 个游戏',
      result.createdGroups.length,
      result.updatedGroups.length,
      result.totalGamesGrouped
    );
  }
}
```

## 前端 API 适配

### api/index.ts

```typescript
// === 分组管理 ===
export function getGameGroups(): Promise<ApiResponse<GameGroup[]>> {
  return request<GameGroup[]>('/game-groups');
}

export function createGameGroup(name: string, pinned?: boolean): Promise<ApiResponse<GameGroup>> {
  clearCache('/game-groups');
  return request<GameGroup>('/game-groups', {
    method: 'POST',
    body: JSON.stringify({ name, pinned })
  });
}

export function updateGameGroup(id: number, data: { name?: string; pinned?: boolean }): Promise<ApiResponse<GameGroup>> {
  clearCache('/game-groups');
  return request<GameGroup>(`/game-groups/update/${id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function deleteGameGroup(id: number): Promise<ApiResponse<void>> {
  clearCache('/game-groups');
  return request<void>(`/game-groups/delete/${id}`, { method: 'POST' });
}

export function reorderGameGroups(items: { id: number; sort_order: number }[]): Promise<ApiResponse<GameGroup[]>> {
  clearCache('/game-groups');
  return request<GameGroup[]>('/game-groups/reorder', {
    method: 'POST',
    body: JSON.stringify({ items })
  });
}

// === 分组内游戏管理 ===
export function getGroupGames(groupId: number, options?: GameQueryOptions): Promise<ApiResponse<{ games: Game[]; total: number }>> {
  const params = buildQueryString(options);
  return request<{ games: Game[]; total: number }>(`/game-groups/${groupId}/games${params}`);
}

export function addGamesToGroup(groupId: number, gameIds: number[]): Promise<ApiResponse<void>> {
  clearCache('/game-groups');
  return request<void>(`/game-groups/${groupId}/games`, {
    method: 'POST',
    body: JSON.stringify({ game_ids: gameIds })
  });
}

export function removeGameFromGroup(groupId: number, gameId: number): Promise<ApiResponse<void>> {
  clearCache('/game-groups');
  return request<void>(`/game-groups/${groupId}/games/remove/${gameId}`, { method: 'POST' });
}

export function reorderGroupGames(groupId: number, items: { game_id: number; sort_order: number }[]): Promise<ApiResponse<Game[]>> {
  clearCache('/game-groups');
  return request<Game[]>(`/game-groups/${groupId}/games/reorder`, {
    method: 'POST',
    body: JSON.stringify({ items })
  });
}

export function getGamesNotInGroup(groupId: number): Promise<ApiResponse<Game[]>> {
  return request<Game[]>(`/game-groups/${groupId}/games/candidates`);
}

// === 自动分组 ===
export function autoGroupGames(): Promise<ApiResponse<AutoGroupResult>> {
  clearCache('/game-groups');
  return request<AutoGroupResult>('/game-groups/auto-group', { method: 'POST' });
}

// === 单个游戏的分组 ===
export function getGroupsForGame(gameId: number): Promise<ApiResponse<GameGroup[]>> {
  return request<GameGroup[]>(`/game-groups/game/${gameId}`);
}

export function setGameGroups(gameId: number, groupIds: number[]): Promise<ApiResponse<void>> {
  clearCache('/game-groups');
  return request<void>(`/game-groups/game/${gameId}`, {
    method: 'POST',
    body: JSON.stringify({ group_ids: groupIds })
  });
}
```

### 前端组件适配

需要修改以下组件，将 API 调用从 `/games/groups` 改为 `/game-groups`：

- `GameGroupManager.vue`
- `GameWallView.vue`
- 其他使用分组 API 的组件

## 用户交互流程

### 扫描时自动分组

1. 用户启动游戏扫描
2. 扫描完成后，检查 `autoGroupOnScan` 配置
3. 若启用，自动分析目录结构并创建/更新分组
4. 日志记录分组结果

### 手动触发分组

1. 用户在分组管理页面点击"自动按目录分组"按钮
2. 调用 `POST /game-groups/auto-group` API
3. 返回分组结果统计，显示 toast 通知

## 注意事项

### 数据一致性

- 自动分组不会删除现有分组
- 同名分组会追加游戏，不会覆盖
- 已存在于分组中的游戏不会重复添加

### 性能考虑

- `getAllGamePaths()` 只查询 id 和 path，轻量高效
- 使用 Map 进行分组计算，O(n) 时间复杂度
- 批量数据库操作在一次 save() 中完成

### 边缘情况

- Windows/Linux 路径分隔符：使用 `path.dirname()` 和 `path.basename()` 自动处理
- **根目录/扫描路径游戏**：跳过以下情况，不创建分组：
  - basename 为空字符串（如 `path.dirname('E:\Game')` 返回 `'E:\'`）
  - basename 为根目录标识符（如 `E:`、`/`、`\`）
  - parent_directory 等于扫描根路径（如扫描 `E:\Games`，则 `E:\Games` 下的直接子游戏不按 `E:\Games` 分组）
- 特殊字符目录名：正常处理，分组名称即为目录名

## 下一步

设计已确认，下一步将进入实现规划阶段。

1. 创建详细的实现计划
2. 分解任务、确定依赖关系
3. 开始实现