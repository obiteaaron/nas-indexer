<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <div class="header-left">
          <h1 class="logo">NAS Indexer</h1>
          <nav class="nav">
            <router-link to="/" class="nav-link">首页</router-link>
            <router-link to="/files" class="nav-link">文件列表</router-link>
            <router-link v-if="config?.gamesEnabled" to="/game" class="nav-link">游戏</router-link>
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
          <a href="https://github.com/obiteaaron/nas-indexer" target="_blank" class="github-link" title="GitHub 仓库">
            <svg viewBox="0 0 24 24" width="20" height="20" class="github-icon">
              <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </header>
    <!-- 游戏子导航 -->
    <div class="game-subnav" v-if="config?.gamesEnabled && $route.path.startsWith('/game')">
      <router-link to="/game/wall" class="subnav-link">游戏墙</router-link>
      <router-link to="/game/steam" class="subnav-link">Steam 管理</router-link>
      <router-link to="/game/settings" class="subnav-link">游戏设置</router-link>
    </div>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getStatus, getConfig, getTaskStreamUrl } from './api'
import TaskBar from './components/TaskBar.vue'
import type { Config, StatusResponse, Task } from './types'

const config = ref<Config | null>(null)
const status = ref<StatusResponse | null>(null)
const tasks = ref<Task[]>([])
const isDark = ref(false)
let eventSource: EventSource | null = null

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

async function loadConfig(): Promise<void> {
  try {
    const res = await getConfig()
    if (res.success && res.data) {
      config.value = res.data
    }
  } catch (err) {
    console.error('获取配置失败:', err)
  }
}

function connectSSE(): void {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = new EventSource(getTaskStreamUrl())

  eventSource.onmessage = (event: MessageEvent) => {
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

function initTheme(): void {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  }
}

function toggleTheme(): void {
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
  loadConfig()
  loadStatus()
  connectSSE()
  window.addEventListener('config-saved', loadConfig)
})

onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  window.removeEventListener('config-saved', loadConfig)
})
</script>

<style scoped>
.game-subnav {
  display: flex;
  gap: 8px;
  padding: 8px 24px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  max-width: 1400px;
  margin: 0 auto;  /* 居中，与 main 区域对齐 */
}

.subnav-link {
  padding: 6px 12px;
  border-radius: 4px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s;
}

.subnav-link:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.subnav-link.router-link-active {
  background: var(--primary);
  color: white;
}

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

.github-link {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
  color: var(--text);
}

.github-link:hover {
  background: var(--bg);
  color: var(--text);
}

.github-icon {
  display: block;
}
</style>