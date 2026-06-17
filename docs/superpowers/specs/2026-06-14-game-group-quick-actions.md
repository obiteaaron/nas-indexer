# 游戏分组快捷操作设计

**日期：** 2026-06-14
**状态：** 设计已确认，待实现

## 问题背景

当前游戏分组功能的操作路径过深，用户体验不佳：

1. **添加游戏到分组需要 5 步操作：**
   - 侧边栏 → 点击分组的"管理"按钮
   - 打开 GameGroupManager 模态框
   - 选择分组 → 点击"管理成员"按钮
   - 点击"添加游戏"按钮 → 打开二级模态框
   - 搜索游戏 → 多选游戏 → 点击"添加"

2. **批量操作效率低：**
   - 无法直接在游戏列表中批量添加分组
   - 需要先进入分组管理界面才能操作

## 设计目标

1. **直接在游戏卡片/详情上快速加入分组** - 一键操作，无需进入分组管理界面
2. **游戏海报墙支持批量操作** - 多选/全选游戏，批量加入分组

## 设计方案

采用组合方案，在三处位置添加分组快捷操作：

### 改进点 1：游戏卡片快捷菜单

**位置：** `frontend/src/components/game/GameCard.vue` - 游戏海报卡片组件

**设计：**

1. 卡片悬停时，右上角显示操作按钮组：
   - 收藏按钮（⭐） - 已有功能
   - 分组按钮（📁） - 新增，点击展开分组选择器
   - 更多按钮（⋯） - 下拉菜单：收藏、加入分组...、排除

2. 分组选择器弹出框：
   - 搜索框：快速筛选分组
   - 分组列表：多选分组（checkbox）
   - 支持一次性添加到多个分组
   - 显示当前游戏已加入的分组（默认勾选）

3. 卡片底部显示分组标签：
   - 已加入的分组以小标签形式显示
   - 标签样式：不同分组可使用不同颜色

**UI 示例：**

```
卡片悬停状态：
┌─────────────────────────┐
│   🎮 游戏海报            │
│                    ⭐📁⋯ │ ← 操作按钮
│                         │
├─────────────────────────┤
│ 游戏名称                 │
│ ⭐ 9.5  [动作RPG]        │ ← 分组标签
└─────────────────────────┘

点击"加入分组..."后弹出：
┌───────────────────┐
│ 选择分组           │
│ [搜索分组...]      │
│ ☑ 📁 动作RPG      │ ← 已加入
│ ☐ 📁 开放世界      │
│ ☐ 📌 已完成       │
│ ☐ 📁 待玩         │
│                   │
│ [取消] [确定]      │
└───────────────────┘
```

### 改进点 2：游戏详情模态框 - 分组区域

**位置：** `frontend/src/views/game/GameWallView.vue` - 游戏详情模态框和海报墙主页面

**设计：**

1. 在详情信息区域新增"所属分组"区块：
   - 位置：在基本信息（开发商、发行日期等）下方
   - 边框样式：绿色边框，突出分组管理功能

2. 分组标签显示：
   - 每个分组一个标签，带删除按钮（×）
   - 点击 × 可移出分组
   - 标签颜色：不同分组不同颜色

3. 操作按钮：
   - "+ 加入分组"按钮 - 点击弹出分组选择器
   - 选择器支持多选分组

**UI 示例：**

```
游戏详情模态框：
┌─────────────────────────────────────┐
│ 🎮 海报 │ 艾尔登法环                  │
│         │ Elden Ring                 │
│         │                            │
│         │ 开发商: FromSoftware        │
│         │ 发行日期: 2022-02-25        │
│         │ 评分: 9.0                   │
│         │                            │
│         │ ┌─────────────────────────┐│
│         │ │ 📁 所属分组              ││ ← 新增区域
│         │ │ [动作RPG ×] [开放世界 ×] ││
│         │ │ [+ 加入分组]             ││
│         │ └─────────────────────────┘│
│         │                            │
├─────────────────────────────────────┤
│ [打开目录] [搜索Steam] [编辑] [刮削] │
└─────────────────────────────────────┘
```

### 改进点 3：游戏海报墙批量操作

**位置：** `frontend/src/views/game/GameWallView.vue` - 游戏海报墙主页面

**设计：**

1. 头部工具栏新增"批量管理"按钮：
   - 位置：在现有按钮右侧
   - 样式：绿色按钮，突出显示
   - 点击进入批量管理模式

2. 批量模式下的 UI 变化：
   - 卡片左上角显示选择框（checkbox）
   - 已选卡片边框变绿色
   - 顶部显示批量操作栏（黄色背景）

3. 批量操作栏：
   - 显示"已选中 X 个游戏"
   - 全选 checkbox
   - 操作按钮：
     - "批量加入分组"（绿色）
     - "批量收藏"（橙色）
     - "批量删除"（红色）
     - "取消"（退出批量模式）

4. 分组选择器：
   - 点击"批量加入分组"弹出分组选择器
   - 支持多选分组
   - 将所有选中的游戏添加到选中的分组

