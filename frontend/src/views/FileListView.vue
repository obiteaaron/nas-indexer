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
        <div class="file-table">
          <div class="file-table-header">
            <div class="file-col file-col-check">
              <input type="checkbox" @change="toggleSelectAll($event)" :checked="isAllSelected">
            </div>
            <div class="file-col file-col-thumb"></div>
            <div class="file-col file-col-name">文件名</div>
            <div class="file-col file-col-size">大小</div>
            <div class="file-col file-col-category">分类</div>
            <div class="file-col file-col-tags">标签</div>
            <div class="file-col file-col-date">修改时间</div>
            <div class="file-col file-col-actions">操作</div>
          </div>
          <RecycleScroller
            class="file-table-body"
            :items="files"
            :item-size="48"
            key-field="id"
            v-slot="{ item: file }"
          >
            <div class="file-table-row" :class="{ selected: selectedFiles.includes(file.id) }">
              <div class="file-col file-col-check">
                <input type="checkbox" :checked="selectedFiles.includes(file.id)" @change="toggleSelect(file.id)">
              </div>
              <div class="file-col file-col-thumb">
                <img v-if="isImageFile(file.ext) && shouldLoadThumbnail(file)"
                     :src="getStreamUrl(file.id)"
                     loading="lazy"
                     class="thumbnail"
                     :alt="file.name"
                     @mouseenter="showHoverPreview($event, file)"
                     @mouseleave="hideHoverPreview"
                     @mousemove="moveHoverPreview($event)" />
                <span v-else class="file-icon" :class="getFileIconClass(file.ext)"></span>
              </div>
              <div class="file-col file-col-name">
                <span class="file-name" :title="file.name" @click="showPreview(file)">{{ file.name }}</span>
                <span class="file-meta">
                  ID: {{ file.id }}<span v-if="isVideoFile(file.ext) && videoMetadata[file.id]"> · Meta: {{ videoMetadata[file.id].duration }} · {{ videoMetadata[file.id].width }}×{{ videoMetadata[file.id].height }}</span>
                </span>
              </div>
              <div class="file-col file-col-size">{{ file.sizeFormatted }}</div>
              <div class="file-col file-col-category">
                <span :class="'badge badge-' + getBadgeClass(file.category)">{{ file.category }}</span>
              </div>
              <div class="file-col file-col-tags">
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
              </div>
              <div class="file-col file-col-date">{{ formatDate(file.modified_at) }}</div>
              <div class="file-col file-col-actions">
                <div class="actions">
                  <button class="btn btn-secondary btn-small" @click="openLocation(file)">定位</button>
                  <button class="btn btn-secondary btn-small" @click="showRename(file)">重命名</button>
                  <button class="btn btn-secondary btn-small" @click="toggleFavorite(file)">
                    {{ file.is_favorite ? '取消收藏' : '收藏' }}
                  </button>
                  <button class="btn btn-danger btn-small" @click="confirmDelete(file)">删除</button>
                </div>
              </div>
            </div>
          </RecycleScroller>
        </div>

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

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import TagBadge from '../components/TagBadge.vue'
import TagSelector from '../components/TagSelector.vue'
import FilePreview from '../components/FilePreview.vue'
import Pagination from '../components/Pagination.vue'
import {
  getFiles, getCategories, openFile, renameFile as apiRename, deleteFile,
  addFavorite, removeFavorite,
  getFileTags, getFileTagsBatch, addFileTag, removeFileTag, batchFileTags,
  getFilesByTags, getTags, getStreamUrl, getConfig, updateFileMetadata
} from '../api'
import type { FileWithTags, Tag, TagWithGroup, Config } from '../types'

interface VideoMeta {
  duration: string
  width: number
  height: number
}

interface HoverPreview {
  visible: boolean
  url: string
  x: number
  y: number
}

