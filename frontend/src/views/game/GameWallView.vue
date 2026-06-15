<template>
  <div class="game-wall">
    <!-- Toast Notification -->
    <Transition name="toast">
      <div v-if="showToast" class="toast-notification">
        {{ toastMessage }}
      </div>
    </Transition>
    <div class="game-wall-layout">
      <GameGroupSidebar
        v-if="config.groupsEnabled"
        :groups="groups"
        :selectedGroupId="selectedGroupId"
        :isFavoriteFilter="isFavoriteFilter"
        :favoriteCount="stats?.favoriteGames || 0"
        @select="selectGroup"
        @favorite="toggleFavoriteFilter"
        @create="showGroupManager = true"
        @manage="openGroupManager"
        @delete="confirmDeleteGroup"
        @reorder="handleReorderGroups"
      />
      <div class="game-wall-main">
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
          重新扫描
        </button>
        <button class="btn btn-secondary" @click="showBatchScrapeModal = true" :disabled="scraping">
          {{ scraping ? '刮削中...' : '批量刮削' }}
        </button>
        <div class="dropdown-wrapper">
          <button class="btn btn-secondary dropdown-toggle" @click="showMoreDropdown = !showMoreDropdown">
            更多...
          </button>
          <div class="dropdown-menu" v-if="showMoreDropdown" @click.away="showMoreDropdown = false">
            <button class="dropdown-item" @click="showMoreDropdown = false; showRemoveNonexistentModal = true">
              移除不存在目录
            </button>
            <button class="dropdown-item" @click="showMoreDropdown = false; handleCleanupStaleGames()">
              清理已移除路径记录
            </button>
          </div>
        </div>
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
          <option value="release_date">按年份（新→旧）</option>
        </select>
      </div>
    </div>

    <div class="stats-summary" v-if="stats">
      <span class="stat-item">总计 {{ stats.totalGames }} 个游戏</span>
      <span class="stat-item">已刮削 {{ stats.scrapedGames }} 个</span>
      <span class="stat-item">待刮削 {{ stats.unscrapedGames }} 个</span>
      <span class="stat-item" v-if="stats.favoriteGames > 0">收藏 {{ stats.favoriteGames }} 个</span>
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
        @delete="deleteSingleGame"
        @favorite="toggleFavorite"
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
          <div v-if="selectedGame.title_en" class="title-en">{{ selectedGame.title_en }}</div>
          <button class="modal-close" @click="selectedGame = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-poster">
            <div class="poster-container">
              <div class="poster-placeholder-large">
                <span class="poster-icon">🎮</span>
              </div>
              <img
                :src="`/api/games/${selectedGame.id}/poster/horizontal`"
                :alt="selectedGame.title"
                @load="($event.target as HTMLImageElement).previousElementSibling?.classList.add('hidden')"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
            </div>
            <div class="poster-actions">
              <button class="btn btn-small" @click="showPosterUploadModal = true">上传海报</button>
              <button class="btn btn-small" @click="redownloadPoster(selectedGame)" :disabled="posterRedownloading">
                {{ posterRedownloading ? '下载中...' : '重新下载' }}
              </button>
            </div>
            <div class="poster-backups" v-if="posterBackups.length">
              <div class="backups-header">历史备份</div>
              <div class="backups-list">
                <div
                  v-for="backup in posterBackups"
                  :key="backup.filename"
                  class="backup-item"
                  @click="restoreBackup(backup)"
                >
                  <img :src="`/api/games/${selectedGame.id}/poster/backups/${backup.filename}`" :alt="backup.createdAt" />
                  <div class="backup-info">
                    <span class="backup-time">{{ backup.createdAt }}</span>
                    <button class="btn-icon delete-btn" @click.stop="deleteBackup(backup)" title="删除备份">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
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
              <div class="info-value-group">
                <span class="info-value steam-id">
                  {{ selectedGame.steam_appid }}
                </span>
                <button class="btn-icon copy-btn" @click="copySteamAppid" title="复制 AppID">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <a class="steam-link" :href="`https://store.steampowered.com/app/${selectedGame.steam_appid}`" target="_blank">
                  查看页面
                </a>
              </div>
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
          <button class="btn btn-secondary" @click="startEditGame(selectedGame)">编辑信息</button>
          <button class="btn btn-secondary" @click="scrapeGame(selectedGame)" :disabled="scraping">
            {{ scraping ? '刮削中...' : '重新刮削' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Game Modal -->
    <div class="modal-overlay" v-if="showEditGameModal" @click.self="showEditGameModal = false">
      <div class="modal-content add-game-modal">
        <div class="modal-header">
          <h3>编辑游戏信息</h3>
          <button class="modal-close" @click="showEditGameModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">游戏路径 <span class="required">*</span></label>
            <input v-model="editForm.source_path" class="input" placeholder="E:\Games\游戏名称" />
            <span class="hint">游戏所在目录的绝对路径</span>
          </div>
          <div class="form-row">
            <label class="form-label">游戏名称 <span class="required">*</span></label>
            <input v-model="editForm.title" class="input" placeholder="游戏名称" />
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">英文名</label>
              <input v-model="editForm.title_en" class="input" placeholder="英文名称" />
            </div>
            <div class="form-row half">
              <label class="form-label">Steam AppID</label>
              <input v-model="editForm.steam_appid" class="input" type="number" placeholder="782330" />
              <span class="hint">修改后重新刮削可更新元数据</span>
            </div>
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">开发商</label>
              <input v-model="editForm.developer" class="input" placeholder="Nintendo" />
            </div>
            <div class="form-row half">
              <label class="form-label">发行商</label>
              <input v-model="editForm.publisher" class="input" placeholder="Nintendo" />
            </div>
          </div>
          <div class="form-row-inline">
            <div class="form-row half">
              <label class="form-label">发行日期</label>
              <input v-model="editForm.release_date" class="input" placeholder="2017-03-03" />
            </div>
            <div class="form-row half">
              <label class="form-label">类型</label>
              <input v-model="editForm.genres" class="input" placeholder="动作, 冒险, RPG" />
              <span class="hint">逗号分隔</span>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">评分</label>
            <input v-model.number="editForm.rating" class="input" type="number" step="0.1" min="0" max="10" placeholder="9.5" />
            <span class="hint">0-10 分</span>
          </div>
          <div class="form-row">
            <a class="toggle-more" @click="showEditMoreFields = !showEditMoreFields">
              {{ showEditMoreFields ? '收起扩展字段 ▲' : '展开扩展字段 ▼' }}
            </a>
          </div>
          <div v-if="showEditMoreFields">
            <div class="form-row">
              <label class="form-label">简介</label>
              <textarea v-model="editForm.short_description" class="textarea" rows="2" placeholder="简短介绍..."></textarea>
            </div>
            <div class="form-row">
              <label class="form-label">详细描述</label>
              <textarea v-model="editForm.description" class="textarea" rows="4" placeholder="详细介绍..."></textarea>
            </div>
            <div class="form-row">
              <label class="form-label">备注</label>
              <textarea v-model="editForm.notes" class="textarea" rows="2" placeholder="备注信息..."></textarea>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showEditGameModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditGame" :disabled="editingGame">
            {{ editingGame ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Poster Upload Modal -->
    <div class="modal-overlay" v-if="showPosterUploadModal" @click.self="showPosterUploadModal = false">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>上传海报</h3>
          <button class="modal-close" @click="showPosterUploadModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">选择海报图片</label>
            <input type="file" accept="image/*" @change="handlePosterFileChange" class="input" />
            <span class="hint">支持 JPG、PNG 等格式，建议尺寸 460x215</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showPosterUploadModal = false">取消</button>
          <button class="btn btn-primary" @click="submitPosterUpload" :disabled="posterUploading || !posterUploadFile">
            {{ posterUploading ? '上传中...' : '确认上传' }}
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

    <!-- Group Manager Modal -->
    <GameGroupManager
      v-if="showGroupManager"
      :initialGroups="groups"
      @close="showGroupManager = false"
      @refresh="loadGroups"
    />

    <!-- Active filter indicator in header -->
    <div class="active-group-bar" v-if="(selectedGroupId !== null && selectedGroupName) || isFavoriteFilter">
      <span class="active-group-label" v-if="isFavoriteFilter">⭐ 收藏</span>
      <span class="active-group-label" v-else-if="selectedGroupId !== null && selectedGroupName">📁 {{ selectedGroupName }}</span>
      <button class="btn btn-small" @click="clearGroupFilter">清除筛选</button>
    </div>
  </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  getGames,
  getGameStatistics,
  getGameGenres,
  getGameYears,
  getGameGroups,
  deleteGameGroup,
  reorderGameGroups,
  openGame,
  deleteGame,
  scrapeGame as scrapeGameApi,
  scrapeGamesBatch,
  identifyGames as identifyGamesApi,
  searchSteamGames,
  bindSteamGame,
  excludeAndDeleteGame,
  toggleFavoriteGame,
  createGame as createGameApi,
  updateGame as updateGameApi,
  removeNonexistentGames,
  cleanupStaleGames,
  getGroupGames,
  uploadGamePoster,
  redownloadGamePoster,
  getGamePosterBackups,
  restoreGamePosterBackup,
  deleteGamePosterBackup
} from '../../api'
import GameCard from '../../components/game/GameCard.vue'
import GameGroupSidebar from '../../components/game/GameGroupSidebar.vue'
import GameGroupManager from '../../components/game/GameGroupManager.vue'
import Pagination from '../../components/Pagination.vue'
import type { Game, GameStatistics, GameGroup, SteamSearchItem, PosterBackup } from '../../types'

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
const showMoreDropdown = ref(false)
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

const showEditGameModal = ref(false)
const editingGame = ref(false)
const showEditMoreFields = ref(false)
const editForm = ref({
  source_path: '',
  title: '',
  title_en: '',
  steam_appid: '',
  developer: '',
  publisher: '',
  release_date: '',
  genres: '',
  rating: null as number | null,
  short_description: '',
  description: '',
  notes: ''
})

const showPosterUploadModal = ref(false)
const posterRedownloading = ref(false)
const posterUploadFile = ref<File | null>(null)
const posterUploading = ref(false)
const posterBackups = ref<PosterBackup[]>([])

// Toast notification
const showToast = ref(false)
const toastMessage = ref('')

function showNotification(message: string): void {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 2000)
}

// Group related state
const groups = ref<GameGroup[]>([])
const selectedGroupId = ref<number | null>(null)
const selectedGroupName = ref('')
const showGroupManager = ref(false)
const config = ref({ groupsEnabled: true })
const isFavoriteFilter = ref(false)

const page = ref(1)
const pageSize = ref(100)
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
    const isFavorite = isFavoriteFilter.value

    if (selectedGroupId.value !== null) {
      // 分组选中时：调用 getGroupGames 并传入筛选参数
      const res = await getGroupGames(selectedGroupId.value, {
        search: searchQuery.value,
        genre: filterGenre.value,
        year: filterYear.value,
        scraped: isFavorite ? undefined : filterScraped.value,
        favorite: isFavorite ? 'true' : undefined,
        orderBy: orderBy.value,
        orderDir: 'ASC',
        page: page.value,
        pageSize: pageSize.value
      })
      if (res.success && res.data) {
        games.value = res.data.games
        total.value = res.data.total
      }
    } else {
      const res = await getGames({
        search: searchQuery.value,
        genre: filterGenre.value,
        year: filterYear.value,
        scraped: isFavorite ? undefined : filterScraped.value,
        favorite: isFavorite ? 'true' : undefined,
        orderBy: orderBy.value,
        orderDir: 'ASC',
        page: page.value,
        pageSize: pageSize.value
      })
      if (res.success && res.data) {
        games.value = res.data.games
        total.value = res.data.total
      }
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

function copySteamAppid(): void {
  if (!selectedGame.value?.steam_appid) return
  navigator.clipboard.writeText(selectedGame.value.steam_appid)
    .then(() => {
      showNotification('已复制 Steam AppID')
    })
    .catch(err => {
      console.error('复制失败:', err)
    })
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
      showNotification('刮削完成')
    }
  } catch (err) {
    console.error('刮削失败:', err)
    showNotification('刮削失败')
  }
  scraping.value = false
}

async function redownloadPoster(game: Game): Promise<void> {
  posterRedownloading.value = true
  try {
    const res = await redownloadGamePoster(game.id, 'horizontal')
    if (res.success) {
      // Force refresh the poster by reloading the game
      const idx = games.value.findIndex(g => g.id === game.id)
      if (idx >= 0) {
        // Trigger a re-render by updating the game
        games.value[idx] = { ...games.value[idx] }
      }
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = { ...selectedGame.value }
      }
      showNotification('海报已重新下载')
    } else {
      showNotification('重新下载海报失败: ' + ((res as any).error || '未知错误'))
    }
  } catch (err) {
    console.error('重新下载海报失败:', err)
    showNotification('重新下载海报失败')
  }
  posterRedownloading.value = false
}

function handlePosterFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    posterUploadFile.value = target.files[0]
  }
}

async function submitPosterUpload(): Promise<void> {
  if (!posterUploadFile.value || !selectedGame.value) return

  posterUploading.value = true
  try {
    const res = await uploadGamePoster(selectedGame.value.id, 'horizontal', posterUploadFile.value)
    if (res.success) {
      showPosterUploadModal.value = false
      posterUploadFile.value = null
      // Force refresh the poster
      const idx = games.value.findIndex(g => g.id === selectedGame.value!.id)
      if (idx >= 0) {
        games.value[idx] = { ...games.value[idx] }
      }
      selectedGame.value = { ...selectedGame.value }
      showNotification('海报已上传')
      loadPosterBackups()
    } else {
      showNotification('上传海报失败: ' + ((res as any).error || '未知错误'))
    }
  } catch (err) {
    console.error('上传海报失败:', err)
    showNotification('上传海报失败')
  }
  posterUploading.value = false
}

async function loadPosterBackups(): Promise<void> {
  if (!selectedGame.value) return
  try {
    const res = await getGamePosterBackups(selectedGame.value.id, 'horizontal')
    if (res.success && res.data) {
      posterBackups.value = res.data
    }
  } catch (err) {
    console.error('加载备份列表失败:', err)
  }
}

