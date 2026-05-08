<template>
  <div class="task-bar" v-if="tasks.length > 0">
    <div class="task-trigger" @click="expanded = !expanded">
      <span class="task-icon" :class="{ spinning: hasRunning }">&#x21bb;</span>
      <span class="task-label">{{ hasRunning ? '任务进行中' : '任务完成' }}</span>
      <span class="task-count">{{ runningCount }}</span>
      <span class="task-arrow" :class="{ expanded }">&#x25BE;</span>
    </div>

    <div class="task-panel" v-if="expanded">
      <div class="task-item" v-for="task in tasks" :key="task.id">
        <div class="task-header">
          <span class="task-type">{{ task.type === 'scan' ? '扫描全部' : '单路径扫描' }}</span>
          <span class="task-status" :class="task.status">{{ statusText[task.status] }}</span>
        </div>
        <div class="task-progress-bar">
          <div class="task-progress-fill" :class="task.status" :style="{ width: task.progress + '%' }"></div>
        </div>
        <div class="task-info">
          <span class="task-message">{{ task.message }}</span>
          <span class="task-percent">{{ task.progress }}%</span>
        </div>
        <div class="task-result" v-if="task.status === 'completed' && task.result">
          完成: {{ task.result.totalFiles }} 个文件, {{ task.result.totalSize }}
        </div>
        <div class="task-error" v-if="task.status === 'failed' && task.error">
          {{ task.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'

export default {
  name: 'TaskBar',
  props: {
    tasks: {
      type: Array,
      default: () => []
    }
  },
  setup(props) {
    const expanded = ref(false)

    const hasRunning = computed(() => props.tasks.some(t => t.status === 'running'))
    const runningCount = computed(() => props.tasks.filter(t => t.status === 'running').length)

    const statusText = {
      running: '进行中',
      completed: '已完成',
      failed: '失败'
    }

    watch(() => props.tasks, (newTasks) => {
      if (newTasks.length === 0) {
        expanded.value = false
      }
    })

    return { expanded, hasRunning, runningCount, statusText }
  }
}
</script>

<style scoped>
.task-bar {
  position: relative;
}

.task-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
  color: var(--text-muted);
}

.task-trigger:hover {
  background: var(--bg);
}

.task-icon {
  font-size: 16px;
  display: inline-block;
}

.task-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.task-label {
  font-weight: 500;
}

.task-count {
  background: var(--primary);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.task-arrow {
  font-size: 10px;
  transition: transform 0.2s;
}

.task-arrow.expanded {
  transform: rotate(180deg);
}

.task-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 320px;
  max-width: 400px;
  z-index: 200;
  overflow: hidden;
}

.task-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.task-item:last-child {
  border-bottom: none;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-type {
  font-weight: 500;
  font-size: 13px;
}

.task-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.task-status.running {
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary);
}

.task-status.completed {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success);
}

.task-status.failed {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

.task-progress-bar {
  height: 4px;
  background: var(--bg);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.task-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.task-progress-fill.running {
  background: var(--primary);
}

.task-progress-fill.completed {
  background: var(--success);
}

.task-progress-fill.failed {
  background: var(--danger);
}

.task-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-message {
  font-size: 12px;
  color: var(--text-muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-percent {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 8px;
  flex-shrink: 0;
}

.task-result {
  font-size: 12px;
  color: var(--success);
  margin-top: 6px;
}

.task-error {
  font-size: 12px;
  color: var(--danger);
  margin-top: 6px;
}
</style>
