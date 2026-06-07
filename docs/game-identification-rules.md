# 游戏识别规则配置说明

> 版本：v1.5.3
> 更新日期：2026-06-08

---

## 背景

v1.5.3移除了`game.json`本地元数据文件机制，改为集中存储。这导致游戏根目录识别失去了人工锚点。本方案通过多级优先级规则解决此问题。

**重要补充（v1.5.4设计）**：
- P0: 用户手动标记（最高优先级）
- P4: 批量识别后人工确认

---

## 五级识别优先级（完整设计）

| 优先级 | 方法 | 准确度 | 可配置 | 说明 |
|--------|------|--------|--------|------|
| **P0** | 手动标记 | ★★★★★ | ❌ | 用户明确指定根目录（最高优先级） |
| **P1** | Steam锚点 | ★★★★★ | ❌ | steam_appid.txt向上查找 |
| **P2** | 启发式规则 | ★★★★☆ | ✅ | 结构特征自动判断 |
| **P3** | 配置levelOffset | ★★★☆☆ | ✅ | 正则规则配置偏移 |
| **P4** | 人工确认 | ★★★★★ | ❌ | 批量识别后审查修正 |

---

## P0: 手动标记（最高优先级）

**说明**：
- 用户明确指定游戏根目录
- 优先级高于所有自动识别规则
- 标记后不会被自动识别覆盖

**触发方式**：
| 方式 | 自动标记 | 说明 |
|------|---------|------|
| 手动添加游戏 | ✅ | 创建时自动标记为已确认 |
| 提升游戏目录 | ✅ | 提升后自动标记为已确认 |
| 识别确认界面 | ✅ | 点击"确认"后标记 |
| API调用 | ✅ | `/api/games/:id/mark-root` |

**数据库标记**：
```sql
is_root_manually_marked = 1  -- 表示用户已确认
```

**识别流程检查**：
- 扫描时先检查 `is_root_manually_marked` 字段
- 如果为1，跳过P1/P2/P3自动识别
- 保持用户指定路径不变

**无法配置原因**：
- 这是用户决策，不应被配置覆盖
- 人工判断永远高于自动规则

---

## P1-P3: 自动识别规则

（内容保持不变，参见前文）

---

## P1: Steam锚点（固定启用）

**原理**：Steam游戏的`steam_appid.txt`文件通常位于游戏根目录。

**示例**：
```
E:\SteamLibrary\steamapps\common\Portal 2\
  ├── steam_appid.txt    ← 锚点文件
  ├── Binaries\
  │   └── portal2.exe    ← exe在子目录
  └── ...
```

**识别逻辑**：
- 正则匹配到exe → 识别结果：`Binaries\`
- P1向上查找steam_appid.txt → 修正结果：`Portal 2\`

**配置说明**：
- 此规则固定启用，无需配置
- 适用于所有Steam游戏

---

## P2: 启发式规则（可配置）

### 规则2.1：exe目录名匹配

**原理**：当exe所在目录名与exe文件名相同，通常需要向上提升。

**示例**：
```
E:\Games\Elden Ring\
  └── Elden Ring\        ← 目录名"Elden Ring"
      └── game.exe       ← exe文件名"game"（不匹配）
```

```
E:\Games\Minecraft\
  └── Minecraft\         ← 目录名"Minecraft"
      └── Minecraft.exe   ← exe文件名"Minecraft"（匹配！）
```

**配置项**：
```typescript
exeNameMatchEnabled: boolean;     // 是否启用（默认true）
exeNameMatchOffset: number;       // 向上提升层级（默认1）
```

### 规则2.2：标准子目录层级偏移

**原理**：游戏常使用标准子目录结构，识别后需向上提升。

**示例**：
```
E:\Games\The Witcher 3\
  └── Binaries\
      └── witcher3.exe   ← Binaries是标准子目录
