const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { formatSize } = require('../scanner');
const { initDatabase, loadConfig, getStoragePath } = require('../utils');

let scanJob = null;

// 设置扫描任务引用
function setScanJob(job) {
  scanJob = job;
}

// 获取统计信息
router.get('/statistics', async (req, res) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取系统状态
router.get('/status', async (req, res) => {
  await initDatabase();
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);

    const totalStats = database.getTotalStats();
    const hasData = totalStats.totalFiles > 0;

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
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { router, setScanJob };
