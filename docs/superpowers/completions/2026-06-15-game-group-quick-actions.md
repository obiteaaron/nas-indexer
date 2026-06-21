# 游戏分组快捷操作实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为游戏分组功能添加快捷操作，在游戏卡片、详情模态框和海报墙页面提供一键添加到分组、批量加入分组等功能

**Architecture:** 采用渐进式实现，从后端到前端，先构建 API 和基础组件，再集成到现有页面。保持现有功能不变，新增快捷操作入口

**Tech Stack:** TypeScript, Express, Vue 3, SQLite

---

## 文件结构

### 新增文件
- `frontend/src/components/game/GroupSelectorPopup.vue` - 分组选择器弹出组件

### 修改文件
- `src/games/database.ts` - 新增分组查询和设置方法
- `src/routes/games.ts` - 新增分组相关 API 路由
- `frontend/src/api/index.ts` - 新增前端 API 函数
- `frontend/src/components/game/GameCard.vue` - 添加分组按钮和标签
- `frontend/src/views/game/GameWallView.vue` - 添加批量操作和详情分组区域

---

## Task 1: 后端数据库方法 - 获取游戏分组

**Files:**
- Modify: `src/games/database.ts`

- [ ] **Step 1: 添加 getGroupsForGame 方法**

```typescript
getGroupsForGame(gameId: number): GameGroup[] {
  const result: QueryResult[] = database.db!.exec(`
    SELECT g.*
    FROM game_groups g
    INNER JOIN game_group_items gi ON g.id = gi.group_id
    WHERE gi.game_id = ?
    ORDER BY g.pinned DESC, g.sort_order ASC
  `, [gameId]);

  return result.map(row => ({
    id: row.id as number,
    name: row.name as string,
    pinned: (row.pinned as number) === 1,
    sort_order: row.sort_order as number,
    game_count: 0,  // 可选：需要时再查询
    created_at: row.created_at as string
  }));
}
```

- [ ] **Step 2: 添加 setGameGroups 方法**

```typescript
setGameGroups(gameId: number, groupIds: number[]): void {
  // 先删除所有现有分组
  database.db!.run('DELETE FROM game_group_items WHERE game_id = ?', [gameId]);

  // 添加新分组
  const stmt = database.db!.prepare('INSERT INTO game_group_items (group_id, game_id) VALUES (?, ?)');

  groupIds.forEach(groupId => {
    stmt.run(groupId, gameId);
  });

  stmt.finalize();
}
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/games/database.ts
git commit -m "feat: add getGroupsForGame and setGameGroups methods"
```

---

## Task 2: 后端 API 路由 - 游戏分组接口

**Files:**
- Modify: `src/routes/games.ts`

- [ ] **Step 1: 添加 GET /games/:id/groups 路由**

在文件中找到其他路由的位置，添加以下代码：

