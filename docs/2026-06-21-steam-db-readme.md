# Steam 标准数据库格式说明

NAS Indexer Steam 数据库标准格式，用于存储 Steam AppID 与游戏名称映射关系。

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
| source | string | ✓ | 来源标记：`community`、`manual`、`scraper`、`imported` |

## 数据示例

```jsonl
{"steam_appid":"1245620","name":"艾尔登法环","name_en":"Elden Ring","aliases":["ER","eldenring"],"release_date":"2022-02-25","genres":["动作","开放世界"],"rating":96,"developer":"FromSoftware","publisher":"万代南梦宫","source":"community"}
{"steam_appid":"1091500","name":"赛博朋克2077","name_en":"Cyberpunk 2077","aliases":["CP2077"],"release_date":"2020-12-10","genres":["动作","FPS"],"rating":91,"developer":"CD Projekt RED","source":"community"}
```

## 导入导出

在「设置」→「Steam 数据库」页面：
- **导入**：选择 `.jsonl/.json` 文件或粘贴内容
- **导出**：点击导出按钮下载 `.jsonl` 文件