const files = ref<FileWithTags[]>([])
const categories = ref<string[]>([])
const loading = ref(true)
const error = ref('')
const category = ref('')
const search = ref('')
const orderBy = ref('name')
const orderDir = ref('ASC')
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const fileTags = ref<Record<number, TagWithGroup[]>>({})
const selectedFiles = ref<number[]>([])

const previewFile = ref<FileWithTags | null>(null)
const renameFile = ref<FileWithTags | null>(null)
const newName = ref('')
const videoMetadata = ref<Record<number, VideoMeta>>({})
const thumbnailPreviewEnabled = ref(true)
const thumbnailSizeLimit = ref(5)
const videoPreviewEnabled = ref(true)
const hoverPreview = ref<HoverPreview>({ visible: false, url: '', x: 0, y: 0 })

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v']

const tagSelectorVisible = ref(false)
const currentEditingFile = ref<FileWithTags | null>(null)
const currentFileTags = ref<number[]>([])

const batchTaggerVisible = ref(false)
const batchSelectedTagIds = ref<number[]>([])

const tagFilterVisible = ref(false)
const filterTagIds = ref<number[]>([])
const allTags = ref<Tag[]>([])
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

async function loadConfig(): Promise<void> {
  try {
    const res = await getConfig()
    if (res.success && res.data) {
      thumbnailPreviewEnabled.value = res.data.thumbnailPreviewEnabled ?? true
      thumbnailSizeLimit.value = res.data.thumbnailSizeLimit ?? 5
      videoPreviewEnabled.value = res.data.videoPreviewEnabled ?? true
    }
  } catch (err) {
    console.error('获取配置失败:', err)
  }
}

async function loadCategories(): Promise<void> {
  try {
    const res = await getCategories()
    if (res.success && res.data) {
      categories.value = res.data
    }
  } catch (err) {
    console.error('获取分类失败:', err)
  }
}

async function loadFiles(): Promise<void> {
  loading.value = true
  error.value = ''
  selectedFiles.value = []
  try {
    if (filterTagIds.value.length > 0) {
      const res = await getFilesByTags({
        tagIds: filterTagIds.value.join(','),
        matchAll: true,
        page: page.value,
        pageSize: pageSize.value,
        orderBy: orderBy.value,
        orderDir: orderDir.value
      })
      if (res.success && res.data) {
        files.value = res.data.files
        total.value = res.data.total
        await loadFileTagsBatch(res.data.files.map(f => f.id))
        loadVideoMetadataBatch(res.data.files)
      } else {
        error.value = res.error || ''
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
      if (res.success && res.data) {
        files.value = res.data.files
        total.value = res.data.total
        await loadFileTagsBatch(res.data.files.map(f => f.id))
        loadVideoMetadataBatch(res.data.files)
      } else {
        error.value = res.error || ''
      }
    }
  } catch (err) {
    const e = err as Error
    error.value = e.message
  }
  loading.value = false
}

async function loadFileTagsBatch(fileIds: number[]): Promise<void> {
  if (fileIds.length === 0) return
  try {
    const res = await getFileTagsBatch(fileIds)
    if (res.success && res.data) {
      Object.assign(fileTags.value, res.data)
    }
  } catch (err) {
    console.error('批量获取标签失败:', err)
    for (const fileId of fileIds) {
      fileTags.value[fileId] = []
    }
  }
}

function toggleSelectAll(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.checked) {
    selectedFiles.value = files.value.map(f => f.id)
  } else {
    selectedFiles.value = []
  }
}

function toggleSelect(fileId: number): void {
  const index = selectedFiles.value.indexOf(fileId)
  if (index > -1) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(fileId)
  }
}

function showBatchTagger(): void {
  batchSelectedTagIds.value = []
  batchTaggerVisible.value = true
}

async function handleBatchTagConfirm(tagIds: number[]): Promise<void> {
  if (tagIds.length === 0) return
  try {
    await batchFileTags(selectedFiles.value, tagIds, 'add')
    await loadFileTagsBatch(selectedFiles.value)
    selectedFiles.value = []
  } catch (err) {
    const e = err as Error
    alert('批量打标失败: ' + e.message)
  }
}

