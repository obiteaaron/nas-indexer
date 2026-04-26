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
            <input class="input" v-model="config.scanPaths[i]" :disabled="pathScanning === i">
            <button class="btn btn-primary btn-small" @click="scanPath(i)" :disabled="pathScanning === i || !config.scanPaths[i]">
              {{ pathScanning === i ? '扫描中...' : '扫描' }}
            </button>
            <button class="btn btn-danger btn-small" @click="removePath(i)" :disabled="pathScanning === i">删除</button>
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
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { getConfig, saveConfig, getStatus, scanSinglePath } from '../api'

export default {
  name: 'SettingsView',
  setup() {
    const config = ref({
      scanPaths: [],
      scanTime: '0 2 * * *',
      excludePatterns: [],
      fileExtensionFilter: { whitelist: [], blacklist: [] },
      categoryRules: {},
      categoryPathRules: []
    })
    const status = ref(null)
    const saving = ref(false)
    const pathScanning = ref(-1)
    
    const localCategoryRules = reactive({})
    const localCategoryPathRules = ref([])
    const newExtensions = reactive({})
    const newCategoryName = ref('')
    
    const categories = computed(() => Object.keys(localCategoryRules))

    const excludePatternsStr = computed({
      get: () => config.value.excludePatterns.join(', '),
      set: (v) => config.value.excludePatterns = v.split(',').map(s => s.trim()).filter(s => s)
    })

    const whitelistStr = computed({
      get: () => (config.value.fileExtensionFilter?.whitelist || []).join(', '),
      set: (v) => config.value.fileExtensionFilter.whitelist = v.split(',').map(s => s.trim()).filter(s => s)
    })

    const blacklistStr = computed({
      get: () => (config.value.fileExtensionFilter?.blacklist || []).join(', '),
      set: (v) => config.value.fileExtensionFilter.blacklist = v.split(',').map(s => s.trim()).filter(s => s)
    })

    onMounted(async () => {
      await loadConfig()
      await loadStatus()
    })

    async function loadConfig() {
      try {
        const res = await getConfig()
        config.value = {
          ...res,
          fileExtensionFilter: res.fileExtensionFilter || { whitelist: [], blacklist: [] },
          categoryRules: res.categoryRules || {},
          categoryPathRules: res.categoryPathRules || []
        }
        
        Object.keys(localCategoryRules).forEach(key => delete localCategoryRules[key])
        Object.assign(localCategoryRules, config.value.categoryRules)
        localCategoryPathRules.value = [...config.value.categoryPathRules]
      } catch (err) {
        console.error('获取配置失败:', err)
      }
    }

    async function loadStatus() {
      try {
        const res = await getStatus()
        if (res.success) {
          status.value = res.status
        }
      } catch (err) {
        console.error('获取状态失败:', err)
      }
    }

    function addPath() {
      config.value.scanPaths.push('')
    }

    function removePath(index) {
      config.value.scanPaths.splice(index, 1)
    }

    async function scanPath(index) {
      const path = config.value.scanPaths[index]
      if (!path) return
      
      pathScanning.value = index
      try {
        const res = await scanSinglePath(path)
        if (res.success) {
          alert('扫描完成：' + res.data.fileCount + ' 个文件')
          loadStatus()
        } else {
          alert('扫描失败：' + res.error)
        }
      } catch (err) {
        alert('扫描失败：' + err.message)
      }
      pathScanning.value = -1
    }

    async function save() {
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
        alert('保存失败：' + err.message)
      }
      saving.value = false
    }

    function reset() {
      loadConfig()
    }

    function addCategory() {
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

    function removeCategory(category) {
      delete localCategoryRules[category]
      delete newExtensions[category]
    }

    function updateCategoryName(oldName, event) {
      const newName = event.target.value.trim()
      if (!newName || newName === oldName) return
      if (localCategoryRules[newName]) {
        alert('分类名称已存在')
        event.target.value = oldName
        return
      }
      const extensions = localCategoryRules[oldName]
      delete localCategoryRules[oldName]
      localCategoryRules[newName] = extensions
      newExtensions[newName] = newExtensions[oldName] || ''
      delete newExtensions[oldName]
    }

    function addExtension(category) {
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

    function removeExtension(category, index) {
      localCategoryRules[category].splice(index, 1)
    }

    function addPathRule() {
      localCategoryPathRules.value.push({ pathPrefix: '', category: '其他' })
    }

    function removePathRule(index) {
      localCategoryPathRules.value.splice(index, 1)
    }

    async function applyCategoryRules() {
      config.value.categoryRules = { ...localCategoryRules }
      await save()
    }

    async function applyPathRules() {
      config.value.categoryPathRules = [...localCategoryPathRules.value]
      await save()
    }

    return {
      config, status, saving, pathScanning,
      excludePatternsStr, whitelistStr, blacklistStr,
      addPath, removePath, scanPath, save, reset,
      localCategoryRules, localCategoryPathRules, newExtensions, newCategoryName, categories,
      addCategory, removeCategory, updateCategoryName, addExtension, removeExtension,
      addPathRule, removePathRule, applyCategoryRules, applyPathRules
    }
  }
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
}

.path-item input {
  flex: 1;
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
</style>