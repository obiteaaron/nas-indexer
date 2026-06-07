# 手动标记游戏根目录功能设计

> 日期：2026-06-08
> 版本：v1.5.4
> 状态：待实现

---

## 背景

当前游戏识别优先级：
- P1: Steam锚点（steam_appid.txt）
- P2: 启发式规则
- P3: 配置levelOffset

**缺失**：
- P0: 用户手动标记（最高优先级）
- P4: 识别后人工确认/修正

---

## 优先级重设计

| 优先级 | 方法 | 准确度 | 说明 |
|--------|------|--------|------|
| **P0** | 手动标记 | ★★★★★ | 用户明确指定根目录（最高） |
| **P1** | Steam锚点 | ★★★★★ | steam_appid.txt向上查找 |
| **P2** | 启发式规则 | ★★★★☆ | 结构特征自动判断 |
| **P3** | 配置levelOffset | ★★★☆☆ | 正则规则配置偏移 |
| **P4** | 人工确认 | ★★★★★ | 批量识别后人工审查修正 |

---

## P0: 手动标记功能

### 数据库改动

新增字段：
```sql
ALTER TABLE games ADD COLUMN is_root_manually_marked INTEGER DEFAULT 0;
```

### API设计

| API | 方法 | 说明 |
|-----|------|------|
| `/api/games/:id/mark-root` | POST | 手动标记当前目录为根目录 |
| `/api/games/:id/change-root` | POST | 更改游戏根目录到指定路径 |

### 请求示例

**标记当前目录为根目录**：
```json
POST /api/games/:id/mark-root
{
  "confirmed": true
}
```

**更改根目录到指定路径**：
```json
POST /api/games/:id/change-root
{
  "new_root": "E:\\Games\\Elden Ring"
}
```

### 实现逻辑

```typescript
function markGameRootManually(gameId: number, newRoot?: string): boolean {
  const game = gameDatabase.getGameById(gameId);
  if (!game) return false;

  // 如果未指定newRoot，使用当前source_path
  const confirmedRoot = newRoot || game.source_path;

  // 验证路径合法性
  if (!fs.existsSync(confirmedRoot)) {
    throw new Error('目录不存在');
  }

  // 更新数据库
  gameDatabase.updateGame(gameId, {
    source_path: confirmedRoot,
    is_root_manually_marked: 1,
    original_name: path.basename(confirmedRoot)
  });

  logger.info('[手动标记] 游戏根目录已确认: %s (id=%d)', confirmedRoot, gameId);
  return true;
}
```

---

## P4: 批量识别确认界面

### 功能流程

```
1. 执行游戏识别（自动：P1/P2/P3）
2. 展示识别结果列表
3. 用户审查每条结果：
   - 确认 ✓ (标记为 is_root_manually_marked=1)
   - 调整路径 ⬆️⬇️ (自由选择目录)
   - 排除 ❌ (标记为 is_excluded=1)
4. 保存确认结果
```

### 前端UI设计

```vue
<template>
  <div class="identification-results">
    <h3>识别结果确认（共 {{ results.length }} 个）</h3>
    
    <div class="result-list">
      <div v-for="result in results" class="result-item">
        <!-- 当前识别的路径 -->
        <div class="current-path">
          <span>{{ result.source_path }}</span>
          <span class="confidence">
            {{ result.confidence_level }} <!-- P1/P2/P3 -->
          </span>
        </div>

        <!-- 目录浏览/调整 -->
        <div class="path-adjust">
          <button @click="browseParent(result)">⬆️ 父目录</button>
          <button @click="browseSubdirs(result)">⬇️ 子目录</button>
          <input v-model="result.selected_path" placeholder="手动输入路径" />
        </div>

        <!-- 操作按钮 -->
        <div class="actions">
          <button @click="confirm(result)" class="btn-primary">
            ✓ 确认
          </button>
          <button @click="exclude(result)" class="btn-secondary">
            ❌ 排除
          </button>
        </div>
      </div>
    </div>

    <!-- 批量操作 -->
    <div class="batch-actions">
      <button @click="confirmAll()">全部确认</button>
      <button @click="reviewNext()">逐个审查</button>
    </div>
  </div>
</template>
```

### API设计

| API | 方法 | 说明 |
|-----|------|------|
| `/api/games/identify` | POST | 执行识别（返回结果列表） |
| `/api/games/batch-confirm` | POST | 批量确认识别结果 |
| `/api/games/:id/browse-parents` | GET | 获取父目录列表 |
| `/api/games/:id/browse-subdirs` | GET | 获取子目录列表 |

---

## 实现优先级

