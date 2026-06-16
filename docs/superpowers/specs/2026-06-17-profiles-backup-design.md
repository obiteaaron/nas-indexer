---
name: profiles-backup-feature
description: profiles 目录一键备份功能设计文档
---

# Profiles 一键备份功能设计文档

## 功能概述

新增"备份管理" TAB 页面，提供 profiles 目录的一键备份功能。

## 需求明细

1. 新增"备份管理"二级 TAB（与"游戏墙"、"Steam 管理"、"游戏设置"同级）
2. 一键备份按钮（备份整个 profiles 目录）
3. 备份文件列表（显示文件名、大小、创建时间）
4. 下载按钮、删除按钮
5. 不需要恢复功能（用户手动解压使用）

## 技术规格

### 备份格式与存储

- **格式：** zip（使用项目已有的 `archiver` 库）
- **文件命名：** `profiles_backup_YYYYMMDD_HHMMSS.zip`
- **存储目录：** `.backup/`（与 profiles 同级，位于项目根目录下）

### API 端点（动词化风格）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/profile-backup/create` | 创建备份 |
| GET | `/api/profile-backup/list` | 获取备份列表 |
| GET | `/api/profile-backup/download/:filename` | 下载备份文件 |
| POST | `/api/profile-backup/delete/:filename` | 删除备份文件 |

### 响应格式

**创建备份：**
```json
{
  "success": true,
  "data": {
    "filename": "profiles_backup_20260617_143052.zip",
    "size": 12345678,
    "createdAt": "2026-06-17T14:30:52+08:00"
  }
}
```

**备份列表：**
```json
{
  "success": true,
  "data": [
    {
      "filename": "profiles_backup_20260617_143052.zip",
      "size": 12345678,
      "createdAt": "2026-06-17T14:30:52+08:00"
    }
  ]
}
```

## 实现方案

### 后端

1. **新增路由文件：** `src/routes/profile-backup.ts`
   - 备份 profiles 目录为 zip 文件
   - 列出 `.backup/` 目录下的备份文件
   - 提供下载接口
   - 删除备份文件

2. **注册路由：** 在 `src/app.ts` 中注册新路由

3. **备份逻辑：**
   - 使用 `archiver` 库创建 zip 压缩包
   - 递归打包 profiles 目录下所有文件
   - 压缩级别：9（最大压缩）

### 前端

1. **修改 App.vue：** 在 game-subnav 区域新增"备份管理"链接
   - 路由路径：`/game/backup`

2. **新增页面组件：** `frontend/src/views/game/ProfileBackupView.vue`
   - 一键备份按钮（显示备份状态）
   - 备份文件列表表格
   - 每行：文件名、大小（格式化）、创建时间、下载按钮、删除按钮

3. **新增路由：** 在 `frontend/src/router/index.ts` 添加路由配置

4. **新增 API 函数：** 在 `frontend/src/api/index.ts` 添加相关 API 调用

## 关键文件参考

| 文件 | 说明 |
|------|------|
| `src/routes/backup.ts` | 现有游戏备份路由（参考风格） |
| `src/games/backup-service.ts` | 现有备份服务（参考 archiver 使用） |
| `src/routes/profile-backup.ts` | 新增：profiles 备份路由 |
| `frontend/src/views/game/GameSteamView.vue` | 参考：管理页面风格 |
| `frontend/src/views/game/ProfileBackupView.vue` | 新增：备份管理页面 |

## 界面设计

### 备份管理页面布局

```
┌─────────────────────────────────────────────────────────┐
│  备份管理                                                │
│  备份 profiles 目录数据，包含游戏数据库和海报文件         │
├─────────────────────────────────────────────────────────┤
│  [一键备份]                                              │
├─────────────────────────────────────────────────────────┤
│  备份文件列表                                            │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 文件名                    │ 大小    │ 创建时间 │ 操作 ││
│  │ profiles_backup_...zip    │ 12.3 MB │ 2026-... │ ↓ 🗑 ││
│  │ profiles_backup_...zip    │ 8.5 MB  │ 2026-... │ ↓ 🗑 ││
│  └─────────────────────────────────────────────────────┘│
│  共 2 个备份文件                                         │
└─────────────────────────────────────────────────────────┘
```

### 二级 TAB 顺序

游戏墙 | Steam 管理 | 游戏设置 | **备份管理**

按钮位置：二级 TAB 栏最右侧新增一项