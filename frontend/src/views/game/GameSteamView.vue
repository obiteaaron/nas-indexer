<!-- frontend/src/views/game/GameSteamView.vue -->
<template>
  <div class="steam-management">
    <h2 class="section-title">Steam 管理</h2>

    <!-- 统计卡片 -->
    <div class="stats-card">
      <div class="stat-box">
        <span class="stat-label">已缓存游戏</span>
        <span class="stat-value">{{ stats?.totalEntries || 0 }}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">海报图片</span>
        <span class="stat-value">{{ stats?.totalPosters || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">截图图片</span>
        <span class="stat-value">{{ stats?.totalScreenshots || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">总缓存大小</span>
        <span class="stat-value">{{ stats?.totalSizeMB || 0 }} MB</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <button class="btn btn-primary" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '刷新中...' : '刷新所有缓存' }}
      </button>
      <button class="btn btn-secondary" @click="exportSteamDb">
        导出 Steam DB
      </button>
    </div>

    <!-- 缓存列表 -->
    <div class="cache-list">
      <div class="list-header">
        <input v-model="searchQuery" type="text" placeholder="搜索..." class="search-input" @input="debouncedSearch" />
      </div>
      <div class="cache-table" v-if="entries.length">
        <div class="cache-row" v-for="entry in entries" :key="entry.steam_appid">
          <span class="col-appid">{{ entry.steam_appid }}</span>
          <span class="col-name">{{ entry.name }}</span>
          <span class="col-name-en">{{ entry.name_en || '-' }}</span>
          <span class="col-status">
            <span v-if="entry.cacheStatus === 'complete'" class="status-complete">✅ 完整</span>
            <span v-else-if="entry.cacheStatus === 'missing_images'" class="status-warning">⚠ 缺失图片</span>
            <span v-else class="status-error">❌ 仅元数据</span>
          </span>
          <div class="col-actions">
            <button class="btn btn-small" @click="refreshSingle(entry.steam_appid)">刷新</button>
            <button class="btn btn-small btn-danger" @click="deleteCache(entry.steam_appid)">删除</button>
            <button class="btn btn-small" @click="showDetail(entry)">详情</button>
          </div>
        </div>
      </div>
      <div class="empty-state" v-else-if="!loading">
        <p>暂无缓存数据</p>
      </div>
      <div class="pagination" v-if="totalPages > 1">
        <button class="btn btn-small" @click="prevPage" :disabled="page <= 1">上一页</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="btn btn-small" @click="nextPage" :disabled="page >= totalPages">下一页</button>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <GameSteamCacheDetailModal
      v-if="selectedEntry"
      :entry="selectedEntry"
      @close="selectedEntry = null"
      @refresh="refreshSingle(selectedEntry.steam_appid)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  getSteamCacheStats,
  getSteamCacheList,
  refreshSteamCache,
  deleteSteamCache,
  refreshAllSteamCache,
  exportSteamDb,
  type SteamCacheStats,
  type SteamCacheEntry
} from '../../api';
import GameSteamCacheDetailModal from '../../components/game/GameSteamCacheDetailModal.vue';
import { useGameToast } from '../../composables/game/useGameToast';

const { showNotification } = useGameToast();

const stats = ref<SteamCacheStats | null>(null);
const entries = ref<SteamCacheEntry[]>([]);
const loading = ref(false);
const refreshing = ref(false);
const searchQuery = ref('');
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const totalPages = computed(() => Math.ceil(total.value / pageSize.value));
const selectedEntry = ref<SteamCacheEntry | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(): void {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    loadList();
  }, 300);
}

function prevPage(): void {
  if (page.value > 1) {
    page.value--;
    loadList();
  }
}

function nextPage(): void {
  if (page.value < totalPages.value) {
    page.value++;
    loadList();
  }
}

async function loadStats(): Promise<void> {
  const res = await getSteamCacheStats();
  if (res.success && res.data) stats.value = res.data;
}

async function loadList(): Promise<void> {
  loading.value = true;
  const res = await getSteamCacheList({
    search: searchQuery.value,
    page: page.value,
    pageSize: pageSize.value
  });
  if (res.success && res.data) {
    entries.value = res.data.entries;
    total.value = res.data.total;
  }
  loading.value = false;
}

async function refreshSingle(appid: string): Promise<void> {
  const res = await refreshSteamCache(appid);
  if (res.success) {
    showNotification('缓存刷新完成');
    loadList();
    loadStats();
  } else {
    showNotification('刷新失败');
  }
}

async function deleteCache(appid: string): Promise<void> {
  if (!confirm('确定要删除该缓存吗？')) return;
  const res = await deleteSteamCache(appid);
  if (res.success) {
    showNotification('缓存已删除');
    loadList();
    loadStats();
  }
}

async function refreshAll(): Promise<void> {
  refreshing.value = true;
  await refreshAllSteamCache();
  refreshing.value = false;
  showNotification('全部缓存刷新完成');
  loadList();
  loadStats();
}

async function exportSteamDbData(): Promise<void> {
  const res = await exportSteamDb();
  if (res.success && res.data) {
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'steam-db-export.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('导出完成');
  }
}

function showDetail(entry: SteamCacheEntry): void {
  selectedEntry.value = entry;
}

onMounted(() => {
  loadStats();
  loadList();
});
</script>

<style scoped>
.steam-management {
  padding: 24px;
}
.section-title {
  font-size: 24px;
  margin-bottom: 24px;
}
.stats-card {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}
.stat-box {
  flex: 1;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}
.action-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}
.cache-list {
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 16px;
}
.list-header {
  margin-bottom: 16px;
}
.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}
.cache-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cache-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 4px;
  align-items: center;
}
.col-appid {
  width: 100px;
  font-family: monospace;
}
.col-name {
  flex: 1;
}
.col-name-en {
  width: 150px;
}
.col-status {
  width: 100px;
}
.status-complete { color: #22c55e; }
.status-warning { color: #f59e0b; }
.status-error { color: #ef4444; }
.col-actions {
  display: flex;
  gap: 8px;
}
.btn-danger {
  background: #ef4444;
  color: white;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
}
.page-info {
  font-size: 14px;
}
.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
}
.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.btn:hover {
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
.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>