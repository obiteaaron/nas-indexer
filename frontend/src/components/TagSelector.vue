<template>
  <div class="modal" v-if="visible" @click.self="close">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 class="modal-title">选择标签</h3>
        <span class="modal-close" @click="close">&times;</span>
      </div>

      <div class="tag-selector-body">
        <div v-if="loading" class="loading">加载中...</div>

        <div v-else-if="groups.length === 0" class="empty">
          <p>暂无标签，请先创建标签</p>
          <button class="btn btn-primary btn-small" @click="goToTagManager">管理标签</button>
        </div>

        <div v-else class="tag-groups">
          <div v-for="group in groups" :key="group.id" class="tag-group">
            <div class="tag-group-header" :style="{ color: group.color }">
              {{ group.name }}
            </div>
            <div class="tag-group-tags">
              <span
                v-for="tag in group.tags"
                :key="tag.id"
                class="tag-item"
                :class="{ selected: selectedTagIds.includes(tag.id) }"
                :style="getTagStyle(tag)"
                @click="toggleTag(tag.id)"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>

          <div class="tag-group" v-if="ungroupedTags.length > 0">
            <div class="tag-group-header">未分组</div>
            <div class="tag-group-tags">
              <span
                v-for="tag in ungroupedTags"
                :key="tag.id"
                class="tag-item"
                :class="{ selected: selectedTagIds.includes(tag.id) }"
                :style="getTagStyle(tag)"
                @click="toggleTag(tag.id)"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-link btn-small-text" @click="goToTagManager">管理标签</button>
        <div class="footer-right">
          <button class="btn btn-secondary" @click="close">取消</button>
          <button class="btn btn-primary" @click="confirm">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getTagGroups, getTags } from '../api'
import type { Tag, TagGroup } from '../types'

interface Props {
  visible?: boolean
  selectedIds?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  selectedIds: () => []
})

const emit = defineEmits<{ close: []; confirm: [tagIds: number[]] }>()

const router = useRouter()
const loading = ref(true)
const groups = ref<TagGroup[]>([])
const allTags = ref<Tag[]>([])
const selectedTagIds = ref<number[]>([])

const ungroupedTags = computed(() => {
  return allTags.value.filter(tag => !tag.group_id)
})

watch(() => props.visible, async (val: boolean) => {
  if (val) {
    selectedTagIds.value = [...props.selectedIds]
    await loadTags()
  }
})

onMounted(async () => {
  if (props.visible) {
    await loadTags()
  }
})

async function loadTags(): Promise<void> {
  loading.value = true
  try {
    const groupsRes = await getTagGroups()
    if (groupsRes.success && groupsRes.data) {
      groups.value = groupsRes.data
    }
    const tagsRes = await getTags()
    if (tagsRes.success && tagsRes.data) {
      allTags.value = tagsRes.data as Tag[]
    }
  } catch (err) {
    console.error('加载标签失败:', err)
  }
  loading.value = false
}

function getTagStyle(tag: Tag): { backgroundColor: string; color: string; border: string } {
  const isSelected = selectedTagIds.value.includes(tag.id)
  return {
    backgroundColor: isSelected ? tag.color : 'transparent',
    color: isSelected ? getContrastColor(tag.color) : tag.color,
    border: `1px solid ${tag.color}`
  }
}

function getContrastColor(hex: string): string {
  const color = hex.replace('#', '')
  const r = parseInt(color.substr(0, 2), 16)
  const g = parseInt(color.substr(2, 2), 16)
  const b = parseInt(color.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000' : '#fff'
}

function toggleTag(tagId: number): void {
  const index = selectedTagIds.value.indexOf(tagId)
  if (index > -1) {
    selectedTagIds.value.splice(index, 1)
  } else {
    selectedTagIds.value.push(tagId)
  }
}

function close(): void {
  emit('close')
}

function confirm(): void {
  emit('confirm', selectedTagIds.value)
  close()
}

function goToTagManager(): void {
  router.push('/tags')
  close()
}
</script>

<style scoped>
.tag-selector-body {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.loading, .empty {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
}

.tag-groups {
  padding: 10px;
}

.tag-group {
  margin-bottom: 15px;
}

.tag-group-header {
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.tag-group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.tag-item:hover {
  opacity: 0.8;
}

.tag-item.selected {
  font-weight: 500;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-top: 15px;
}

.footer-right {
  display: flex;
  gap: 10px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  padding: 4px 8px;
}

.btn-small-text {
  font-size: 12px;
}

.btn-link:hover {
  text-decoration: underline;
}
</style>