<!-- frontend/src/views/game/GameSettingsView.vue -->
<template>
  <div class="game-settings">
    <h2 class="section-title">游戏设置</h2>

    <!-- 扫描路径 -->
    <div class="settings-section">
      <h3>扫描路径</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gameScanPathsEnabled" />
          启用独立扫描路径
        </label>
      </div>
      <div class="path-list" v-if="config.gameScanPathsEnabled">
        <div class="path-item" v-for="(path, i) in config.gameScanPaths" :key="i">
          <span>{{ path }}</span>
          <button class="btn btn-small btn-danger" @click="removeScanPath(i)">删除</button>
        </div>
        <div class="add-path">
          <input v-model="newScanPath" type="text" placeholder="输入路径..." />
          <button class="btn btn-small" @click="addScanPath">添加</button>
        </div>
      </div>
    </div>

    <!-- 刮削配置 -->
    <div class="settings-section">
      <h3>刮削配置</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.autoScrape" />
          自动刮削
        </label>
      </div>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.downloadPosters" />
          刮削时下载海报
        </label>
      </div>
      <div class="setting-row">
        <label>Steam API 代理</label>
        <input v-model="config.proxyUrl" type="text" placeholder="http://127.0.0.1:7890" class="input" />
      </div>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getGamesConfig, saveGamesConfig, type GamesConfig } from '../../api';
import { useGameToast } from '../../composables/game/useGameToast';

const { showNotification } = useGameToast();

const defaultConfig: GamesConfig = {
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: {
    recognitionRules: [],
    heuristicRules: {},
    blacklistPatterns: [],
    maxScanDepth: 3
  },
  gamesScrape: {
    autoScrape: true,
    downloadPosters: true,
    scrapeOnIdentify: true
  },
  maxPosterBackups: 5,
  proxyUrl: ''
};

const config = ref<GamesConfig>(defaultConfig);
const saving = ref(false);
const newScanPath = ref('');

async function loadConfig(): Promise<void> {
  const res = await getGamesConfig();
  if (res.success && res.data) {
    config.value = res.data;
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  const res = await saveGamesConfig(config.value);
  saving.value = false;
  if (res.success) {
    showNotification('配置已保存');
  } else {
    showNotification('保存失败');
  }
}

function addScanPath(): void {
  if (newScanPath.value.trim()) {
    config.value.gameScanPaths.push(newScanPath.value.trim());
    newScanPath.value = '';
  }
}

function removeScanPath(index: number): void {
  config.value.gameScanPaths.splice(index, 1);
}

onMounted(() => loadConfig());
</script>

<style scoped>
.game-settings {
  padding: 24px;
  max-width: 800px;
}
.section-title {
  font-size: 24px;
  margin-bottom: 24px;
}
.settings-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.settings-section h3 {
  font-size: 16px;
  margin-bottom: 16px;
}
.setting-row {
  margin-bottom: 12px;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.path-list {
  margin-top: 12px;
}
.path-item {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: var(--bg);
  border-radius: 4px;
  margin-bottom: 8px;
}
.add-path {
  display: flex;
  gap: 8px;
}
.input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  width: 100%;
}
.action-bar {
  margin-top: 24px;
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
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>