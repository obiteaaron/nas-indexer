<template>
  <div class="settings">
    <div class="settings-layout">
      <nav class="settings-sidebar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="settings-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <div class="settings-content">
        <!-- 扫描配置 -->
        <div v-show="activeTab === 'scan'" class="tab-panel">
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
                <button class="btn btn-warning btn-small" @click="handleCleanupStaleFiles" style="margin-left: 8px;">清理失效记录</button>
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
        </div>

        <!-- 分类规则 -->
        <div v-show="activeTab === 'category'" class="tab-panel">
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
        </div>

        <!-- 偏好与显示 -->
        <div v-show="activeTab === 'display'" class="tab-panel">
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
        </div>

        <!-- 游戏模块 -->
        <div v-show="activeTab === 'games'" class="tab-panel">
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
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.gameScanPathsEnabled">
                仅扫描指定路径
              </label>
              <span class="hint">开启后游戏模块只扫描下方配置的路径，关闭则沿用文件扫描路径。开启时文件扫描不再触发游戏识别，游戏识别仅在游戏页面手动触发</span>
              <div class="path-list" v-if="config.gameScanPathsEnabled" style="margin-top: 8px;">
                <div class="path-item" v-for="(p, i) in config.gameScanPaths" :key="i">
                  <input class="input" v-model="config.gameScanPaths![i]">
                  <button class="btn btn-danger btn-small" @click="removeGameScanPath(i)">删除</button>
                </div>
                <button class="btn btn-secondary btn-small" @click="addGameScanPath">添加路径</button>
              </div>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label>识别规则</label>
              <div class="game-rules-section">
                <div class="priority-group">
                  <span class="priority-label">识别优先级 1: 本地元数据</span>
                  <span class="hint">游戏目录下的 game.json 文件（识别优先级最高，不可在此配置）</span>
                </div>

                <div class="priority-group">
                  <span class="priority-label">识别优先级 2: 目录特征匹配</span>
                </div>
                <div class="rule-item">
                  <label>排除路径</label>
                  <input class="input" v-model="gameExcludePatternsStr" placeholder="$Recycle.Bin, node_modules">
                  <span class="hint">路径包含这些关键词时排除，优先级最高，逗号分隔</span>
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

                <div class="priority-group">
                  <span class="priority-label">识别优先级 3: 游戏库路径（递归扫描）</span>
                </div>
                <div class="rule-item">
                  <label>路径前缀匹配</label>
                  <input class="input" v-model="pathPrefixesStr" placeholder="D:\Games, E:\SteamLibrary">
                  <span class="hint">路径以这些前缀开头时递归扫描子目录，逗号分隔</span>
                </div>
                <div class="rule-item">
                  <label>路径关键词匹配</label>
                  <input class="input" v-model="pathKeywordsStr" placeholder="steamapps, games, game">
                  <span class="hint">路径包含这些关键词时递归扫描子目录，逗号分隔</span>
                </div>
              </div>
              <span class="hint">识别优先级：本地元数据 > 排除规则 > 目录名特征 > 特征文件 > 路径前缀 > 路径关键词</span>
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

            <div class="game-doc-section" v-if="config.gamesEnabled">
              <h4 class="doc-title" @click="showGameDoc = !showGameDoc">
                📖 game.json 格式说明
                <span class="doc-toggle">{{ showGameDoc ? '收起' : '展开' }}</span>
              </h4>
              <div v-if="showGameDoc" class="doc-content">
                <p class="doc-desc">在游戏目录下放置 <code>game.json</code> 文件可手动提供元数据。系统识别时会优先读取此文件，识别优先级最高。</p>

                <h5>字段说明</h5>
                <table class="doc-table">
                  <thead>
                    <tr><th>字段</th><th>类型</th><th>说明</th></tr>
                  </thead>
                  <tbody>
                    <tr><td><code>title</code></td><td>string</td><td>游戏名称（必填）</td></tr>
                    <tr><td><code>title_en</code></td><td>string</td><td>英文名称</td></tr>
                    <tr><td><code>original_name</code></td><td>string</td><td>原始文件夹名</td></tr>
                    <tr><td><code>steam_appid</code></td><td>string</td><td>Steam AppID，设置后可自动关联 Steam 数据</td></tr>
                    <tr><td><code>developer</code></td><td>string</td><td>开发商</td></tr>
                    <tr><td><code>publisher</code></td><td>string</td><td>发行商</td></tr>
                    <tr><td><code>release_date</code></td><td>string</td><td>发行日期，格式 YYYY-MM-DD</td></tr>
                    <tr><td><code>genres</code></td><td>string[]</td><td>游戏类型，如 ["RPG", "Action"]</td></tr>
                    <tr><td><code>rating</code></td><td>number</td><td>评分</td></tr>
                    <tr><td><code>description</code></td><td>string</td><td>详细描述</td></tr>
                    <tr><td><code>short_description</code></td><td>string</td><td>简短描述</td></tr>
                    <tr><td><code>languages</code></td><td>string[]</td><td>支持语言，如 ["English", "中文"]</td></tr>
                    <tr><td><code>tags</code></td><td>string[]</td><td>标签列表</td></tr>
                    <tr><td><code>notes</code></td><td>string</td><td>备注（仅本地存储）</td></tr>
                    <tr><td><code>screenshots</code></td><td>string[]</td><td>截图 URL 列表</td></tr>
                    <tr><td><code>metadata_source</code></td><td>string</td><td>数据来源，如 "local"、"steam"</td></tr>
                    <tr><td><code>scraped_at</code></td><td>string</td><td>刮削时间，ISO 格式</td></tr>
                  </tbody>
                </table>

                <h5>示例</h5>
                <pre class="doc-code">{
  "title": "The Witcher 3: Wild Hunt",
  "title_en": "The Witcher 3: Wild Hunt",
  "developer": "CD Projekt RED",
  "publisher": "CD Projekt",
  "release_date": "2015-05-19",
  "genres": ["RPG", "Action", "Open World"],
  "rating": 9.5,
  "steam_appid": "292030",
  "languages": ["English", "中文"],
  "metadata_source": "local"
}</pre>

                <h5>海报文件</h5>
                <p class="doc-desc">可在游戏目录下放置以下海报文件，系统会自动识别：</p>
                <ul class="doc-list">
                  <li><code>poster-horizontal.jpg</code> — 横版海报（主要展示用）</li>
                  <li><code>poster-vertical.jpg</code> — 竖版海报</li>
                  <li><code>poster-banner.jpg</code> — 横幅海报</li>
                  <li><code>background.jpg</code> — 背景图</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- 系统状态 -->
        <div v-show="activeTab === 'status'" class="tab-panel">
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { getConfig, saveConfig, getStatus, scanSinglePath, clearPreferencesData, checkAllPaths, cleanupStaleFiles } from '../api'
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
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: DEFAULT_GAME_RULES,
  gamesScrape: DEFAULT_GAME_SCRAPE
})
const status = ref<StatusResponse | null>(null)
const saving = ref(false)
const checkingPaths = ref(false)
const pathStatuses = ref<PathStatus[]>([])
const showGameDoc = ref(false)

