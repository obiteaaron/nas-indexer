<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content group-manager-modal">
      <div class="modal-header">
        <h3>{{ editingGroup ? `管理分组：${editingGroup.name}` : '管理分组' }}</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <!-- Create new group form (when not editing a specific group) -->
      <div class="create-group-row" v-if="!editingGroup">
        <input v-model="newGroupName" type="text" placeholder="输入分组名称..." class="create-group-input" @keyup.enter="createGroup" />
        <button class="btn btn-primary btn-small" @click="createGroup" :disabled="!newGroupName.trim()">新建分组</button>
      </div>

      <!-- Group list (when not editing a specific group) -->
      <div class="modal-body" v-if="!editingGroup">
        <div class="group-list">
          <div
            v-for="group in sortedGroups"
            :key="group.id"
            class="group-row"
          >
            <span class="group-icon">{{ group.pinned ? '📌' : '📁' }}</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.game_count || 0 }} 个游戏</span>
            <div class="row-actions">
              <button class="btn btn-secondary btn-small" @click="openGroup(group)">管理成员</button>
              <button class="btn btn-secondary btn-small" @click="togglePin(group)">
                {{ group.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button class="btn btn-danger btn-small" @click="confirmDelete(group)">删除</button>
            </div>
          </div>
          <div class="empty-state" v-if="groups.length === 0">
            <p>暂无分组</p>
          </div>
        </div>
      </div>

      <!-- Group members management -->
      <div class="modal-body" v-else>
        <div class="group-member-header">
          <button class="btn btn-secondary btn-small" @click="editingGroup = null">← 返回分组列表</button>
          <button class="btn btn-primary btn-small" @click="showAddGames = true">+ 添加游戏</button>
        </div>
        <div class="member-list" ref="memberSortableList">
          <div
            v-for="game in groupGames"
            :key="game.id"
            class="member-row"
            :data-game-id="game.id"
          >
            <span class="member-drag-handle">⠿</span>
            <span class="member-title">{{ game.title }}</span>
            <button class="btn btn-danger btn-small" @click="removeFromGroup(game)">移除</button>
          </div>
          <div class="empty-state" v-if="groupGames.length === 0">
            <p>分组内暂无游戏</p>
          </div>
        </div>
      </div>

      <!-- Add games to group modal -->
      <div class="add-games-overlay" v-if="showAddGames" @click.self="showAddGames = false">
        <div class="add-games-content">
          <div class="add-games-header">
            <h4>添加游戏到「{{ editingGroup?.name }}」</h4>
            <button class="modal-close" @click="showAddGames = false">✕</button>
          </div>
          <div class="add-games-search">
            <input
              v-model="candidateSearch"
              type="text"
              placeholder="搜索游戏..."
              class="search-input"
            />
          </div>
          <div class="candidate-list">
            <label
              v-for="game in filteredCandidates"
              :key="game.id"
              class="candidate-row"
            >
              <input type="checkbox" :value="game.id" v-model="selectedToAdd" />
              <span class="candidate-title">{{ game.title }}</span>
            </label>
            <div class="empty-state" v-if="filteredCandidates.length === 0">
              <p>暂无可添加的游戏</p>
            </div>
          </div>
          <div class="add-games-actions">
            <button class="btn btn-secondary" @click="showAddGames = false">取消</button>
            <button class="btn btn-primary" @click="addSelectedGames" :disabled="selectedToAdd.length === 0">
              添加选中 ({{ selectedToAdd.length }})
            </button>
          </div>
        </div>
      </div>

      <!-- Delete confirmation -->
      <div class="confirm-overlay" v-if="deletingGroup" @click.self="deletingGroup = null">
        <div class="confirm-content">
          <h4>确认删除</h4>
          <p>确定要删除分组「{{ deletingGroup.name }}」吗？分组内的游戏不会被删除。</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" @click="deletingGroup = null">取消</button>
            <button class="btn btn-danger" @click="executeDelete">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Sortable from 'sortablejs'
import type { GameGroup, Game } from '../types'
import {
  getGameGroups,
  createGameGroup,
  updateGameGroup,
  deleteGameGroup,
  getGroupGames,
  getGamesNotInGroup,
  addGamesToGroup,
  removeGameFromGroup,
  reorderGroupGames
} from '../api'

interface Props {
  initialGroups: GameGroup[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const groups = ref<GameGroup[]>([...props.initialGroups])
const editingGroup = ref<GameGroup | null>(null)
const groupGames = ref<Game[]>([])
const candidateGames = ref<Game[]>([])
const showAddGames = ref(false)
const selectedToAdd = ref<number[]>([])
const candidateSearch = ref('')
const deletingGroup = ref<GameGroup | null>(null)
const newGroupName = ref('')
let memberSortable: Sortable | null = null
const memberSortableList = ref<HTMLElement | null>(null)

const sortedGroups = computed(() => {
  return [...groups.value].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    return a.sort_order - b.sort_order
  })
})

const filteredCandidates = computed(() => {
  if (!candidateSearch.value) return candidateGames.value
  const q = candidateSearch.value.toLowerCase()
  return candidateGames.value.filter(g =>
    g.title.toLowerCase().includes(q) ||
    (g.title_en && g.title_en.toLowerCase().includes(q))
  )
})

watch(editingGroup, async (newVal) => {
  if (newVal) {
    await loadGroupGames(newVal.id)
  }
})

async function loadGroups() {
  const res = await getGameGroups()
  if (res.success && res.data) {
    groups.value = res.data
    emit('refresh')
  }
}

async function createGroup() {
  if (!newGroupName.value.trim()) return
  await createGameGroup({ name: newGroupName.value.trim() })
  newGroupName.value = ''
  await loadGroups()
}

async function loadGroupGames(groupId: number) {
  const [gamesRes, candidatesRes] = await Promise.all([
    getGroupGames(groupId),
    getGamesNotInGroup(groupId)
  ])
  if (gamesRes.success && gamesRes.data) {
    groupGames.value = gamesRes.data
  }
  if (candidatesRes.success && candidatesRes.data) {
    candidateGames.value = candidatesRes.data
  }
}

function openGroup(group: GameGroup) {
  editingGroup.value = group
  selectedToAdd.value = []
  candidateSearch.value = ''
}

async function togglePin(group: GameGroup) {
  await updateGameGroup(group.id, { pinned: group.pinned ? 0 : 1 })
  await loadGroups()
}

function confirmDelete(group: GameGroup) {
  deletingGroup.value = group
}

async function executeDelete() {
  if (!deletingGroup.value) return
  await deleteGameGroup(deletingGroup.value.id)
  deletingGroup.value = null
  editingGroup.value = null
  await loadGroups()
}

async function removeFromGroup(game: Game) {
  if (!editingGroup.value) return
  await removeGameFromGroup(editingGroup.value.id, game.id)
  await loadGroupGames(editingGroup.value.id)
}

async function addSelectedGames() {
  if (!editingGroup.value || selectedToAdd.value.length === 0) return
  await addGamesToGroup(editingGroup.value.id, selectedToAdd.value)
  selectedToAdd.value = []
  candidateSearch.value = ''
  await loadGroupGames(editingGroup.value.id)
}

onMounted(() => {
  // Init sortable for member list
  if (memberSortableList.value) {
    memberSortable = Sortable.create(memberSortableList.value, {
      animation: 150,
      handle: '.member-drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: async () => {
        if (!editingGroup.value) return
        const children = Array.from(memberSortableList.value!.children) as HTMLElement[]
        const items: Array<{ game_id: number; sort_order: number }> = []
        children.forEach((el, i) => {
          const gameId = Number(el.dataset.gameId)
          if (gameId) {
            items.push({ game_id: gameId, sort_order: i + 1 })
          }
        })
        if (items.length > 0) {
          await reorderGroupGames(editingGroup.value.id, items)
          await loadGroupGames(editingGroup.value.id)
        }
      }
    })
  }
})

onBeforeUnmount(() => {
  memberSortable?.destroy()
})
</script>

<style scoped>
.group-manager-modal {
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
}

.create-group-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.create-group-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}