async function restoreBackup(backup: PosterBackup): Promise<void> {
  if (!selectedGame.value) return
  try {
    const res = await restoreGamePosterBackup(selectedGame.value.id, backup.type, backup.filename)
    if (res.success) {
      // Force refresh
      const idx = games.value.findIndex(g => g.id === selectedGame.value!.id)
      if (idx >= 0) {
        games.value[idx] = { ...games.value[idx] }
      }
      selectedGame.value = { ...selectedGame.value }
      loadPosterBackups()
      showNotification('已恢复备份海报')
    }
  } catch (err) {
    console.error('恢复备份失败:', err)
    showNotification('恢复备份失败')
  }
}

async function deleteBackup(backup: PosterBackup): Promise<void> {
  if (!selectedGame.value) return
  try {
    const res = await deleteGamePosterBackup(selectedGame.value.id, backup.filename)
    if (res.success) {
      loadPosterBackups()
      showNotification('已删除备份')
    }
  } catch (err) {
    console.error('删除备份失败:', err)
    showNotification('删除备份失败')
  }
}

async function scrapeAll(): Promise<void> {
  scraping.value = true
  try {
    const res = await scrapeGamesBatch()
    if (res.success && res.data) {
      // SSE 模式：任务已创建，进度由 TaskBar 显示
      // 等任务完成后再刷新数据
      showNotification('批量刮削任务已启动')
    }
  } catch (err) {
    console.error('批量刮削失败:', err)
    showNotification('批量刮削失败')
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
      showNotification('游戏识别完成')
    }
  } catch (err) {
    console.error('识别失败:', err)
    showNotification('游戏识别失败')
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
      showNotification('已绑定 Steam AppID 并刮削')
    }
  } catch (err) {
    console.error('绑定 Steam 失败:', err)
    showNotification('绑定 Steam 失败')
  }
  bindingSteam.value = false
}

