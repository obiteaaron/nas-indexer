<!-- frontend/src/views/game/GameSettingsView.vue -->
<template>
  <div class="game-settings">
    <!-- Toast 提示 -->
    <div class="toast-container" v-if="showToast">
      <div class="toast-message">{{ toastMessage }}</div>
    </div>

    <h2 class="section-title">游戏设置</h2>

    <!-- 扫描路径 -->
    <div class="settings-section">
      <h3>扫描路径</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gameScanPathsEnabled" />
          仅扫描指定路径
        </label>
      </div>
      <p class="hint">开启后游戏模块只扫描下方配置的路径，关闭则沿用文件扫描路径。开启时文件扫描不再触发游戏识别</p>
      <div class="path-list" v-if="config.gameScanPathsEnabled">
        <div class="path-item" v-for="(path, i) in config.gameScanPaths" :key="i">
          <input v-model="config.gameScanPaths[i]" type="text" class="input" />
          <button class="btn btn-small btn-danger" @click="removeScanPath(i)">删除</button>
        </div>
        <button class="btn btn-small btn-secondary" @click="addScanPath">添加路径</button>
      </div>
    </div>

    <!-- 扫描限制 -->
    <div class="settings-section">
      <h3>扫描限制</h3>
      <div class="setting-row">
        <label>最大递归深度</label>
        <input v-model.number="config.gamesRules.maxScanDepth" type="number" min="1" max="10" class="input small" />
        <span class="hint">未匹配规则时递归扫描的最大深度</span>
      </div>
    </div>

    <!-- 识别规则 -->
    <div class="settings-section">
      <h3>识别规则</h3>

      <div class="priority-info">
        <div class="priority-item">
          <span class="priority-label">P0: 手动标记</span>
          <span class="priority-desc">手动添加或提升目录的游戏，自动标记为用户确认，跳过自动识别（最高优先级）</span>
        </div>
        <div class="priority-item">
          <span class="priority-label">P1: Steam锚点</span>
          <span class="priority-desc">自动向上查找 steam_appid.txt 文件定位游戏根目录</span>
        </div>
        <div class="priority-item">
          <span class="priority-label">P2: 正则规则</span>
          <span class="priority-desc">匹配自定义正则规则，配合 levelOffset 向上提升（兜底方案）</span>
        </div>
      </div>

      <div class="setting-row">
        <label>黑名单路径</label>
        <input v-model="blacklistPatternsStr" type="text" class="input" placeholder="$Recycle.Bin, System Volume Information, .git" />
        <span class="hint">包含这些关键词的路径跳过识别，逗号分隔</span>
      </div>

      <div class="rules-list">
        <label>正则规则列表</label>
        <div class="rule-row" v-for="(rule, i) in config.gamesRules.recognitionRules" :key="i">
          <div class="rule-order">
            <button class="btn btn-small order-btn" @click="moveRuleUp(Number(i))" :disabled="i === 0">↑</button>
            <button class="btn btn-small order-btn" @click="moveRuleDown(Number(i))" :disabled="i === config.gamesRules.recognitionRules.length - 1">↓</button>
          </div>
          <input v-model="rule.pattern" type="text" class="input pattern-input" placeholder="正则表达式" />
          <input v-model.number="rule.levelOffset" type="number" min="0" max="5" class="input small offset-input" />
          <span class="offset-label">层偏移</span>
          <input type="checkbox" v-model="rule.enabled" class="rule-checkbox" />
          <input v-model="rule.description" type="text" class="input small desc-input" placeholder="说明" />
          <button class="btn btn-small btn-danger" @click="removeRecognitionRule(Number(i))">删除</button>
        </div>
        <button class="btn btn-small btn-secondary" @click="addRecognitionRule">添加规则</button>
        <p class="hint">正则匹配完整路径。想限制目录名可用 $ 结尾（如 [GOG]$）。层偏移：0=匹配目录本身，1=父目录</p>
      </div>
    </div>

    <!-- 刮削配置 -->
    <div class="settings-section">
      <h3>刮削配置</h3>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.autoScrape" />
          扫描后自动刮削元数据
        </label>
      </div>
      <div class="setting-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="config.gamesScrape.downloadPosters" />
          下载海报到本地
        </label>
      </div>
      <p class="hint">刮削将从 Steam Store 获取游戏元数据和海报</p>
    </div>

    <!-- 代理配置 -->
    <div class="settings-section">
      <h3>HTTP 代理</h3>
      <div class="setting-row">
        <input v-model="config.proxyUrl" type="text" class="input" placeholder="http://127.0.0.1:7890" />
        <span class="hint">用于 Steam API 刮削的代理地址，留空则直连</span>
      </div>
    </div>

    <!-- 优先级说明 -->
    <div class="settings-section doc-section">
      <h3 @click="showDoc = !showDoc" class="doc-title">
        📖 游戏识别优先级说明
        <span class="doc-toggle">{{ showDoc ? '收起' : '展开' }}</span>
      </h3>
      <div v-if="showDoc" class="doc-content">
        <p>系统采用三级优先级识别游戏根目录，手动操作优先级最高：</p>
        <table class="doc-table">
          <thead>
            <tr><th>优先级</th><th>方法</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>P0</strong></td><td>手动标记</td><td>手动添加或提升目录时自动标记，跳过自动识别</td></tr>
            <tr><td><strong>P1</strong></td><td>Steam锚点</td><td>自动向上查找 steam_appid.txt 文件定位根目录</td></tr>
            <tr><td><strong>P2</strong></td><td>正则规则</td><td>匹配自定义正则规则，配合 levelOffset 向上提升</td></tr>
          </tbody>
        </table>
        <p class="hint">海报存储位置：profiles/games/posters/{game_id}/ 目录</p>
      </div>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
        {{ saving ? '保存中...' : '保存游戏设置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getGamesConfig, saveGamesConfig, type GamesConfig } from '../../api';
import { useGameToast } from '../../composables/game/useGameToast';

const { showNotification, showToast, toastMessage } = useGameToast();

const defaultConfig: GamesConfig = {
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: {
    recognitionRules: [
      { pattern: '\\[GOG\\]$', levelOffset: 0, enabled: true, description: 'GOG 版游戏' },
      { pattern: '\\[Steam\\]$', levelOffset: 0, enabled: true, description: 'Steam 版游戏' },
      { pattern: '\\[CRACK\\]$', levelOffset: 0, enabled: true, description: '破解版游戏' },
      { pattern: 'FitGirl.*Repack$', levelOffset: 1, enabled: true, description: 'FitGirl 压缩包' },
      { pattern: '/steamapps/', levelOffset: 0, enabled: true, description: 'Steam 游戏库' },
      { pattern: '/games/', levelOffset: 0, enabled: true, description: '通用游戏目录' }
    ],
    heuristicRules: {},
    blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
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
const showDoc = ref(false);

// 黑名单路径字符串（computed）
const blacklistPatternsStr = computed({
  get: () => config.value.gamesRules.blacklistPatterns.join(', '),
  set: (v: string) => {
    config.value.gamesRules.blacklistPatterns = v.split(',').map(s => s.trim()).filter(s => s);
  }
});

// 加载配置
async function loadConfig(): Promise<void> {
  const res = await getGamesConfig();
  if (res.success && res.data) {
    config.value = res.data;
  }
}

// 保存配置
async function saveSettings(): Promise<void> {
  saving.value = true;
  const res = await saveGamesConfig(config.value);
  saving.value = false;
  if (res.success) {
    showNotification('游戏设置已保存');
  } else {
    showNotification('保存失败');
  }
}

// 添加扫描路径
function addScanPath(): void {
  if (newScanPath.value.trim()) {
    config.value.gameScanPaths.push(newScanPath.value.trim());
    newScanPath.value = '';
  }
}

// 移除扫描路径
function removeScanPath(index: number): void {
  config.value.gameScanPaths.splice(index, 1);
}

// 添加识别规则
function addRecognitionRule(): void {
  config.value.gamesRules.recognitionRules.push({
    pattern: '',
    levelOffset: 0,
    enabled: true,
    description: ''
  });
}

// 上移规则
function moveRuleUp(index: number): void {
  if (index > 0) {
    const rules = config.value.gamesRules.recognitionRules;
    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
  }
}

// 下移规则
function moveRuleDown(index: number): void {
  const rules = config.value.gamesRules.recognitionRules;
  if (index < rules.length - 1) {
    [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]];
  }
}

// 移除识别规则
function removeRecognitionRule(index: number): void {
  config.value.gamesRules.recognitionRules.splice(index, 1);
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
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.hint {
  color: var(--text-secondary);
  font-size: 13px;
}
.path-list {
  margin-top: 12px;
}
.path-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
.input.small {
  width: 80px;
}
.input.pattern-input {
  flex: 1;
}
.input.offset-input {
  width: 60px;
}
.input.desc-input {
  width: 120px;
}
.offset-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.rule-checkbox {
  margin: 0 8px;
}
.priority-info {
  margin-bottom: 16px;
}
.priority-item {
  margin-bottom: 8px;
}
.priority-label {
  font-weight: 600;
  font-size: 14px;
}
.priority-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 8px;
}
.rules-list {
  margin-top: 12px;
}
.rules-list label {
  font-size: 14px;
  margin-bottom: 8px;
  display: block;
}
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.rule-order {
  display: flex;
  gap: 4px;
}
.order-btn {
  padding: 2px 6px;
  font-size: 12px;
}
.action-bar {
  margin-top: 24px;
}
.doc-section {
  cursor: pointer;
}
.doc-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.doc-toggle {
  font-size: 14px;
  color: var(--text-secondary);
}
.doc-content {
  margin-top: 16px;
}
.doc-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}
.doc-table th, .doc-table td {
  padding: 8px;
  border: 1px solid var(--border);
  text-align: left;
}
.doc-table th {
  background: var(--bg-secondary);
}
.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
}
.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.btn-secondary {
  background: var(--bg-secondary);
}
.btn-danger {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}
.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Toast 提示 */
.toast-container {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
}
.toast-message {
  background: var(--primary);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: fadeInOut 2s ease-in-out;
}
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(-10px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}
</style>