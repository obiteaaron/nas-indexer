<template>
  <div class="game-card" :class="{ favorited: game.is_favorite }" @click="$emit('click', game)">
    <div class="poster-container">
      <div class="poster-placeholder">
        <span class="poster-icon">🎮</span>
        <span class="poster-title">{{ game.title }}</span>
      </div>
      <img
        v-if="posterUrl"
        :src="posterUrl"
        :alt="game.title"
        class="poster"
        loading="lazy"
        @load="($event.target as HTMLImageElement).previousElementSibling?.classList.add('hidden')"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <div class="poster-overlay">
        <div class="game-rating" v-if="game.rating">
          <span class="rating-badge">{{ game.rating }}</span>
        </div>
        <div class="steam-badge" v-if="game.steam_appid || game.is_no_steam" :class="{ disabled: game.is_no_steam }" :title="game.is_no_steam ? '无 Steam 信息' : 'Steam AppID: ' + game.steam_appid">
          <img src="/icons/steam-favicon.ico" alt="Steam" class="steam-icon" />
        </div>
        <div class="game-actions">
          <button class="action-btn" @click.stop="$emit('open', game)" title="打开目录">
            📂
          </button>
          <button class="action-btn" @click.stop="$emit('detail', game)" title="查看详情">
            📋
          </button>
          <button class="action-btn" @click.stop="$emit('group', game)" title="加入分组">
            📁
          </button>
          <button class="action-btn" @click.stop="$emit('exclude', game)" title="排除">
            🚫
          </button>
          <button class="action-btn" @click.stop="$emit('favorite', game)" :title="game.is_favorite ? '取消收藏' : '收藏'">
            {{ game.is_favorite ? '⭐' : '☆' }}
          </button>
          <button class="action-btn action-btn-danger" @click.stop="$emit('delete', game)" title="删除">
            🗑️
          </button>
        </div>
      </div>
    </div>
    <div class="game-info">
      <h4 class="game-title">{{ game.title }}</h4>
      <p class="game-meta" v-if="game.developer || game.release_date">
        <span v-if="game.developer">{{ game.developer }}</span>
        <span v-if="game.release_date"> · {{ formatYear(game.release_date) }}</span>
      </p>
      <div class="game-tags" v-if="genres.length">
        <span class="genre-tag" v-for="genre in genres.slice(0, 3)" :key="genre">{{ genre }}</span>
      </div>
      <div class="game-status">
        <span class="rating-badge" v-if="game.rating">{{ game.rating }}</span>
        <span class="status-badge" :class="statusClass">{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Game } from '../../types'

interface Props {
  game: Game
  posterType?: 'horizontal' | 'vertical' | 'banner'
}

const props = withDefaults(defineProps<Props>(), {
  posterType: 'horizontal'
})

defineEmits<{
  click: [game: Game]
  open: [game: Game]
  detail: [game: Game]
  exclude: [game: Game]
  favorite: [game: Game]
  delete: [game: Game]
  group: [game: Game]
}>()

// 海报始终从本地 API 加载（集中存储在 profiles/games/posters/{gameId}/）
// 如果有 Steam 海报 URL 作为备选
const posterUrl = computed(() => {
  // 优先使用本地集中存储的海报
  return `/api/games/${props.game.id}/poster/${props.posterType}`
})

const genres = computed(() => {
  if (props.game.genresArray) {
    return props.game.genresArray
  }
  if (props.game.genres) {
    try {
      return JSON.parse(props.game.genres)
    } catch {
      return []
    }
  }
  return []
})

const statusClass = computed(() => {
  // 已刮削：有 scraped_at 时间戳（Steam API 刮削成功）
  if (props.game.scraped_at) return 'status-scraped'

  // 已完善：信息完整（有海报 + 有评分 + 有类型 + 有开发商）
  const hasPoster = posterUrl.value !== null
  const hasRating = props.game.rating && props.game.rating > 0
  const hasGenres = genres.value.length > 0
  const hasDeveloper = props.game.developer && props.game.developer.trim()
  if (hasPoster && hasRating && hasGenres && hasDeveloper) return 'status-complete'

  // 已配置：手动填写了基础信息
  const basicFields = [
    props.game.developer,
    props.game.publisher,
    props.game.release_date,
    props.game.short_description,
    props.game.notes
  ].filter(v => v && v.trim && v.trim())

  // metadata_source = 'manual' 或标记无 Steam + 有基础字段 或 ≥3 个基础字段
  if (props.game.metadata_source === 'manual') return 'status-manual'
  if (props.game.is_no_steam && basicFields.length >= 1) return 'status-manual'
  if (basicFields.length >= 3) return 'status-manual'

  return 'status-unscraped'
})

const statusText = computed(() => {
  // 已刮削
  if (props.game.scraped_at) return '已刮削'

  // 已完善
  const hasPoster = posterUrl.value !== null
  const hasRating = props.game.rating && props.game.rating > 0
  const hasGenres = genres.value.length > 0
  const hasDeveloper = props.game.developer && props.game.developer.trim()
  if (hasPoster && hasRating && hasGenres && hasDeveloper) return '已完善'

  // 已配置
  const basicFields = [
    props.game.developer,
    props.game.publisher,
    props.game.release_date,
    props.game.short_description,
    props.game.notes
  ].filter(v => v && v.trim && v.trim())

  if (props.game.metadata_source === 'manual') return '已配置'
  if (props.game.is_no_steam && basicFields.length >= 1) return '已配置'
  if (basicFields.length >= 3) return '已配置'

  return '待刮削'
})

function formatYear(dateStr: string): string {
  if (!dateStr) return ''
  const match = dateStr.match(/\d{4}/)
  return match ? match[0] : dateStr.slice(0, 4)
}
</script>

<style scoped>
.game-card {
  border-radius: 12px;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.game-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.poster-container {
  position: relative;
  aspect-ratio: 460 / 215;
  overflow: hidden;
}

.poster {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--bg) 0%, var(--border) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.poster-placeholder.hidden {
  display: none;
}

.poster-icon {
  font-size: 48px;
}

.poster-title {
  font-size: 14px;
  color: var(--text);
  max-width: 80%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
}

.game-card:hover .poster-overlay {
  opacity: 1;
}

.game-rating {
  position: absolute;
  top: 8px;
  right: 8px;
}

.rating-badge {
  background: var(--accent);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.game-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.action-btn:hover {
  background: white;
}

.game-info {
  padding: 12px;
}

.game-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.game-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-tags {
  display: flex;
  gap: 4px;
  margin: 8px 0;
  flex-wrap: wrap;
}

.genre-tag {
  background: var(--bg);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.game-status {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.rating-badge {
  background: #f59e0b;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.status-scraped {
  background: #10b981;
  color: white;
}

.status-manual {
  background: #3b82f6;
  color: white;
}

.status-complete {
  background: #8b5cf6;
  color: white;
}

.status-unscraped {
  background: #6b7280;
  color: white;
}

.game-card.favorited {
  border-left: 3px solid #f59e0b;
}

.action-btn-danger:hover {
  background: #ef4444;
  color: white;
}

.steam-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 4px;
  background: rgba(27, 40, 56, 0.8);
  border-radius: 4px;
}

.steam-badge .steam-icon {
  width: 16px;
  height: 16px;
}

.steam-badge.disabled {
  background: rgba(107, 114, 128, 0.6);
}

.steam-badge.disabled .steam-icon {
  opacity: 0.4;
  filter: grayscale(0.5);
}
</style>