**UI 示例：**

```
批量模式：

头部：
┌───────────────────────────────────────────────┐
│ 游戏海报墙  [刷新] [手动添加] [批量管理]       │ ← 绿色按钮
└───────────────────────────────────────────────┘

批量操作栏：
┌───────────────────────────────────────────────┐
│ ☑ 已选中 3 个游戏                             │
│                                               │
│ [批量加入分组] [批量收藏] [批量删除] [取消]   │
└───────────────────────────────────────────────┘

卡片网格（左上角 checkbox）：
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│☑      │ │☑      │ │☑      │ │☐      │
│ 🎮    │ │ 🎮    │ │ 🎮    │ │ 🎮    │
│游戏1  │ │游戏2  │ │游戏3  │ │游戏4  │
└───────┘ └───────┘ └───────┘ └───────┘
 ↑绿色边框                      ↑普通边框
```

## 技术实现要点

### 1. 新组件

**GroupSelectorPopup.vue** - 分组选择器弹出组件

- Props：
  - `gameId?: number` - 单个游戏 ID（单个游戏操作时使用）
  - `gameIds?: number[]` - 多个游戏 ID（批量操作时使用）
  - `selectedGroupIds?: number[]` - 已加入的分组 ID（默认勾选）

- Events：
  - `close` - 关闭选择器
  - `confirm` - 确认选择，返回 `{ groupIds: number[] }`

- 功能：
  - 搜索框：快速筛选分组
  - 分组列表：多选分组（checkbox）
  - 显示分组图标（📌置顶 / 📁普通）
  - 显示分组游戏数量
  - 默认勾选已加入的分组

- 样式：
  - 固定宽度，居中显示
  - 最大高度，超出滚动
  - 绿色主色调，与其他分组操作保持一致

### 2. 现有组件修改

**GameCard.vue**

- 新增：
  - 分组按钮（📁）在悬停时显示
  - 卡片底部显示分组标签
  - `@group` 事件

**GameWallView.vue**

- 新增：
  - 批量管理模式状态（`batchMode`, `selectedGameIds`）
  - 头部"批量管理"按钮
  - 批量操作栏
  - 分组选择器集成

- 游戏详情模态框：
  - 分组管理区域
  - 分组标签显示（带删除按钮）
  - 加入/移出分组功能

**GameGroupManager.vue**

- 无需修改（保持现有功能）

### 3. API 调用

**现有 API（已支持）：**
- `getGameGroups()` - 获取所有分组
- `addGamesToGroup(groupId, gameIds)` - 添加游戏到分组
- `removeGameFromGroup(groupId, gameId)` - 移出分组

**需要新增的 API：**

#### 前端 API 函数（`frontend/src/api/index.ts`）
```typescript
// 获取单个游戏所属的分组列表
export function getGameGroupsForGame(gameId: number): Promise<ApiResponse<GameGroup[]>>

// 批量设置游戏分组（添加到多个分组，可选：移出其他分组）
export function setGameGroups(gameId: number, groupIds: number[]): Promise<ApiResponse<void>>
```

#### 后端路由（`src/routes/games.ts`）
```typescript
// 获取单个游戏所属的分组列表
router.get('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  // 返回游戏所属的所有分组
});

// 设置游戏分组（覆盖式：设置为指定分组）
router.post('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  // 移出所有分组，然后添加到指定分组
});
```

### 4. 状态管理

- 批量模式状态：
  - `batchMode: boolean` - 是否处于批量模式
  - `selectedGameIds: number[]` - 已选中的游戏 ID

- 分组选择器状态：
  - 传入游戏 ID（单个或多个）
  - 选中分组 ID

## 用户交互流程

### 单个游戏快速加入分组

1. 用户悬停游戏卡片
2. 显示操作按钮（⭐📁⋯）
3. 点击分组按钮或下拉菜单"加入分组..."
4. 弹出分组选择器
5. 多选分组，点击确定
6. 游戏添加到选中的分组，卡片底部显示分组标签

### 游戏详情中管理分组

1. 用户点击游戏卡片，打开详情模态框
2. 查看游戏所属分组
3. 点击分组标签的 × 移出分组
4. 点击"+ 加入分组"，弹出选择器添加新分组

### 批量加入分组

1. 用户点击"批量管理"按钮，进入批量模式
2. 卡片左上角显示 checkbox
3. 用户多选/全选游戏
4. 点击"批量加入分组"
5. 弹出分组选择器
6. 多选分组，点击确定
7. 所有选中的游戏添加到选中的分组
8. 点击"取消"退出批量模式

## 设计考虑

### 1. 性能考虑

- 分组选择器使用虚拟滚动（分组数量大时）
- 批量操作使用批量 API，避免逐个请求
- 卡片悬停显示按钮使用 CSS transition，避免频繁 DOM 操作

### 2. 用户体验

