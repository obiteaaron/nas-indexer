<template>
  <div class="tag-manager">
    <div class="card">
      <div class="toolbar">
        <button class="btn btn-primary" @click="showAddGroup">新建分组</button>
        <button class="btn btn-secondary" @click="showAddTag">新建标签</button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else class="tag-content">
        <div v-if="groups.length === 0 && allTags.length === 0" class="empty-state">
          <p>暂无标签，点击上方按钮创建</p>
        </div>

        <div v-else>
          <div v-for="group in groups" :key="group.id" class="tag-group-section">
            <div class="group-header">
              <span class="group-name" :style="{ color: group.color }">{{ group.name }}</span>
              <span class="group-count">{{ group.tags?.length || 0 }} 个标签</span>
              <div class="group-actions">
                <button class="btn btn-secondary btn-small" @click="editGroup(group)">编辑</button>
                <button class="btn btn-danger btn-small" @click="deleteGroup(group)">删除</button>
              </div>
            </div>
            <div class="group-tags">
              <div v-for="tag in group.tags" :key="tag.id" class="tag-row">
                <TagBadge :name="tag.name" :color="tag.color" />
                <span class="tag-stats">{{ tag.file_count || 0 }} 个文件</span>
                <div class="tag-actions">
                  <button class="btn btn-secondary btn-small" @click="editTag(tag)">编辑</button>
                  <button class="btn btn-danger btn-small" @click="deleteTag(tag)">删除</button>
                </div>
              </div>
              <div v-if="!group.tags || group.tags.length === 0" class="no-tags">暂无标签</div>
            </div>
          </div>

          <div v-if="ungroupedTags.length > 0" class="tag-group-section">
            <div class="group-header">
              <span class="group-name">未分组</span>
              <span class="group-count">{{ ungroupedTags.length }} 个标签</span>
            </div>
            <div class="group-tags">
              <div v-for="tag in ungroupedTags" :key="tag.id" class="tag-row">
                <TagBadge :name="tag.name" :color="tag.color" />
                <span class="tag-stats">{{ tag.file_count || 0 }} 个文件</span>
                <div class="tag-actions">
                  <button class="btn btn-secondary btn-small" @click="editTag(tag)">编辑</button>
                  <button class="btn btn-danger btn-small" @click="deleteTag(tag)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal" v-if="showGroupModal" @click.self="showGroupModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">{{ editingGroup ? '编辑分组' : '新建分组' }}</h3>
          <span class="modal-close" @click="showGroupModal = false">&times;</span>
        </div>
        <div class="form-group">
          <label>分组名称</label>
          <input class="input" v-model="groupForm.name" placeholder="如：类型、年份、状态">
        </div>
        <div class="form-group">
          <label>分组颜色</label>
          <input type="color" class="color-input" v-model="groupForm.color">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showGroupModal = false">取消</button>
          <button class="btn btn-primary" @click="saveGroup">保存</button>
        </div>
      </div>
    </div>

    <div class="modal" v-if="showTagModal" @click.self="showTagModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">{{ editingTag ? '编辑标签' : '新建标签' }}</h3>
          <span class="modal-close" @click="showTagModal = false">&times;</span>
        </div>
        <div class="form-group">
          <label>标签名称</label>
          <input class="input" v-model="tagForm.name" placeholder="如：电影、2024、已看">
        </div>
        <div class="form-group">
          <label>所属分组</label>
          <select class="select" v-model="tagForm.groupId">
            <option value="">无分组</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>标签颜色</label>
          <input type="color" class="color-input" v-model="tagForm.color">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showTagModal = false">取消</button>
          <button class="btn btn-primary" @click="saveTag">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TagBadge from '../components/TagBadge.vue'
import { getTagGroups, createTagGroup, updateTagGroup, deleteTagGroup, getTagStats, createTag, updateTag, deleteTag as apiDeleteTag } from '../api'
import type { TagGroup, Tag, TagStats } from '../types'

interface TagWithStats extends Tag {
  file_count?: number
}

interface TagGroupWithStats extends TagGroup {
  tags?: TagWithStats[]
}

const loading = ref(true)
const groups = ref<TagGroupWithStats[]>([])
const tagStats = ref<TagStats[]>([])

const showGroupModal = ref(false)
const editingGroup = ref<TagGroup | null>(null)
const groupForm = ref({ name: '', color: '#6366f1' })