### 高优先级（必须实现）

1. **数据库字段** - `is_root_manually_marked`
2. **P0检查逻辑** - 识别时先检查此字段
3. **手动标记API** - `/api/games/:id/mark-root`

### 中优先级

4. **更改根目录API** - `/api/games/:id/change-root`
5. **目录浏览API** - 获取父目录/子目录列表

### 低优先级（后续优化）

6. **批量确认界面** - 完整的Vue组件
7. **置信度显示** - 显示P1/P2/P3来源
8. **历史记录** - 记录手动调整历史

---

## P0集成到识别流程

修改 `identifier.ts` 的 `scanEntry`：

```typescript
function scanEntry(entryPath, isFile, rules, processedPaths, depth, scanRoot) {
  const normalizedPath = path.resolve(entryPath);

  // === P0: 用户确认优先级检查 ===
  
  // 1. 此目录本身已被用户确认（路径精确匹配）
  const existing = gameDatabase.getGameByPath(normalizedPath);
  if (existing && existing.is_root_manually_marked === 1) {
    logger.debug('[P0] 已确认，跳过: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // 2. 父目录已被用户确认（向上查找匹配）
  if (!isFile && checkParentConfirmed(normalizedPath, scanRoot)) {
    logger.debug('[P0] 父目录已确认，跳过子目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // 3. 子目录已被用户确认（查询LIKE匹配）
  if (!isFile && checkChildConfirmed(normalizedPath)) {
    logger.debug('[P0] 子目录已确认，跳过父目录: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // === P1/P2/P3自动识别 ===
  // ...原有逻辑
}

// 向上查找已确认的父目录
function checkParentConfirmed(path: string, stopAt: string): boolean {
  let current = path.dirname(path);
  while (current !== stopAt && current !== path.dirname(current)) {
    const game = gameDatabase.getGameByPath(current);
    if (game && game.is_root_manually_marked === 1) {
      return true;
    }
    current = path.dirname(current);
  }
  return false;
}

// 查询是否有已确认的子目录
function checkChildConfirmed(parentPath: string): boolean {
  const results = database.db.exec(
    'SELECT id FROM games WHERE source_path LIKE ? AND is_root_manually_marked = 1',
    [parentPath.replace(/\\/g, '/') + '/%']
  );
  return results.length > 0 && results[0].values.length > 0;
}
```

**关键**：
- 通过数据库路径查询实现"已知用户决策"
- 三种匹配方式：精确匹配、向上查找、LIKE查询子目录
```

---

## 现有功能改造

### promoteGame 改造

当前：
- 只能向上提升1级
- 不标记为手动确认

改进：
```typescript
function promoteGame(id: number): boolean {
  const game = gameDatabase.getGameById(id);
  const parentPath = path.dirname(game.source_path);

  // 更新路径 + 标记为手动确认
  gameDatabase.updateGame(id, {
    source_path: parentPath,
    is_root_manually_marked: 1,  // 新增
    original_name: path.basename(parentPath)
  });
}
```

### createManualGame 改造

当前：
- 新添加的游戏

改进：
```typescript
function createManualGame(data): Game {
  // 创建游戏 + 标记为手动确认
  const game = {
    ...data,
    is_root_manually_marked: 1  // 新增
  };
  return gameDatabase.insertGame(game);
}
```

---

## 配置说明更新

在 `docs/game-identification-rules.md` 补充：

```markdown
## P0: 手动标记（最高优先级）

**说明**：
- 用户明确指定游戏根目录
- 优先级高于所有自动识别规则
- 标记后不会再被自动识别覆盖

**触发方式**：
1. 手动添加游戏（自动标记）
2. 提升游戏目录（自动标记）
3. 识别确认界面点击"确认"
4. API调用 `/api/games/:id/mark-root`

**数据库标记**：
- `is_root_manually_marked = 1` 表示用户已确认
- 此字段存在时，跳过P1/P2/P3自动识别

**无法配置原因**：
- 这是用户决策，不应被配置覆盖
- 人工判断永远高于自动规则
```

---

## 实现建议

### 第一阶段（核心功能）

1. 数据库字段迁移
2. promoteGame/createManualGame改造
3. P0检查逻辑集成

### 第二阶段（完整功能）

4. 手动标记API
5. 更改根目录API
6. 目录浏览API

### 第三阶段（用户界面）

7. 批量确认组件
8. 目录选择器组件

---

## 参考

- 当前识别逻辑：`src/games/identifier.ts`
- 数据库操作：`src/games/database.ts`
- 前端组件：`frontend/src/views/GameWallView.vue`