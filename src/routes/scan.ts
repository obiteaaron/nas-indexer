import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import { performScanWithDatabase, formatSize } from '../scanner';
import { database } from '../database';
import { taskManager } from '../task-manager';
import { initDatabase, loadConfig } from '../utils';
import type { Config, FileExtensionFilter, ScanProgressEvent } from '../types';

const router: Router = express.Router();

const scanningPaths: Set<string> = new Set();

// 扫描全部路径
router.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    await initDatabase();
    const config: Config = loadConfig();

    if (!config.scanPaths || config.scanPaths.length === 0) {
      res.status(400).json({ success: false, error: '请先配置扫描路径' });
      return;
    }

    if (taskManager.hasRunningTask('scan')) {
      res.status(409).json({ success: false, error: '已有扫描任务正在执行' });
      return;
    }

    const task = taskManager.createTask('scan');
    res.json({ success: true, taskId: task.id });

    // 异步执行扫描
    (async () => {
      try {
        const fileExtensionFilter: FileExtensionFilter = config.fileExtensionFilter || { whitelist: [], blacklist: [] };
        const result = await performScanWithDatabase(
          config.scanPaths,
          config.excludePatterns || [],
          fileExtensionFilter,
          (progress: ScanProgressEvent) => {
            taskManager.updateTask(task.id, {
              progress: progress.progress || 0,
              message: progress.message,
              currentPath: progress.path
            });
          }
        );

        taskManager.completeTask(task.id, {
          totalFiles: result.totalFiles,
          totalSize: formatSize(result.totalSize)
        });
      } catch (err) {
        const error = err as Error;
        taskManager.failTask(task.id, error.message);
      }
    })();
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 扫描单个路径
router.post('/path', async (req: Request, res: Response): Promise<void> => {
  try {
    await initDatabase();
    const { path: scanPath } = req.body;

    if (!scanPath) {
      res.status(400).json({ success: false, error: '请提供扫描路径' });
      return;
    }

    if (!fs.existsSync(scanPath)) {
      res.status(400).json({ success: false, error: '路径不存在' });
      return;
    }

    if (scanningPaths.has(scanPath)) {
      res.status(409).json({ success: false, error: '该路径正在扫描中，请稍后再试' });
      return;
    }

    scanningPaths.add(scanPath);

    const config: Config = loadConfig();

    if (config.categoryRules) {
      database.setCategoryRules(config.categoryRules);
    }
    if (config.categoryPathRules) {
      database.setCategoryPathRules(config.categoryPathRules);
    }

    const task = taskManager.createTask('scan-path');
    res.json({ success: true, taskId: task.id });

    // 异步执行扫描
    (async () => {
      try {
        const fileExtensionFilter: FileExtensionFilter = config.fileExtensionFilter || { whitelist: [], blacklist: [] };
        const result = await performScanWithDatabase(
          [scanPath],
          config.excludePatterns || [],
          fileExtensionFilter,
          (progress: ScanProgressEvent) => {
            taskManager.updateTask(task.id, {
              progress: progress.progress || 0,
              message: progress.message,
              currentPath: progress.path
            });
          }
        );

        taskManager.completeTask(task.id, {
          totalFiles: result.totalFiles,
          totalSize: formatSize(result.totalSize)
        });
      } catch (err) {
        const error = err as Error;
        taskManager.failTask(task.id, error.message);
      } finally {
        scanningPaths.delete(scanPath);
      }
    })();
  } catch (err) {
    const error = err as Error;
    scanningPaths.delete(req.body.path);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 检测路径是否可达
router.post('/check-path', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path: checkPath } = req.body;

    if (!checkPath) {
      res.status(400).json({ success: false, error: '请提供检测路径' });
      return;
    }

    const startTime: number = Date.now();
    let isAccessible: boolean = false;
    let fileCount: number = 0;
    let error: string | null = null;

    try {
      const stats: fs.Stats = fs.statSync(checkPath);
      isAccessible = true;

      if (stats.isDirectory()) {
        const files: string[] = fs.readdirSync(checkPath);
        fileCount = files.length;
      }
    } catch (err) {
      const errObj = err as Error;
      error = errObj.message;
      isAccessible = false;
    }

    const latency: number = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        path: checkPath,
        isAccessible,
        fileCount,
        latency,
        error
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量检测所有配置路径
router.post('/check-all-paths', async (_req: Request, res: Response): Promise<void> => {
  try {
    await initDatabase();
    const config: Config = loadConfig();
    const paths: string[] = config.scanPaths || [];

    if (paths.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const results = await Promise.all(paths.map(async (scanPath: string) => {
      const startTime: number = Date.now();
      let isAccessible: boolean = false;
      let fileCount: number = 0;
      let error: string | null = null;

      try {
        const stats: fs.Stats = fs.statSync(scanPath);
        isAccessible = true;

        if (stats.isDirectory()) {
          const files: string[] = fs.readdirSync(scanPath);
          fileCount = files.length;
        }
      } catch (err) {
        const errObj = err as Error;
        error = errObj.message;
        isAccessible = false;
      }

      const latency: number = Date.now() - startTime;

      return {
        path: scanPath,
        isAccessible,
        fileCount,
        latency,
        error
      };
    }));

    res.json({ success: true, data: results });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取任务列表
router.get('/tasks', (_req: Request, res: Response): void => {
  res.json({ success: true, tasks: taskManager.getActiveTasks() });
});

// 任务状态 SSE 流
router.get('/tasks/stream', (req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 立即发送当前任务状态
  res.write(`data: ${JSON.stringify({ type: 'tasks-update', tasks: taskManager.getActiveTasks() })}\n\n`);

  taskManager.addClient(res);
  req.on('close', () => {
    taskManager.removeClient(res);
  });
});

export default router;