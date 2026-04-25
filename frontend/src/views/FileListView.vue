<template>
  <div class="files">
    <div class="card">
      <div class="toolbar">
        <select class="select" v-model="category" @change="loadFiles">
          <option value="">全部分类</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <select class="select" v-model="orderBy" @change="loadFiles">
          <option value="name">按名称</option>
          <option value="size">按大小</option>
          <option value="modified_at">按时间</option>
        </select>
        <select class="select" v-model="orderDir" @change="loadFiles">
          <option value="ASC">升序</option>
          <option value="DESC">降序</option>
        </select>
        <input class="input" v-model="search" placeholder="搜索文件..." @keyup.enter="loadFiles" style="width: 200px">
        <button class="btn btn-secondary btn-small" @click="loadFiles">搜索</button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else>
        <table class="table">
          <thead>
            <tr>
              <th>文件名</th>
              <th>大小</th>
              <th>分类</th>
              <th>修改时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in files" :key="file.id">
              <td>
                <span class="file-name" @click="showPreview(file)">{{ file.name }}</span>
              </td>
              <td>{{ file.sizeFormatted }}</td>
              <td>
                <span :class="'badge badge-' + getBadgeClass(file.category)">{{ file.category }}</span>
              </td>
              <td>{{ formatDate(file.modified_at) }}</td>
              <td>
                <div class="actions">
                  <button class="btn btn-secondary btn-small" @click="openLocation(file)">定位</button>
                  <button class="btn btn-secondary btn-small" @click="showRename(file)">重命名</button>
                  <button class="btn btn-secondary btn-small" @click="toggleFavorite(file)">
                    {{ file.is_favorite ? '取消收藏' : '收藏' }}
                  </button>
                  <button class="btn btn-danger btn-small" @click="confirmDelete(file)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="pagination" v-if="totalPages > 1">
          <button class="btn btn-secondary" @click="prevPage" :disabled="page <= 1">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-secondary" @click="nextPage" :disabled="page >= totalPages">下一页</button>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
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
          
          <div v-else-if="previewType === 'markdown'" class="preview-text preview-markdown" 
            ref="markdownRef" tabindex="0" @keydown.ctrl.a="selectAllInElement($event)">
            <div v-if="textLoading" class="loading-text">加载中...</div>
            <div v-else v-html="renderedMarkdown" class="markdown-body"></div>
          </div>
          
          <div v-else-if="previewType === 'text'" class="preview-text" 
            ref="textRef" tabindex="0" @keydown.ctrl.a="selectAllInElement($event)">
            <div v-if="textLoading" class="loading-text">加载中...</div>
            <pre v-else class="text-content">{{ textContent }}</pre>
          </div>
          
          <div v-else class="preview-unknown">
            <p>无法预览此文件类型</p>
            <button class="btn btn-primary" @click="openLocation(previewFile)">打开文件位置</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Rename Modal -->
    <div class="modal" v-if="renameFile" @click.self="renameFile = null">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">重命名</h3>
          <span class="modal-close" @click="renameFile = null">&times;</span>
        </div>
        <input class="input" v-model="newName" placeholder="新文件名">
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="renameFile = null">取消</button>
          <button class="btn btn-primary" @click="doRename">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed, nextTick } from 'vue'
import { marked } from 'marked'
import { getFiles, getCategories, openFile, renameFile as apiRename, deleteFile, addFavorite, removeFavorite, getPreview, getStreamUrl } from '../api'

