# Profiles 一键备份功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"备份管理" TAB 页面，提供 profiles 目录一键备份功能

**Architecture:** 后端新增路由处理备份创建/列表/下载/删除，前端新增页面组件和路由配置，使用已有的 archiver 库创建 zip 压缩包

**Tech Stack:** Express.js、archiver (zip)、Vue 3、TypeScript

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/routes/profile-backup.ts` | 创建 | 后端备份路由 |
| `src/server.ts` | 修改 | 注册新路由 |
| `frontend/src/views/game/ProfileBackupView.vue` | 创建 | 备份管理页面 |
| `frontend/src/App.vue` | 修改 | 添加 TAB 链接 |
| `frontend/src/router/index.ts` | 修改 | 添加路由配置 |
| `frontend/src/api/index.ts` | 修改 | 添加 API 函数 |
| `frontend/src/types/api.ts` | 修改 | 添加类型定义 |

---

### Task 1: 后端路由 - 创建备份 API

**Files:**
- Create: `src/routes/profile-backup.ts`

- [ ] **Step 1: 编写 profile-backup.ts 路由文件**

```typescript
/**
 * Profile Backup API routes
 * 备份 profiles 目录为 zip 文件
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PROJECT_ROOT, DEFAULT_STORAGE_PATH, loadConfig, getStoragePath } from '../utils';
import { logger } from '../logger';

const router: Router = express.Router();

// 备份目录：项目根目录下的 .backup/
const BACKUP_DIR = path.join(PROJECT_ROOT, '.backup');

// 确保备份目录存在
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    logger.info('Created backup directory: %s', BACKUP_DIR);
  }
}

// 获取 profiles 目录路径
function getProfilesPath(): string {
  const config = loadConfig();
  return getStoragePath(config);
}

// 格式化日期时间：YYYYMMDD_HHMMSS
function formatTimestamp(): string {
  const now = new Date();
  return now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * 创建备份
 */