.group-list {
  max-height: 60vh;
  overflow-y: auto;
}

.group-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
}

.group-row:last-child {
  border-bottom: none;
}

.group-row .group-icon {
  font-size: 18px;
}

.group-row .group-name {
  flex: 1;
  font-weight: 500;
}

.group-row .group-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.row-actions {
  display: flex;
  gap: 4px;
}

.group-member-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.member-list {
  max-height: 50vh;
  overflow-y: auto;
}

.member-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
}

.member-row:last-child {
  border-bottom: none;
}

.member-drag-handle {
  cursor: grab;
  font-size: 16px;
  color: var(--text-secondary);
}

.member-drag-handle:active {
  cursor: grabbing;
}

.member-title {
  flex: 1;
  font-size: 13px;
}

/* Add games overlay */
.add-games-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.add-games-content {
  background: var(--bg-card);
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.add-games-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.add-games-header h4 {
  margin: 0;
  font-size: 16px;
}

.add-games-search {
  padding: 12px 16px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}

.candidate-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
  max-height: 300px;
}

.candidate-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 8px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.candidate-title {
  flex: 1;
  font-size: 13px;
}

.add-games-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

/* Confirm dialog */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.confirm-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
}

.confirm-content h4 {
  margin: 0 0 12px;
}

.confirm-content p {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-state p {
  margin: 0;
}

.sortable-ghost {
  opacity: 0.4;
}

.btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: opacity 0.15s;
}

.btn:hover {
  opacity: 0.85;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-primary {
  background: var(--primary);
  color: white !important;
}

.btn-primary:hover {
  background: var(--primary-dark);
  opacity: 1;
}

.btn-secondary {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
}
</style>
