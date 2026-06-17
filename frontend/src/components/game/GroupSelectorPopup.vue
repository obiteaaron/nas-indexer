<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content group-selector-modal">
      <div class="modal-header">
        <h3>选择分组</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索分组..."
            class="search-input"
          />
        </div>

        <div class="group-list">
          <label
            v-for="group in filteredGroups"
            :key="group.id"
            class="group-item"
          >
            <input
              type="checkbox"
              :value="group.id"
              v-model="selectedGroupIds"
            />
            <span class="group-icon">{{ group.pinned ? '📌' : '📁' }}</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count" v-if="group.game_count !== undefined">
              {{ group.game_count }} 个游戏
            </span>
          </label>

          <div class="empty-state" v-if="filteredGroups.length === 0">
            <p>暂无分组</p>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button
          class="btn btn-primary"
          @click="handleConfirm"
        >
          确定 ({{ selectedGroupIds.length })
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { GameGroup } from '../types'
import { getGameGroups } from '../api'

interface Props {
  gameId?: number
  gameIds?: number[]
  selectedGroupIds?: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  confirm: [{ groupIds: number[] }]
}>()

const groups = ref<GameGroup[]>([])
const selectedGroupIds = ref<number[]>(props.selectedGroupIds || [])
const searchQuery = ref('')

const filteredGroups = computed(() => {
  if (!searchQuery.value) return groups.value
  const q = searchQuery.value.toLowerCase()
  return groups.value.filter(g => g.name.toLowerCase().includes(q))
})

async function loadGroups(): Promise<void> {
  const res = await getGameGroups()
  if (res.success && res.data) {
    groups.value = res.data
  }
}

function handleConfirm(): void {
  emit('confirm', { groupIds: selectedGroupIds.value })
  emit('close')
}

onMounted(() => {
  loadGroups()
})

// 当 props.selectedGroupIds 变化时更新本地状态
watch(() => props.selectedGroupIds, (newVal) => {
  if (newVal) {
    selectedGroupIds.value = [...newVal]
  }
})
</script>

<style scoped>
.group-selector-modal {
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.group-list {
  max-height: 50vh;
  overflow-y: auto;
  padding: 8px 16px;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.group-item:last-child {
  border-bottom: none;
}

.group-item input[type="checkbox"] {
  cursor: pointer;
}

.group-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.group-name {
  flex: 1;
  font-size: 14px;
}

.group-count {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border);
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: var(--primary);
  color: white !important;
}

.btn-secondary {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}
</style>