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
        <button class="btn btn-primary" @click="startScan" :disabled="scanning">
          {{ scanning ? '扫描中...' : '立即扫描全部' }}
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
        <div class="rec-item" v-for="rec in recommendations" :key="rec.id" @click="viewFile(rec.file_id)">
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
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { getStatistics, scanFiles, getPreferences, getRecommendations, generateRecommendations } from '../api'

export default {
  name: 'HomeView',
  setup() {
    const stats = ref(null)
    const scanning = ref(false)
    const preferences = ref(null)
    const recommendations = ref([])

    onMounted(async () => {
      loadStats()
      loadPreferences()
      loadRecommendations()
    })

    async function loadStats() {
      try {
        const res = await getStatistics()
        if (res.success) {
          stats.value = res.stats
        }
      } catch (err) {
        console.error('获取统计失败:', err)
      }
    }

    async function loadPreferences() {
      try {
        const res = await getPreferences()
        if (res.success && res.data.enabled) {
          preferences.value = res.data
        }
      } catch (err) {
        console.error('获取偏好失败:', err)
      }
    }

    async function loadRecommendations() {
      try {
        const res = await getRecommendations({ limit: 10 })
        if (res.success) {
          recommendations.value = res.data
          if (res.data.length === 0) {
            await refreshRecommendations()
          }
        }
      } catch (err) {
        console.error('获取推荐失败:', err)
      }
    }

    async function refreshRecommendations() {
      try {
        const res = await generateRecommendations()
        if (res.success) {
          recommendations.value = res.data.slice(0, 10)
        }
      } catch (err) {
        console.error('生成推荐失败:', err)
      }
    }

    function getCategoryIcon(category) {
      const icons = {
        '视频': '🎬', '音频': '🎵', '图片': '🖼️',
        '文档': '📄', '字幕': '📝', '其他': '📦'
      }
      return icons[category] || '📦'
    }

    function viewFile(fileId) {
      window.location.hash = '/files'
    }

    async function startScan() {
      scanning.value = true
      try {
        const res = await scanFiles()
        if (res.success) {
          alert('扫描完成：' + res.data.totalFiles + ' 个文件')
          loadStats()
        } else {
          alert('扫描失败：' + res.error)
        }
      } catch (err) {
        alert('扫描失败：' + err.message)
      }
      scanning.value = false
    }

    return { stats, scanning, startScan, preferences, recommendations, getCategoryIcon, viewFile, refreshRecommendations }
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
</style>