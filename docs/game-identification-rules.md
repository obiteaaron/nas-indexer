# 游戏识别规则配置说明

> 版本：v1.5.5
> 更新日期：2026-06-13

---

## 背景

v1.5.3移除了`game.json`本地元数据文件机制，改为集中存储。这导致游戏根目录识别失去了人工锚点。本方案通过多级优先级规则解决此问题。

**v1.5.5 更新**：
- 删除 P2 启发式规则，简化识别逻辑
- 保留 P0/P1/P2 三级优先级（原 P3 重命名为 P2）

---

## 三级识别优先级

| 优先级 | 方法 | 准确度 | 可配置 | 说明 |
|--------|------|--------|--------|------|
| **P0** | 手动标记 | ★★★★★ | ❌ | 用户明确指定根目录（最高优先级） |
| **P1** | Steam锚点 | ★★★★★ | ❌ | steam_appid.txt向上查找 |
| **P2** | 配置levelOffset | ★★★☆☆ | ✅ | 正则规则配置偏移（兜底） |

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
| API调用 | ✅ | `/api/games/:id/mark-root` |

**数据库标记**：
```sql
is_root_manually_marked = 1  -- 表示用户已确认
```

**识别流程检查**：
- 扫描时先检查 `is_root_manually_marked` 字段
- 如果为1，跳过P1/P2自动识别
- 保持用户指定路径不变

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

## P2: 配置levelOffset（兜底）

当P1未生效时，使用正则规则配置的`levelOffset`进行层级调整。

**配置位置**：`GameRecognitionRule.levelOffset`

**默认规则示例**：
```typescript
{ pattern: 'FitGirl.*Repack$', levelOffset: 1, description: 'FitGirl压缩包 → 父目录' }
```

**工作原理**：
- 正则规则匹配到路径后，获得基准目录
- 根据 `levelOffset` 配置向上提升层级
- 例如 `levelOffset=1` 表示从匹配目录向上提升一层

---

## 已删除的规则（v1.5.5）

以下启发式规则已删除，原因：识别逻辑不可预测，难以调试。

### ~~规则2.1：exe目录名匹配~~

**原逻辑**：当exe所在目录名与exe文件名相同，向上提升。

**删除原因**：不同打包者命名风格差异大，规则误判率高。

### ~~规则2.2：标准子目录层级偏移~~

**原逻辑**：匹配 Binaries/Win32/Data 等标准子目录，按配置偏移。

**删除原因**：字符串包含匹配易误触发（如 `GameData` 匹配 `Data`）。

### ~~规则2.3：目录大小启发~~

**原逻辑**：根据目录大小判断是否需要向上提升。

**删除原因**：大小计算性能开销大，阈值不适用于所有游戏类型。

---

## 配置方法

### 后端配置

**位置**：`src/types/game.ts`

**默认识别规则**：
```typescript
export const DEFAULT_RECOGNITION_RULES: GameRecognitionRule[] = [
  { pattern: '\\[GOG\\]$',           levelOffset: 0, enabled: true, description: 'GOG 版游戏' },
  { pattern: '\\[Steam\\]$',         levelOffset: 0, enabled: true, description: 'Steam 版游戏' },
  { pattern: '/steamapps/',          levelOffset: 0, enabled: true, description: 'Steam 游戏库目录' },
  { pattern: 'FitGirl.*Repack$',     levelOffset: 1, enabled: true, description: 'FitGirl压缩包 → 父目录' },
];
```

### 自定义规则

用户可在配置文件中添加自定义正则规则：

```json
{
  "gamesRules": {
    "recognitionRules": [
      { "pattern": "YourPattern$", "levelOffset": 1, "enabled": true, "description": "自定义规则" }
    ]
  }
}
```

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

### levelOffset测试

```bash
# 通过配置levelOffset=1识别
E:\Games\FitGirl Repack\
  └── setup.exe
```

**预期结果**：匹配规则 `FitGirl.*Repack$`，levelOffset=1 → 提升到父目录

---

## 调优建议

1. **Steam游戏为主** - P1已覆盖，无需调整
2. **非Steam游戏** - 通过正则规则 levelOffset 配置
3. **识别不准确** - 手动标记（P0）修正

---

## 参考资料

- 设计文档：`docs/superpowers/specs/2026-06-06-game-metadata-redesign.md`
- 实现文件：`src/games/identifier.ts`
- 类型定义：`src/types/game.ts`