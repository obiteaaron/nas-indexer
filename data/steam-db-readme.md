# Steam 标准数据库

本文件是 NAS Indexer 的 Steam 游戏数据库标准格式，用于存储 Steam AppID 与游戏名称的映射关系，提升游戏识别的刮削成功率。

## 格式规范

- **格式**：JSON Lines（每行一个 JSON 对象）
- **编码**：UTF-8
- **排序**：按 name 中文拼音排序

## 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| steam_appid | string | ✓ | Steam AppID（唯一键） |
| name | string | ✓ | 中文名称（主名称） |
| name_en | string | | 英文名称 |
| aliases | string[] | | 别名数组（用于文件夹名映射） |
| release_date | string | | 发行日期 YYYY-MM-DD |
| genres | string[] | | 游戏类型 |
| rating | number | | Metacritic 评分 |
| developer | string | | 开发商 |
| publisher | string | | 发行商 |
| languages | string[] | | 支持语言 |
| short_description | string | | 游戏简介 |
| notes | string | | 备注 |
| source | string | ✓ | 来源标记：`community`（共建）、`manual`（手动）、`scraper`（刮削） |

## 数据示例

```jsonl
{"steam_appid":"1245620","name":"艾尔登法环","name_en":"Elden Ring","aliases":["ER","eldenring","艾尔登"],"release_date":"2022-02-25","genres":["动作","开放世界"],"rating":96,"developer":"FromSoftware","publisher":"万代南梦宫","source":"community"}
{"steam_appid":"1091500","name":"赛博朋克2077","name_en":"Cyberpunk 2077","aliases":["CP2077","cyberpunk"],"release_date":"2020-12-10","genres":["动作","FPS","开放世界"],"rating":91,"developer":"CD Projekt RED","publisher":"CD Projekt","source":"community"}
```

## 使用方式

### NAS Indexer 导入

1. 打开「设置」→「Steam 数据库」页面
2. 点击「导入」按钮
3. 上传 `.jsonl` 文件或粘贴 JSON 内容
4. 选择导入模式（合并/覆盖）
5. 确认导入

### 命令行导入

```bash
# 通过 API 导入
curl -X POST http://localhost:3000/api/steam-cache/import \
  -H "Content-Type: application/json" \
  -d @steam-db.jsonl
```

### 导出数据

1. 打开「设置」→「Steam 数据库」页面
2. 点击「导出标准数据库」按钮
3. 下载 `steam-db.jsonl` 文件

## 贡献方式

欢迎贡献数据，帮助提升游戏识别成功率：

1. Fork 本仓库
2. 在 `data/steam-db.jsonl` 中添加新游戏数据
3. 确保数据格式符合规范
4. 提交 PR，等待审核合并

### 贡献注意事项

- **steam_appid** 必须是真实的 Steam AppID（可在 SteamDB 查询）
- **name** 应使用官方中文译名（如有）
- **aliases** 添加常见的文件夹命名变体（如缩写、英文名等）
- **source** 使用 `community` 标记共建数据

## 数据来源

- `community` - 社区共建贡献
- `manual` - 用户手动添加
- `scraper` - Steam API 自动刮削
- `imported` - 从其他来源导入

---

**版本**: v1.0.0
**更新日期**: 2026-06-21