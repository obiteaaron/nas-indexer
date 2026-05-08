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

    onMounted(() => {
      loadStatus()
      connectSSE()
    })

    onUnmounted(() => {
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    })

    return { status, tasks }
  }
}
</script>
