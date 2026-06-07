# P0手动优先级 - 正确实现方案

## 问题回顾

### 错误方案

```typescript
// ❌ 数据库字段标记
is_root_manually_marked = 1

// 扫描时的问题：
扫描器扫描文件系统 → 发现目录 → 无法知道对应哪个数据库记录
可能重复识别子目录
```

### 为什么game.json可以工作？

```text
game.json在文件系统中（可见）
扫描器扫描到game.json → 知道"这是根目录" → 不再向上或向下识别
```

**关键**：标记必须在文件系统中，扫描器才能看到！

---

## 正确方案：识别后确认机制

### 核心思路

用户决策不影响**扫描逻辑**，而是影响**结果保存**：

```
扫描流程（P1/P2/P3自动） → 识别结果列表 → 用户审查确认 → 保存到数据库（标记已确认）

下次扫描：
  检查数据库 → 已确认的游戏跳过重复识别（通过路径匹配）
```

---

## 实现流程

### 第一次扫描

```
1. 执行识别（P1/P2/P3）
2. 返回识别结果列表：
   [
     { suggested_path: "E:\Games\Elden Ring\Elden Ring\", confidence: "P2" }
   ]
3. 用户审查，调整为：
   { confirmed_path: "E:\Games\Elden Ring\" }
4. 保存到数据库 + 标记 is_root_manually_marked=1
```

### 第二次扫描

```typescript
function scanEntry(entryPath, ...) {
  // 检查此路径（或其子目录）是否已在数据库中被用户确认
  const existing = gameDatabase.getGameByPath(entryPath);
  
  if (existing && existing.is_root_manually_marked === 1) {
    // ✅ 已确认，跳过识别
    logger.debug('[P0] 用户已确认: %s', entryPath);
    processedPaths.add(entryPath);
    return [];  // 不添加新游戏
  }

  // 检查是否是已确认游戏的子目录
  const parentConfirmed = checkParentConfirmed(entryPath);
  if (parentConfirmed) {
    // ✅ 父目录已确认，跳过
    logger.debug('[P0] 父目录已确认，跳过子目录: %s', entryPath);
    processedPaths.add(entryPath);
    return [];
  }

  // P1/P2/P3自动识别...
}
```

### 关键函数：checkParentConfirmed

```typescript
function checkParentConfirmed(path: string): boolean {
  // 向上查找父目录，检查是否在数据库中且已确认
  let current = path;
  while (current !== path.dirname(current)) {
    const existing = gameDatabase.getGameByPath(current);
    if (existing && existing.is_root_manually_marked === 1) {
      return true;  // 找到已确认的父目录
    }
    current = path.dirname(current);
  }
  return false;
}
```

---

## 场景验证

### 场景1：用户确认后，扫描器发现子目录

```
用户确认：
  E:\Games\Elden Ring\  ← is_root_manually_marked=1

下次扫描发现：
  E:\Games\Elden Ring\Elden Ring\game.exe
  
扫描逻辑：
  checkParentConfirmed("E:\Games\Elden Ring\Elden Ring\")
  → 向上查找发现 "E:\Games\Elden Ring\" 在数据库中且已确认
  → 返回true
  
结果：
  跳过识别，不重复添加 ✅
```

### 场景2：用户提升目录后重新扫描

```
原识别：
  E:\Games\Elden Ring\Elden Ring\ (数据库记录)

用户提升：
  E:\Games\Elden Ring\
  标记：is_root_manually_marked=1
  
数据库更新：
  旧记录的source_path改为 "E:\Games\Elden Ring\"
  
下次扫描：
  发现 E:\Games\Elden Ring\Elden Ring\
  checkParentConfirmed → 找到父目录已确认
  跳过 ✅
```

### 场景3：手动添加游戏，父目录也被扫描

```
用户手动添加：
  E:\Games\Elden Ring\Elden Ring\  ← is_root_manually_marked=1
  
下次扫描：
  发现 E:\Games\Elden Ring\
  getGameByPath → 未找到（路径不匹配）
  
问题：
  父目录可能被识别为新游戏！❌
```

**解决方案**：checkChildConfirmed