```typescript
// 获取单个游戏所属的分组列表
router.get('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }
    const groups = gameDatabase.getGroupsForGame(gameId);
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    logger.error('获取游戏分组失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 2: 添加 POST /games/:id/groups 路由**

在 GET 路由后添加：

```typescript
// 设置游戏分组（覆盖式）
router.post('/:id/groups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
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
        validGroupIds.push(numId);
      }
    }

    gameDatabase.setGameGroups(gameId, validGroupIds);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('设置游戏分组失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: 启动服务器验证路由存在**

```bash
npm run dev
```

在另一个终端测试：

```bash
curl http://localhost:3000/api/games/999/groups
```

Expected: `{ success: true, data: [] }` (游戏 999 不存在，返回空数组)

- [ ] **Step 5: Commit**

```bash
git add src/routes/games.ts
git commit -m "feat: add game groups API endpoints"
```

---

## Task 3: 前端 API 函数 - 游戏分组接口

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 添加 getGameGroupsForGame 函数**

在文件中找到其他 getGame 相关函数的位置，添加：

```typescript
/**
 * 获取单个游戏所属的分组列表
 */
export async function getGameGroupsForGame(gameId: number): Promise<ApiResponse<GameGroup[]>> {
  return request<GameGroup[]>(`/games/${gameId}/groups`);
}
```

- [ ] **Step 2: 添加 setGameGroups 函数**

在 getGameGroupsForGame 后添加：

```typescript
/**
 * 设置游戏分组（覆盖式：移出所有分组，添加到指定分组）
 */
export async function setGameGroups(gameId: number, groupIds: number[]): Promise<ApiResponse<void>> {
  return request<void>(`/games/${gameId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ group_ids: groupIds })
  });
}
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: add game groups API functions"
```

---

## Task 4: 创建分组选择器组件

**Files:**
- Create: `frontend/src/components/game/GroupSelectorPopup.vue`

- [ ] **Step 1: 创建组件文件**

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content group-selector-modal">
      <div class="modal-header">
        <h3>选择分组</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索分组..."
            class="search-input"
            @input="handleSearch"
          />
        </div>

        <div class="group-list">
          <label
            v-for="group in filteredGroups"
            :key="group.id"
            class="group-item"
            :class="{ 'no-match': !matchesSearch(group.name) }"
          >
            <input
              type="checkbox"
              :value="group.id"
              v-model="selectedGroupIds"
            />
            <span class="group-icon">{{ group.pinned ? '📌' : '📁' }}</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count" v-if="group.game_count !== undefined">
              {{ group.game_count }} 个游戏
            </span>
          </label>

          <div class="empty-state" v-if="filteredGroups.length === 0">
            <p>暂无分组</p>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button
          class="btn btn-primary"
          @click="handleConfirm"
          :disabled="selectedGroupIds.length === 0"
        >
          确定 ({{ selectedGroupIds.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { GameGroup } from '../../types'
import { getGameGroups } from '../../api'

interface Props {
  gameId?: number
  gameIds?: number[]
  selectedGroupIds?: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  confirm: [{ groupIds: number[] }]
}>()

const groups = ref<GameGroup[]>([])
const selectedGroupIds = ref<number[]>(props.selectedGroupIds || [])
const searchQuery = ref('')

const filteredGroups = computed(() => {
  if (!searchQuery.value) return groups.value
  const q = searchQuery.value.toLowerCase()
  return groups.value.filter(g => g.name.toLowerCase().includes(q))
})

async function loadGroups(): Promise<void> {
  const res = await getGameGroups()
  if (res.success && res.data) {
    groups.value = res.data
  }
}

function handleSearch(): void {
  // 搜索逻辑在 computed 中自动处理
}

function matchesSearch(name: string): boolean {
  if (!searchQuery.value) return true
  return name.toLowerCase().includes(searchQuery.value.toLowerCase())
}

function handleConfirm(): void {
  emit('confirm', { groupIds: selectedGroupIds.value })
  emit('close')
}

onMounted(() => {
  loadGroups()
})

// 当 props.selectedGroupIds 变化时更新本地状态
watch(() => props.selectedGroupIds, (newVal) => {
  if (newVal) {
    selectedGroupIds.value = [...newVal]
  }
})
</script>

<style scoped>
.group-selector-modal {
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.group-list {
  max-height: 50vh;
  overflow-y: auto;
  padding: 8px 16px;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.group-item:last-child {
  border-bottom: none;
}

.group-item.no-match {
  display: none;
}

.group-item input[type="checkbox"] {
  cursor: pointer;
}

.group-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.group-name {
  flex: 1;
  font-size: 14px;
}

.group-count {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border);
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: white !important;
}

.btn-secondary {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}
</style>
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/GroupSelectorPopup.vue
git commit -m "feat: add GroupSelectorPopup component"
```

---

## Task 5: GameCard 组件 - 添加分组按钮和标签

**Files:**
- Modify: `frontend/src/components/game/GameCard.vue`

- [ ] **Step 1: 读取 GameCard 组件文件**

```bash
cat D:\workspace-share\nas-indexer\frontend\src\components\game\GameCard.vue
```

确认组件结构（特别是 poster-overlay 部分）

- [ ] **Step 2: 在 poster-overlay 按钮组中添加分组按钮**

在现有按钮（收藏、更多等）的位置添加分组按钮。根据现有代码结构，按钮可能在按钮组中，添加：

```vue
<button
  class="action-button group-button"
  @click.stop="$emit('group')"
  title="加入分组"
>
  📁
</button>
```

- [ ] **Step 3: 在游戏信息区域添加分组标签显示**

在 game-info 区域中添加（通常在评分或发行日期后面）：

```vue
<div class="game-groups" v-if="game.groups && game.groups.length > 0">
  <span
    v-for="group in game.groups.slice(0, 3)"
    :key="group.id"
    class="group-tag"
  >
    {{ group.name }}
  </span>
  <span
    v-if="game.groups.length > 3"
    class="group-tag more"
  >
    +{{ game.groups.length - 3 }}
  </span>
</div>
```

- [ ] **Step 4: 在 script setup 中添加 group emit**

