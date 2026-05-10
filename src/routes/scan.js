const express = require('express');
const fs = require('fs');
const router = express.Router();
const { performScanWithDatabase, formatSize } = require('../scanner');
const { database } = require('../database');
const { taskManager } = require('../task-manager');
const { initDatabase, loadConfig } = require('../utils');

const scanningPaths = new Set();

// 扫描全部路径
router.post('/', async (req, res) => {
  try {
    await initDatabase();
    const config = loadConfig();

    if (!config.scanPaths || config.scanPaths.length === 0) {
      return res.status(400).json({ success: false, error: '请先配置扫描路径' });
    }

    if (taskManager.hasRunningTask('scan')) {
      return res.status(409).json({ success: false, error: '已有扫描任务正在执行' });
    }

    const task = taskManager.createTask('scan');
    res.json({ success: true, taskId: task.id });

    // 异步执行扫描
    (async () => {
      try {
        const result = await performScanWithDatabase(
          config.scanPaths,
          config.excludePatterns || [],
          config.fileExtensionFilter || { whitelist: [], blacklist: [] },
          (progress) => {
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
        taskManager.failTask(task.id, err.message);
      }
    })();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 扫描单个路径
router.post('/path', async (req, res) => {
  try {
    await initDatabase();
    const { path: scanPath } = req.body;

    if (!scanPath) {
      return res.status(400).json({ success: false, error: '请提供扫描路径' });
    }

    if (!fs.existsSync(scanPath)) {
      return res.status(400).json({ success: false, error: '路径不存在' });
    }

    if (scanningPaths.has(scanPath)) {
      return res.status(409).json({ success: false, error: '该路径正在扫描中，请稍后再试' });
    }

    scanningPaths.add(scanPath);

    const config = loadConfig();

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
        const result = await performScanWithDatabase(
          [scanPath],
          config.excludePatterns || [],
          config.fileExtensionFilter || { whitelist: [], blacklist: [] },
          (progress) => {
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
        taskManager.failTask(task.id, err.message);
      } finally {
        scanningPaths.delete(scanPath);
      }
    })();
  } catch (err) {
    scanningPaths.delete(req.body.path);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 检测路径是否可达
router.post('/check-path', async (req, res) => {
  try {
    const { path: checkPath } = req.body;
    
    if (!checkPath) {
      return res.status(400).json({ success: false, error: '请提供检测路径' });
    }

    const startTime = Date.now();
    let isAccessible = false;
    let fileCount = 0;
    let error = null;

    try {
      const stats = fs.statSync(checkPath);
      isAccessible = true;
      
      if (stats.isDirectory()) {
        const files = fs.readdirSync(checkPath);
        fileCount = files.length;
      }
    } catch (err) {
      error = err.message;
      isAccessible = false;
    }

    const latency = Date.now() - startTime;

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
    res.status(500).json({ success: false, error: err.message });
  }
});

// 批量检测所有配置路径
router.post('/check-all-paths', async (req, res) => {
  try {
    await initDatabase();
    const config = loadConfig();
    const paths = config.scanPaths || [];

    if (paths.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const results = await Promise.all(paths.map(async (scanPath) => {
      const startTime = Date.now();
      let isAccessible = false;
      let fileCount = 0;
      let error = null;

      try {
        const stats = fs.statSync(scanPath);
        isAccessible = true;
        
        if (stats.isDirectory()) {
          const files = fs.readdirSync(scanPath);
          fileCount = files.length;
        }
      } catch (err) {
        error = err.message;
        isAccessible = false;
      }

      const latency = Date.now() - startTime;

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
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取任务列表
router.get('/tasks', (req, res) => {
  res.json({ success: true, tasks: taskManager.getActiveTasks() });
});

// 任务状态 SSE 流
router.get('/tasks/stream', (req, res) => {
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

module.exports = router;