function showGameDetail(game: Game): void {
  selectedGame.value = game
  posterBackups.value = []
  loadPosterBackups()
}

async function toggleExclude(game: Game): Promise<void> {
  // 确认排除操作
  if (!confirm(`确定要排除游戏「${game.title}」吗？\n\n该路径将加入黑名单，游戏记录将被删除。`)) return

  try {
    const res = await excludeAndDeleteGame(game.id)
    if (res.success) {
      // 从列表中移除游戏
      games.value = games.value.filter(g => g.id !== game.id)
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = null
      }
      total.value -= 1
      loadStats()
      showNotification('游戏已排除并删除')
    } else {
      showNotification('排除失败: ' + ((res as any).error || '未知错误'))
    }
  } catch (err) {
    console.error('排除操作失败:', err)
    showNotification('操作失败')
  }
}

async function toggleFavorite(game: Game): Promise<void> {
  try {
    const res = await toggleFavoriteGame(game.id)
    if (res.success && res.data) {
      const idx = games.value.findIndex(g => g.id === game.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      if (selectedGame.value?.id === game.id) {
        selectedGame.value = res.data
      }
      loadStats()
      showNotification(res.data.is_favorite ? '已收藏游戏' : '已取消收藏')
    }
  } catch (err) {
    console.error('收藏操作失败:', err)
    showNotification('操作失败')
  }
}

// === Group handlers ===

async function loadGroups(): Promise<void> {
  try {
    const res = await getGameGroups()
    if (res.success && res.data) {
      groups.value = res.data
    }
  } catch (err) {
    console.error('加载分组失败:', err)
  }
}

function selectGroup(groupId: number | null): void {
  selectedGroupId.value = groupId
  // 点击"全部游戏"时，也清除收藏筛选
  if (groupId === null) {
    isFavoriteFilter.value = false
  }
  page.value = 1
  if (groupId !== null) {
    const group = groups.value.find(g => g.id === groupId)
    selectedGroupName.value = group?.name || ''
  } else {
    selectedGroupName.value = ''
  }
  loadGames()
}

function toggleFavoriteFilter(): void {
  isFavoriteFilter.value = !isFavoriteFilter.value
  page.value = 1
  loadGames()
}

function clearGroupFilter(): void {
  selectedGroupId.value = null
  selectedGroupName.value = ''
  isFavoriteFilter.value = false
  page.value = 1
  loadGames()
}

function openGroupManager(group: GameGroup): void {
  showGroupManager.value = true
}

async function confirmDeleteGroup(group: GameGroup): Promise<void> {
  if (!confirm(`确定要删除分组「${group.name}」吗？分组内的游戏不会被删除。`)) return
  try {
    await deleteGameGroup(group.id)
    if (selectedGroupId.value === group.id) {
      selectedGroupId.value = null
      selectedGroupName.value = ''
    }
    await loadGroups()
    loadGames()
  } catch (err) {
    console.error('删除分组失败:', err)
  }
}

async function handleReorderGroups(items: Array<{ id: number; sort_order: number }>): Promise<void> {
  try {
    const res = await reorderGameGroups(items)
    if (res.success && res.data) {
      groups.value = res.data
    }
  } catch (err) {
    console.error('分组排序失败:', err)
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
      showNotification('游戏已删除')
    }
  } catch (err) {
    console.error('删除游戏失败:', err)
    showNotification('删除失败')
  }
}

