<template>
  <div class="game-group-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">游戏分组</span>
      <button class="btn-add-group" @click="$emit('create')" title="新建分组">+</button>
    </div>
    <div class="sidebar-list">
      <div
        class="group-item"
        :class="{ active: selectedGroupId === null }"
        @click="$emit('select', null)"
      >
        <span class="group-icon">🎮</span>
        <span class="group-name">全部游戏</span>
      </div>
      <div
        ref="sortableList"
        class="sortable-list"
      >
        <div
          v-for="group in sortedGroups"
          :key="group.id"
          class="group-item"
          :class="{ active: selectedGroupId === group.id }"
          :data-group-id="group.id"
          :data-pinned="group.pinned"
          @click="$emit('select', group.id)"
        >
          <span
            class="group-icon"
            :class="{ 'draggable': !group.pinned }"
          >{{ group.pinned ? '📌' : '📁' }}</span>
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">{{ group.game_count || 0 }}</span>
          <div class="group-actions" @click.stop>
            <button class="btn-icon" @click="$emit('manage', group)" title="管理">✏️</button>
            <button class="btn-icon btn-danger" @click="$emit('delete', group)" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-footer" v-if="groups.length === 0">
      <p class="empty-tip">暂无分组，点击上方 + 创建</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import Sortable from 'sortablejs'
import type { GameGroup } from '../types'

interface Props {
  groups: GameGroup[]
  selectedGroupId: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [groupId: number | null]
  create: []
  manage: [group: GameGroup]
  delete: [group: GameGroup]
  reorder: [items: Array<{ id: number; sort_order: number }>]
}>()

const sortableList = ref<HTMLElement | null>(null)
let sortableInstance: Sortable | null = null

const sortedGroups = computed(() => {
  return [...props.groups].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    return a.sort_order - b.sort_order
  })
})

onMounted(() => {
  if (sortableList.value) {
    sortableInstance = Sortable.create(sortableList.value, {
      animation: 150,
      handle: '.draggable',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      filter: '[data-pinned="1"]',
      onEnd: () => {
        // Read current DOM order (only non-pinned groups)
        const children = Array.from(sortableList.value!.children) as HTMLElement[]
        const items: Array<{ id: number; sort_order: number }> = []
        let order = 1
        children.forEach((el) => {
          const isPinned = el.dataset.pinned === '1'
          if (!isPinned) {
            const groupId = Number(el.dataset.groupId)
            if (groupId) {
              items.push({ id: groupId, sort_order: order++ })
            }
          }
        })
        if (items.length > 0) {
          emit('reorder', items)
        }
      }
    })
  }
})

onBeforeUnmount(() => {
  sortableInstance?.destroy()
})
</script>

<style scoped>
.game-group-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: fit-content;
  max-height: calc(100vh - 140px);
  position: sticky;
  top: 20px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.sidebar-title {
  font-weight: 600;
  font-size: 14px;
}

.btn-add-group {
  background: var(--primary);
  color: white !important;
  border: none;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.btn-add-group:hover {
  opacity: 0.8;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.sortable-list {
  min-height: 0;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 8px;
}

.group-item:hover {
  background: var(--bg);
}

.group-item.active {
  background: var(--primary);
  color: white !important;
}

.group-item.active .group-count {
  background: rgba(255, 255, 255, 0.3);
  color: white !important;
}

.group-item.active .btn-icon {
  background: rgba(255, 255, 255, 0.2);
}

.group-item.active .group-name {
  color: white !important;
}

.group-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.group-icon.draggable {
  cursor: grab;
}

.group-icon.draggable:active {
  cursor: grabbing;
}

.group-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  flex-shrink: 0;
}

.group-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}

.group-item:hover .group-actions {
  display: flex;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  font-size: 12px;
  border-radius: 4px;
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--border);
}

.btn-icon.btn-danger:hover {
  background: #ef4444;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.empty-tip {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
}

.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  background: var(--border) !important;
}

@media (max-width: 768px) {
  .game-group-sidebar {
    width: 100%;
    min-width: unset;
    max-height: none;
    position: static;
  }
}
</style>