async function showTagFilter(): Promise<void> {
  try {
    const res = await getTags()
    if (res.success && res.data) {
      allTags.value = res.data as Tag[]
    }
  } catch (err) {
    console.error('加载标签失败:', err)
  }
  tagFilterVisible.value = true
}

function handleTagFilterConfirm(tagIds: number[]): void {
  filterTagIds.value = tagIds
  page.value = 1
  loadFiles()
}

function resetAndLoad(): void {
  page.value = 1
  loadFiles()
}

function removeFilterTag(tagId: number): void {
  const index = filterTagIds.value.indexOf(tagId)
  if (index > -1) {
    filterTagIds.value.splice(index, 1)
    page.value = 1
    loadFiles()
  }
}

async function openLocation(file: FileWithTags): Promise<void> {
  try {
    await openFile(file.id)
  } catch (err) {
    const e = err as Error
    alert('打开失败：' + e.message)
  }
}

function showPreview(file: FileWithTags): void {
  previewFile.value = file
}

function showRename(file: FileWithTags): void {
  renameFile.value = file
  newName.value = file.name
}

async function doRename(): Promise<void> {
  if (!newName.value) return

  try {
    const res = await apiRename(renameFile.value!.id, newName.value)
    if (res.success) {
      renameFile.value = null
      loadFiles()
    } else {
      alert('重命名失败：' + res.error)
    }
  } catch (err) {
    const e = err as Error
    alert('重命名失败：' + e.message)
  }
}

async function toggleFavorite(file: FileWithTags): Promise<void> {
  try {
    if (file.is_favorite) {
      await removeFavorite(file.id)
    } else {
      await addFavorite(file.id)
    }
    loadFiles()
  } catch (err) {
    const e = err as Error
    alert('操作失败：' + e.message)
  }
}

async function confirmDelete(file: FileWithTags): Promise<void> {
  if (confirm('确定删除文件 "' + file.name + '"？')) {
    try {
      const res = await deleteFile(file.id)
      if (res.success) {
        loadFiles()
      } else {
        alert('删除失败：' + res.error)
      }
    } catch (err) {
      const e = err as Error
      alert('删除失败：' + e.message)
    }
  }
}

function openTagSelector(file: FileWithTags): void {
  currentEditingFile.value = file
  currentFileTags.value = (fileTags.value[file.id] || []).map(t => t.id)
  tagSelectorVisible.value = true
}

async function handleTagConfirm(tagIds: number[]): Promise<void> {
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
    if (res.success && res.data) {
      fileTags.value[fileId] = res.data
    }
  } catch (err) {
    const e = err as Error
    alert('打标失败: ' + e.message)
  }
}

async function removeTagFromFile(fileId: number, tagId: number): Promise<void> {
  try {
    await removeFileTag(fileId, tagId)
    const res = await getFileTags(fileId)
    if (res.success && res.data) {
      fileTags.value[fileId] = res.data
    }
  } catch (err) {
    const e = err as Error
    alert('移除标签失败: ' + e.message)
  }
}

function getBadgeClass(category: string): string {
  const map: Record<string, string> = {
    '视频': 'video',
    '图片': 'image',
    '音频': 'audio',
    '文档': 'doc'
  }
  return map[category] || 'other'
}

function isImageFile(ext: string | null): boolean {
  return IMAGE_EXTS.includes((ext || '').toLowerCase())
}

function isVideoFile(ext: string | null): boolean {
  return VIDEO_EXTS.includes((ext || '').toLowerCase())
}