async function submitAddGame(): Promise<void> {
  if (!addForm.value.source_path.trim()) {
    showNotification('请输入游戏路径')
    return
  }
  if (!addForm.value.title.trim()) {
    showNotification('请输入游戏名称')
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
      showNotification(hadSteamAppid ? '游戏已添加，正在后台刮削' : '游戏已添加')
    } else {
      showNotification('添加失败: ' + ((res as any).error || '未知错误'))
    }
  } catch (err) {
    console.error('添加游戏失败:', err)
    showNotification('添加失败，请查看控制台')
  }
  addingGame.value = false
}

function startEditGame(game: Game): void {
  // 填充表单
  editForm.value = {
    source_path: game.source_path || '',
    title: game.title || '',
    title_en: game.title_en || '',
    steam_appid: game.steam_appid || '',
    developer: game.developer || '',
    publisher: game.publisher || '',
    release_date: game.release_date || '',
    genres: game.genresArray?.join(', ') || '',
    rating: game.rating || null,
    short_description: game.short_description || '',
    description: game.description || '',
    notes: game.notes || ''
  }
  showEditMoreFields.value = false
  showEditGameModal.value = true
}

async function submitEditGame(): Promise<void> {
  if (!editForm.value.source_path.trim()) {
    showNotification('请输入游戏路径')
    return
  }
  if (!editForm.value.title.trim()) {
    showNotification('请输入游戏名称')
    return
  }

  if (!selectedGame.value) return

  editingGame.value = true
  try {
    const genresStr = editForm.value.genres
      ? JSON.stringify(editForm.value.genres.split(',').map(s => s.trim()).filter(s => s))
      : undefined

    const updateData: Partial<Game> = {
      source_path: editForm.value.source_path.trim(),
      title: editForm.value.title.trim(),
      title_en: editForm.value.title_en.trim() || undefined,
      steam_appid: editForm.value.steam_appid.toString().trim() || undefined,
      developer: editForm.value.developer.trim() || undefined,
      publisher: editForm.value.publisher.trim() || undefined,
      release_date: editForm.value.release_date.trim() || undefined,
      genres: genresStr,
      rating: editForm.value.rating || undefined,
      short_description: editForm.value.short_description.trim() || undefined,
      description: editForm.value.description.trim() || undefined,
      notes: editForm.value.notes.trim() || undefined
    }

    const res = await updateGameApi(selectedGame.value.id, updateData)
    if (res.success && res.data) {
      showEditGameModal.value = false
      // 更新游戏列表和选中游戏
      const idx = games.value.findIndex(g => g.id === selectedGame.value!.id)
      if (idx >= 0) {
        games.value[idx] = res.data
      }
      selectedGame.value = res.data
      loadStats()
      showNotification('游戏信息已更新')
    } else {
      showNotification('保存失败: ' + ((res as any).error || '未知错误'))
    }
  } catch (err) {
    console.error('编辑游戏失败:', err)
    showNotification('保存失败')
  }
  editingGame.value = false
}

