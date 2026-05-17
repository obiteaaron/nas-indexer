import { Response } from 'express';
import { logger } from './logger';

interface Task {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  currentPath: string | null;
  startedAt: string;
  completedAt: string | null;
  result: unknown | null;
  error: string | null;
}

interface TaskUpdate {
  status?: 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  currentPath?: string | null;
  result?: unknown;
  error?: string;
}

class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private clients: Set<Response> = new Set();
  private taskCounter: number = 0;

  createTask(type: string): Task {
    this.taskCounter++;
    const task: Task = {
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

  updateTask(taskId: string, updates: TaskUpdate): void {
    const task: Task | undefined = this.tasks.get(taskId);
    if (!task) return;
    Object.assign(task, updates);
    this.broadcast();
  }

  completeTask(taskId: string, result: unknown): void {
    const task: Task | undefined = this.tasks.get(taskId);
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

  failTask(taskId: string, error: string): void {
    const task: Task | undefined = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'failed';
    task.message = '扫描失败';
    task.completedAt = new Date().toISOString();
    task.error = error;
    this.broadcast();
    logger.error('[TaskManager] 任务失败: %s - %s', taskId, error);
    this.scheduleCleanup(taskId);
  }

  getActiveTasks(): Task[] {
    const active: Task[] = [];
    for (const task of this.tasks.values()) {
      active.push({ ...task });
    }
    return active;
  }

  hasRunningTask(type: string): boolean {
    for (const task of this.tasks.values()) {
      if (task.type === type && task.status === 'running') {
        return true;
      }
    }
    return false;
  }

  addClient(res: Response): void {
    this.clients.add(res);
    logger.debug('[TaskManager] SSE 客户端连接, 当前: %d', this.clients.size);
  }

  removeClient(res: Response): void {
    this.clients.delete(res);
    logger.debug('[TaskManager] SSE 客户端断开, 当前: %d', this.clients.size);
  }

  broadcast(): void {
    const data: string = JSON.stringify({
      type: 'tasks-update',
      tasks: this.getActiveTasks()
    });
    const message: string = `data: ${data}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private scheduleCleanup(taskId: string): void {
    setTimeout(() => {
      this.tasks.delete(taskId);
      this.broadcast();
      logger.info('[TaskManager] 任务已清理: %s', taskId);
    }, 5 * 60 * 1000);
  }
}

const taskManager: TaskManager = new TaskManager();

export { taskManager, TaskManager };