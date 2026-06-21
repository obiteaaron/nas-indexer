<template>
  <div class="settings">
    <!-- Toast Notification -->
    <Transition name="toast">
      <div v-if="showToast" class="toast-notification">
        {{ toastMessage }}
      </div>
    </Transition>

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
                  <button class="btn btn-primary btn-small" @click="scanPath(i)" :disabled="!config.scanPaths[i] || scanPathLoading[i]">
                    {{ scanPathLoading[i] ? '扫描中...' : '扫描' }}
                  </button>
                  <button class="btn btn-danger btn-small" @click="removePath(i)">删除</button>
                </div>
                <button class="btn btn-secondary btn-small" @click="addPath">添加路径</button>
                <button class="btn btn-warning btn-small" @click="handleCleanupStaleFiles" :disabled="cleanupLoading.loading.value" style="margin-left: 8px;">
                  {{ cleanupLoading.loading.value ? '清理中...' : '清理失效记录' }}
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>定时扫描 (Cron 表达式)</label>
              <input class="input" v-model="config.scanTime" placeholder="0 2 * * *">
              <span class="hint">默认每天凌晨 2 点扫描。设置为空可关闭定时扫描</span>
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
              <button class="btn btn-primary" @click="applyCategoryRules" :disabled="applyCategoryLoading.loading.value">
                {{ applyCategoryLoading.loading.value ? '应用中...' : '应用分类规则' }}
              </button>
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
              <button class="btn btn-primary" @click="applyPathRules" :disabled="applyPathLoading.loading.value">
                {{ applyPathLoading.loading.value ? '应用中...' : '应用目录规则' }}
              </button>
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
              <button class="btn btn-danger btn-small" @click="clearPreferences" :disabled="clearPrefsLoading.loading.value">
                {{ clearPrefsLoading.loading.value ? '清除中...' : '清除偏好数据' }}
              </button>
              <span class="clear-tip">清除所有行为记录和推荐结果，不影响文件和标签</span>
            </div>
          </div>

          <div class="card">
            <h3 class="section-title">显示设置</h3>

            <!-- 图片预览开关 -->
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.thumbnailPreviewEnabled">
                启用图片缩略图预览
              </label>
            </div>

            <!-- 图片预览大小限制（仅在启用时显示） -->
            <div class="form-group" v-if="config.thumbnailPreviewEnabled">
              <label>缩略图加载大小限制</label>
              <div class="size-limit-input">
                <input class="input" type="number" v-model.number="config.thumbnailSizeLimit" min="0" step="1">
                <span class="size-unit">MB</span>
              </div>
              <span class="hint">文件大小超过此限制时不自动加载缩略图。0 表示不限制。默认 5MB</span>
            </div>

            <!-- 视频预览开关 -->
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.videoPreviewEnabled">
                显示视频元数据（时长、分辨率）
              </label>
              <span class="hint">关闭后将跳过视频时长和分辨率的获取，减少磁盘读取压力</span>
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
              <span class="hint">开启后将在扫描时识别游戏目录，并显示"游戏"导航入口。详细配置请前往游戏设置页面。</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="save">保存设置</button>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useButtonLoading } from '../composables/useRequestState'
import { getConfig, saveConfig, getStatus, scanSinglePath, clearPreferencesData, checkAllPaths, cleanupStaleFiles } from '../api'
import type { Config, StatusResponse, PathStatus, CategoryRule, CategoryPathRule } from '../types'

const config = ref<Config>({
  storagePath: '',
  scanPaths: [],
  scanTime: '0 2 * * *',
  excludePatterns: [],
  fileExtensionFilter: { whitelist: [], blacklist: [] },
  categoryRules: {},
  categoryPathRules: [],
  trackingConfig: { trackingEnabled: true, trackingLevel: 'full' },
  thumbnailPreviewEnabled: true,
  thumbnailSizeLimit: 5,
  videoPreviewEnabled: true,
  gamesEnabled: false
})
const status = ref<StatusResponse | null>(null)
const saving = ref(false)
const checkingPaths = ref(false)
const pathStatuses = ref<PathStatus[]>([])