function getFileIconClass(ext: string | null): string {
  const lower = (ext || '').toLowerCase()
  if (IMAGE_EXTS.includes(lower)) return 'icon-image'
  if (['.mp4', '.mkv', '.avi', '.mov'].includes(lower)) return 'icon-video'
  if (['.mp3', '.wav', '.flac'].includes(lower)) return 'icon-audio'
  if (['.pdf', '.doc', '.docx'].includes(lower)) return 'icon-doc'
  return 'icon-file'
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

async function loadVideoMetadata(file: FileWithTags): Promise<void> {
  // 1. 检查内存缓存（当前 session）
  if (videoMetadata.value[file.id]) return

  // 2. 检查数据库数据（跨 session）- 只要 duration 存在就认为已获取过
  if (file.duration != null) {
    videoMetadata.value[file.id] = {
      duration: formatDuration(file.duration),
      width: file.width || 0,
      height: file.height || 0
    }
    return // 数据库有数据，填充内存缓存后返回
  }

  // 3. 都无数据，通过 video 元素获取
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = getStreamUrl(file.id)
  video.onloadedmetadata = async () => {
    const duration = Math.floor(video.duration)
    const width = video.videoWidth
    const height = video.videoHeight

    // 填充内存缓存
    videoMetadata.value[file.id] = {
      duration: formatDuration(duration),
      width,
      height
    }

    // 上报到数据库
    try {
      await updateFileMetadata(file.id, { duration, width, height })
    } catch (err) {
      console.error('上报视频元数据失败:', err)
    }
    video.src = ''
  }
  video.onerror = () => {
    video.src = ''
  }
}

function loadVideoMetadataBatch(filesList: FileWithTags[]): void {
  // 视频预览开关关闭时，跳过
  if (!videoPreviewEnabled.value) return
  for (const file of filesList) {
    if (isVideoFile(file.ext)) {
      loadVideoMetadata(file)
    }
  }
}

function shouldLoadThumbnail(file: FileWithTags): boolean {
  if (!isImageFile(file.ext)) return false
  // 图片预览开关关闭时，不加载
  if (!thumbnailPreviewEnabled.value) return false
  // 0 表示不限制
  if (thumbnailSizeLimit.value === 0) return true
  const sizeInMB = (file.size || 0) / (1024 * 1024)
  return sizeInMB <= thumbnailSizeLimit.value
}

function showHoverPreview(event: MouseEvent, file: FileWithTags): void {
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

function hideHoverPreview(): void {
  hoverPreview.value.visible = false
}

function moveHoverPreview(event: MouseEvent): void {
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

async function exportToExcel(): Promise<void> {
  try {
    const allFiles: FileWithTags[] = []
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
          matchAll: true,
          ...params
        })
      } else {
        res = await getFiles(params)
      }

      if (res.success && res.data) {
        allFiles.push(...res.data.files)
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
    const e = err as Error
    alert('导出失败: ' + e.message)
  }
}

function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.file-table {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.file-table-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-muted);
}

.file-table-body {
  height: calc(100vh - 280px);
  min-height: 400px;
}

.file-table-row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light);
  height: 48px;
}

.file-table-row:hover {
  background: var(--bg-hover);
}

.file-table-row.selected {
  background-color: var(--primary-light, #e8f4f8);
}

.file-col {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.file-col-check {
  width: 30px;
  flex-shrink: 0;
  justify-content: center;
}

.file-col-thumb {
  width: 50px;
  flex-shrink: 0;
  justify-content: center;
}

.file-col-name {
  flex: 1;
  min-width: 200px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}

.file-col-size {
  width: 80px;
  flex-shrink: 0;
  font-size: 13px;
}

.file-col-category {
  width: 70px;
  flex-shrink: 0;
}

.file-col-tags {
  width: 20%;
  min-width: 150px;
  flex-shrink: 0;
}

.file-col-date {
  width: 100px;
  flex-shrink: 0;
  font-size: 13px;
}

.file-col-actions {
  width: 230px;
  flex-shrink: 0;
}

.file-name {
  cursor: pointer;
  color: var(--primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
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

.thumbnail {
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bg);
}

.file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: var(--bg);
  font-size: 18px;
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

.file-meta {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
  line-height: 1;
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