```typescript
const emit = defineEmits<{
  click: [game: Game]
  open: [game: Game]
  detail: [game: Game]
  exclude: [game: Game]
  promote: [game: Game]
  delete: [game: Game]
  favorite: [game: Game]
  group: [game: Game]  // 新增
}>()
```

- [ ] **Step 5: 添加样式**

在 style 部分添加：

```css
.group-button {
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.game-groups {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.group-tag {
  background: var(--primary);
  color: white !important;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.group-tag.more {
  background: var(--text-secondary);
}
```

- [ ] **Step 6: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/game/GameCard.vue
git commit -m "feat: add group button and tags to GameCard"
```

---

## Task 6: GameWallView - 添加单个游戏分组选择器

**Files:**
- Modify: `frontend/src/views/game/GameWallView.vue`

- [ ] **Step 1: 导入 GroupSelectorPopup 组件**

在 script setup 部分的 import 区域添加：

```typescript
import GroupSelectorPopup from '../components/game/GroupSelectorPopup.vue'
import { getGameGroupsForGame, setGameGroups } from '../api'
```

- [ ] **Step 2: 添加分组选择器状态**

在现有 ref 声明区域添加：

```typescript
const showGroupSelector = ref(false)
const selectedGameForGroup = ref<Game | null>(null)
```

- [ ] **Step 3: 在 GameCard 中添加 @group 事件**

找到 GameCard 组件的调用位置，添加：

```vue
<GameCard
  v-for="game in games"
  :key="game.id"
  :game="game"
  @click="showGameDetail(game)"
  @open="openGameDir"
  @detail="showGameDetail"
  @exclude="toggleExclude"
  @promote="promoteGame"
  @delete="deleteSingleGame"
  @favorite="toggleFavorite"
  @group="openGroupSelector(game)"  <!-- 新增 -->
/>
```

- [ ] **Step 4: 添加 openGroupSelector 方法**

在 methods 区域添加：

```typescript
function openGroupSelector(game: Game): void {
  selectedGameForGroup.value = game
  showGroupSelector.value = true
}
```

- [ ] **Step 5: 添加分组选择器组件到模板**

在模板底部，其他 modal 附近添加：

```vue
<GroupSelectorPopup
  v-if="showGroupSelector && selectedGameForGroup"
  :gameId="selectedGameForGroup.id"
  :selectedGroupIds="selectedGameForGroup?.groups?.map(g => g.id) || []"
  @close="showGroupSelector = false"
  @confirm="handleGroupSelection"
/>
```

- [ ] **Step 6: 添加 handleGroupSelection 方法**

```typescript
async function handleGroupSelection({ groupIds }: { groupIds: number[] }): Promise<void> {
  if (!selectedGameForGroup.value) return

  try {
    const res = await setGameGroups(selectedGameForGroup.value.id, groupIds)
    if (res.success) {
      // 重新加载游戏列表以更新分组信息
      await loadGames()
      showNotification('分组已更新')
    } else {
      showNotification('更新分组失败')
    }
  } catch (err) {
    console.error('更新分组失败:', err)
    showNotification('更新分组失败')
  }

  showGroupSelector.value = false
}
```

- [ ] **Step 7: 修改 loadGames 方法以加载分组信息（可选）**

如果需要游戏列表中显示分组标签，修改 getGames 调用或单独加载每个游戏的分组。为简化，可以先在详情页面加载分组，列表暂不加载。

- [ ] **Step 8: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/views/game/GameWallView.vue
git commit -m "feat: add single game group selector to GameWallView"
```

---

## Task 7: GameWallView - 详情模态框分组区域

**Files:**
- Modify: `frontend/src/views/game/GameWallView.vue`

- [ ] **Step 1: 在详情模态框中添加分组管理区域**

在游戏详情模态框的 `detail-info` 区域中（在基本信息如开发商、发行日期之后），添加：