router.post('/create', async (_req: Request, res: Response): Promise<void> => {
  try {
    ensureBackupDir();
    const profilesPath = getProfilesPath();

    if (!fs.existsSync(profilesPath)) {
      res.status(400).json({ success: false, error: 'profiles 目录不存在' });
      return;
    }

    const timestamp = formatTimestamp();
    const filename = `profiles_backup_${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, filename);

    // 使用 archiver 创建 zip
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => {
        logger.info('Backup created: %s (%s)', filename, formatFileSize(archive.pointer()));
        resolve();
      });

      archive.on('error', (err) => {
        logger.error('Backup failed: %s', err.message);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(profilesPath, 'profiles');
      archive.finalize();
    });

    const stat = fs.statSync(backupPath);
    res.json({
      success: true,
      data: {
        filename,
        size: stat.size,
        createdAt: stat.birthtime.toISOString()
      }
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to create backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取备份列表
 */
router.get('/list', async (_req: Request, res: Response): Promise<void> => {
  try {
    ensureBackupDir();

    const files = fs.readdirSync(BACKUP_DIR);
    const backups: Array<{ filename: string; size: number; createdAt: string }> = [];

    for (const file of files) {
      if (!file.startsWith('profiles_backup_') || !file.endsWith('.zip')) continue;

      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);

      backups.push({
        filename: file,
        size: stat.size,
        createdAt: stat.birthtime.toISOString()
      });
    }

    // 按创建时间降序排列
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ success: true, data: backups });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to list backups: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 下载备份
 */
router.get('/download/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = req.params.filename;

  if (!filename.startsWith('profiles_backup_') || !filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: '无效的备份文件名' });
    return;
  }

  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '备份文件不存在' });
    return;
  }

  res.download(filePath, filename);
});

/**
 * 删除备份
 */
router.post('/delete/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = req.params.filename;

  if (!filename.startsWith('profiles_backup_') || !filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: '无效的备份文件名' });
    return;
  }

  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '备份文件不存在' });
    return;
  }

  try {
    fs.unlinkSync(filePath);
    logger.info('Backup deleted: %s', filename);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to delete backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

---

### Task 2: 后端路由 - 注册路由

**Files:**
- Modify: `src/server.ts:28-142`

- [ ] **Step 1: 添加 import 语句**

在 `src/server.ts` 第 28 行附近（其他路由 import 之后）添加：

```typescript
import profileBackupRouter from './routes/profile-backup';
```

- [ ] **Step 2: 注册路由**

在 `src/server.ts` 第 142 行附近（其他 app.use 之后）添加：

```typescript
app.use('/api/profile-backup', profileBackupRouter);
```

---

### Task 3: 前端类型定义

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: 添加 ProfileBackupInfo 类型**

在 `frontend/src/types/api.ts` 文件末尾添加：

```typescript
// Profile Backup
export interface ProfileBackupInfo {
  filename: string
  size: number
  createdAt: string
}
```

---

### Task 4: 前端 API 函数

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 添加类型 import**

在 `frontend/src/api/index.ts` 第 26 行附近的 import 类型列表中添加 `ProfileBackupInfo`：

```typescript
import type {
  ...
  SteamDbImportResult,
  ProfileBackupInfo
} from '../types'
```

- [ ] **Step 2: 添加 API 函数**

在 `frontend/src/api/index.ts` 文件末尾添加：

```typescript
// Profile Backup API
export function createProfileBackup(): Promise<ApiResponse<ProfileBackupInfo>> {
  return request<ProfileBackupInfo>('/profile-backup/create', { method: 'POST' })
}

export function getProfileBackupList(): Promise<ApiResponse<ProfileBackupInfo[]>> {
  return request<ProfileBackupInfo[]>('/profile-backup/list')
}

export function getProfileBackupDownloadUrl(filename: string): string {
  return API_BASE + '/profile-backup/download/' + filename
}

export function deleteProfileBackup(filename: string): Promise<ApiResponse<void>> {
  return request<void>('/profile-backup/delete/' + filename, { method: 'POST' })
}
```

---

### Task 5: 前端路由配置

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 添加组件 import**

在 `frontend/src/router/index.ts` 第 12 行附近添加：

```typescript
const ProfileBackupView = () => import('../views/game/ProfileBackupView.vue')
```

- [ ] **Step 2: 添加路由配置**

在 `frontend/src/router/index.ts` 的 `/game` children 数组中添加：

```typescript
{ path: 'backup', name: 'game-backup', component: ProfileBackupView }
```

完整修改后的 children 数组：

```typescript
children: [
  { path: 'wall', name: 'game-wall', component: GameWallView },
  { path: 'steam', name: 'game-steam', component: GameSteamView },
  { path: 'settings', name: 'game-settings', component: GameSettingsView },
  { path: 'backup', name: 'game-backup', component: ProfileBackupView }
]
```

---

### Task 6: 前端 TAB 链接

**Files:**
- Modify: `frontend/src/App.vue:32-36`

- [ ] **Step 1: 添加备份管理 TAB 链接**

在 `frontend/src/App.vue` 的 `game-subnav` 区域添加备份管理链接：

```vue
<div class="game-subnav" v-if="config?.gamesEnabled && $route.path.startsWith('/game')">
  <router-link to="/game/wall" class="subnav-link">游戏墙</router-link>
  <router-link to="/game/steam" class="subnav-link">Steam 管理</router-link>
  <router-link to="/game/settings" class="subnav-link">游戏设置</router-link>
  <router-link to="/game/backup" class="subnav-link">备份管理</router-link>
</div>
```

---

### Task 7: 前端页面组件

**Files:**
- Create: `frontend/src/views/game/ProfileBackupView.vue`

- [ ] **Step 1: 编写页面组件**

```vue
<!-- frontend/src/views/game/ProfileBackupView.vue -->
<template>
  <div class="profile-backup">
    <!-- Toast 提示 -->
    <div class="toast-container" v-if="showToast">
      <div class="toast-message">{{ toastMessage }}</div>
    </div>

    <h2 class="section-title">备份管理</h2>
    <p class="hint">备份 profiles 目录数据，包含游戏数据库和海报文件</p>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <button class="btn btn-primary" @click="createBackup" :disabled="creating">
        {{ creating ? '备份中...' : '一键备份' }}
      </button>
    </div>

    <!-- 备份列表 -->
    <div class="backup-list-section">
      <h3 class="list-title">备份文件列表</h3>

      <div class="backup-table" v-if="backups.length">
        <div class="backup-row backup-header-row">
          <span class="col-filename">文件名</span>
          <span class="col-size">大小</span>
          <span class="col-time">创建时间</span>
          <span class="col-actions">操作</span>
        </div>
        <div class="backup-row" v-for="backup in backups" :key="backup.filename">
          <span class="col-filename" :title="backup.filename">{{ backup.filename }}</span>
          <span class="col-size">{{ formatSize(backup.size) }}</span>
          <span class="col-time">{{ formatTime(backup.createdAt) }}</span>
          <span class="col-actions">
            <button class="btn btn-secondary btn-small" @click="downloadBackup(backup.filename)">下载</button>
            <button class="btn btn-danger btn-small" @click="deleteBackup(backup.filename)">删除</button>
          </span>
        </div>
      </div>

      <div class="empty-state" v-else>
        <p>暂无备份文件</p>
      </div>

      <p class="count-info" v-if="backups.length">共 {{ backups.length }} 个备份文件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  createProfileBackup,
  getProfileBackupList,
  getProfileBackupDownloadUrl,
  deleteProfileBackup
} from '../../api';
import type { ProfileBackupInfo } from '../../types';
import { useGameToast } from '../../composables/game/useGameToast';

const { showNotification, showToast, toastMessage } = useGameToast();

const backups = ref<ProfileBackupInfo[]>([]);
const creating = ref(false);

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// 格式化时间
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 加载备份列表
async function loadBackups(): Promise<void> {
  const res = await getProfileBackupList();
  if (res.success && res.data) {
    backups.value = res.data;
  }
}

// 创建备份
async function createBackup(): Promise<void> {
  creating.value = true;
  try {
    const res = await createProfileBackup();
    if (res.success && res.data) {
      showNotification('备份创建成功');
      loadBackups();
    } else {
      showNotification(res.error || '备份创建失败');
    }
  } catch (err) {
    showNotification('备份创建失败');
  }
  creating.value = false;
}

// 下载备份
function downloadBackup(filename: string): void {
  const url = getProfileBackupDownloadUrl(filename);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// 删除备份
async function deleteBackup(filename: string): Promise<void> {
  if (!confirm(`确定要删除备份文件 ${filename} 吗？`)) return;

  const res = await deleteProfileBackup(filename);
  if (res.success) {
    showNotification('备份已删除');
    loadBackups();
  } else {
    showNotification(res.error || '删除失败');
  }
}

onMounted(() => loadBackups());
</script>

<style scoped>
.profile-backup {
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-title {
  font-size: 24px;
  margin-bottom: 8px;
}

.hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
}

.action-bar {
  margin-bottom: 24px;
}

.backup-list-section {
  margin-top: 16px;
}

.list-title {
  font-size: 16px;
  margin-bottom: 16px;
}

.backup-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.backup-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  align-items: center;
  background: var(--bg);
}

.backup-row:not(:last-child) {
  border-bottom: 1px solid var(--border);
}

.backup-header-row {
  background: var(--bg-secondary);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.col-filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-size {
  width: 100px;
  text-align: right;
}

.col-time {
  width: 180px;
}

.col-actions {
  width: 140px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.count-info {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-secondary {
  background: var(--bg-secondary);
}

.btn-danger {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.btn-small {
  padding: 6px 12px;
  font-size: 13px;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Toast 提示 */
.toast-container {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
}

.toast-message {
  background: var(--primary);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(-10px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}
</style>
```

---

### Task 8: 编译测试

- [ ] **Step 1: 后端编译**

运行：`npm run build`
预期：编译成功，无错误

- [ ] **Step 2: 前端编译**

运行：`cd frontend && npm run build`
预期：编译成功，无错误

- [ ] **Step 3: 运行测试（如有）**

运行：`npm test`
预期：所有测试通过

---

## Self-Review Checklist

**Spec coverage:**
- ✓ 一键备份按钮 → Task 7
- ✓ 备份列表 → Task 1 + Task 7
- ✓ 下载按钮 → Task 1 + Task 7
- ✓ 删除按钮 → Task 1 + Task 7
- ✓ zip 格式 → Task 1 (archiver)
- ✓ 文件命名 → Task 1
- ✓ .backup 目录 → Task 1
- ✓ 动词化 API → Task 1

**Placeholder scan:** 无 TBD/TODO

**Type consistency:** ProfileBackupInfo 类型在各文件中一致使用