async function removeNonexistent(): Promise<void> {
  try {
    const res = await removeNonexistentGames()
    if (res.success && res.data) {
      await refreshGames()
      showNotification(`已移除 ${res.data.deletedCount} 个不存在的游戏目录`)
    }
  } catch (err) {
    console.error('移除失败:', err)
    showNotification('移除失败')
  }
}

async function handleCleanupStaleGames(): Promise<void> {
  try {
    const res = await cleanupStaleGames()
    if (res.success) {
      await refreshGames()
      showNotification(`清理完成，已删除 ${res.data?.deletedCount ?? 0} 个已移除路径下的游戏记录`)
    }
  } catch (err) {
    console.error('清理失败:', err)
    showNotification('清理失败')
  }
}

onMounted(() => {
  loadGames()
  loadStats()
  loadFilters()
  loadGroups()
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEsc)
})

function handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (showMoreDropdown.value) { showMoreDropdown.value = false; return }
    if (selectedGame.value) { selectedGame.value = null; return }
    if (showPosterUploadModal.value) { showPosterUploadModal.value = false; return }
    if (showGroupManager.value) { showGroupManager.value = false; return }
    if (showAddGameModal.value) { showAddGameModal.value = false; return }
    if (showSteamSearchModal.value) { showSteamSearchModal.value = false; return }
    if (showIdentifyModal.value) { showIdentifyModal.value = false; return }
    if (showBatchScrapeModal.value) { showBatchScrapeModal.value = false; return }
    if (showRemoveNonexistentModal.value) { showRemoveNonexistentModal.value = false }
  }
}
</script>

<style scoped>
.game-wall {
  padding: 24px;
}

.game-wall-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.game-wall-main {
  flex: 1;
  min-width: 0;
}

.active-group-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
}

.active-group-label {
  font-weight: 600;
  font-size: 14px;
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

.dropdown-wrapper {
  position: relative;
}

.dropdown-toggle {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 180px;
  padding: 4px 0;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  text-align: left;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: var(--hover-bg);
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
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-poster .poster-container {
  position: relative;
  width: 100%;
  aspect-ratio: 460 / 215;
}

.detail-poster .poster-container img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.poster-placeholder-large {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--bg) 0%, var(--border) 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-placeholder-large.hidden {
  display: none;
}

.poster-placeholder-large .poster-icon {
  font-size: 64px;
}

.poster-actions {
  display: flex;
  gap: 8px;
}

.poster-backups {
  margin-top: 8px;
}

.poster-backups .backups-header {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.poster-backups .backups-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.poster-backups .backup-item {
  width: 80px;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.poster-backups .backup-item:hover {
  border-color: var(--accent);
  transform: scale(1.05);
}

.poster-backups .backup-item img {
  width: 100%;
  height: 37px;
  object-fit: cover;
}

.poster-backups .backup-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  background: var(--bg);
}

.poster-backups .backup-time {
  font-size: 10px;
  color: var(--text-secondary);
}

.poster-backups .delete-btn {
  padding: 2px;
}

.poster-backups .delete-btn:hover {
  color: #ef4444;
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
  background: #f59e0b;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  flex: 0 0 auto;
  display: inline-block;
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

.info-value-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-value.steam-id {
  font-family: monospace;
  font-size: 14px;
  user-select: text;
}

.btn-icon {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--hover-bg);
  color: var(--accent);
}

.toast-notification {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  color: var(--text);
  padding: 12px 24px;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  font-size: 14px;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.steam-link {
  color: #2563eb;
  text-decoration: none;
  font-size: 13px;
}

.steam-link:hover {
  text-decoration: underline;
  color: #1d4ed8;
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