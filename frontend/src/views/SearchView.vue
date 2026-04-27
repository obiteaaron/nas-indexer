<template>
  <div class="search">
    <div class="card">
      <div class="search-bar">
        <input class="input" v-model="query" placeholder="输入搜索关键词..." @keyup.enter="doSearch" autofocus>
        <button class="btn btn-primary" @click="doSearch">搜索</button>
      </div>

      <div class="search-history" v-if="history.length">
        <span class="history-label">搜索历史：</span>
        <span class="history-item" v-for="h in history" :key="h" @click="query = h; doSearch()">{{ h }}</span>
        <button class="btn btn-secondary btn-small" @click="clearHistory">清除</button>
      </div>

      <div class="filters">
        <select class="select" v-model="category">
          <option value="">全部分类</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading">搜索中...</div>
      <div v-else-if="results.length">
        <p class="result-count">找到 {{ total }} 个结果</p>
        <table class="table">
          <thead>
            <tr>
              <th style="width: 30%">文件名</th>
              <th style="width: 35%">路径</th>
              <th style="width: 80px">大小</th>
              <th style="width: 70px">分类</th>
              <th style="width: 70px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in results" :key="file.id">
              <td><span class="file-name" :title="file.name" @click="showPreview(file)">{{ file.name }}</span></td>
              <td class="path-cell">{{ truncatePath(file.path) }}</td>
              <td>{{ file.sizeFormatted }}</td>
              <td>
                <span :class="'badge badge-' + getBadgeClass(file.category)">{{ file.category }}</span>
              </td>
              <td>
                <button class="btn btn-secondary btn-small" @click="openLocation(file)">定位</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="searched" class="no-results">
        未找到匹配的文件
      </div>
    </div>

    <div class="modal" v-if="previewFile" @click.self="previewFile = null">
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h3 class="modal-title">{{ previewFile.name }}</h3>
          <span class="modal-close" @click="previewFile = null">&times;</span>
        </div>
        <div class="preview-content">
          <img v-if="previewType === 'image'" :src="streamUrl" class="preview-image">
          <video v-else-if="previewType === 'video'" :src="streamUrl" controls class="preview-video"></video>
          <audio v-else-if="previewType === 'audio'" :src="streamUrl" controls class="preview-audio"></audio>
          <iframe v-else-if="previewType === 'pdf'" :src="streamUrl" class="preview-pdf"></iframe>
          <div v-else class="preview-unknown">
            <p>无法预览此文件类型</p>
            <button class="btn btn-primary" @click="openLocation(previewFile)">打开文件位置</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { getFiles, getCategories, openFile, getSearchHistory, clearSearchHistory, recordFilePreview, recordUserAction, getPreview, getStreamUrl } from '../api'

export default {
  name: 'SearchView',
  setup() {
    const query = ref('')
    const category = ref('')
    const results = ref([])
    const total = ref(0)
    const loading = ref(false)
    const searched = ref(false)
    const history = ref([])
    const categories = ref([])
    
    const previewFile = ref(null)
    const previewType = ref('')
    const streamUrl = ref('')

    onMounted(async () => {
      await loadHistory()
      await loadCategories()
    })

    async function loadHistory() {
      try {
        const res = await getSearchHistory()
        if (res.success) {
          history.value = [...new Set(res.data)]
        }
      } catch (err) {
        console.error('获取历史失败:', err)
      }
    }

    async function loadCategories() {
      try {
        const res = await getCategories()
        if (res.success) {
          categories.value = res.data
        }
      } catch (err) {
        console.error('获取分类失败:', err)
      }
    }

    async function doSearch() {
      if (!query.value.trim()) return
      
      loading.value = true
      searched.value = true
      
      try {
        const res = await getFiles({
          search: query.value,
          category: category.value,
          pageSize: 100
        })
        if (res.success) {
          results.value = res.data.files
          total.value = res.data.total
          loadHistory()
          recordUserAction(0, 'search', { search_query: query.value }).catch(() => {})
        }
      } catch (err) {
        console.error('搜索失败:', err)
      }
      
      loading.value = false
    }
    
    async function showPreview(file) {
      previewFile.value = file
      streamUrl.value = getStreamUrl(file.id)
      previewType.value = ''
      
      try {
        const res = await getPreview(file.id)
        if (res.success) {
          previewType.value = res.data.previewType
          recordFilePreview(file.id).catch(() => {})
        }
      } catch (err) {
        console.error('获取预览失败:', err)
      }
    }

    async function openLocation(file) {
      try {
        await openFile(file.id)
      } catch (err) {
        alert('打开失败：' + err.message)
      }
    }

    async function clearHistory() {
      try {
        await clearSearchHistory()
        history.value = []
      } catch (err) {
        console.error('清除历史失败:', err)
      }
    }

    function truncatePath(path) {
      if (path.length > 60) {
        return '...' + path.slice(-57)
      }
      return path
    }

    function getBadgeClass(category) {
      const map = {
        '视频': 'video',
        '图片': 'image',
        '音频': 'audio',
        '文档': 'doc'
      }
      return map[category] || 'other'
    }

    return {
      query, category, results, total, loading, searched, history, categories,
      previewFile, previewType, streamUrl,
      doSearch, openLocation, clearHistory, showPreview,
      truncatePath, getBadgeClass
    }
  }
}
</script>

<style scoped>
.search-history {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-label {
  color: var(--text-muted);
  font-size: 14px;
}

.history-item {
  padding: 4px 12px;
  background: var(--bg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.history-item:hover {
  background: var(--border);
}

.filters {
  margin-top: 16px;
}

.result-count {
  color: var(--text-muted);
  margin-bottom: 16px;
}

.path-cell {
  color: var(--text-muted);
  font-size: 13px;
}

.no-results {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}

.file-name {
  cursor: pointer;
  color: var(--primary);
}

.file-name:hover {
  text-decoration: underline;
}

.modal-large {
  max-width: 800px;
}

.preview-content {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 500px;
}

.preview-video {
  max-width: 100%;
  max-height: 400px;
}

.preview-audio {
  width: 100%;
}

.preview-pdf {
  width: 100%;
  height: 400px;
  border: none;
}

.preview-unknown {
  text-align: center;
  color: var(--text-muted);
}
</style>