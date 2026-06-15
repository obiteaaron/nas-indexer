<!-- frontend/src/components/game/GameSteamCacheDetailModal.vue -->
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ entry.name }}</h3>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <!-- 海报预览 -->
        <div class="poster-preview">
          <img :src="`/static/games/steam-cache/${entry.steam_appid}/header.jpg`" alt="header" @error="onImageError" />
        </div>
        <!-- 截图列表 -->
        <div class="screenshots-preview">
          <img v-for="i in (entry.screenshotCount || 0)" :key="i"
            :src="`/static/games/steam-cache/${entry.steam_appid}/screenshots/${i}.jpg`"
            @error="onImageError" />
        </div>
        <!-- 元数据 -->
        <div class="metadata">
          <p><strong>AppID:</strong> {{ entry.steam_appid }}</p>
          <p><strong>英文名:</strong> {{ entry.name_en || '-' }}</p>
          <p><strong>发行日期:</strong> {{ entry.release_date || '-' }}</p>
          <p><strong>评分:</strong> {{ entry.rating || '-' }}</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
        <button class="btn btn-primary" @click="$emit('refresh')">刷新缓存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SteamCacheEntry } from '../../api';

defineProps<{
  entry: SteamCacheEntry;
}>();

defineEmits<{
  close: [];
  refresh: [];
}>();

function onImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none';
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
}
.modal-body {
  padding: 24px;
}
.poster-preview img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 8px;
}
.screenshots-preview {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.screenshots-preview img {
  width: 120px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}
.metadata {
  margin-top: 16px;
}
.metadata p {
  margin: 8px 0;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.btn-secondary {
  background: var(--bg-secondary);
}
</style>