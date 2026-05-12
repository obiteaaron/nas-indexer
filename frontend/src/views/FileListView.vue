<template>
  <div class="files">
    <div class="card">
      <div class="toolbar">
        <select class="select" v-model="category" @change="resetAndLoad">
          <option value="">全部分类</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <select class="select" v-model="orderBy" @change="resetAndLoad">
          <option value="name">按名称</option>
          <option value="size">按大小</option>
          <option value="modified_at">按时间</option>
        </select>
        <select class="select" v-model="orderDir" @change="resetAndLoad">
          <option value="ASC">升序</option>
          <option value="DESC">降序</option>
        </select>
        <input class="input" v-model="search" placeholder="搜索文件..." @keyup.enter="resetAndLoad" style="width: 200px">
        <button class="btn btn-secondary btn-small" @click="resetAndLoad">搜索</button>
        <div class="tag-filter">
          <button class="btn btn-secondary btn-small" @click="showTagFilter">
            {{ filterTagIds.length > 0 ? '标签过滤 (' + filterTagIds.length + ')' : '标签过滤' }}
          </button>
          <div v-if="filterTags.length > 0" class="filter-tags-display">
            <TagBadge 
              v-for="tag in filterTags" 
              :key="tag.id"
              :name="tag.name"
              :color="tag.color"
              :removable="true"
              @remove="removeFilterTag(tag.id)"
            />
          </div>
        </div>
        <button 
          v-if="selectedFiles.length > 0" 
          class="btn btn-primary btn-small" 
          @click="showBatchTagger"
        >
          批量打标 ({{ selectedFiles.length }})
        </button>
        <button class="btn btn-secondary btn-small" @click="exportToExcel">
          导出 Excel
        </button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else>
        <table class="table">
          <thead>
            <tr>
              <th style="width: 30px">
                <input type="checkbox" @change="toggleSelectAll($event)" :checked="isAllSelected">
              </th>
              <th style="width: 50px"></th>
              <th style="width: 30%">文件名</th>
              <th style="width: 80px">大小</th>
              <th style="width: 70px">分类</th>
              <th style="width: 20%">标签</th>
              <th style="width: 100px">修改时间</th>
              <th style="width: 230px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in files" :key="file.id" :class="{ selected: selectedFiles.includes(file.id) }">
              <td>
                <input type="checkbox" :checked="selectedFiles.includes(file.id)" @change="toggleSelect(file.id)">
              </td>
              <td class="thumbnail-cell">
                <img v-if="isImageFile(file.ext) && shouldLoadThumbnail(file)"
                     :src="getStreamUrl(file.id)"
                     loading="lazy"
                     class="thumbnail"
                     :alt="file.name"
                     @mouseenter="showHoverPreview($event, file)"
                     @mouseleave="hideHoverPreview"
                     @mousemove="moveHoverPreview($event)" />
                <span v-else class="file-icon" :class="getFileIconClass(file.ext)"></span>
              </td>
              <td>
                <span class="file-name" :title="file.name" @click="showPreview(file)">{{ file.name }}</span>
                <span v-if="isVideoFile(file.ext) && videoMetadata[file.id]" class="video-meta">
                  {{ videoMetadata[file.id].duration }} · {{ videoMetadata[file.id].width }}×{{ videoMetadata[file.id].height }}
                </span>
              </td>
              <td>{{ file.sizeFormatted }}</td>
              <td>
                <span :class="'badge badge-' + getBadgeClass(file.category)">{{ file.category }}</span>
              </td>
              <td>
                <div class="file-tags">
                  <TagBadge 
                    v-for="tag in fileTags[file.id] || []" 
                    :key="tag.id"
                    :name="tag.name"
                    :color="tag.color"
                    :groupName="tag.group_name"
                    :removable="true"
                    @remove="removeTagFromFile(file.id, tag.id)"
                  />
                  <button class="btn btn-secondary btn-small" @click="openTagSelector(file)">+标签</button>
                </div>
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

        <Pagination v-model="page" :totalPages="totalPages" />
      </div>
    </div>

    <TagSelector 
      :visible="tagSelectorVisible" 
      :selectedIds="currentFileTags"
      @close="tagSelectorVisible = false"
      @confirm="handleTagConfirm"
    />

    <TagSelector 
      :visible="batchTaggerVisible" 
      :selectedIds="batchSelectedTagIds"
      @close="batchTaggerVisible = false"
      @confirm="handleBatchTagConfirm"
    />

    <TagSelector 
      :visible="tagFilterVisible" 
      :selectedIds="filterTagIds"
      @close="tagFilterVisible = false"
      @confirm="handleTagFilterConfirm"
    />

    <FilePreview :visible="!!previewFile" :file="previewFile" @close="previewFile = null" />

    <Teleport to="body">
      <div v-if="hoverPreview.visible" 
           class="hover-preview"
           :style="{ left: hoverPreview.x + 'px', top: hoverPreview.y + 'px' }">
        <img :src="hoverPreview.url" class="hover-preview-img" />
      </div>
    </Teleport>

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
import { ref, onMounted, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import TagBadge from '../components/TagBadge.vue'
import TagSelector from '../components/TagSelector.vue'
import FilePreview from '../components/FilePreview.vue'
import Pagination from '../components/Pagination.vue'
import { 
  getFiles, getCategories, openFile, renameFile as apiRename, deleteFile, 
  addFavorite, removeFavorite,
  getFileTags, addFileTag, removeFileTag, batchFileTags,
  getFilesByTags, getTags, getStreamUrl, getConfig
} from '../api'

export default {
  name: 'FileListView',
  components: { TagBadge, TagSelector, FilePreview, Pagination },
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
    const fileTags = ref({})
    const selectedFiles = ref([])

    const previewFile = ref(null)
    const renameFile = ref(null)
    const newName = ref('')
    const videoMetadata = ref({})
    const thumbnailSizeLimit = ref(5)
    const hoverPreview = ref({ visible: false, url: '', x: 0, y: 0 })

    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']
    const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v']

    const tagSelectorVisible = ref(false)
    const currentEditingFile = ref(null)
    const currentFileTags = ref([])

    const batchTaggerVisible = ref(false)
    const batchSelectedTagIds = ref([])

    const tagFilterVisible = ref(false)
    const filterTagIds = ref([])
    const allTags = ref([])
    const filterTags = computed(() => {
      return allTags.value.filter(t => filterTagIds.value.includes(t.id))
    })

    const totalPages = computed(() => Math.ceil(total.value / pageSize.value))
    const isAllSelected = computed(() => {
      return files.value.length > 0 && selectedFiles.value.length === files.value.length
    })

    watch(page, () => {
      loadFiles()
    })

    onMounted(async () => {
      await loadConfig()
      await loadCategories()
      await loadFiles()
    })

    async function loadConfig() {
      try {
        const res = await getConfig()
        if (res.thumbnailSizeLimit !== undefined) {
          thumbnailSizeLimit.value = res.thumbnailSizeLimit
        }
      } catch (err) {
        console.error('获取配置失败:', err)
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

    async function loadFiles() {
      loading.value = true
      error.value = ''
      selectedFiles.value = []
      try {
        if (filterTagIds.value.length > 0) {
          const res = await getFilesByTags({
            tagIds: filterTagIds.value.join(','),
            matchAll: 'true',
            page: page.value,
            pageSize: pageSize.value,
            orderBy: orderBy.value,
            orderDir: orderDir.value
          })
          if (res.success) {
            files.value = res.data.files
            total.value = res.data.total
            await loadFileTagsBatch(res.data.files.map(f => f.id))
            loadVideoMetadataBatch(res.data.files)
          } else {
            error.value = res.error
          }
        } else {
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
            await loadFileTagsBatch(res.data.files.map(f => f.id))
            loadVideoMetadataBatch(res.data.files)
          } else {
            error.value = res.error
          }
        }
      } catch (err) {
        error.value = err.message
      }
      loading.value = false
    }

    async function loadFileTagsBatch(fileIds) {
      for (const fileId of fileIds) {
        try {
          const res = await getFileTags(fileId)
          if (res.success) {
            fileTags.value[fileId] = res.data
          }
        } catch (err) {
          fileTags.value[fileId] = []
        }
      }
    }

    function toggleSelectAll(event) {
      if (event.target.checked) {
        selectedFiles.value = files.value.map(f => f.id)
      } else {
        selectedFiles.value = []
      }
    }

    function toggleSelect(fileId) {
      const index = selectedFiles.value.indexOf(fileId)
      if (index > -1) {
        selectedFiles.value.splice(index, 1)
      } else {
        selectedFiles.value.push(fileId)
      }
    }

    function showBatchTagger() {
      batchSelectedTagIds.value = []
      batchTaggerVisible.value = true
    }

    async function handleBatchTagConfirm(tagIds) {
      if (tagIds.length === 0) return
      try {
        await batchFileTags(selectedFiles.value, tagIds, 'add')
        await loadFileTagsBatch(selectedFiles.value)
        selectedFiles.value = []
      } catch (err) {
        alert('批量打标失败: ' + err.message)
      }
    }

    async function showTagFilter() {
      try {
        const res = await getTags()
        if (res.success) {
          allTags.value = res.data
        }
      } catch (err) {
        console.error('加载标签失败:', err)
      }
      tagFilterVisible.value = true
    }

    function handleTagFilterConfirm(tagIds) {
      filterTagIds.value = tagIds
      page.value = 1
      loadFiles()
    }

    function resetAndLoad() {
      page.value = 1
      loadFiles()
    }

    function removeFilterTag(tagId) {
      const index = filterTagIds.value.indexOf(tagId)
      if (index > -1) {
        filterTagIds.value.splice(index, 1)
        page.value = 1
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

    function showPreview(file) {
      previewFile.value = file
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

    function openTagSelector(file) {
      currentEditingFile.value = file
      currentFileTags.value = (fileTags.value[file.id] || []).map(t => t.id)
      tagSelectorVisible.value = true
    }

    async function handleTagConfirm(tagIds) {
      if (!currentEditingFile.value) return
      const fileId = currentEditingFile.value.id
      const existingTagIds = (fileTags.value[fileId] || []).map(t => t.id)
      const toAdd = tagIds.filter(id => !existingTagIds.includes(id))
      const toRemove = existingTagIds.filter(id => !tagIds.includes(id))
      
      try {
        for (const tagId of toAdd) {
          await addFileTag(fileId, tagId)
        }
        for (const tagId of toRemove) {
          await removeFileTag(fileId, tagId)
        }
        const res = await getFileTags(fileId)
        if (res.success) {
          fileTags.value[fileId] = res.data
        }
      } catch (err) {
        alert('打标失败: ' + err.message)
      }
    }

    async function removeTagFromFile(fileId, tagId) {
      try {
        await removeFileTag(fileId, tagId)
        const res = await getFileTags(fileId)
        if (res.success) {
          fileTags.value[fileId] = res.data
        }
      } catch (err) {
        alert('移除标签失败: ' + err.message)
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

    function isImageFile(ext) {
      return IMAGE_EXTS.includes((ext || '').toLowerCase())
    }

    function isVideoFile(ext) {
      return VIDEO_EXTS.includes((ext || '').toLowerCase())
    }

    function getFileIconClass(ext) {
      const lower = (ext || '').toLowerCase()
      if (IMAGE_EXTS.includes(lower)) return 'icon-image'
      if (['.mp4', '.mkv', '.avi', '.mov'].includes(lower)) return 'icon-video'
      if (['.mp3', '.wav', '.flac'].includes(lower)) return 'icon-audio'
      if (['.pdf', '.doc', '.docx'].includes(lower)) return 'icon-doc'
      return 'icon-file'
    }

    function formatDuration(seconds) {
      if (!seconds || isNaN(seconds)) return ''
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = Math.floor(seconds % 60)
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      return `${m}:${String(s).padStart(2, '0')}`
    }

    function loadVideoMetadata(file) {
      if (videoMetadata.value[file.id]) return
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = getStreamUrl(file.id)
      video.onloadedmetadata = () => {
        videoMetadata.value[file.id] = {
          duration: formatDuration(video.duration),
          width: video.videoWidth,
          height: video.videoHeight
        }
        video.src = ''
      }
      video.onerror = () => {
        video.src = ''
      }
    }

    function loadVideoMetadataBatch(filesList) {
      for (const file of filesList) {
        if (isVideoFile(file.ext)) {
          loadVideoMetadata(file)
        }
      }
    }

    function shouldLoadThumbnail(file) {
      if (!isImageFile(file.ext)) return false
      if (thumbnailSizeLimit.value === 0) return true
      const sizeInMB = (file.size || 0) / (1024 * 1024)
      return sizeInMB <= thumbnailSizeLimit.value
    }

    function showHoverPreview(event, file) {
      const previewWidth = 608
      const previewHeight = 458
      let x = event.clientX + 16
      let y = event.clientY + 16

      if (x + previewWidth > window.innerWidth) {
        x = event.clientX - previewWidth - 16
      }
      if (y + previewHeight > window.innerHeight) {
        y = event.clientY - previewHeight - 16
      }
      if (x < 0) x = 0
      if (y < 0) y = 0

      hoverPreview.value = {
        visible: true,
        url: getStreamUrl(file.id),
        x,
        y
      }
    }

    function hideHoverPreview() {
      hoverPreview.value.visible = false
    }

    function moveHoverPreview(event) {
      if (hoverPreview.value.visible) {
        const previewWidth = 608
        const previewHeight = 458
        let x = event.clientX + 16
        let y = event.clientY + 16

        if (x + previewWidth > window.innerWidth) {
          x = event.clientX - previewWidth - 16
        }
        if (y + previewHeight > window.innerHeight) {
          y = event.clientY - previewHeight - 16
        }
        if (x < 0) x = 0
        if (y < 0) y = 0

        hoverPreview.value.x = x
        hoverPreview.value.y = y
      }
    }

    async function exportToExcel() {
      try {
        let allFiles = []
        let currentPage = 1
        const exportPageSize = 500
        let hasMore = true

        while (hasMore) {
          const params = {
            category: category.value,
            search: search.value,
            orderBy: orderBy.value,
            orderDir: orderDir.value,
            page: currentPage,
            pageSize: exportPageSize
          }

          let res
          if (filterTagIds.value.length > 0) {
            res = await getFilesByTags({
              tagIds: filterTagIds.value.join(','),
              matchAll: 'true',
              ...params
            })
          } else {
            res = await getFiles(params)
          }

          if (res.success) {
            allFiles = allFiles.concat(res.data.files)
            hasMore = currentPage < res.data.totalPages
            currentPage++
          } else {
            hasMore = false
          }
        }

        const exportData = allFiles.map(f => ({
          '文件名': f.name,
          '路径': f.path,
          '大小': f.sizeFormatted,
          '分类': f.category,
          '修改时间': f.modified_at ? new Date(f.modified_at).toLocaleString('zh-CN') : ''
        }))

        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '文件列表')

        ws['!cols'] = [
          { wch: 40 },
          { wch: 60 },
          { wch: 12 },
          { wch: 10 },
          { wch: 20 }
        ]

        const date = new Date().toISOString().slice(0, 10)
        XLSX.writeFile(wb, `文件列表_${date}.xlsx`)
      } catch (err) {
        alert('导出失败: ' + err.message)
      }
    }

    function formatDate(date) {
      if (!date) return ''
      return new Date(date).toLocaleDateString('zh-CN')
    }

    return {
      files, categories, loading, error,
      category, search, orderBy, orderDir, page, pageSize, total, totalPages,
      previewFile,
      renameFile, newName, videoMetadata, thumbnailSizeLimit, hoverPreview,
      fileTags, selectedFiles, isAllSelected,
      tagSelectorVisible, currentFileTags, currentEditingFile,
      batchTaggerVisible, batchSelectedTagIds,
      tagFilterVisible, filterTagIds, allTags, filterTags,
      loadFiles, resetAndLoad,
      openLocation, showPreview, showRename, doRename,
      toggleFavorite, confirmDelete,
      toggleSelectAll, toggleSelect, showBatchTagger, handleBatchTagConfirm,
      openTagSelector, handleTagConfirm, removeTagFromFile,
      showTagFilter, handleTagFilterConfirm, removeFilterTag,
      getBadgeClass, formatDate, isImageFile, isVideoFile, getFileIconClass, getStreamUrl,
      exportToExcel, shouldLoadThumbnail, showHoverPreview, hideHoverPreview, moveHoverPreview
    }
  }
}
</script>

<style scoped>
.file-name {
  cursor: pointer;
  color: var(--primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name:hover {
  text-decoration: underline;
}

.actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.actions .btn {
  flex-shrink: 0;
}

.file-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

tr.selected {
  background-color: var(--primary-light, #e8f4f8);
}

.tag-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-tags-display {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.thumbnail-cell {
  width: 50px;
  text-align: center;
  overflow: visible;
  white-space: normal;
  text-overflow: initial;
}

.table td:first-child,
.table th:first-child {
  width: 30px;
  overflow: visible;
  white-space: normal;
  text-overflow: initial;
}

.thumbnail {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bg);
}

.file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: var(--bg);
  font-size: 20px;
}

.file-icon::before {
  content: '📄';
}

.file-icon.icon-video::before {
  content: '🎬';
}

.file-icon.icon-audio::before {
  content: '🎵';
}

.file-icon.icon-doc::before {
  content: '📝';
}

.file-icon.icon-image::before {
  content: '📷';
}

.video-meta {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.hover-preview {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.hover-preview-img {
  display: block;
  max-width: 600px;
  max-height: 450px;
  object-fit: contain;
  border-radius: 4px;
}
</style>