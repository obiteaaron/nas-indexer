const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { performScanWithDatabase } = require('./scanner');
const { database } = require('./database');
const { logger } = require('./logger');
const { PROJECT_ROOT, DEFAULT_STORAGE_PATH, initDatabase, loadConfig, ensureStorageDir } = require('./utils');

// 路由模块
const configRouter = require('./routes/config');
const scanRouter = require('./routes/scan');
const filesRouter = require('./routes/files');
const tagsRouter = require('./routes/tags');
const previewRouter = require('./routes/preview');
const recommendationsRouter = require('./routes/recommendations');
const trackingRouter = require('./routes/tracking');
const { router: statsRouter, setScanJob } = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let scanJob = null;

async function runScan(config, onProgress = null) {
  try {
    ensureStorageDir(config);

    await initDatabase();

    if (config.categoryRules) {
      database.setCategoryRules(config.categoryRules);
    }
    if (config.categoryPathRules) {
      database.setCategoryPathRules(config.categoryPathRules);
    }

    const result = await performScanWithDatabase(
      config.scanPaths,
      config.excludePatterns || [],
      config.fileExtensionFilter || { whitelist: [], blacklist: [] },
      onProgress
    );

    return result;
  } catch (err) {
    logger.error('扫描失败: %s', err.message);
    throw err;
  }
}

function scheduleScan(config) {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
  }

  if (config.scanPaths && config.scanPaths.length > 0) {
    scanJob = cron.schedule(config.scanTime, async () => {
      logger.info('[%s] 定时扫描开始', new Date().toLocaleString());
      await runScan(config);
    }, {
      timezone: 'Asia/Shanghai'
    });
    logger.info('定时扫描已设置: %s', config.scanTime);
  }

  setScanJob(scanJob);
}

// API Routes
app.use('/api/config', configRouter);
app.use('/api/scan', scanRouter);
app.use('/api/files', filesRouter);
app.use('/api', tagsRouter);
app.use('/api', previewRouter);
app.use('/api', recommendationsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api', statsRouter);

// Static files - serve Vue frontend
const frontendPath = path.join(PROJECT_ROOT, 'frontend', 'dist');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, async () => {
  await initDatabase();
  logger.info('\n🚀 NAS Indexer v1.3.0 服务已启动');
  logger.info('📍 访问地址: http://localhost:%d', PORT);
  logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

  const config = loadConfig();
  const { getStoragePath } = require('./utils');
  const storagePath = getStoragePath(config);
  logger.info('📂 当前存储目录: %s', storagePath);

  scheduleScan(config);
});