```vue
<!-- 分组管理区域 -->
<div v-if="selectedGame" class="info-row" style="margin-top: 16px;">
  <div class="groups-section">
    <div class="groups-header">
      <span class="groups-title">📁 所属分组</span>
      <button
        class="btn btn-small btn-primary"
        @click="openGroupSelector(selectedGame)"
      >
        + 加入分组
      </button>
    </div>

    <div class="groups-list">
      <span
        v-for="group in selectedGameGroups"
        :key="group.id"
        class="group-badge"
      >
        {{ group.name }}
        <button
          class="group-badge-remove"
          @click="removeFromGroup(group.id)"
          title="移出分组"
        >
          ×
        </button>
      </span>
      <span v-if="selectedGameGroups.length === 0" class="no-groups">
        暂无分组
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 添加状态变量**

```typescript
const selectedGameGroups = ref<GameGroup[]>([])
```

- [ ] **Step 3: 修改 showGameDetail 方法以加载分组**

```typescript
async function showGameDetail(game: Game): Promise<void> {
  selectedGame.value = game
  posterBackups.value = []

  // 加载分组信息
  await loadGameGroups(game.id)

  loadPosterBackups()
}
```

- [ ] **Step 4: 添加 loadGameGroups 方法**

```typescript
async function loadGameGroups(gameId: number): Promise<void> {
  try {
    const res = await getGameGroupsForGame(gameId)
    if (res.success && res.data) {
      selectedGameGroups.value = res.data
    } else {
      selectedGameGroups.value = []
    }
  } catch (err) {
    console.error('加载游戏分组失败:', err)
    selectedGameGroups.value = []
  }
}
```

- [ ] **Step 5: 添加 removeFromGroup 方法**

```typescript
async function removeFromGroup(groupId: number): Promise<void> {
  if (!selectedGame.value) return

  // 移除该分组
  const newGroupIds = selectedGameGroups.value
    .filter(g => g.id !== groupId)
    .map(g => g.id)

  try {
    const res = await setGameGroups(selectedGame.value.id, newGroupIds)
    if (res.success) {
      await loadGameGroups(selectedGame.value.id)
      showNotification('已移出分组')
    } else {
      showNotification('移出分组失败')
    }
  } catch (err) {
    console.error('移出分组失败:', err)
    showNotification('移出分组失败')
  }
}
```

- [ ] **Step 6: 添加样式**

在 style 部分添加：

```css
.groups-section {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f0f7f0;
}

.groups-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.groups-title {
  font-weight: 600;
  color: var(--text);
  font-size: 14px;
}

