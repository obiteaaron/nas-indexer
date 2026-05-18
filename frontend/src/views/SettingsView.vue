<template>
  <div class="settings">
    <div class="card">
      <h2 class="section-title">扫描配置</h2>

      <div class="form-group">
        <label>扫描路径</label>
        <p class="path-tip">
          添加扫描路径后，点击"扫描"按钮可单独扫描该路径；首页"立即扫描全部"会扫描所有配置路径
        </p>
        <div class="path-list">
          <div class="path-item" v-for="(p, i) in config.scanPaths" :key="i">
            <span class="path-status-dot" :class="getPathStatusClass(p)" :title="getPathStatusTitle(p)"></span>
            <input class="input" v-model="config.scanPaths[i]">
            <button class="btn btn-primary btn-small" @click="scanPath(i)" :disabled="!config.scanPaths[i]">
              扫描
            </button>
            <button class="btn btn-danger btn-small" @click="removePath(i)">删除</button>
          </div>
          <button class="btn btn-secondary btn-small" @click="addPath">添加路径</button>
        </div>
      </div>

      <div class="form-group">
        <label>定时扫描 (Cron 表达式)</label>
        <input class="input" v-model="config.scanTime" placeholder="0 2 * * *">
        <span class="hint">默认每天凌晨 2 点扫描</span>
      </div>

      <div class="form-group">
        <label>排除模式</label>
        <input class="input" v-model="excludePatternsStr" placeholder="node_modules, .git, .cache">
        <span class="hint">逗号分隔</span>
      </div>

      <div class="form-group">
        <label>白名单扩展名</label>
        <input class="input" v-model="whitelistStr" placeholder=".mp4, .mkv, .jpg">
        <span class="hint">留空则使用黑名单过滤</span>
      </div>

      <div class="form-group">
        <label>黑名单扩展名</label>
        <input class="input" v-model="blacklistStr" placeholder=".js, .ts, .log">
        <span class="hint">排除这些扩展名的文件</span>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="save" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</button>
        <button class="btn btn-secondary" @click="reset">重置</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">分类规则（按后缀）</h3>
      <p class="hint">根据文件后缀自动分类，每个分类对应一组扩展名</p>

      <div class="category-rules">
        <div class="category-item" v-for="(extensions, category) in localCategoryRules" :key="category">
          <div class="category-header">
            <input class="input category-name" :value="category" @change="updateCategoryName(category, $event)" placeholder="分类名称">
            <button class="btn btn-danger btn-small" @click="removeCategory(category)">删除分类</button>
          </div>
          <div class="extensions-list">
            <span class="extension-tag" v-for="(ext, i) in extensions" :key="i">
              {{ ext }}
              <button class="remove-ext" @click="removeExtension(category, i)">×</button>
            </span>
            <input
              class="input extension-input"
              v-model="newExtensions[category]"
              placeholder="添加扩展名，如 .mp4"
              @keyup.enter="addExtension(category)"
            >
            <button class="btn btn-secondary btn-small" @click="addExtension(category)">添加</button>
          </div>
        </div>
        <div class="add-category">
          <input class="input" v-model="newCategoryName" placeholder="新分类名称">
          <button class="btn btn-secondary btn-small" @click="addCategory">添加分类</button>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="applyCategoryRules">应用分类规则</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">目录分类规则（优先级更高）</h3>
      <p class="hint">根据文件所在目录路径前缀分类，优先级高于后缀规则</p>

      <div class="path-rules">
        <div class="path-rule-item" v-for="(rule, i) in localCategoryPathRules" :key="i">
          <input class="input path-prefix" v-model="rule.pathPrefix" placeholder="目录路径前缀，如 D:/NAS/Games">
          <select class="select category-select" v-model="rule.category">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            <option value="其他">其他</option>
          </select>
          <button class="btn btn-danger btn-small" @click="removePathRule(i)">删除</button>
        </div>
        <button class="btn btn-secondary btn-small" @click="addPathRule">添加目录规则</button>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="applyPathRules">应用目录规则</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">状态信息</h3>
      <div class="status-info" v-if="status">
        <p><strong>存储目录：</strong>{{ status.storagePath }}</p>
        <p><strong>定时扫描：</strong>{{ status.scheduled ? '已启用' : '未启用' }}</p>
        <p><strong>总文件数：</strong>{{ status.totalFiles }}</p>
        <p><strong>总大小：</strong>{{ status.totalSize }}</p>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">NAS 连接状态</h3>
      <div class="path-status-actions">
        <button class="btn btn-primary" @click="checkPathsStatus" :disabled="checkingPaths">
          {{ checkingPaths ? '检测中...' : '检测所有路径' }}
        </button>
      </div>
      <div class="path-status-list" v-if="pathStatuses.length">
        <div class="path-status-item" v-for="(ps, i) in pathStatuses" :key="i" :class="{ 'path-error': !ps.isAccessible }">
          <div class="path-status-header">
            <span class="path-status-icon">{{ ps.isAccessible ? '✅' : '❌' }}</span>
            <span class="path-status-path" :title="ps.path">{{ ps.path }}</span>
          </div>
          <div class="path-status-details">
            <span v-if="ps.isAccessible">文件数: {{ ps.fileCount }} | 延迟: {{ ps.latency }}ms</span>
            <span v-else class="path-error-msg">{{ ps.error }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">偏好分析</h3>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.trackingConfig!.trackingEnabled">
          启用行为追踪
        </label>
        <span class="hint">开启后将记录文件查看、预览、搜索等行为，用于生成个性化推荐</span>
      </div>

      <div class="form-group" v-if="config.trackingConfig?.trackingEnabled">
        <label>追踪级别</label>
        <select class="select" v-model="config.trackingConfig!.trackingLevel">
          <option value="minimal">基础（仅搜索记录）</option>
          <option value="full">完整（查看、预览、搜索、打标）</option>
        </select>
        <span class="hint">完整模式将记录更多行为数据，推荐结果更精准</span>
      </div>

      <div class="form-actions">
        <button class="btn btn-danger btn-small" @click="clearPreferences">清除偏好数据</button>
        <span class="clear-tip">清除所有行为记录和推荐结果，不影响文件和标签</span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">显示设置</h3>
      <div class="form-group">
        <label>缩略图加载大小限制</label>
        <div class="size-limit-input">
          <input class="input" type="number" v-model.number="config.thumbnailSizeLimit" min="0" step="1">
          <span class="size-unit">MB</span>
        </div>
        <span class="hint">文件大小超过此限制时不自动加载缩略图，设为 0 表示不限制。默认 5MB</span>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="save">保存显示设置</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">游戏模块</h3>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.gamesEnabled">
          启用游戏模块
        </label>
        <span class="hint">开启后将在扫描时识别游戏目录，并显示"游戏"导航入口</span>
      </div>

      <div class="form-group" v-if="config.gamesEnabled">
        <label>识别规则</label>
        <div class="game-rules-section">
          <div class="rule-item">
            <label>路径前缀匹配</label>
            <input class="input" v-model="pathPrefixesStr" placeholder="D:\Games, E:\SteamLibrary">
            <span class="hint">路径以这些前缀开头时识别为游戏，逗号分隔</span>
          </div>
          <div class="rule-item">
            <label>路径关键词匹配</label>
            <input class="input" v-model="pathKeywordsStr" placeholder="steamapps, games, game">
            <span class="hint">路径包含这些关键词时识别为游戏，逗号分隔</span>
          </div>
          <div class="rule-item">
            <label>目录名特征（正则表达式）</label>
            <input class="input" v-model="folderPatternsStr" placeholder="\[GOG\], \[Steam\]">
            <span class="hint">目录名匹配这些模式时识别为游戏，逗号分隔</span>
          </div>
          <div class="rule-item">
            <label>特征文件</label>
            <input class="input" v-model="fileIndicatorsStr" placeholder=".exe, steam_api.dll, game.json">
            <span class="hint">目录内存在这些文件时识别为游戏，逗号分隔</span>
          </div>
          <div class="rule-item">
            <label>排除路径</label>
            <input class="input" v-model="gameExcludePatternsStr" placeholder="$Recycle.Bin, node_modules">
            <span class="hint">路径包含这些关键词时排除，逗号分隔</span>
          </div>
        </div>
        <span class="hint">识别优先级：排除规则 > 路径前缀 > 路径关键词 > 目录名特征 > 文件特征</span>
      </div>

      <div class="form-group" v-if="config.gamesEnabled">
        <label>刮削设置</label>
        <label class="checkbox-label sub-checkbox">
          <input type="checkbox" v-model="config.gamesScrape!.autoScrape">
          扫描后自动刮削元数据
        </label>
        <label class="checkbox-label sub-checkbox">
          <input type="checkbox" v-model="config.gamesScrape!.downloadPosters">
          下载海报到本地
        </label>
        <span class="hint">刮削将从 Steam Store 获取游戏元数据和海报</span>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" @click="save">保存游戏设置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { getConfig, saveConfig, getStatus, scanSinglePath, clearPreferencesData, checkAllPaths } from '../api'
import type { Config, StatusResponse, PathStatus, CategoryRule, CategoryPathRule, GameRules, GameScrapeConfig } from '../types'

const DEFAULT_GAME_RULES: GameRules = {
  pathPrefixes: [],
  pathKeywords: ['steamapps', 'steam_library', 'steamlibrary', 'games', 'game'],
  fileIndicators: ['.exe', 'steam_api.dll', 'steam_api64.dll', 'steam_appid.txt'],
  excludePatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
  folderPatterns: ['\\[GOG\\]', '\\[Steam\\]'],
  metadataFile: 'game.json'
}

const DEFAULT_GAME_SCRAPE: GameScrapeConfig = {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true
}

const config = ref<Config>({
  storagePath: '',
  scanPaths: [],
  scanTime: '0 2 * * *',
  excludePatterns: [],
  fileExtensionFilter: { whitelist: [], blacklist: [] },
  categoryRules: {},
  categoryPathRules: [],
  trackingConfig: { trackingEnabled: true, trackingLevel: 'full' },
  thumbnailSizeLimit: 5,
  gamesEnabled: false,
  gamesRules: DEFAULT_GAME_RULES,
  gamesScrape: DEFAULT_GAME_SCRAPE
})
const status = ref<StatusResponse | null>(null)
const saving = ref(false)
const checkingPaths = ref(false)
const pathStatuses = ref<PathStatus[]>([])

const localCategoryRules = reactive<CategoryRule>({})
const localCategoryPathRules = ref<CategoryPathRule[]>([])
const newExtensions = reactive<Record<string, string>>({})
const newCategoryName = ref('')

const categories = computed(() => Object.keys(localCategoryRules))

const excludePatternsStr = computed({
  get: () => config.value.excludePatterns.join(', '),
  set: (v: string) => config.value.excludePatterns = v.split(',').map(s => s.trim()).filter(s => s)
})

const whitelistStr = computed({
  get: () => (config.value.fileExtensionFilter?.whitelist || []).join(', '),
  set: (v: string) => {
    if (!config.value.fileExtensionFilter) config.value.fileExtensionFilter = { whitelist: [], blacklist: [] }
    config.value.fileExtensionFilter.whitelist = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const blacklistStr = computed({
  get: () => (config.value.fileExtensionFilter?.blacklist || []).join(', '),
  set: (v: string) => {
    if (!config.value.fileExtensionFilter) config.value.fileExtensionFilter = { whitelist: [], blacklist: [] }
    config.value.fileExtensionFilter.blacklist = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const pathKeywordsStr = computed({
  get: () => (config.value.gamesRules?.pathKeywords || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.pathKeywords = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const pathPrefixesStr = computed({
  get: () => (config.value.gamesRules?.pathPrefixes || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.pathPrefixes = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const folderPatternsStr = computed({
  get: () => (config.value.gamesRules?.folderPatterns || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.folderPatterns = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const fileIndicatorsStr = computed({
  get: () => (config.value.gamesRules?.fileIndicators || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.fileIndicators = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const gameExcludePatternsStr = computed({
  get: () => (config.value.gamesRules?.excludePatterns || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.excludePatterns = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

onMounted(async () => {
  await loadConfig()
  await loadStatus()
  await checkPathsStatus()
})

async function loadConfig(): Promise<void> {
  try {
    const res = await getConfig()
    if (res.success && res.data) {
      config.value = {
        ...res.data,
        fileExtensionFilter: res.data.fileExtensionFilter || { whitelist: [], blacklist: [] },
        categoryRules: res.data.categoryRules || {},
        categoryPathRules: res.data.categoryPathRules || [],
        trackingConfig: res.data.trackingConfig || { trackingEnabled: true, trackingLevel: 'full' },
        thumbnailSizeLimit: res.data.thumbnailSizeLimit ?? 5,
        gamesEnabled: res.data.gamesEnabled ?? false,
        gamesRules: res.data.gamesRules || DEFAULT_GAME_RULES,
        gamesScrape: res.data.gamesScrape || DEFAULT_GAME_SCRAPE
      }

      Object.keys(localCategoryRules).forEach(key => delete localCategoryRules[key])
      Object.assign(localCategoryRules, config.value.categoryRules || {})
      localCategoryPathRules.value = [...(config.value.categoryPathRules || [])]
    }
  } catch (err) {
    console.error('获取配置失败:', err)
  }
}

async function loadStatus(): Promise<void> {
  try {
    const res = await getStatus()
    if (res.success && res.data) {
      status.value = res.data
    }
  } catch (err) {
    console.error('获取状态失败:', err)
  }
}

function addPath(): void {
  config.value.scanPaths.push('')
}

function removePath(index: number): void {
  config.value.scanPaths.splice(index, 1)
}

async function scanPath(index: number): Promise<void> {
  const path = config.value.scanPaths[index]
  if (!path) return

  try {
    const res = await scanSinglePath(path)
    if (!res.success) {
      alert('启动扫描失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    alert('启动扫描失败：' + error.message)
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const res = await saveConfig(config.value)
    if (res.success) {
      alert('配置已保存')
      loadStatus()
    } else {
      alert('保存失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    alert('保存失败：' + error.message)
  }
  saving.value = false
}

function reset(): void {
  loadConfig()
}

function addCategory(): void {
  if (!newCategoryName.value.trim()) return
  const name = newCategoryName.value.trim()
  if (localCategoryRules[name]) {
    alert('分类已存在')
    return
  }
  localCategoryRules[name] = []
  newExtensions[name] = ''
  newCategoryName.value = ''
}

function removeCategory(category: string): void {
  delete localCategoryRules[category]
  delete newExtensions[category]
}

function updateCategoryName(oldName: string, event: Event): void {
  const target = event.target as HTMLInputElement
  const newName = target.value.trim()
  if (!newName || newName === oldName) return
  if (localCategoryRules[newName]) {
    alert('分类名称已存在')
    target.value = oldName
    return
  }
  const extensions = localCategoryRules[oldName]
  delete localCategoryRules[oldName]
  localCategoryRules[newName] = extensions
  newExtensions[newName] = newExtensions[oldName] || ''
  delete newExtensions[oldName]
}

function addExtension(category: string): void {
  const ext = newExtensions[category]?.trim()
  if (!ext) return
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase()
  if (localCategoryRules[category].includes(normalizedExt)) {
    alert('扩展名已存在')
    return
  }
  localCategoryRules[category].push(normalizedExt)
  newExtensions[category] = ''
}

function removeExtension(category: string, index: number): void {
  localCategoryRules[category].splice(index, 1)
}

function addPathRule(): void {
  localCategoryPathRules.value.push({ pathPrefix: '', category: '其他' })
}

function removePathRule(index: number): void {
  localCategoryPathRules.value.splice(index, 1)
}

async function applyCategoryRules(): Promise<void> {
  config.value.categoryRules = { ...localCategoryRules }
  await save()
}

async function applyPathRules(): Promise<void> {
  config.value.categoryPathRules = [...localCategoryPathRules.value]
  await save()
}

async function clearPreferences(): Promise<void> {
  if (!confirm('确定要清除所有偏好数据吗？此操作不可恢复。')) return
  try {
    const res = await clearPreferencesData()
    if (res.success) {
      alert('偏好数据已清除')
    } else {
      alert('清除失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    alert('清除失败：' + error.message)
  }
}

async function checkPathsStatus(): Promise<void> {
  checkingPaths.value = true
  try {
    const res = await checkAllPaths()
    if (res.success && res.data) {
      pathStatuses.value = res.data
    } else {
      alert('检测失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    alert('检测失败：' + error.message)
  }
  checkingPaths.value = false
}

function getPathStatusClass(path: string): string {
  if (!path) return 'status-unknown'
  const ps = pathStatuses.value.find(p => p.path === path)
  if (!ps) return 'status-unknown'
  return ps.isAccessible ? 'status-ok' : 'status-error'
}

function getPathStatusTitle(path: string): string {
  if (!path) return '未配置'
  const ps = pathStatuses.value.find(p => p.path === path)
  if (!ps) return '未检测'
  if (ps.isAccessible) return `可达 - 文件数: ${ps.fileCount}, 延迟: ${ps.latency}ms`
  return `不可达 - ${ps.error}`
}
</script>

<style scoped>
.section-title {
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-group .hint {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 13px;
}

.path-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 13px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-item input {
  flex: 1;
}

.path-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.path-status-dot.status-unknown {
  background: #9ca3af;
}

.path-status-dot.status-ok {
  background: #22c55e;
}

.path-status-dot.status-error {
  background: #ef4444;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.status-info p {
  margin-bottom: 8px;
  color: var(--text);
}

.status-info strong {
  color: var(--text-muted);
}

.category-rules {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.category-header {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.category-name {
  width: 150px;
}

.extensions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.extension-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 13px;
}

.remove-ext {
  margin-left: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.remove-ext:hover {
  color: var(--danger);
}

.extension-input {
  width: 120px;
}

.add-category {
  display: flex;
  gap: 8px;
}

.add-category .input {
  width: 150px;
}

.path-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-rule-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-prefix {
  flex: 1;
}

.category-select {
  width: 120px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.sub-checkbox {
  margin-top: 8px;
  font-size: 14px;
}

.clear-tip {
  margin-left: 8px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 32px;
}

.path-status-actions {
  margin-bottom: 16px;
}

.path-status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-status-item {
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.path-status-item.path-error {
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.05);
}

.path-status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.path-status-icon {
  font-size: 16px;
}

.path-status-path {
  font-weight: 500;
  word-break: break-all;
}

.path-status-details {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: 24px;
}

.path-error-msg {
  color: var(--danger);
}

.size-limit-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-limit-input .input {
  width: 120px;
}

.size-unit {
  color: var(--text-muted);
  font-size: 14px;
}

.game-rules-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.rule-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0;
}

.rule-item .hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 0;
}
</style>