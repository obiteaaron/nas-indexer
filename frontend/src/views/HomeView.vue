<template>
  <div class="home">
    <div class="card">
      <h2 class="section-title">NAS Indexer 文件管理系统</h2>
      <p class="section-desc">扫描、索引、管理您的 NAS 文件</p>

      <div class="stats-grid" v-if="stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.meta.totalFiles }}</div>
          <div class="stat-label">总文件数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.meta.totalSize }}</div>
          <div class="stat-label">总大小</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.categories.length }}</div>
          <div class="stat-label">分类数</div>
        </div>
      </div>

      <div class="quick-actions">
        <router-link to="/files" class="btn btn-primary">查看文件</router-link>
        <router-link to="/search" class="btn btn-secondary">搜索文件</router-link>
        <button class="btn btn-primary" @click="showScanConfirm = true">
          立即扫描全部
        </button>
      </div>
      <p class="scan-tip">
        扫描所有配置路径（可在设置页面单独扫描指定路径）
      </p>
    </div>

    <div class="card" v-if="stats && stats.categories.length">
      <h3 class="section-title">分类统计</h3>
      <div class="category-list">
        <div class="category-item" v-for="cat in stats.categories" :key="cat.category">
          <span class="category-name">{{ cat.category }}</span>
          <span class="category-count">{{ cat.count }} 个</span>
          <span class="category-size">{{ cat.size }}</span>
          <span class="category-percent">{{ cat.percent }}%</span>
        </div>
      </div>
    </div>

    <div class="card" v-if="preferences && preferences.categories.length">
      <h3 class="section-title">你的偏好</h3>
      <div class="preferences-summary">
        <div class="pref-item" v-for="pref in preferences.categories.slice(0, 5)" :key="pref.preference_key">
          <span class="pref-label">{{ pref.preference_key }}</span>
          <div class="pref-bar">
            <div class="pref-bar-fill" :style="{ width: (pref.preference_value * 100) + '%' }"></div>
          </div>
          <span class="pref-value">{{ (pref.preference_value * 100).toFixed(1) }}%</span>
        </div>
      </div>
    </div>

    <div class="card" v-if="recommendations.length">
      <h3 class="section-title">为你推荐</h3>
      <div class="recommendations-grid">
        <div class="rec-item" v-for="rec in recommendations" :key="rec.id" @click="viewFile(rec)">
          <div class="rec-icon" :class="'cat-' + (rec.category || '其他')">{{ getCategoryIcon(rec.category) }}</div>
          <div class="rec-info">
            <div class="rec-name" :title="rec.name">{{ rec.name }}</div>
            <div class="rec-reason">{{ rec.reason }}</div>
            <div class="rec-meta">{{ rec.sizeFormatted }} · {{ rec.category }}</div>
          </div>
        </div>
      </div>
      <button class="btn btn-secondary btn-small" @click="refreshRecommendations" v-if="!recommendations.length || recommendations.length === 0">
        生成推荐
      </button>
    </div>

    <FilePreview :visible="!!previewFile" :file="previewFile" @close="previewFile = null" />

    <div class="modal" v-if="showScanConfirm" @click.self="showScanConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">确认全部扫描</h3>
          <span class="modal-close" @click="showScanConfirm = false">&times;</span>
        </div>
        <p class="scan-confirm-tip">全部扫描将遍历所有配置目录，耗时较长。</p>
        <p class="scan-confirm-tip">如果只是单个目录有更新，建议前往<span class="scan-confirm-link" @click="$router.push('/settings'); showScanConfirm = false">设置页面</span>对该目录单独扫描。</p>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showScanConfirm = false">取消</button>
          <button class="btn btn-primary" @click="confirmScan">确认扫描</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FilePreview from '../components/FilePreview.vue'
import { getStatistics, scanFiles, getPreferences, getRecommendations, generateRecommendations, getFile } from '../api'
import type { StatisticsResponse, Preferences, Recommendation, FileWithTags } from '../types'

const router = useRouter()
const stats = ref<StatisticsResponse | null>(null)
const showScanConfirm = ref(false)
const preferences = ref<(Preferences & { enabled: boolean }) | null>(null)
const recommendations = ref<Recommendation[]>([])
const previewFile = ref<FileWithTags | null>(null)

onMounted(async () => {
  loadStats()
  loadPreferences()
  loadRecommendations()
})

async function loadStats(): Promise<void> {
  try {
    const res = await getStatistics()
    if (res.success && res.data) {
      stats.value = res.data
    }
  } catch (err) {
    console.error('获取统计失败:', err)
  }
}

async function loadPreferences(): Promise<void> {
  try {
    const res = await getPreferences()
    if (res.success && res.data && res.data.enabled) {
      preferences.value = res.data
    }
  } catch (err) {
    console.error('获取偏好失败:', err)
  }
}

async function loadRecommendations(): Promise<void> {
  try {
    const res = await getRecommendations({ limit: 10 })
    if (res.success && res.data) {
      recommendations.value = res.data
      if (res.data.length === 0) {
        await refreshRecommendations()
      }
    }
  } catch (err) {
    console.error('获取推荐失败:', err)
  }
}

async function refreshRecommendations(): Promise<void> {
  try {
    const res = await generateRecommendations()
    if (res.success && res.data) {
      recommendations.value = res.data.slice(0, 10)
    }
  } catch (err) {
    console.error('生成推荐失败:', err)
  }
}

function getCategoryIcon(category?: string): string {
  const icons: Record<string, string> = {
    '视频': '🎬', '音频': '🎵', '图片': '🖼️',
    '文档': '📄', '字幕': '📝', '其他': '📦'
  }
  return icons[category || '其他'] || '📦'
}

async function viewFile(rec: Recommendation): Promise<void> {
  try {
    const res = await getFile(rec.file_id)
    if (res.success && res.data) {
      previewFile.value = res.data
    }
  } catch (err) {
    console.error('获取文件详情失败:', err)
  }
}

async function confirmScan(): Promise<void> {
  showScanConfirm.value = false
  try {
    const res = await scanFiles()
    if (!res.success) {
      alert('启动扫描失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    alert('启动扫描失败：' + error.message)
  }
}
</script>

<style scoped>
.section-title {
  font-size: 24px;
  margin-bottom: 8px;
}

.section-desc {
  color: var(--text-muted);
  margin-bottom: 24px;
}

.quick-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.quick-actions a {
  text-decoration: none;
}

.scan-tip {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.category-list {
  margin-top: 16px;
}

.category-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.category-name {
  flex: 1;
  font-weight: 500;
}

.category-count {
  width: 80px;
  color: var(--text-muted);
}

.category-size {
  width: 100px;
  color: var(--text-muted);
}

.category-percent {
  width: 60px;
  text-align: right;
  color: var(--primary);
}

.preferences-summary {
  margin-top: 12px;
}

.pref-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.pref-label {
  width: 80px;
  font-weight: 500;
  font-size: 14px;
}

.pref-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.pref-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #a78bfa);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.pref-value {
  width: 50px;
  text-align: right;
  color: var(--text-muted);
  font-size: 13px;
}

.recommendations-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.rec-item {
  display: flex;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.rec-item:hover {
  background: var(--bg-secondary);
}

.rec-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 20px;
  flex-shrink: 0;
}

.rec-info {
  flex: 1;
  min-width: 0;
}

.rec-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.rec-reason {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.rec-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.scan-confirm-tip {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.6;
}

.scan-confirm-link {
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
}

.scan-confirm-link:hover {
  opacity: 0.8;
}
</style>