const showTagModal = ref(false)
const editingTag = ref<Tag | null>(null)
const tagForm = ref({ name: '', groupId: '', color: '#6366f1' })

const allTags = computed(() => tagStats.value)
const ungroupedTags = computed(() => tagStats.value.filter(t => !t.group_id || t.group_id === null))

onMounted(async () => {
  await loadData()
})

async function loadData(): Promise<void> {
  loading.value = true
  try {
    const groupsRes = await getTagGroups()
    if (groupsRes.success && groupsRes.data) {
      groups.value = groupsRes.data
    }
    const statsRes = await getTagStats()
    if (statsRes.success && statsRes.data) {
      tagStats.value = statsRes.data
      const tagsMap: Record<number, TagStats> = {}
      tagStats.value.forEach(t => { tagsMap[t.id] = t })
      groups.value.forEach(group => {
        if (group.tags) {
          group.tags = group.tags.map(tag => ({
            ...tag,
            file_count: tagsMap[tag.id]?.file_count || 0
          }))
        }
      })
    }
  } catch (err) {
    console.error('加载失败:', err)
  }
  loading.value = false
}

function showAddGroup(): void {
  editingGroup.value = null
  groupForm.value = { name: '', color: '#6366f1' }
  showGroupModal.value = true
}

function editGroup(group: TagGroup): void {
  editingGroup.value = group
  groupForm.value = { name: group.name, color: group.color }
  showGroupModal.value = true
}

async function saveGroup(): Promise<void> {
  if (!groupForm.value.name) {
    alert('请输入分组名称')
    return
  }
  try {
    if (editingGroup.value) {
      await updateTagGroup(editingGroup.value.id, groupForm.value)
    } else {
      await createTagGroup(groupForm.value)
    }
    showGroupModal.value = false
    await loadData()
  } catch (err) {
    const error = err as Error
    alert('保存失败: ' + error.message)
  }
}

async function deleteGroup(group: TagGroup): Promise<void> {
  if (!confirm('确定删除分组 "' + group.name + '"？组内标签将变为未分组。')) return
  try {
    await deleteTagGroup(group.id)
    await loadData()
  } catch (err) {
    const error = err as Error
    alert('删除失败: ' + error.message)
  }
}

function showAddTag(): void {
  editingTag.value = null
  tagForm.value = { name: '', groupId: '', color: '#6366f1' }
  showTagModal.value = true
}

function editTag(tag: Tag): void {
  editingTag.value = tag
  tagForm.value = { name: tag.name, groupId: tag.group_id ? String(tag.group_id) : '', color: tag.color }
  showTagModal.value = true
}

async function saveTag(): Promise<void> {
  if (!tagForm.value.name) {
    alert('请输入标签名称')
    return
  }
  try {
    const data = {
      name: tagForm.value.name,
      groupId: tagForm.value.groupId ? parseInt(tagForm.value.groupId) : null,
      color: tagForm.value.color
    }
    if (editingTag.value) {
      await updateTag(editingTag.value.id, data)
    } else {
      await createTag(data)
    }
    showTagModal.value = false
    await loadData()
  } catch (err) {
    const error = err as Error
    alert('保存失败: ' + error.message)
  }
}

async function deleteTag(tag: Tag): Promise<void> {
  if (!confirm('确定删除标签 "' + tag.name + '"？相关文件将移除此标签。')) return
  try {
    await apiDeleteTag(tag.id)
    await loadData()
  } catch (err) {
    const error = err as Error
    alert('删除失败: ' + error.message)
  }
}
</script>

<style scoped>
.tag-manager {
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.toolbar {
  margin-bottom: 20px;
}

.tag-content {
  min-height: 300px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.tag-group-section {
  margin-bottom: 25px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 15px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 15px;
}

.group-name {
  font-size: 18px;
  font-weight: 600;
}

.group-count {
  color: var(--text-muted);
  font-size: 14px;
}

.group-actions {
  margin-left: auto;
  display: flex;
  gap: 5px;
}

.group-tags {
  padding-left: 10px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.tag-row:last-child {
  border-bottom: none;
}

.tag-stats {
  color: var(--text-muted);
  font-size: 14px;
}

.tag-actions {
  margin-left: auto;
  display: flex;
  gap: 5px;
}

.no-tags {
  color: var(--text-muted);
  padding: 10px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.color-input {
  width: 60px;
  height: 30px;
  border: none;
  cursor: pointer;
}
</style>