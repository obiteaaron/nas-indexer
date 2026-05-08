const { logger } = require('./logger');

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.clients = new Set();
    this.taskCounter = 0;
  }

  createTask(type) {
    this.taskCounter++;
    const task = {
      id: `${type}_${Date.now()}_${this.taskCounter}`,
      type,
      status: 'running',
      progress: 0,
      message: '准备中...',
      currentPath: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null
    };
    this.tasks.set(task.id, task);
    this.broadcast();
    logger.info('[TaskManager] 任务创建: %s (%s)', task.id, type);
    return task;
  }

  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    Object.assign(task, updates);
    this.broadcast();
  }

  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'completed';
    task.progress = 100;
    task.message = '扫描完成';
    task.completedAt = new Date().toISOString();
    task.result = result;
    this.broadcast();
    logger.info('[TaskManager] 任务完成: %s', taskId);
    this.scheduleCleanup(taskId);
  }

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'failed';
    task.message = '扫描失败';
    task.completedAt = new Date().toISOString();
    task.error = error;
    this.broadcast();
    logger.error('[TaskManager] 任务失败: %s - %s', taskId, error);
    this.scheduleCleanup(taskId);
  }

  getActiveTasks() {
    const active = [];
    for (const task of this.tasks.values()) {
      active.push({ ...task });
    }
    return active;
  }

  hasRunningTask(type) {
    for (const task of this.tasks.values()) {
      if (task.type === type && task.status === 'running') {
        return true;
      }
    }
    return false;
  }

  addClient(res) {
    this.clients.add(res);
    logger.debug('[TaskManager] SSE 客户端连接, 当前: %d', this.clients.size);
  }

  removeClient(res) {
    this.clients.delete(res);
    logger.debug('[TaskManager] SSE 客户端断开, 当前: %d', this.clients.size);
  }

  broadcast() {
    const data = JSON.stringify({
      type: 'tasks-update',
      tasks: this.getActiveTasks()
    });
    const message = `data: ${data}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  scheduleCleanup(taskId) {
    setTimeout(() => {
      this.tasks.delete(taskId);
      this.broadcast();
      logger.info('[TaskManager] 任务已清理: %s', taskId);
    }, 5 * 60 * 1000);
  }
}

const taskManager = new TaskManager();

module.exports = { taskManager };
