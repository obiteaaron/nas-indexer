<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <h1 class="logo">NAS Indexer</h1>
        <nav class="nav">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/files" class="nav-link">文件列表</router-link>
          <router-link to="/search" class="nav-link">搜索</router-link>
          <router-link to="/statistics" class="nav-link">统计</router-link>
          <router-link to="/tags" class="nav-link">标签管理</router-link>
          <router-link to="/settings" class="nav-link">设置</router-link>
        </nav>
      </div>
      <div class="header-right">
        <TaskBar :tasks="tasks" />
        <span class="status" v-if="status">{{ status.totalFiles }} 个文件 | {{ status.totalSize }}</span>
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到深色模式'">
          {{ isDark ? '☀️' : '🌙' }}
        </button>
      </div>
    </header>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { getStatus, getTaskStreamUrl } from './api'
import TaskBar from './components/TaskBar.vue'

export default {
  name: 'App',
  components: { TaskBar },
  setup() {
    const status = ref(null)
    const tasks = ref([])
    const isDark = ref(false)
    let eventSource = null

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

    function connectSSE() {
      if (eventSource) {
        eventSource.close()
      }

      eventSource = new EventSource(getTaskStreamUrl())

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'tasks-update') {
            tasks.value = data.tasks
          }
        } catch (err) {
          console.error('解析 SSE 数据失败:', err)
        }
      }

      eventSource.onerror = () => {
        console.warn('SSE 连接断开，将自动重连')
      }
    }

    function initTheme() {
      const savedTheme = localStorage.getItem('theme')
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        isDark.value = true
        document.documentElement.setAttribute('data-theme', 'dark')
      }
    }

    function toggleTheme() {
      isDark.value = !isDark.value
      if (isDark.value) {
        document.documentElement.setAttribute('data-theme', 'dark')
        localStorage.setItem('theme', 'dark')
      } else {
        document.documentElement.removeAttribute('data-theme')
        localStorage.setItem('theme', 'light')
      }
    }

    onMounted(() => {
      initTheme()
      loadStatus()
      connectSSE()
    })

    onUnmounted(() => {
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    })

    return { status, tasks, isDark, toggleTheme }
  }
}
</script>

<style scoped>
.theme-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-toggle:hover {
  background: var(--bg);
}
</style>