- 操作路径从 5 步缩短到 2 步（单个游戏）
- 批量操作直观，无需进入分组管理界面
- 分组选择器支持搜索，快速定位分组
- 显示已加入的分组，避免重复添加

### 3. 兼容性

- 保持现有分组管理功能（GameGroupManager）不变
- 新功能为快捷操作，不替代现有功能
- 用户可选择使用快捷操作或完整管理界面

## 文件修改清单

### 新增文件

**前端组件：**
- `frontend/src/components/game/GroupSelectorPopup.vue` - 分组选择器弹出组件

### 修改文件

**前端组件：**
- `frontend/src/components/game/GameCard.vue`
  - 添加分组按钮（📁）在悬停操作按钮组中
  - 卡片底部显示分组标签区域
  - 添加 `@group` 事件

- `frontend/src/views/game/GameWallView.vue`
  - 添加批量管理模式状态（`batchMode`, `selectedGameIds`）
  - 头部工具栏添加"批量管理"按钮
  - 添加批量操作栏（全选、批量加入分组、批量收藏、批量删除、取消）
  - 游戏详情模态框添加分组管理区域
  - 集成 GroupSelectorPopup 组件

**前端 API：**
- `frontend/src/api/index.ts`
  - 新增 `getGameGroupsForGame(gameId)` 函数
  - 新增 `setGameGroups(gameId, groupIds)` 函数

**后端路由：**
- `src/routes/games.ts`
  - 新增 `GET /games/:id/groups` 路由
  - 新增 `POST /games/:id/groups` 路由

**后端数据库（可选）：**
- `src/games/database.ts`
  - 新增 `getGroupsForGame(gameId)` 方法
  - 新增 `setGameGroups(gameId, groupIds)` 方法

### 新增类型定义（如需要）

如果 `Game` 类型中需要添加分组相关字段，在 `src/types/game.ts` 中补充：
```typescript
interface Game {
  // ... 现有字段

  // 可选：添加分组缓存字段（避免每次查询数据库）
  groups?: GameGroup[];  // 所属分组列表
}
```

## 下一步

设计已确认，下一步将进入实现规划阶段：

1. 创建详细的实现计划
2. 分解任务、确定依赖关系
3. 开始实现

---

## 实现注意事项

### 数据结构考虑

**Game 类型是否需要缓存分组信息？**

**方案 A：每次查询数据库（推荐）**
- 优点：数据始终最新，无缓存一致性问题
- 缺点：频繁查询数据库
- 适用：分组操作不频繁的场景

**方案 B：在 Game 类型中缓存分组**
- 优点：减少数据库查询
- 缺点：需要保证缓存一致性
- 适用：分组操作频繁，且可以接受轻微延迟

**建议：先实现方案 A，性能有问题再考虑优化**

### 后端 API 实现

**GET /games/:id/groups**
```typescript
router.get('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id);
    const groups = gameDatabase.getGroupsForGame(gameId);
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**POST /games/:id/groups**
```typescript
router.post('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id);
    const { group_ids } = req.body;
    if (!Array.isArray(group_ids)) {
      res.status(400).json({ success: false, error: 'group_ids 必须为数组' });
      return;
    }
    gameDatabase.setGameGroups(gameId, group_ids);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 前端 API 实现

```typescript
// 获取单个游戏所属的分组列表
export async function getGameGroupsForGame(gameId: number): Promise<ApiResponse<GameGroup[]>> {
  return request<GameGroup[]>(`/games/${gameId}/groups`);
}

// 设置游戏分组（覆盖式）
export async function setGameGroups(gameId: number, groupIds: number[]): Promise<ApiResponse<void>> {
  clearCache('/games');
  return request<void>(`/games/${gameId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ group_ids: groupIds })
  });
}
```

### 组件交互设计

**GameCard.vue 悬停按钮位置**
- 现有按钮在 `poster-overlay` 中，位于海报底部
- 保持现有布局，在现有按钮组中添加分组按钮

**GameCard.vue 分组标签显示**
- 在 `game-info` 区域添加 `game-groups` div
- 显示已加入的分组标签（最多显示 3 个，超出显示 "+N"）

**批量模式下的卡片样式**
- 批量模式时，卡片左上角添加 checkbox
- 已选卡片边框变为绿色（`border: 2px solid #28a745`）
- 未选卡片保持原有样式

### 错误处理

**API 调用失败**
- 显示 toast 通知
- 批量操作失败时，不中断其他操作，记录失败的游戏

**数据一致性**
- 添加/移出分组后，重新加载分组列表
- 游戏详情中移出分组后，实时更新显示
- 卡片标签在操作后立即更新（乐观更新）

### 性能优化

**分组选择器**
- 如果分组数量超过 50 个，考虑虚拟滚动
- 使用防抖处理搜索输入

**批量操作**
- 限制单次批量操作的游戏数量（建议最多 100 个）
- 使用 Promise.all 并发调用 API

**缓存策略**
- 游戏列表中不加载分组信息，避免过度查询
- 详情模态框中按需加载分组信息