export default {
  name: 'FileListView',
  setup() {
    const files = ref([])
    const categories = ref([])
    const loading = ref(true)
    const error = ref('')
    const category = ref('')
    const search = ref('')
    const orderBy = ref('name')
    const orderDir = ref('ASC')
    const page = ref(1)
    const pageSize = ref(50)
    const total = ref(0)

    const previewFile = ref(null)
    const previewType = ref('')
    const streamUrl = ref('')
    const textContent = ref('')
    const textLoading = ref(false)
    const textRef = ref(null)
    const markdownRef = ref(null)
    
    const renameFile = ref(null)
    const newName = ref('')

    const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

    const renderedMarkdown = computed(() => {
      if (!textContent.value) return ''
      return marked(textContent.value)
    })

    onMounted(async () => {
      await loadCategories()
      await loadFiles()
    })

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

    async function loadFiles() {
      loading.value = true
      error.value = ''
      try {
        const res = await getFiles({
          category: category.value,
          search: search.value,
          orderBy: orderBy.value,
          orderDir: orderDir.value,
          page: page.value,
          pageSize: pageSize.value
        })
        if (res.success) {
          files.value = res.data.files
          total.value = res.data.total
        } else {
          error.value = res.error
        }
      } catch (err) {
        error.value = err.message
      }
      loading.value = false
    }

    function prevPage() {
      if (page.value > 1) {
        page.value--
        loadFiles()
      }
    }

    function nextPage() {
      if (page.value < totalPages.value) {
        page.value++
        loadFiles()
      }
    }

    async function openLocation(file) {
      try {
        await openFile(file.id)
      } catch (err) {
        alert('打开失败：' + err.message)
      }
    }

    async function showPreview(file) {
      previewFile.value = file
      streamUrl.value = getStreamUrl(file.id)
      previewType.value = ''
      textContent.value = ''
      
      try {
        const res = await getPreview(file.id)
        if (res.success) {
          previewType.value = res.data.previewType
          
          if (previewType.value === 'text' || previewType.value === 'markdown') {
            await loadTextContent(file.id)
          }
        }
      } catch (err) {
        console.error('获取预览失败:', err)
      }
    }

    async function loadTextContent(fileId) {
      textLoading.value = true
      try {
        const response = await fetch(getStreamUrl(fileId))
        textContent.value = await response.text()
      } catch (err) {
        console.error('加载文本内容失败:', err)
        textContent.value = '加载失败'
      }
      textLoading.value = false
      
      nextTick(() => {
        const refEl = previewType.value === 'markdown' ? markdownRef.value : textRef.value
        if (refEl) {
          refEl.focus()
        }
      })
    }

    function selectAllInElement(event) {
      event.preventDefault()
      const el = event.currentTarget
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    function showRename(file) {
      renameFile.value = file
      newName.value = file.name
    }

    async function doRename() {
      if (!newName.value) return
      
      try {
        const res = await apiRename(renameFile.value.id, newName.value)
        if (res.success) {
          renameFile.value = null
          loadFiles()
        } else {
          alert('重命名失败：' + res.error)
        }
      } catch (err) {
        alert('重命名失败：' + err.message)
      }
    }

    async function toggleFavorite(file) {
      try {
        if (file.is_favorite) {
          await removeFavorite(file.id)
        } else {
          await addFavorite(file.id)
        }
        loadFiles()
      } catch (err) {
        alert('操作失败：' + err.message)
      }
    }

    async function confirmDelete(file) {
      if (confirm('确定删除文件 "' + file.name + '"？')) {
        try {
          const res = await deleteFile(file.id)
          if (res.success) {
            loadFiles()
          } else {
            alert('删除失败：' + res.error)
          }
        } catch (err) {
          alert('删除失败：' + err.message)
        }
      }
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

    function formatDate(date) {
      if (!date) return ''
      return new Date(date).toLocaleDateString('zh-CN')
    }

    return {
      files, categories, loading, error,
      category, search, orderBy, orderDir, page, pageSize, total, totalPages,
      previewFile, previewType, streamUrl, textContent, textLoading, renderedMarkdown,
      textRef, markdownRef,
      renameFile, newName,
      loadFiles, prevPage, nextPage,
      openLocation, showPreview, showRename, doRename,
      toggleFavorite, confirmDelete,
      getBadgeClass, formatDate, selectAllInElement
    }
  }
}
</script>

<style scoped>
.file-name {
  cursor: pointer;
  color: var(--primary);
}

.file-name:hover {
  text-decoration: underline;
}

.actions {
  display: flex;
  gap: 4px;
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

.preview-text {
  width: 100%;
  max-height: 500px;
  overflow: auto;
  text-align: left;
  user-select: text;
}

.preview-text:focus {
  outline: none;
}

.text-content {
  margin: 0;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 480px;
  overflow: auto;
  user-select: text;
}

.loading-text {
  color: var(--text-muted);
  padding: 20px;
}

.preview-markdown {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  user-select: text;
}

.markdown-body {
  line-height: 1.6;
  user-select: text;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3 {
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.markdown-body code {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
}

.markdown-body pre {
  background: rgba(0, 0, 0, 0.1);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
}

.markdown-body pre code {
  background: none;
  padding: 0;
}
</style>