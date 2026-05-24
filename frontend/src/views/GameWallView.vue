<template>
  <div class="game-wall">
    <div class="wall-header">
      <h2 class="section-title">游戏海报墙</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="refreshGames" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
        <button class="btn btn-secondary" @click="showAddGameModal = true">
          手动添加
        </button>
        <button class="btn btn-secondary" @click="showIdentifyModal = true">
          重新识别
        </button>
        <button class="btn btn-secondary" @click="showBatchScrapeModal = true" :disabled="scraping">
          {{ scraping ? '刮削中...' : '批量刮削' }}
        </button>
        <button class="btn btn-secondary" @click="showRemoveNonexistentModal = true">
          移除不存在目录
        </button>
        <button class="btn btn-warning" @click="handleCleanupStaleGames">
          清理已移除路径记录
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索游戏..."
          class="search-input"
          @input="debouncedSearch"
        />
      </div>
      <div class="filter-group">
        <select v-model="filterGenre" class="filter-select" @change="loadGames">
          <option value="">所有类型</option>
          <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
        </select>
      </div>
      <div class="filter-group">
        <select v-model="filterYear" class="filter-select" @change="loadGames">
          <option value="">所有年份</option>
          <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
        </select>
      </div>
      <div class="filter-group">
        <select v-model="filterScraped" class="filter-select" @change="loadGames">
          <option value="">全部状态</option>
          <option value="true">已刮削</option>
          <option value="false">待刮削</option>
          <option value="excluded">已排除</option>
        </select>
      </div>
      <div class="filter-group">
        <select v-model="orderBy" class="filter-select" @change="loadGames">
          <option value="title">按名称</option>
          <option value="rating">按评分</option>
          <option value="release_date">按年份（新→旧）</option>
        </select>
      </div>
    </div>

    <div class="stats-summary" v-if="stats">
      <span class="stat-item">总计 {{ stats.totalGames }} 个游戏</span>
      <span class="stat-item">已刮削 {{ stats.scrapedGames }} 个</span>
      <span class="stat-item">待刮削 {{ stats.unscrapedGames }} 个</span>
      <span class="stat-item" v-if="stats.excludedGames > 0">已排除 {{ stats.excludedGames }} 个</span>
    </div>

    <div class="poster-grid" v-if="games.length">
      <GameCard
        v-for="game in games"
        :key="game.id"
        :game="game"
        @click="showGameDetail(game)"
        @open="openGameDir"
        @detail="showGameDetail"
        @exclude="toggleExclude"
        @promote="promoteGame"
        @delete="deleteSingleGame"
      />
    </div>

    <div class="empty-state" v-else-if="!loading">
      <p>暂无游戏数据</p>
      <p class="empty-tip">请在设置中启用游戏模块，然后扫描文件</p>
    </div>

    <div class="pagination" v-if="totalPages > 1">
      <Pagination
        v-model="page"
        :totalPages="totalPages"
      />
    </div>

    <!-- Game Detail Modal -->
    <div class="modal-overlay" v-if="selectedGame" @click.self="selectedGame = null">
      <div class="modal-content game-detail-modal">
        <div class="modal-header">
          <h3>{{ selectedGame.title }}</h3>
          <button class="modal-close" @click="selectedGame = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-poster">
            <img
              v-if="selectedGame.poster_horizontal_path"
              :src="`/api/games/${selectedGame.id}/poster/horizontal`"
              :alt="selectedGame.title"
            />
            <div v-else class="poster-placeholder-large">
              <span class="poster-icon">🎮</span>
            </div>
          </div>
          <div class="detail-info">
            <div class="info-row" v-if="selectedGame.developer">
              <span class="info-label">开发商</span>
              <span class="info-value">{{ selectedGame.developer }}</span>
            </div>
            <div class="info-row" v-if="selectedGame.publisher">
              <span class="info-label">发行商</span>
              <span class="info-value">{{ selectedGame.publisher }}</span>
            </div>
            <div class="info-row" v-if="selectedGame.release_date">
              <span class="info-label">发行日期</span>
              <span class="info-value">{{ selectedGame.release_date }}</span>
            </div>
            <div class="info-row" v-if="selectedGame.rating">
              <span class="info-label">评分</span>
              <span class="info-value rating">{{ selectedGame.rating }}</span>
            </div>
            <div class="info-row" v-if="genresArray.length">
              <span class="info-label">类型</span>
              <span class="info-value">{{ genresArray.join(', ') }}</span>
            </div>
            <div class="info-row" v-if="selectedGame.steam_appid">
              <span class="info-label">Steam</span>
              <a class="info-value link" :href="`https://store.steampowered.com/app/${selectedGame.steam_appid}`" target="_blank">
                查看 Steam 页面
              </a>
            </div>
            <div class="info-row" v-if="selectedGame.short_description">
              <span class="info-label">简介</span>
              <p class="info-value description">{{ selectedGame.short_description }}</p>
            </div>
            <div class="info-row" v-if="selectedGame.source_path">
              <span class="info-label">路径</span>
              <span class="info-value path">{{ selectedGame.source_path }}</span>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="openGameDir(selectedGame)">打开目录</button>
          <button class="btn btn-secondary" @click="openSteamSearch">搜索 Steam</button>
          <button class="btn btn-secondary" @click="scrapeGame(selectedGame)" :disabled="scraping">
            {{ scraping ? '刮削中...' : '重新刮削' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Identify Modal -->
    <div class="modal-overlay" v-if="showIdentifyModal" @click.self="showIdentifyModal = false">
      <div class="modal-content identify-modal">
        <div class="modal-header">
          <h3>重新识别游戏</h3>
          <button class="modal-close" @click="showIdentifyModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p>重新扫描已配置的路径，识别其中的游戏目录。</p>
          <p class="warning">这将重新识别所有游戏，但不会删除已有的元数据。</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showIdentifyModal = false">取消</button>
          <button class="btn btn-primary" @click="identifyGames" :disabled="identifying">
            {{ identifying ? '识别中...' : '开始识别' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Steam Search Modal -->
    <div class="modal-overlay" v-if="showSteamSearchModal" @click.self="showSteamSearchModal = false">
      <div class="modal-content steam-search-modal">
        <div class="modal-header">
          <h3>搜索 Steam 游戏</h3>
          <button class="modal-close" @click="showSteamSearchModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="steam-search-bar">
            <input
              v-model="steamSearchQuery"
              type="text"
              placeholder="输入游戏名称搜索..."
              class="search-input"
              @keyup.enter="searchSteam"
            />
            <button class="btn btn-primary" @click="searchSteam" :disabled="steamSearching">
              {{ steamSearching ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <div v-if="steamSearchResults.length" class="steam-results">
            <div
              v-for="item in steamSearchResults"
              :key="item.id"
              class="steam-result-item"
              :class="{ selected: selectedSteamItem?.id === item.id }"
              @click="selectedSteamItem = item"
            >
              <img :src="item.tiny_image" :alt="item.name" class="steam-thumb" />
              <div class="steam-result-info">
                <div class="steam-result-name">{{ item.name }}</div>
                <div v-if="item.metacritic_score" class="steam-result-score">
                  Metacritic: {{ item.metacritic_score }}
                </div>
                <div class="steam-result-appid">AppID: {{ item.id }}</div>
              </div>
            </div>
          </div>
          <div v-else-if="steamSearched && !steamSearching" class="steam-empty">
            未找到相关游戏
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showSteamSearchModal = false">取消</button>
          <button
            class="btn btn-primary"
            @click="bindSteamAppid"
            :disabled="!selectedSteamItem || bindingSteam"
          >
            {{ bindingSteam ? '绑定中...' : '绑定并刮削' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Batch Scrape Confirm Modal -->
    <div class="modal-overlay" v-if="showBatchScrapeModal" @click.self="showBatchScrapeModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>批量刮削</h3>
          <button class="modal-close" @click="showBatchScrapeModal = false">✕</button>
        </div>
        <div class="modal-body confirm-body">
          <p>确定要对所有未刮削的游戏执行批量刮削吗？</p>
          <p class="warning">这将从 Steam 获取元数据和海报，已有元数据的游戏不会被覆盖。</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showBatchScrapeModal = false">取消</button>
          <button class="btn btn-primary" @click="showBatchScrapeModal = false; scrapeAll()" :disabled="scraping">
            {{ scraping ? '刮削中...' : '确定' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Remove Nonexistent Confirm Modal -->
    <div class="modal-overlay" v-if="showRemoveNonexistentModal" @click.self="showRemoveNonexistentModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>移除不存在目录</h3>
          <button class="modal-close" @click="showRemoveNonexistentModal = false">✕</button>
        </div>
        <div class="modal-body confirm-body">
          <p>确定要移除所有目录已不存在的游戏吗？</p>
          <p class="warning">此操作不可撤销，将从数据库中删除对应的游戏记录。</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showRemoveNonexistentModal = false">取消</button>
          <button class="btn btn-primary" @click="showRemoveNonexistentModal = false; removeNonexistent()">
            确定移除
          </button>
        </div>
      </div>
    </div>

    <!-- Add Game Modal -->
    <div class="modal-overlay" v-if="showAddGameModal" @click.self="showAddGameModal = false">
      <div class="modal-content add-game-modal">
        <div class="modal-header">
          <h3>手动添加游戏</h3>
          <button class="modal-close" @click="showAddGameModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">游戏路径 <span class="required">*</span></label>
            <input v-model="addForm.source_path" class="input" placeholder="E:\Games\游戏名称" />
            <span class="hint">游戏所在目录的绝对路径</span>
          </div>
          <div class="form-row">
            <label class="form-label">游戏名称 <span class="required">*</span></label>
            <input v-model="addForm.title" class="input" placeholder="塞尔达传说：旷野之息" />
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">英文名</label>
              <input v-model="addForm.title_en" class="input" placeholder="Zelda: Breath of the Wild" />
            </div>
            <div class="form-row half">
              <label class="form-label">Steam AppID</label>
              <input v-model="addForm.steam_appid" class="input" type="number" placeholder="782330" />
              <span class="hint">填写后自动刮削</span>
            </div>
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">开发商</label>
              <input v-model="addForm.developer" class="input" placeholder="Nintendo" />
            </div>
            <div class="form-row half">
              <label class="form-label">发行商</label>
              <input v-model="addForm.publisher" class="input" placeholder="Nintendo" />
            </div>
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">发行日期</label>
              <input v-model="addForm.release_date" class="input" placeholder="2017-03-03" />
            </div>
            <div class="form-row half">
              <label class="form-label">类型</label>
              <input v-model="addForm.genres" class="input" placeholder="动作, 冒险, RPG" />
              <span class="hint">逗号分隔</span>
            </div>
          </div>
          <div class="form-row">
            <a class="toggle-more" @click="showMoreFields = !showMoreFields">
              {{ showMoreFields ? '收起扩展字段 ▲' : '展开扩展字段 ▼' }}
            </a>
          </div>
          <div v-if="showMoreFields">
            <div class="form-row">
              <label class="form-label">简介</label>
              <textarea v-model="addForm.short_description" class="textarea" rows="2" placeholder="简短介绍..."></textarea>
            </div>
            <div class="form-row">
              <label class="form-label">备注</label>
              <textarea v-model="addForm.notes" class="textarea" rows="2" placeholder="备注信息..."></textarea>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAddGameModal = false">取消</button>
          <button class="btn btn-primary" @click="submitAddGame" :disabled="addingGame">
            {{ addingGame ? '添加中...' : '确认添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  getGames,
  getGameStatistics,
  getGameGenres,
  getGameYears,
  openGame,
  deleteGame,
  scrapeGame as scrapeGameApi,
  scrapeGamesBatch,
  identifyGames as identifyGamesApi,
  searchSteamGames,
  bindSteamGame,
  toggleExcludeGame,
  promoteGame as promoteGameApi,
  createGame as createGameApi,
  removeNonexistentGames,
  cleanupStaleGames
} from '../api'
import GameCard from '../components/GameCard.vue'
import Pagination from '../components/Pagination.vue'
import type { Game, GameStatistics, SteamSearchItem } from '../types'

const games = ref<Game[]>([])
const stats = ref<GameStatistics | null>(null)
const genres = ref<string[]>([])
const years = ref<string[]>([])
const loading = ref(false)
const scraping = ref(false)
const identifying = ref(false)
const selectedGame = ref<Game | null>(null)
const showIdentifyModal = ref(false)
const showSteamSearchModal = ref(false)
const steamSearchQuery = ref('')
const steamSearchResults = ref<SteamSearchItem[]>([])
const selectedSteamItem = ref<SteamSearchItem | null>(null)
const steamSearching = ref(false)
const steamSearched = ref(false)
const bindingSteam = ref(false)
const showBatchScrapeModal = ref(false)
const showRemoveNonexistentModal = ref(false)
const showAddGameModal = ref(false)
const addingGame = ref(false)
const showMoreFields = ref(false)
const addForm = ref({
  source_path: '',
  title: '',
  title_en: '',
  steam_appid: '',
  developer: '',
  publisher: '',
  release_date: '',
  genres: '',
  short_description: '',
  notes: ''
})

const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

const searchQuery = ref('')
const filterGenre = ref('')
const filterYear = ref('')
const filterScraped = ref('')
const orderBy = ref('title')

let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(page, () => {
  loadGames()
})

function debouncedSearch(): void {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    page.value = 1
    loadGames()
  }, 300)
}

const genresArray = computed(() => {
  if (!selectedGame.value) return []
  if (selectedGame.value.genresArray) return selectedGame.value.genresArray
  if (selectedGame.value.genres) {
    try {
      return JSON.parse(selectedGame.value.genres)
    } catch {
      return []
    }
  }
  return []
})

async function loadGames(): Promise<void> {
  loading.value = true
  try {
    const isExcluded = filterScraped.value === 'excluded'
    const res = await getGames({
      search: searchQuery.value,
      genre: filterGenre.value,
      year: filterYear.value,
      scraped: isExcluded ? undefined : filterScraped.value,
      excluded: isExcluded ? 'true' : undefined,
      orderBy: orderBy.value,
      orderDir: 'ASC',
      page: page.value,
      pageSize: pageSize.value
    })
    if (res.success && res.data) {
      games.value = res.data.games
      total.value = res.data.total
    }
  } catch (err) {
    console.error('加载游戏失败:', err)
  }
  loading.value = false
}

async function loadStats(): Promise<void> {
  try {
    const res = await getGameStatistics()
    if (res.success && res.data) {
      stats.value = res.data
    }
  } catch (err) {
    console.error('加载统计失败:', err)
  }
}

async function loadFilters(): Promise<void> {
  try {
    const genresRes = await getGameGenres()
    if (genresRes.success && genresRes.data) {
      genres.value = genresRes.data
    }
    const yearsRes = await getGameYears()
    if (yearsRes.success && yearsRes.data) {
      years.value = yearsRes.data
    }
  } catch (err) {
    console.error('加载过滤选项失败:', err)
  }
}

async function refreshGames(): Promise<void> {
  await Promise.all([loadGames(), loadStats(), loadFilters()])
}

async function openGameDir(game: Game): Promise<void> {
  try {
    await openGame(game.id)
  } catch (err) {
    console.error('打开目录失败:', err)
  }
}

async function scrapeGame(game: Game): Promise<void> {
  scraping.value = true
  try {
    const res = await scrapeGameApi(game.id)
    if (res.success && res.data) {
      const idx = games.value.findIndex(g => g.id === game.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = res.data
      }
      loadStats()
    }
  } catch (err) {
    console.error('刮削失败:', err)
  }
  scraping.value = false
}

async function scrapeAll(): Promise<void> {
  scraping.value = true
  try {
    const res = await scrapeGamesBatch()
    if (res.success && res.data) {
      await loadGames()
      await loadStats()
    }
  } catch (err) {
    console.error('批量刮削失败:', err)
  }
  scraping.value = false
}

async function identifyGames(): Promise<void> {
  identifying.value = true
  try {
    const res = await identifyGamesApi()
    if (res.success) {
      showIdentifyModal.value = false
      await refreshGames()
    }
  } catch (err) {
    console.error('识别失败:', err)
  }
  identifying.value = false
}

function openSteamSearch(): void {
  if (selectedGame.value) {
    steamSearchQuery.value = selectedGame.value.original_name || selectedGame.value.title
    steamSearchResults.value = []
    selectedSteamItem.value = null
    steamSearched.value = false
    showSteamSearchModal.value = true
  }
}

async function searchSteam(): Promise<void> {
  if (!steamSearchQuery.value.trim()) return
  steamSearching.value = true
  steamSearched.value = false
  try {
    const res = await searchSteamGames(steamSearchQuery.value.trim())
    if (res.success && res.data) {
      steamSearchResults.value = res.data
    } else {
      steamSearchResults.value = []
    }
    steamSearched.value = true
  } catch (err) {
    console.error('Steam 搜索失败:', err)
    steamSearchResults.value = []
    steamSearched.value = true
  }
  steamSearching.value = false
}

async function bindSteamAppid(): Promise<void> {
  if (!selectedGame.value || !selectedSteamItem.value) return
  bindingSteam.value = true
  try {
    const res = await bindSteamGame(selectedGame.value.id, selectedSteamItem.value.id)
    if (res.success && res.data) {
      const idx = games.value.findIndex(g => g.id === selectedGame.value!.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      selectedGame.value = res.data
      showSteamSearchModal.value = false
      loadStats()
    }
  } catch (err) {
    console.error('绑定 Steam 失败:', err)
  }
  bindingSteam.value = false
}

function showGameDetail(game: Game): void {
  selectedGame.value = game
}

async function toggleExclude(game: Game): Promise<void> {
  try {
    const res = await toggleExcludeGame(game.id)
    if (res.success && res.data) {
      const idx = games.value.findIndex(g => g.id === game.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = res.data
      }
      loadStats()
    }
  } catch (err) {
    console.error('排除操作失败:', err)
  }
}

async function promoteGame(game: Game): Promise<void> {
  const parentPath = game.source_path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  if (!confirm(`将「${game.title}」的游戏目录提升一级至父目录？\n\n当前: ${game.source_path}\n提升后: ${parentPath}`)) return
  try {
    const res = await promoteGameApi(game.id)
    if (res.success && res.data) {
      const idx = games.value.findIndex(g => g.id === game.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = res.data
      }
      loadStats()
    } else {
      alert('提升失败: ' + (res as any).error || '未知错误')
    }
  } catch (err) {
    console.error('提升目录失败:', err)
    alert('提升失败，请查看控制台')
  }
}

async function deleteSingleGame(game: Game): Promise<void> {
  if (!confirm(`确定要删除游戏「${game.title}」吗？此操作不可撤销。`)) return
  try {
    const res = await deleteGame(game.id)
    if (res.success) {
      games.value = games.value.filter(g => g.id !== game.id)
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = null
      }
      loadStats()
    }
  } catch (err) {
    console.error('删除游戏失败:', err)
  }
}

async function submitAddGame(): Promise<void> {
  if (!addForm.value.source_path.trim()) {
    alert('请输入游戏路径')
    return
  }
  if (!addForm.value.title.trim()) {
    alert('请输入游戏名称')
    return
  }

  addingGame.value = true
  try {
    const genresStr = addForm.value.genres
      ? JSON.stringify(addForm.value.genres.split(',').map(s => s.trim()).filter(s => s))
      : undefined
    const res = await createGameApi({
      source_path: addForm.value.source_path.trim(),
      title: addForm.value.title.trim(),
      title_en: addForm.value.title_en.trim() || undefined,
      steam_appid: addForm.value.steam_appid.trim() || undefined,
      developer: addForm.value.developer.trim() || undefined,
      publisher: addForm.value.publisher.trim() || undefined,
      release_date: addForm.value.release_date.trim() || undefined,
      genres: genresStr,
      short_description: addForm.value.short_description.trim() || undefined,
      notes: addForm.value.notes.trim() || undefined
    })
    if (res.success && res.data) {
      const hadSteamAppid = addForm.value.steam_appid.trim()
      showAddGameModal.value = false
      addForm.value = {
        source_path: '', title: '', title_en: '', steam_appid: '',
        developer: '', publisher: '', release_date: '', genres: '',
        short_description: '', notes: ''
      }
      await refreshGames()
      if (hadSteamAppid) {
        // 自动刮削在后台进行，等待刷新后显示
      }
    } else {
      alert('添加失败: ' + (res as any).error || '未知错误')
    }
  } catch (err) {
    console.error('添加游戏失败:', err)
    alert('添加失败，请查看控制台')
  }
  addingGame.value = false
}

async function removeNonexistent(): Promise<void> {
  try {
    const res = await removeNonexistentGames()
    if (res.success && res.data) {
      alert(`已移除 ${res.data.deletedCount} 个不存在的游戏目录`)
      await refreshGames()
    }
  } catch (err) {
    console.error('移除失败:', err)
  }
}

async function handleCleanupStaleGames(): Promise<void> {
  try {
    const res = await cleanupStaleGames()
    if (res.success) {
      alert(`清理完成，已删除 ${res.data?.deletedCount ?? 0} 个已移除路径下的游戏记录`)
      await refreshGames()
    }
  } catch (err) {
    console.error('清理失败:', err)
  }
}

onMounted(() => {
  loadGames()
  loadStats()
  loadFilters()
})
</script>

<style scoped>
.game-wall {
  padding: 24px;
}

.wall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-title {
  font-size: 24px;
  margin: 0;
  color: var(--text);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-group {
  flex: 1;
  min-width: 120px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.stat-item {
  padding: 4px 12px;
  background: var(--bg);
  border-radius: 4px;
}

.poster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-secondary);
}

.empty-tip {
  font-size: 14px;
  margin-top: 8px;
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}

.game-detail-modal .modal-body {
  display: flex;
  gap: 24px;
}

.detail-poster {
  flex: 0 0 300px;
}

.detail-poster img {
  width: 100%;
  border-radius: 8px;
}

.poster-placeholder-large {
  width: 100%;
  aspect-ratio: 460 / 215;
  background: linear-gradient(135deg, var(--bg) 0%, var(--border) 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-placeholder-large .poster-icon {
  font-size: 64px;
}

.detail-info {
  flex: 1;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 24px;
}

.info-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.info-label {
  flex: 0 0 80px;
  font-weight: 600;
  color: var(--text-secondary);
}

.info-value {
  flex: 1;
  color: var(--text);
}

.info-value.rating {
  background: var(--accent);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
}

.info-value.link {
  color: var(--accent);
  text-decoration: none;
}

.info-value.path {
  font-size: 12px;
  word-break: break-all;
}

.info-value.description {
  margin: 0;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.identify-modal .modal-body {
  text-align: center;
}

.identify-modal .warning {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 12px;
}

.confirm-body .warning {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

/* Steam Search Modal */
.steam-search-modal {
  max-width: 600px;
}

.steam-search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.steam-search-bar .search-input {
  flex: 1;
}

.steam-results {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.steam-result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.steam-result-item:hover {
  border-color: var(--accent);
  background: var(--bg);
}

.steam-result-item.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.steam-thumb {
  width: 120px;
  height: 45px;
  object-fit: cover;
  border-radius: 4px;
}

.steam-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.steam-result-name {
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.steam-result-score {
  font-size: 12px;
  color: var(--text-secondary);
}

.steam-result-appid {
  font-size: 12px;
  color: var(--text-secondary);
}

.steam-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
}

/* Add Game Modal */
.add-game-modal {
  max-width: 520px;
}

.form-row {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}

.form-label .required {
  color: #ef4444;
}

.form-row .input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  box-sizing: border-box;
}

.form-row .hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.form-row .textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.form-row-inline {
  display: flex;
  gap: 12px;
}

.form-row-inline .form-row.half {
  flex: 1;
}

.toggle-more {
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
}

.toggle-more:hover {
  text-decoration: underline;
}
</style>