// 按钮级 loading 状态
const scanPathLoading = ref<Record<number, boolean>>({})
const cleanupLoading = useButtonLoading()
const applyCategoryLoading = useButtonLoading()
const applyPathLoading = useButtonLoading()
const clearPrefsLoading = useButtonLoading()

// Toast 提示
const showToast = ref(false)
const toastMessage = ref('')
let toastTimeout: ReturnType<typeof setTimeout> | null = null

function showNotification(message: string): void {
  toastMessage.value = message
  showToast.value = true
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    showToast.value = false
  }, 2000)
}

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
        thumbnailPreviewEnabled: res.data.thumbnailPreviewEnabled ?? true,
        thumbnailSizeLimit: res.data.thumbnailSizeLimit ?? 5,
        videoPreviewEnabled: res.data.videoPreviewEnabled ?? true,
        gamesEnabled: res.data.gamesEnabled ?? false
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

async function handleCleanupStaleFiles(): Promise<void> {
  await cleanupLoading.withButtonLoading(async () => {
    try {
      const res = await cleanupStaleFiles()
      if (res.success) {
        showNotification(`清理完成，已删除 ${res.data?.deletedCount ?? 0} 条失效记录`)
      } else {
        showNotification('清理失败：' + res.error)
      }
    } catch (err) {
      showNotification('清理失败：' + (err as Error).message)
    }
  })
}

async function scanPath(index: number): Promise<void> {
  const path = config.value.scanPaths[index]
  if (!path) return

  scanPathLoading.value[index] = true
  try {
    const res = await scanSinglePath(path)
    if (!res.success) {
      showNotification('启动扫描失败：' + res.error)
    } else {
      showNotification('扫描已启动')
    }
  } catch (err) {
    const error = err as Error
    showNotification('启动扫描失败：' + error.message)
  }
  scanPathLoading.value[index] = false
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const res = await saveConfig(config.value)
    if (res.success) {
      showNotification('配置已保存')
      window.dispatchEvent(new Event('config-saved'))
      loadStatus()
    } else {
      showNotification('保存失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('保存失败：' + error.message)
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
    showNotification('分类已存在')
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
    showNotification('分类名称已存在')
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
    showNotification('扩展名已存在')
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
  await applyCategoryLoading.withButtonLoading(async () => {
    config.value.categoryRules = { ...localCategoryRules }
    await save()
  })
}

async function applyPathRules(): Promise<void> {
  await applyPathLoading.withButtonLoading(async () => {
    config.value.categoryPathRules = [...localCategoryPathRules.value]
    await save()
  })
}

async function clearPreferences(): Promise<void> {
  if (!confirm('确定要清除所有偏好数据吗？此操作不可恢复。')) return
  await clearPrefsLoading.withButtonLoading(async () => {
    try {
      const res = await clearPreferencesData()
      if (res.success) {
        showNotification('偏好数据已清除')
      } else {
        showNotification('清除失败：' + res.error)
      }
    } catch (err) {
      const error = err as Error
      showNotification('清除失败：' + error.message)
    }
  })
}

async function checkPathsStatus(): Promise<void> {
  checkingPaths.value = true
  try {
    const res = await checkAllPaths()
    if (res.success && res.data) {
      pathStatuses.value = res.data
    } else {
      showNotification('检测失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('检测失败：' + error.message)
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

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.rule-row .pattern-input {
  flex: 1;
}

.rule-row .offset-input {
  width: 50px;
}

.rule-row .offset-label {
  font-size: 12px;
  color: var(--text-muted);
}

.rule-row .rule-checkbox {
  width: 16px;
  height: 16px;
}

.rule-row .desc-input {
  width: 100px;
}

.rule-order {
  display: flex;
  gap: 2px;
}

.order-btn {
  padding: 2px 6px;
  font-size: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.order-btn:hover:not(:disabled) {
  background: var(--bg);
  color: var(--text);
}

.order-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  padding: 0;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.modal-close {
  cursor: pointer;
  font-size: 18px;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: 4px;
}

.modal-close:hover {
  color: var(--text);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.textarea {
  width: 100%;
  min-height: 150px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
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

/* Toast Styles */
.toast-notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  color: var(--text);
  padding: 12px 24px;
  border-radius: 8px;
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
</style>