const activeTab = ref('scan')
const tabs = [
  { key: 'scan', label: '扫描配置' },
  { key: 'category', label: '分类规则' },
  { key: 'display', label: '偏好与显示' },
  { key: 'games', label: '游戏模块' },
  { key: 'status', label: '系统状态' },
]

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
        gameScanPathsEnabled: res.data.gameScanPathsEnabled ?? false,
        gameScanPaths: res.data.gameScanPaths || [],
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

function addGameScanPath(): void {
  if (!config.value.gameScanPaths) config.value.gameScanPaths = []
  config.value.gameScanPaths.push('')
}

function removeGameScanPath(index: number): void {
  config.value.gameScanPaths?.splice(index, 1)
}

async function handleCleanupStaleFiles(): Promise<void> {
  try {
    const res = await cleanupStaleFiles()
    if (res.success) {
      alert(`清理完成，已删除 ${res.data?.deletedCount ?? 0} 条失效记录`)
    } else {
      alert('清理失败：' + res.error)
    }
  } catch (err) {
    alert('清理失败：' + (err as Error).message)
  }
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
      window.dispatchEvent(new Event('config-saved'))
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
.settings-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
  flex-shrink: 0;
  position: sticky;
  top: 84px;
}

.settings-tab {
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  text-align: left;
  transition: all 0.2s;
}

.settings-tab:hover {
  color: var(--text);
  background: var(--bg-secondary);
}

.settings-tab.active {
  color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
  font-weight: 500;
}

.settings-content {
  flex: 1;
  min-width: 0;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.priority-group {
  padding: 8px 0 4px;
  border-top: 1px solid var(--border);
}

.priority-group:first-child {
  border-top: none;
  padding-top: 0;
}

.priority-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 2px;
}

.game-doc-section {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.doc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}

.doc-title:hover {
  color: var(--accent);
}

.doc-toggle {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.doc-content {
  margin-top: 12px;
}

.doc-content h5 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 16px 0 8px;
}

.doc-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 8px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin: 8px 0;
}

.doc-table th,
.doc-table td {
  padding: 6px 10px;
  text-align: left;
  border: 1px solid var(--border);
}

.doc-table th {
  background: var(--bg);
  font-weight: 600;
  color: var(--text);
}

.doc-table td {
  color: var(--text-secondary);
}

.doc-table code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--accent);
}

.doc-code {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  color: var(--text);
  margin: 8px 0;
}

.doc-list {
  font-size: 13px;
  color: var(--text-secondary);
  padding-left: 20px;
  line-height: 1.8;
}

.doc-list code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--accent);
}

.doc-content code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--accent);
}

@media (max-width: 768px) {
  .settings-layout {
    flex-direction: column;
  }

  .settings-sidebar {
    flex-direction: row;
    min-width: 0;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    position: static;
    gap: 8px;
    padding-bottom: 4px;
  }

  .settings-tab {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 8px 14px;
    font-size: 13px;
  }
}
</style>