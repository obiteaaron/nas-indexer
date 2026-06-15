<!-- frontend/src/components/game/GameFilterBar.vue -->
<template>
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
      <select v-model="filterGenre" class="filter-select">
        <option value="">所有类型</option>
        <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="filterYear" class="filter-select">
        <option value="">所有年份</option>
        <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="filterScraped" class="filter-select">
        <option value="">全部状态</option>
        <option value="true">已刮削</option>
        <option value="false">待刮削</option>
      </select>
    </div>
    <div class="filter-group">
      <select v-model="orderBy" class="filter-select">
        <option value="title">按名称</option>
        <option value="rating">按评分</option>
        <option value="release_date">按年份（新→旧）</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  genres: string[];
  years: string[];
}>();

const emit = defineEmits<{
  change: [];
}>();

const searchQuery = ref('');
const filterGenre = ref('');
const filterYear = ref('');
const filterScraped = ref('');
const orderBy = ref('title');

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(): void {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => emit('change'), 300);
}

watch([filterGenre, filterYear, filterScraped, orderBy], () => emit('change'));
</script>

<style scoped>
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
.search-input, .filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
</style>