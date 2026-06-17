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