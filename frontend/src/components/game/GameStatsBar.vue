<!-- frontend/src/components/game/GameStatsBar.vue -->
<template>
  <div class="stats-summary" v-if="stats">
    <span class="stat-item">总计 {{ stats.totalGames }} 个游戏</span>
    <span class="stat-item">已刮削 {{ stats.scrapedGames }} 个</span>
    <span class="stat-item">待刮削 {{ stats.unscrapedGames }} 个</span>
    <span class="stat-item" v-if="stats.favoriteGames > 0">收藏 {{ stats.favoriteGames }} 个</span>
  </div>
</template>

<script setup lang="ts">
import type { GameStatistics } from '../../types';

defineProps<{
  stats: GameStatistics | null;
}>();
</script>

<style scoped>
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
</style>