<!-- frontend/src/views/game/GameSteamView.vue -->
<template>
  <div class="steam-management">
    <!-- Toast 提示 -->
    <div class="toast-container" v-if="showToast">
      <div class="toast-message">{{ toastMessage }}</div>
    </div>

    <h2 class="section-title">Steam 数据库管理</h2>
    <p class="hint">管理 Steam AppID 与游戏名称映射，提升刮削成功率。刷新缓存时保留已有的中文名/英文名。</p>

    <!-- 统计卡片 -->
    <div class="stats-card">
      <div class="stat-box">
        <span class="stat-label">已缓存游戏</span>
        <span class="stat-value">{{ steamDbTotal }}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">缓存图片</span>
        <span class="stat-value">{{ stats?.totalPosters || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">截图</span>
        <span class="stat-value">{{ stats?.totalScreenshots || 0 }} 张</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">缓存大小</span>
        <span class="stat-value">{{ stats?.totalSizeMB || 0 }} MB</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <button class="btn btn-primary btn-small" @click="openAddModal">添加记录</button>
      <button class="btn btn-secondary btn-small" @click="showImportModal = true">导入 JSON</button>
      <button class="btn btn-secondary btn-small" @click="handleExport" :disabled="steamDbTotal === 0">导出 JSON</button>
      <button class="btn btn-secondary btn-small" @click="refreshAll" :disabled="refreshing">
        {{ refreshing ? '刷新中...' : '刷新所有缓存' }}
      </button>
    </div>

    <!-- 搜索栏 -->
    <div class="filter-bar">
      <input class="input" v-model="steamDbSearch" placeholder="搜索 AppID 或名称" @keyup.enter="handleSearch" />
      <button class="btn btn-secondary btn-small" @click="handleSearch">搜索</button>
      <span class="count-info">共 {{ steamDbTotal }} 条记录</span>
    </div>

    <!-- SteamDB 表格 -->
    <div class="steam-db-table" v-if="steamDbEntries.length">
      <div class="steam-db-row steam-db-header-row">
        <span class="col-appid">AppID</span>
        <span class="col-name">中文名</span>
        <span class="col-name-en">英文名</span>
        <span class="col-aliases">别名</span>
        <span class="col-status">状态</span>
        <span class="col-actions">操作</span>
      </div>
      <div class="steam-db-row" v-for="entry in steamDbEntries" :key="entry.id">
        <span class="col-appid">
          <a :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
            {{ entry.steam_appid }}
          </a>
        </span>
        <span class="col-name">
          <a :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
            {{ entry.name }}
          </a>
        </span>
        <span class="col-name-en">
          <a v-if="entry.name_en" :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
            {{ entry.name_en }}
          </a>
          <span v-else>-</span>
        </span>
        <span class="col-aliases">
          <span class="alias-tag" v-for="(alias, i) in ((entry.aliases || []) as string[]).slice(0, 3)" :key="i">{{ alias }}</span>
          <span class="alias-more" v-if="(entry.aliases || []).length > 3">+{{ (entry.aliases || []).length - 3 }}</span>
        </span>
        <span class="col-status">
          <span v-if="entry.cacheStatus === 'complete'" class="status-complete">✅完整</span>
          <span v-else-if="entry.cacheStatus === 'missing_images'" class="status-warning">⚠缺图</span>
          <span v-else class="status-error">❌元数据</span>
        </span>
        <span class="col-actions">
          <button class="btn btn-secondary btn-small" @click="showDetail(entry)">详情</button>
          <button class="btn btn-secondary btn-small" @click="openEditModal(entry)">编辑</button>
          <button class="btn btn-secondary btn-small" @click="refreshSingle(entry.steam_appid)">刷新</button>
          <button class="btn btn-danger btn-small" @click="deleteConfirm(entry)">删除</button>
        </span>
      </div>
    </div>
    <div class="empty-state" v-else>
      <p>暂无数据，请添加记录或导入 JSON</p>
    </div>

    <!-- 分页 -->
    <div class="pagination" v-if="steamDbTotalPages > 1">
      <button class="btn btn-secondary btn-small" @click="steamDbPage--" :disabled="steamDbPage === 1">上一页</button>
      <span class="pagination-info">第 {{ steamDbPage }} / {{ steamDbTotalPages }} 页</span>
      <button class="btn btn-secondary btn-small" @click="steamDbPage++" :disabled="steamDbPage >= steamDbTotalPages">下一页</button>
    </div>

    <!-- 添加/编辑模态框 -->
    <div class="modal-overlay" v-if="showEditModal" @click.self="closeEditModal">
      <div class="modal-content edit-modal">
        <div class="modal-header">
          <h3>{{ editingEntry ? '编辑 Steam DB 记录' : '添加 Steam DB 记录' }}</h3>
          <button class="modal-close" @click="closeEditModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">Steam AppID <span class="required">*</span></label>
            <input class="input" v-model="editForm.steam_appid" placeholder="如 1234560" :disabled="!!editingEntry" />
          </div>
          <div class="form-row">
            <label class="form-label">中文名 <span class="required">*</span></label>
            <input class="input" v-model="editForm.name" placeholder="如 艾尔登法环" />
          </div>
          <div class="form-row">
            <label class="form-label">英文名</label>
            <input class="input" v-model="editForm.name_en" placeholder="如 Elden Ring" />
          </div>
          <div class="form-row">
            <label class="form-label">别名</label>
            <input class="input" v-model="editForm.aliasesStr" placeholder="逗号分隔，如 ER,eldenring" />
            <span class="hint">多个别名用逗号分隔</span>
          </div>
          <div class="form-row">
            <label class="form-label">备注</label>
            <input class="input" v-model="editForm.notes" placeholder="可选备注" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeEditModal">取消</button>
          <button class="btn btn-primary" @click="saveEntry" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 导入模态框 -->
    <div class="modal-overlay" v-if="showImportModal" @click.self="showImportModal = false">
      <div class="modal-content import-modal">
        <div class="modal-header">
          <h3>导入 Steam DB</h3>
          <button class="modal-close" @click="showImportModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">JSON 内容</label>
            <textarea class="textarea" v-model="importJsonStr" placeholder="粘贴 JSON 数组，格式：[{steam_appid, name, name_en, aliases}]"></textarea>
          </div>
          <div class="form-row">
            <label class="form-label">导入模式</label>
            <select class="select" v-model="importMode">
              <option value="merge">合并（跳过已存在的 AppID）</option>
              <option value="overwrite">覆盖（更新已存在的 AppID）</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showImportModal = false">取消</button>
          <button class="btn btn-primary" @click="handleImport" :disabled="importing">
            {{ importing ? '导入中...' : '导入' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <GameSteamCacheDetailModal
      v-if="selectedEntry"
      :entry="selectedEntry"
      @close="closeDetail"
      @refresh="refreshFromDetail(selectedEntry.steam_appid)"
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
  getSteamDbEntries,
  getSteamCacheDetail,
  createSteamDbEntry,
  updateSteamDbEntry,
  deleteSteamDbEntry as deleteSteamDbEntryApi,
  exportSteamDb,
  importSteamDb,
  type SteamCacheStats,
  type SteamCacheEntry
} from '../../api';
import type { SteamDbEntry } from '../../types';
import { useGameToast } from '../../composables/game/useGameToast';
import GameSteamCacheDetailModal from '../../components/game/GameSteamCacheDetailModal.vue';

const { showNotification, showToast, toastMessage } = useGameToast();

// Steam 缓存统计
const stats = ref<SteamCacheStats | null>(null);
const refreshing = ref(false);

// SteamDB 列表
const steamDbEntries = ref<SteamCacheEntry[]>([]);
const steamDbSearch = ref('');
const steamDbPage = ref(1);
const steamDbPageSize = ref(20);
const steamDbTotal = ref(0);
const steamDbTotalPages = computed(() => Math.ceil(steamDbTotal.value / steamDbPageSize.value));

// 详情弹窗
const selectedEntry = ref<SteamCacheEntry | null>(null);
const detailLoading = ref(false);

// 编辑模态框
const showEditModal = ref(false);
const editingEntry = ref<SteamDbEntry | null>(null);
const editForm = ref({
  steam_appid: '',
  name: '',
  name_en: '',
  aliasesStr: '',
  notes: ''
});
const saving = ref(false);

// 导入模态框
const showImportModal = ref(false);
const importJsonStr = ref('');
const importMode = ref<'merge' | 'overwrite'>('merge');
const importing = ref(false);

// 加载缓存统计
async function loadStats(): Promise<void> {
  const res = await getSteamCacheStats();
  if (res.success && res.data) stats.value = res.data;
}

// 加载 SteamDB 列表
async function loadSteamDbList(): Promise<void> {
  const res = await getSteamDbEntries({
    search: steamDbSearch.value,
    orderBy: 'name',
    orderDir: 'ASC',
    page: steamDbPage.value,
    pageSize: steamDbPageSize.value
  });
  if (res.success && res.data) {
    steamDbEntries.value = res.data.entries;
    steamDbTotal.value = res.data.total;
  }
}

// 搜索
function handleSearch(): void {
  steamDbPage.value = 1;
  loadSteamDbList();
}

// 打开添加模态框
function openAddModal(): void {
  editingEntry.value = null;
  editForm.value = { steam_appid: '', name: '', name_en: '', aliasesStr: '', notes: '' };
  showEditModal.value = true;
}

// 打开编辑模态框
function openEditModal(entry: SteamCacheEntry): void {
  const steamDbEntry: SteamDbEntry = {
    id: entry.id,
    steam_appid: entry.steam_appid,
    name: entry.name,
    name_en: entry.name_en,
    aliases: entry.aliases || [],
    notes: entry.notes,
    source: (entry.source as SteamDbEntry['source']) || 'manual'
  };
  editingEntry.value = steamDbEntry;
  editForm.value = {
    steam_appid: entry.steam_appid,
    name: entry.name,
    name_en: entry.name_en || '',
    aliasesStr: (entry.aliases || []).join(','),
    notes: entry.notes || ''
  };
  showEditModal.value = true;
}

// 关闭编辑模态框
function closeEditModal(): void {
  showEditModal.value = false;
  editingEntry.value = null;
}

// 保存记录
async function saveEntry(): Promise<void> {
  if (!editForm.value.steam_appid || !editForm.value.name) {
    showNotification('AppID 和中文名必填');
    return;
  }
  saving.value = true;
  const aliases: string[] = editForm.value.aliasesStr ? editForm.value.aliasesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const data = {
    steam_appid: editForm.value.steam_appid,
    name: editForm.value.name,
    name_en: editForm.value.name_en || undefined,
    aliases: aliases,
    notes: editForm.value.notes || undefined
  };
  try {
    if (editingEntry.value) {
      const res = await updateSteamDbEntry(editingEntry.value.id!, data);
      if (res.success) {
        showNotification('记录已更新');
        loadSteamDbList();
      }
    } else {
      const res = await createSteamDbEntry(data);
      if (res.success) {
        showNotification('记录已添加');
        loadSteamDbList();
        loadStats();
      }
    }
  } catch (err) {
    showNotification('保存失败');
  }
  saving.value = false;
  closeEditModal();
}

// 删除确认
async function deleteConfirm(entry: SteamCacheEntry): Promise<void> {
  if (!confirm(`确定要删除 AppID ${entry.steam_appid} 吗？`)) return;
  const res = await deleteSteamDbEntryApi(entry.id!);
  if (res.success) {
    showNotification('记录已删除');
    loadSteamDbList();
    loadStats();
  }
}

// 刷新单个缓存
async function refreshSingle(appid: string): Promise<void> {
  const res = await refreshSteamCache(appid);
  if (res.success) {
    showNotification('缓存刷新完成（保留已有名称）');
    loadSteamDbList();
    loadStats();
  } else {
    showNotification('刷新失败');
  }
}

// 显示详情弹窗
async function showDetail(entry: SteamCacheEntry): Promise<void> {
  detailLoading.value = true;
  try {
    const res = await getSteamCacheDetail(entry.steam_appid);
    if (res.success && res.data) {
      selectedEntry.value = res.data;
    } else {
      showNotification('获取详情失败');
    }
  } catch (err) {
    showNotification('获取详情失败');
  }
  detailLoading.value = false;
}

// 关闭详情弹窗
function closeDetail(): void {
  selectedEntry.value = null;
}

// 从详情弹窗刷新
async function refreshFromDetail(appid: string): Promise<void> {
  await refreshSingle(appid);
  // 重新获取详情
  if (selectedEntry.value) {
    const res = await getSteamCacheDetail(appid);
    if (res.success && res.data) {
      selectedEntry.value = res.data;
    }
  }
}

// 刷新所有缓存
async function refreshAll(): Promise<void> {
  refreshing.value = true;
  await refreshAllSteamCache();
  refreshing.value = false;
  showNotification('全部缓存刷新完成');
  loadSteamDbList();
  loadStats();
}

// 导出 JSON（下载文件）
async function handleExport(): Promise<void> {
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
  } else {
    showNotification('导出失败');
  }
}

// 导入 JSON
async function handleImport(): Promise<void> {
  if (!importJsonStr.value.trim()) {
    showNotification('请输入 JSON 内容');
    return;
  }
  importing.value = true;
  try {
    const entries = JSON.parse(importJsonStr.value);
    if (!Array.isArray(entries)) {
      showNotification('JSON 格式错误，应为数组');
      importing.value = false;
      return;
    }
    const res = await importSteamDb(entries, importMode.value);
    if (res.success && res.data) {
      showNotification(`导入完成：新增 ${res.data.added}，更新 ${res.data.updated}，跳过 ${res.data.skipped}`);
      loadSteamDbList();
      loadStats();
      showImportModal.value = false;
      importJsonStr.value = '';
    }
  } catch (err) {
    showNotification('JSON 解析失败');
  }
  importing.value = false;
}

// 监听分页变化
watch(steamDbPage, () => loadSteamDbList());

onMounted(() => {
  loadStats();
  loadSteamDbList();
});
</script>

<style scoped>
.steam-management {
  padding: 24px;
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
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
.input:disabled {
  opacity: 0.6;
}
.count-info {
  color: var(--text-secondary);
  font-size: 14px;
}
.steam-db-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.steam-db-row {
  display: flex;
  gap: 12px;
  padding: 12px;
  align-items: center;
  background: var(--bg);
}
.steam-db-row:not(:last-child) {
  border-bottom: 1px solid var(--border);
}
.steam-db-header-row {
  background: var(--bg-secondary);
  font-weight: 600;
}
.col-appid { width: 100px; }
.col-name { flex: 1; }
.col-name-en { width: 150px; }
.col-aliases { width: 150px; }
.col-status { width: 80px; }
.col-actions { width: 180px; display: flex; gap: 8px; }
.steam-link {
  color: var(--primary);
  text-decoration: none;
}
.steam-link:hover {
  text-decoration: underline;
}
.alias-tag {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 12px;
  margin-right: 4px;
}
.alias-more {
  color: var(--text-secondary);
  font-size: 12px;
}
.status-complete { color: #22c55e; }
.status-warning { color: #f59e0b; }
.status-error { color: #ef4444; }
.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
}
.pagination-info {
  font-size: 14px;
}
/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-header h3 {
  font-size: 18px;
  margin: 0;
}
.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text);
}
.modal-body {
  padding: 24px;
}
.form-row {
  margin-bottom: 16px;
}
.form-label {
  display: block;
  font-size: 14px;
  margin-bottom: 8px;
  color: var(--text);
}
.form-label .required {
  color: #ef4444;
}
.textarea {
  width: 100%;
  min-height: 150px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  resize: vertical;
}
.select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
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
  padding: 4px 8px;
  font-size: 12px;
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