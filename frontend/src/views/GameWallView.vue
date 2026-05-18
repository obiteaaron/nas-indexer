<template>
  <div class="game-wall">
    <div class="wall-header">
      <h2 class="section-title">游戏海报墙</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="refreshGames" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
        <button class="btn btn-secondary" @click="showIdentifyModal = true">
          重新识别
        </button>
        <button class="btn btn-secondary" @click="scrapeAll" :disabled="scraping">
          {{ scraping ? '刮削中...' : '批量刮削' }}
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
        </select>
      </div>
      <div class="filter-group">
        <select v-model="orderBy" class="filter-select" @change="loadGames">
          <option value="title">按名称</option>
          <option value="rating">按评分</option>
          <option value="release_date">按年份</option>
        </select>
      </div>
    </div>

    <div class="stats-summary" v-if="stats">
      <span class="stat-item">总计 {{ stats.totalGames }} 个游戏</span>
      <span class="stat-item">已刮削 {{ stats.scrapedGames }} 个</span>
      <span class="stat-item">待刮削 {{ stats.unscrapedGames }} 个</span>
    </div>

    <div class="poster-grid" v-if="games.length">
      <GameCard
        v-for="game in games"
        :key="game.id"
        :game="game"
        @click="showGameDetail(game)"
        @open="openGameDir"
        @scrape="scrapeGame"
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
  scrapeGame as scrapeGameApi,
  scrapeGamesBatch,
  identifyGames as identifyGamesApi
} from '../api'
import GameCard from '../components/GameCard.vue'
import Pagination from '../components/Pagination.vue'
import type { Game, GameStatistics } from '../types'

const games = ref<Game[]>([])
const stats = ref<GameStatistics | null>(null)
const genres = ref<string[]>([])
const years = ref<string[]>([])
const loading = ref(false)
const scraping = ref(false)
const identifying = ref(false)
const selectedGame = ref<Game | null>(null)
const showIdentifyModal = ref(false)

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
    const res = await getGames({
      search: searchQuery.value,
      genre: filterGenre.value,
      year: filterYear.value,
      scraped: filterScraped.value,
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

function showGameDetail(game: Game): void {
  selectedGame.value = game
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
  background: var(--card-bg);
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
</style>