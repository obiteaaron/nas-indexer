<template>
  <div class="statistics">
    <div class="card">
      <h2 class="section-title">统计分析</h2>

      <div class="stats-grid" v-if="stats">
        <div class="stat-card">
          <div class="stat-value">{{ stats.meta.totalFiles }}</div>
          <div class="stat-label">总文件数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.meta.totalSize }}</div>
          <div class="stat-label">总大小</div>
        </div>
      </div>
    </div>

    <div class="charts-row" v-if="stats && stats.categories.length">
      <ChartCard 
        title="分类分布（按数量）" 
        type="doughnut" 
        :data="categoryCountData" 
      />
      <ChartCard 
        title="存储占比（按大小）" 
        type="doughnut" 
        :data="categorySizeData" 
      />
    </div>

    <div class="card" v-if="stats && stats.categories.length">
      <h3 class="section-title">分类详情</h3>
      <table class="table">
        <thead>
          <tr>
            <th>分类</th>
            <th>文件数</th>
            <th>大小</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in stats.categories" :key="cat.category">
            <td>
              <span :class="'badge badge-' + getBadgeClass(cat.category)">{{ cat.category }}</span>
            </td>
            <td>{{ cat.count }}</td>
            <td>{{ cat.size }}</td>
            <td>
              <div class="percent-bar">
                <div class="percent-fill" :style="{ width: cat.percent + '%' }"></div>
                <span class="percent-text">{{ cat.percent }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { getStatistics } from '../api'
import ChartCard from '../components/ChartCard.vue'

export default {
  name: 'StatisticsView',
  components: { ChartCard },
  setup() {
    const stats = ref(null)

    const categoryColors = {
      '视频': '#ef4444',
      '音频': '#a855f7',
      '图片': '#22c55e',
      '文档': '#3b82f6',
      '字幕': '#f97316',
      '其他': '#6b7280'
    }

    const categoryCountData = computed(() => {
      if (!stats.value) return null
      return {
        labels: stats.value.categories.map(c => c.category),
        datasets: [{
          data: stats.value.categories.map(c => c.count),
          backgroundColor: stats.value.categories.map(c => categoryColors[c.category] || '#6b7280'),
          borderWidth: 0,
          hoverOffset: 8
        }]
      }
    })

    const categorySizeData = computed(() => {
      if (!stats.value) return null
      return {
        labels: stats.value.categories.map(c => c.category),
        datasets: [{
          data: stats.value.categories.map(c => c.sizeBytes),
          backgroundColor: stats.value.categories.map(c => categoryColors[c.category] || '#6b7280'),
          borderWidth: 0,
          hoverOffset: 8
        }]
      }
    })

    onMounted(async () => {
      try {
        const res = await getStatistics()
        if (res.success) {
          stats.value = res.stats
        }
      } catch (err) {
        console.error('获取统计失败:', err)
      }
    })

    function getBadgeClass(category) {
      const map = {
        '视频': 'video',
        '图片': 'image',
        '音频': 'audio',
        '文档': 'doc'
      }
      return map[category] || 'other'
    }

    return { stats, categoryCountData, categorySizeData, getBadgeClass }
  }
}
</script>

<style scoped>
.section-title {
  margin-bottom: 16px;
}

.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-top: 24px;
}

.percent-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.percent-fill {
  height: 8px;
  background: var(--primary);
  border-radius: 4px;
  min-width: 4px;
}

.percent-text {
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 768px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>