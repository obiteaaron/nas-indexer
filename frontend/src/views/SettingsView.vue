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
import { ref, computed, onMounted } from 'vue'
import { getConfig, saveConfig, getStatus, scanSinglePath } from '../api'

export default {
  name: 'SettingsView',
  setup() {
    const config = ref({
      scanPaths: [],
      scanTime: '0 2 * * *',
      excludePatterns: [],
      fileExtensionFilter: { whitelist: [], blacklist: [] }
    })
    const status = ref(null)
    const saving = ref(false)
    const pathScanning = ref(-1)

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
          fileExtensionFilter: res.fileExtensionFilter || { whitelist: [], blacklist: [] }
        }
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

    return {
      config, status, saving, pathScanning,
      excludePatternsStr, whitelistStr, blacklistStr,
      addPath, removePath, scanPath, save, reset
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
</style>