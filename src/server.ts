import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import { performScanWithDatabase } from './scanner';
import { database } from './database';
import { gameDatabase } from './games/database';
import { runIdentification } from './games/identifier';
import { scrapeUnscrapedGames } from './games/scraper';
import { logger } from './logger';
import { PROJECT_ROOT, DEFAULT_STORAGE_PATH, initDatabase, loadConfig, ensureStorageDir, getStoragePath, DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE } from './utils';
import { ensureGamesDirs } from './games/storage';
import type { Config, FileExtensionFilter, ScanProgressEvent } from './types';

// 路由模块
import configRouter from './routes/config';
import scanRouter from './routes/scan';
import filesRouter from './routes/files';
import tagsRouter from './routes/tags';
import previewRouter from './routes/preview';
import recommendationsRouter from './routes/recommendations';
import trackingRouter from './routes/tracking';
import gamesRouter from './routes/games';
import { router as statsRouter, setScanJob } from './routes/stats';

const app = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

let scanJob: cron.ScheduledTask | null = null;

async function runScan(config: Config, onProgress: ((event: ScanProgressEvent) => void) | null = null): Promise<unknown> {
  try {
    ensureStorageDir(config);

    await initDatabase();

    if (config.categoryRules) {
      database.setCategoryRules(config.categoryRules);
    }
    if (config.categoryPathRules) {
      database.setCategoryPathRules(config.categoryPathRules);
    }

    const fileExtensionFilter: FileExtensionFilter = config.fileExtensionFilter || { whitelist: [], blacklist: [] };

    const result = await performScanWithDatabase(
      config.scanPaths,
      config.excludePatterns || [],
      fileExtensionFilter,
      onProgress
    );

    // 游戏模块集成：扫描完成后识别游戏
    if (config.gamesEnabled) {
      try {
        gameDatabase.createGameTables();

        const rules = config.gamesRules || DEFAULT_GAME_RULES;
        const scrapeConfig = config.gamesScrape || DEFAULT_GAME_SCRAPE;

        if (onProgress) {
          onProgress({
            phase: 'games',
            pathIndex: 0,
            totalPaths: config.scanPaths.length,
            progress: 95,
            path: '',
            message: '正在识别游戏目录...'
          });
        }

        const { games, ids } = await runIdentification(config.scanPaths, rules, scrapeConfig);
        logger.info('游戏识别完成: %d 个游戏', games.length);

        // 自动刮削
        if (scrapeConfig.autoScrape && ids.length > 0) {
          if (onProgress) {
            onProgress({
              phase: 'scraping',
              pathIndex: 0,
              totalPaths: 1,
              progress: 97,
              path: '',
              message: `正在刮削游戏元数据...`
            });
          }

          const scrapedIds = await scrapeUnscrapedGames(scrapeConfig.downloadPosters);
          logger.info('自动刮削完成: %d 个游戏', scrapedIds.length);
        }
      } catch (gameErr) {
        const gameError = gameErr as Error;
        logger.warn('游戏识别失败: %s', gameError.message);
      }
    }

    return result;
  } catch (err) {
    const error = err as Error;
    logger.error('扫描失败: %s', error.message);
    throw err;
  }
}

function scheduleScan(config: Config): void {
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
app.use('/api/games', gamesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/stats', statsRouter);

// Static files - serve Vue frontend
const frontendPath: string = path.join(PROJECT_ROOT, 'frontend', 'dist');
app.use(express.static(frontendPath));
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, async () => {
  await initDatabase();
  logger.info('\n🚀 NAS Indexer v1.3.2 服务已启动');
  logger.info('📍 访问地址: http://localhost:%d', PORT);
  logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

  const config: Config = loadConfig();
  const storagePath: string = getStoragePath(config);
  ensureGamesDirs(storagePath);
  logger.info('📂 当前存储目录: %s', storagePath);

  scheduleScan(config);
});