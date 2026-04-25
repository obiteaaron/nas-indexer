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
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { getStatistics, scanFiles } from '../api'

export default {
  name: 'HomeView',
  setup() {
    const stats = ref(null)
    const scanning = ref(false)

    onMounted(async () => {
      loadStats()
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

    return { stats, scanning, startScan }
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
</style>