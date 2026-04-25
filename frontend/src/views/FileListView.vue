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
              <th>文件名</th>
              <th>大小</th>
              <th>分类</th>
              <th>标签</th>
              <th>修改时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in files" :key="file.id" :class="{ selected: selectedFiles.includes(file.id) }">
              <td>
                <input type="checkbox" :checked="selectedFiles.includes(file.id)" @change="toggleSelect(file.id)">
              </td>
              <td>
                <span class="file-name" @click="showPreview(file)">{{ file.name }}</span>
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

        <div class="pagination" v-if="totalPages > 1">
          <button class="btn btn-secondary" @click="prevPage" :disabled="page <= 1">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-secondary" @click="nextPage" :disabled="page >= totalPages">下一页</button>
        </div>
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
import TagBadge from '../components/TagBadge.vue'
import TagSelector from '../components/TagSelector.vue'
import { 
  getFiles, getCategories, openFile, renameFile as apiRename, deleteFile, 
  addFavorite, removeFavorite, getPreview, getStreamUrl,
  getFileTags, addFileTag, removeFileTag, batchFileTags,
  getFilesByTags, getTags
} from '../api'

export default {
  name: 'FileListView',
  components: { TagBadge, TagSelector },
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
    const previewType = ref('')
    const streamUrl = ref('')
    
    const renameFile = ref(null)
    const newName = ref('')

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

    function removeFilterTag(tagId) {
      const index = filterTagIds.value.indexOf(tagId)
      if (index > -1) {
        filterTagIds.value.splice(index, 1)
        page.value = 1
        loadFiles()
      }
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
      
      try {
        const res = await getPreview(file.id)
        if (res.success) {
          previewType.value = res.data.previewType
        }
      } catch (err) {
        console.error('获取预览失败:', err)
      }
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

    function formatDate(date) {
      if (!date) return ''
      return new Date(date).toLocaleDateString('zh-CN')
    }

    return {
      files, categories, loading, error,
      category, search, orderBy, orderDir, page, pageSize, total, totalPages,
      previewFile, previewType, streamUrl,
      renameFile, newName,
      fileTags, selectedFiles, isAllSelected,
      tagSelectorVisible, currentFileTags, currentEditingFile,
      batchTaggerVisible, batchSelectedTagIds,
      tagFilterVisible, filterTagIds, allTags, filterTags,
      loadFiles, prevPage, nextPage,
      openLocation, showPreview, showRename, doRename,
      toggleFavorite, confirmDelete,
      toggleSelectAll, toggleSelect, showBatchTagger, handleBatchTagConfirm,
      openTagSelector, handleTagConfirm, removeTagFromFile,
      showTagFilter, handleTagFilterConfirm, removeFilterTag,
      getBadgeClass, formatDate
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

.file-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

tr.selected {
  background-color: var(--primary-light, #e8f4f8);
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
</style>