```typescript
function checkChildConfirmed(path: string): boolean {
  // 检查数据库中是否有子目录已被用户确认
  // 查询：source_path LIKE 'parent_path/%' AND is_root_manually_marked=1
  const results = gameDatabase.getGamesByPathPrefix(path);
  return results.some(g => g.is_root_manually_marked === 1);
}

function scanEntry(entryPath, ...) {
  // 检查此目录是否有已确认的子目录
  if (checkChildConfirmed(entryPath)) {
    logger.debug('[P0] 子目录已确认，跳过父目录: %s', entryPath);
    processedPaths.add(entryPath);
    return [];
  }

  // 其他检查...
}
```

---

## 完整P0检查逻辑

```typescript
function scanEntry(entryPath, isFile, rules, processedPaths, depth, scanRoot) {
  const normalizedPath = path.resolve(entryPath);

  // === P0: 用户确认优先级检查 ===
  
  // 1. 此目录本身已被用户确认
  const existing = gameDatabase.getGameByPath(normalizedPath);
  if (existing && existing.is_root_manually_marked === 1) {
    logger.debug('[P0] 已确认: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // 2. 父目录已被用户确认（跳过子目录）
  if (!isFile && checkParentConfirmed(normalizedPath, scanRoot)) {
    logger.debug('[P0] 父目录已确认: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // 3. 子目录已被用户确认（跳过父目录）
  if (!isFile && checkChildConfirmed(normalizedPath)) {
    logger.debug('[P0] 子目录已确认: %s', normalizedPath);
    processedPaths.add(normalizedPath);
    return [];
  }

  // === P1/P2/P3自动识别 ===
  // ...
}

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

function checkChildConfirmed(parentPath: string): boolean {
  // 查询数据库中是否有此目录下的子目录已确认
  const results = database.db.exec(
    'SELECT id FROM games WHERE source_path LIKE ? AND is_root_manually_marked = 1',
    [parentPath.replace(/\\/g, '/') + '/%']
  );
  return results.length > 0 && results[0].values.length > 0;
}
```

---

## 需要新增的数据库方法

```typescript
// src/games/database.ts

getGamesByPathPrefix(prefix: string): Game[] {
  const normalizedPrefix = prefix.replace(/\\/g, '/');
  const result = database.db.exec(
    'SELECT * FROM games WHERE source_path LIKE ?',
    [normalizedPrefix + '/%']
  );
  return result[0]?.values.map(row => this.rowToGame(result[0], row)) || [];
}
```

---

## 前端确认界面（P4）

### 第一次识别

```vue
<template>
  <div class="identification-confirm">
    <h3>识别结果确认</h3>
    
    <div v-for="result in identificationResults">
      <div class="suggested-path">
        建议: {{ result.suggested_path }}
        <span class="confidence">{{ result.confidence }}</span>
      </div>
      
      <div class="path-adjust">
        <!-- 用户可调整 -->
        <button @click="moveUp(result)">⬆️ 向上提升</button>
        <button @click="moveDown(result)">⬇️ 向下选择</button>
        <input v-model="result.confirmed_path" />
      </div>
      
      <button @click="confirm(result)">✓ 确认</button>
      <button @click="exclude(result)">❌ 排除</button>
    </div>
    
    <button @click="confirmAll">批量确认</button>
  </div>
</template>
```

---

## 现有功能改造

### promoteGame

```typescript
// 当前实现
promoteGame(id: number) {
  const game = this.getGameById(id);
  const newPath = path.dirname(game.source_path);
  
  // 更新路径 + 标记为已确认
  this.updateGame(id, {
    source_path: newPath,
    is_root_manually_marked: 1  // ← 新增标记
  });
  
  logger.info('[提升] 目录提升并标记为已确认: %s', newPath);
}
```

### createManualGame

```typescript
// 当前实现
createManualGame(data) {
  // 创建游戏 + 标记为已确认
  database.db.run(
    'INSERT INTO games (..., is_root_manually_marked) VALUES (..., 1)',
    [...]
  );
  
  logger.info('[手动添加] 创建游戏并标记为已确认: %s', data.source_path);
}
```

---

## 总结

**正确的实现**：
- 数据库标记 `is_root_manually_marked`
- 扫描时通过**路径匹配**检查数据库：
  - 目录本身已确认 → 跳过
  - 父目录已确认 → 跳过子目录
  - 子目录已确认 → 跳过父目录

**用户决策如何生效**：
- 不是改变扫描逻辑，而是让扫描器**知道用户已确认哪些目录**
- 通过数据库路径查询实现匹配

**优先级**：
- P0是用户决策，扫描时通过数据库查询实现"优先跳过"
- P1/P2/P3只在未被确认的目录上生效