```

**配置项**：
```typescript
subdirRulesEnabled: boolean;      // 是否启用（默认true）
subdirPatterns: Array<{
  patterns: string[];             // 目录名模式
  offset: number;                 // 层级偏移
  description: string;            // 说明
}>;
```

**默认配置**：
| 模式 | 层级偏移 | 说明 |
|------|---------|------|
| `Binaries, Binary, Bin, Win32, Win64` | 1 | 可执行文件标准子目录 |
| `Redist, Support, Common` | 1 | redistributable/support目录 |
| `Data, Assets, Resources` | 0 | 数据/资源目录（通常就是根目录） |

**自定义示例**：
```json
{
  "patterns": ["GOG", "NOCD"],
  "offset": 1,
  "description": "GOG版/破解版子目录"
}
```

### 规则2.3：目录大小启发

**原理**：游戏根目录通常较大（>1GB），子目录较小。

**示例**：
```
E:\Games\Cyberpunk 2077\
  ├── (总大小>50GB)       ← 根目录
  └── REDIST\
      └── setup.exe       ← exe所在目录<100MB
```

**配置项**：
```typescript
sizeHeuristicEnabled: boolean;    // 是否启用（默认true）
sizeThresholdMB: number;          // 小目录阈值（默认100MB）
sizeRatioThreshold: number;       // 父目录倍数阈值（默认5倍）
```

**识别逻辑**：
- 如果exe目录 < `sizeThresholdMB`，向上查找父目录
- 如果父目录 > exe目录 × `sizeRatioThreshold`，使用父目录作为根目录

---

## P3: 正则规则levelOffset（兜底）

当P1、P2都未生效时，使用正则规则配置的`levelOffset`。

**配置位置**：`GameRecognitionRule.levelOffset`

**默认规则示例**：
```typescript
{ pattern: 'FitGirl.*Repack$', levelOffset: 1, description: 'FitGirl压缩包 → 父目录' }
```

---

## 配置方法

### 后端配置

**位置**：`src/types/game.ts`

**修改默认配置**：
```typescript
export const DEFAULT_HEURISTIC_RULES: HeuristicRulesConfig = {
  exeNameMatchEnabled: true,
  exeNameMatchOffset: 1,
  
  subdirRulesEnabled: true,
  subdirPatterns: [
    // 自定义添加...
  ],
  
  sizeHeuristicEnabled: true,
  sizeThresholdMB: 100,
  sizeRatioThreshold: 5
};
```

### 用户配置（TODO）

**计划**：在设置界面添加游戏识别规则配置面板，允许用户：
- 启用/禁用各项启发式规则
- 自定义标准子目录模式
- 调整目录大小阈值

---

## 无法配置的部分

### Steam锚点规则

**原因**：`steam_appid.txt`是Steam平台的标准文件，位置固定，无需灵活性。

**限制**：
- 此规则固定启用
- 无法禁用
- 无参数可调

### 正则规则优先级

**原因**：正则规则按配置顺序执行，顺序影响识别结果。

**建议**：
- 高优先级规则放前面（如Steam相关规则）
- 通用规则放后面（如`/games/`）

---

## 测试建议

### Steam游戏测试

```bash
# 应自动通过P1识别
E:\SteamLibrary\steamapps\common\Portal 2\
  ├── steam_appid.txt
  └── Binaries\portal2.exe
```

**预期结果**：识别为`Portal 2\`（而非`Binaries\`）

### exe目录名匹配测试

```bash
# 应通过P2.1识别
E:\Games\Minecraft\
  └── Minecraft\Minecraft.exe
```

**预期结果**：识别为`Minecraft\`（而非`Minecraft\Minecraft\`）

### 标准子目录测试

```bash
# 应通过P2.2识别
E:\Games\The Witcher 3\
  └── Binaries\witcher3.exe
```

**预期结果**：识别为`The Witcher 3\`（而非`Binaries\`）

---

## 调优建议

1. **Steam游戏为主** - P1已覆盖，无需调整
2. **非Steam游戏** - 重点调优P2规则
3. **特殊结构游戏** - 添加自定义子目录模式到P2.2
4. **识别失败** - 检查P3 levelOffset是否合理

---

## 参考资料

- 设计文档：`docs/superpowers/specs/2026-06-06-game-metadata-redesign.md`
- 实现文件：`src/games/identifier.ts`
- 类型定义：`src/types/game.ts`