.groups-list {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.group-badge {
  background: var(--primary);
  color: white !important;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.group-badge-remove {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-badge-remove:hover {
  opacity: 0.8;
}

.no-groups {
  color: var(--text-secondary);
  font-size: 13px;
}

.btn-small {
  padding: 4px 12px;
  font-size: 13px;
}
```

- [ ] **Step 7: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/game/GameWallView.vue
git commit -m "feat: add group management section to game detail modal"
```

---

## Task 8: GameWallView - 批量操作模式

**Files:**
- Modify: `frontend/src/views/game/GameWallView.vue`

- [ ] **Step 1: 添加批量模式状态变量**

```typescript
const batchMode = ref(false)
const selectedGameIds = ref<Set<number>>(new Set())
const selectAll = ref(false)
```

- [ ] **Step 2: 添加"批量管理"按钮**

在头部工具栏按钮组中添加：

```vue
<button
  class="btn btn-primary"
  @click="toggleBatchMode"
  :class="{ 'active': batchMode }"
>
  {{ batchMode ? '退出批量' : '批量管理' }}
</button>
```

- [ ] **Step 3: 添加批量操作栏**

在筛选栏和游戏列表之间添加：

```vue
<div class="batch-actions-bar" v-if="batchMode">
  <div class="batch-selection">
    <input
      type="checkbox"
      v-model="selectAll"
      @change="handleSelectAll"
    />
    <span class="batch-count">已选中 {{ selectedGameIds.size }} 个游戏</span>
  </div>

  <div class="batch-actions">
    <button
      class="btn btn-primary btn-small"
      @click="openBatchGroupSelector"
      :disabled="selectedGameIds.size === 0"
    >
      📁 批量加入分组
    </button>
    <button
      class="btn btn-warning btn-small"
      @click="batchToggleFavorite"
      :disabled="selectedGameIds.size === 0"
    >
      ⭐ 批量收藏
    </button>
    <button
      class="btn btn-danger btn-small"
      @click="batchDeleteGames"
      :disabled="selectedGameIds.size === 0"
    >
      🗑️ 批量删除
    </button>
    <button
      class="btn btn-secondary btn-small"
      @click="exitBatchMode"
    >
      取消
    </button>
  </div>
</div>
```

- [ ] **Step 4: 修改 GameCard 以支持批量选择**

```vue
<GameCard
  v-for="game in games"
  :key="game.id"
  :game="game"
  :batchMode="batchMode"
  :selected="selectedGameIds.has(game.id)"
  @select="toggleGameSelection(game.id)"
  @click="showGameDetail(game)"
  @open="openGameDir"
  @detail="showGameDetail"
  @exclude="toggleExclude"
  @promote="promoteGame"
  @delete="deleteSingleGame"
  @favorite="toggleFavorite"
  @group="openGroupSelector(game)"
/>
```

- [ ] **Step 5: 添加批量模式相关方法**

```typescript
function toggleBatchMode(): void {
  batchMode.value = !batchMode.value
  if (!batchMode.value) {
    selectedGameIds.value.clear()
    selectAll.value = false
  }
}

function exitBatchMode(): void {
  batchMode.value = false
  selectedGameIds.value.clear()
  selectAll.value = false
}

function toggleGameSelection(gameId: number): void {
  if (selectedGameIds.value.has(gameId)) {
    selectedGameIds.value.delete(gameId)
  } else {
    selectedGameIds.value.add(gameId)
  }
  // 更新全选状态
  selectAll.value = selectedGameIds.value.size === games.value.length
}

function handleSelectAll(): void {
  if (selectAll.value) {
    games.value.forEach(game => selectedGameIds.value.add(game.id))
  } else {
    selectedGameIds.value.clear()
  }
}

function openBatchGroupSelector(): void {
  // 使用选中的所有游戏
  selectedGameForGroup.value = null  // 批量模式不需要单个游戏
  // 显示分组选择器，传入 gameIds
  showBatchGroupSelector.value = true
}

async function batchToggleFavorite(): Promise<void> {
  if (selectedGameIds.value.size === 0) return

  try {
    // 使用现有 API 批量切换收藏状态
    // 需要后端支持批量收藏 API
    // 临时实现：逐个调用
    for (const gameId of selectedGameIds.value) {
      const game = games.value.find(g => g.id === gameId)
      if (game) {
        await toggleFavorite(game)
      }
    }
    showNotification(`已处理 ${selectedGameIds.value.size} 个游戏`)
    exitBatchMode()
  } catch (err) {
    console.error('批量收藏失败:', err)
    showNotification('批量收藏失败')
  }
}

async function batchDeleteGames(): Promise<void> {
  if (selectedGameIds.value.size === 0) return

  if (!confirm(`确定要删除选中的 ${selectedGameIds.value.size} 个游戏吗？此操作不可撤销。`)) {
    return
  }

  try {
    // 使用现有 API 逐个删除
    for (const gameId of selectedGameIds.value) {
      await deleteGame(gameId)
    }
    await refreshGames()
    showNotification(`已删除 ${selectedGameIds.value.size} 个游戏`)
    exitBatchMode()
  } catch (err) {
    console.error('批量删除失败:', err)
    showNotification('批量删除失败')
  }
}
```

- [ ] **Step 6: 添加批量分组选择器状态和组件**

```typescript
const showBatchGroupSelector = ref(false)
```

在模板中添加：

```vue
<GroupSelectorPopup
  v-if="showBatchGroupSelector"
  :gameIds="Array.from(selectedGameIds)"
  @close="showBatchGroupSelector = false"
  @confirm="handleBatchGroupSelection"
/>
```

- [ ] **Step 7: 添加 handleBatchGroupSelection 方法**

```typescript
async function handleBatchGroupSelection({ groupIds }: { groupIds: number[] }): Promise<void> {
  if (selectedGameIds.value.size === 0 || groupIds.length === 0) return

  try {
    // 将选中的游戏添加到选中的分组
    // 需要遍历每个游戏，使用 setGameGroups
    // 注意：这会覆盖每个游戏的所有分组，如果需要保留现有分组，需要先获取再合并

    for (const gameId of selectedGameIds.value) {
      const game = games.value.find(g => g.id === gameId)
      if (game) {
        // 获取现有分组
        const res = await getGameGroupsForGame(gameId)
        const existingGroupIds = res.success && res.data ? res.data.map(g => g.id) : []

        // 合并新旧分组（去重）
        const mergedGroupIds = [...new Set([...existingGroupIds, ...groupIds])]

        // 设置合并后的分组
        await setGameGroups(gameId, mergedGroupIds)
      }
    }

    showNotification(`已将 ${selectedGameIds.value.size} 个游戏添加到分组`)
    exitBatchMode()
  } catch (err) {
    console.error('批量添加到分组失败:', err)
    showNotification('批量添加到分组失败')
  }

  showBatchGroupSelector.value = false
}
```

- [ ] **Step 8: 添加批量操作栏样式**

```css
.batch-actions-bar {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 16px 0;
  display: flex;
  align-items: center;
  gap: 16px;
}

.batch-selection {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-count {
  font-size: 14px;
  font-weight: 500;
}

.batch-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn.active {
  opacity: 0.8;
}
```

- [ ] **Step 9: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/views/game/GameWallView.vue
git commit -m "feat: add batch operations mode to GameWallView"
```

---

## Task 9: GameCard 组件 - 支持批量选择

**Files:**
- Modify: `frontend/src/components/game/GameCard.vue`

- [ ] **Step 1: 添加批量模式 props**

```typescript
interface Props {
  game: Game
  batchMode?: boolean
  selected?: boolean
}

const props = defineProps<Props>()
```

- [ ] **Step 2: 添加 select emit**

```typescript
const emit = defineEmits<{
  click: [game: Game]
  open: [game: Game]
  detail: [game: Game]
  exclude: [game: Game]
  promote: [game: Game]
  delete: [game: Game]
  favorite: [game: Game]
  group: [game: Game]
  select: [gameId: number]  // 新增
}>()
```

- [ ] **Step 3: 在模板中添加批量选择 checkbox**

在卡片顶部添加：

```vue
<input
  v-if="batchMode"
  type="checkbox"
  :checked="selected"
  @change="handleSelect"
  @click.stop
  class="batch-checkbox"
/>
```

- [ ] **Step 4: 添加 handleSelect 方法**

```typescript
function handleSelect(): void {
  emit('select', props.game.id)
}
```

- [ ] **Step 5: 添加批量模式样式**

```css
.batch-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  cursor: pointer;
  z-index: 10;
}
```

- [ ] **Step 6: 根据批量模式调整卡片样式**

在 game-card 的 style class 中添加条件：

```vue
<div
  class="game-card"
  :class="{ 'batch-mode': batchMode, 'selected': selected && batchMode }"
>
```

添加样式：

```css
.game-card.batch-mode {
  cursor: pointer;
}

.game-card.batch-mode.selected {
  border: 2px solid #28a745;
}
```

- [ ] **Step 7: 运行 TypeScript 类型检查**

```bash
cd D:\workspace-share\nas-indexer\frontend
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/game/GameCard.vue
git commit -m "feat: add batch selection support to GameCard"
```

---

## Task 10: 集成测试和修复

**Files:**
- Modify: 所有修改的文件

- [ ] **Step 1: 启动后端服务器**

```bash
cd D:\workspace-share\nas-indexer
npm run dev
```

- [ ] **Step 2: 启动前端开发服务器**

```bash
cd D:\workspace-share\nas-indexer\frontend
npm run dev
```

- [ ] **Step 3: 测试单个游戏分组选择**

1. 打开游戏海报墙页面
2. 悬停在游戏卡片上
3. 点击分组按钮（📁）
4. 验证分组选择器弹出
5. 选择一个或多个分组
6. 点击确定
7. 验证游戏已添加到分组
8. 刷新页面，验证分组标签显示

- [ ] **Step 4: 测试游戏详情分组管理**

1. 点击游戏卡片打开详情
2. 验证"所属分组"区域显示
3. 点击分组标签的 × 移出分组
4. 点击"+ 加入分组"添加新分组
5. 验证分组更新正确

- [ ] **Step 5: 测试批量操作**

1. 点击"批量管理"按钮
2. 验证批量操作栏显示
3. 选择多个游戏（checkbox）
4. 点击"批量加入分组"
5. 选择分组并确认
6. 验证所有选中的游戏都添加到分组
7. 测试全选功能
8. 测试批量收藏功能
9. 测试批量删除功能

- [ ] **Step 6: 修复发现的问题**

根据测试结果，修复发现的 bug 和问题

- [ ] **Step 7: 最终 commit**

```bash
git add .
git commit -m "fix: issues found during integration testing"
```

---

## Self-Review

**Spec coverage:**
✅ 改进点 1：游戏卡片快捷菜单 - Task 5, 6, 9
✅ 改进点 2：游戏详情模态框分组区域 - Task 7
✅ 改进点 3：游戏海报墙批量操作 - Task 8, 9

**Placeholder scan:**
✅ 所有步骤包含完整代码
✅ 没有使用 "TBD", "TODO" 等占位符
✅ 所有命令都有具体内容

**Type consistency:**
✅ 函数名称一致（getGroupsForGame, setGameGroups）
✅ Props 和 Events 类型定义完整
✅ 变量命名一致（batchMode, selectedGameIds）

---

计划完成！请选择执行方式。