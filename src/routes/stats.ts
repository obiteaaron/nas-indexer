import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { formatSize } from '../scanner';
import { initDatabase, loadConfig, getStoragePath } from '../utils';
import type { ScheduledTask } from 'node-cron';

const router: Router = express.Router();

let scanJob: ScheduledTask | null = null;

// 设置扫描任务引用
function setScanJob(job: ScheduledTask | null): void {
  scanJob = job;
}

// 获取统计信息
router.get('/statistics', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const categoryStats = database.getStatistics();
    const totalStats = database.getTotalStats();

    const formattedStats = categoryStats.map(stat => ({
      category: stat.category,
      count: stat.count,
      size: formatSize(stat.totalSize),
      sizeBytes: stat.totalSize,
      percent: totalStats.totalSize > 0 ? ((stat.totalSize / totalStats.totalSize) * 100).toFixed(1) : 0
    }));

    res.json({
      success: true,
      stats: {
        meta: {
          totalFiles: totalStats.totalFiles,
          totalSize: formatSize(totalStats.totalSize),
          totalSizeBytes: totalStats.totalSize
        },
        categories: formattedStats
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取系统状态
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const config = loadConfig();
    const storagePath: string = getStoragePath(config);

    const totalStats = database.getTotalStats();
    const hasData: boolean = totalStats.totalFiles > 0;

    res.json({
      success: true,
      status: {
        storagePath,
        hasData,
        totalFiles: totalStats.totalFiles,
        totalSize: formatSize(totalStats.totalSize),
        scheduled: scanJob !== null,
        nextScan: scanJob ? '按 cron 计划执行' : '未设置'
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router, setScanJob };