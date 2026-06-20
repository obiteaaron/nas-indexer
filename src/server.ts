import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { performScanWithDatabase } from './scanner';
import { database } from './database';
import { gameDatabase } from './games/database';
import { runIdentification } from './games/identifier';
import { scrapeUnscrapedGames, initProxy } from './games/scraper';
import { groupService } from './games/group-service';
import { logger } from './logger';
import { PROJECT_ROOT, DEFAULT_STORAGE_PATH, initDatabase, loadConfig, ensureStorageDir, getStoragePath } from './utils';
import { DEFAULT_GAMES_CONFIG } from './types/games-config';
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
import gameGroupsRouter from './routes/game-groups';
import { router as statsRouter, setScanJob } from './routes/stats';
import steamCacheRouter from './routes/steam-cache';
import gamesConfigRouter from './routes/games-config';
import profileBackupRouter from './routes/profile-backup';

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

        const rules = config.gamesRules || DEFAULT_GAMES_CONFIG.gamesRules;
        const scrapeConfig = config.gamesScrape || DEFAULT_GAMES_CONFIG.gamesScrape;

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

        // 自动分组（在刮削之后）
        if (scrapeConfig.autoGroupOnScan && ids.length > 0) {
          if (onProgress) {
            onProgress({
              phase: 'grouping',
              pathIndex: 0,
              totalPaths: 1,
              progress: 99,
              path: '',
              message: '正在自动分组...'
            });
          }

          const groupResult = groupService.autoGroupByParentDirectory(config.scanPaths);
          logger.info('自动分组完成: 创建 %d 个分组, 更新 %d 个分组',
            groupResult.createdGroups.length,
            groupResult.updatedGroups.length
          );
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
app.use('/api/game-groups', gameGroupsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/preview', previewRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/stats', statsRouter);
app.use('/api/steam-cache', steamCacheRouter);
app.use('/api/games-config', gamesConfigRouter);
app.use('/api/profile-backup', profileBackupRouter);

// Static files - serve Vue frontend
// 支持环境变量 FRONTEND_PATH（用于 Electron 打包模式，前端在 asar 内）
const frontendPath: string = process.env.FRONTEND_PATH || path.join(PROJECT_ROOT, 'frontend', 'dist');
app.use(express.static(frontendPath));

// Steam 缓存图片静态服务（延迟初始化）
app.use('/static/games', (req: Request, res: Response, next: NextFunction) => {
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  const gamesPath = path.join(storagePath, 'games');
  if (fs.existsSync(gamesPath)) {
    express.static(gamesPath)(req, res, next);
  } else {
    next();
  }
});
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

let server: ReturnType<typeof app.listen> | null = null;

export async function startServer(customPort?: number): Promise<number> {
  const port = customPort || PORT;

  return new Promise((resolve, reject) => {
    server = app.listen(port, async () => {
      try {
        await initDatabase();

        // 初始化代理（用于 Steam API 刮削）
        initProxy();

        logger.info('\n🚀 NAS Indexer v1.6.0 服务已启动');
        logger.info('📍 访问地址: http://localhost:%d', port);
        logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

        const config: Config = loadConfig();
        const storagePath: string = getStoragePath(config);
        ensureGamesDirs(storagePath);
        logger.info('📂 当前存储目录: %s', storagePath);

        scheduleScan(config);

        resolve(port);
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

export function getPort(): number {
  return PORT;
}

// 独立运行时（非 Electron 模式）自动启动
if (require.main === module) {
  startServer().catch((err) => {
    logger.error('服务启动失败: %s', (err as Error).message);
    process.exit(1);
  });
}