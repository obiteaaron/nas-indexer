/**
 * Steam 缓存 API 路由
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { gameDatabase } from '../games/database';
import { SteamCacheService, getSteamCacheDir } from '../games/steam-cache-service';
import { refreshSteamCache } from '../games/scraper';
import { loadConfig, getStoragePath, initDatabase } from '../utils';
import { logger } from '../logger';
import type { SteamCacheStatus, SteamCacheStats } from '../types/game';

const router: Router = Router();

/**
 * 初始化
 */
async function init(): Promise<void> {
  await initDatabase();
  gameDatabase.createGameTables();
}

/**
 * 获取缓存统计
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);

    const dbStats = gameDatabase.getSteamCacheStats();
    const appids = gameDatabase.getAllSteamDbAppids();
    const cacheService = new SteamCacheService(storagePath);
    const fileStats = cacheService.getStats(appids);

    res.json({
      success: true,
      data: {
        totalEntries: dbStats.totalEntries,
        completeEntries: fileStats.totalPosters > 0 ? appids.length : 0,
        missingImagesEntries: dbStats.totalEntries - (fileStats.totalPosters > 0 ? appids.length : 0),
        totalPosters: fileStats.totalPosters,
        totalScreenshots: fileStats.totalScreenshots,
        totalSizeMB: fileStats.totalSizeMB
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取缓存列表
 */
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const { search, page = '1', pageSize = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const limit = parseInt(pageSize as string);

    const result = gameDatabase.getAllSteamDbEntries({
      search: search as string,
      orderBy: 'name',
      orderDir: 'ASC',
      limit,
      offset
    });

    // 检查图片状态
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);

    const entriesWithStatus = result.entries.map(entry => {
      const status = cacheService.checkStatus(entry.steam_appid);
      const isComplete = status.hasHeader && entry.raw_data;
      return {
        ...entry,
        cacheStatus: isComplete ? 'complete' : (entry.raw_data ? 'missing_images' : 'metadata_only'),
        hasHeader: status.hasHeader,
        hasCapsule: status.hasCapsule,
        hasBackground: status.hasBackground,
        screenshotCount: status.screenshotCount
      };
    });

    res.json({
      success: true,
      data: {
        entries: entriesWithStatus,
        total: result.total,
        page: parseInt(page as string),
        pageSize: limit,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个缓存详情
 */
router.get('/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const entry = gameDatabase.getSteamDbByAppid(appid);

    if (!entry) {
      res.status(404).json({ success: false, error: '缓存不存在' });
      return;
    }

    // 检查图片状态
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);
    const status = cacheService.checkStatus(appid);

    // 解析 raw_data 提取图片 URL
    let imageUrl = null;
    if (entry.raw_data) {
      try {
        const rawData = JSON.parse(entry.raw_data);
        imageUrl = {
          header: rawData.header_image,
          capsule: rawData.capsule_images?.[0]?.capsule,
          background: rawData.background,
          screenshots: rawData.screenshots?.map((s: any) => s.path_full)
        };
      } catch {}
    }

    res.json({
      success: true,
      data: {
        ...entry,
        imageStatus: status,
        originalUrls: imageUrl
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 强制刷新单个缓存
 */
router.post('/:appid/refresh', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const success = await refreshSteamCache(appid);

    if (success) {
      res.json({ success: true, message: '缓存刷新完成' });
    } else {
      res.status(400).json({ success: false, error: '刷新失败，无法获取 Steam 数据' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除单个缓存
 */
router.delete('/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;

    // 删除数据库记录
    const entry = gameDatabase.getSteamDbByAppid(appid);
    if (!entry) {
      res.status(404).json({ success: false, error: '缓存不存在' });
      return;
    }
    gameDatabase.deleteSteamDbEntry(entry.id!);

    // 删除缓存文件
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheService = new SteamCacheService(storagePath);
    cacheService.deleteCache(appid);

    res.json({ success: true, message: '缓存已删除' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量刷新所有缓存
 */
router.post('/refresh-all', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appids = gameDatabase.getAllSteamDbAppids();

    if (appids.length === 0) {
      res.json({ success: true, message: '无缓存需要刷新' });
      return;
    }

    // 使用 SSE 返回进度
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    for (let i = 0; i < appids.length; i++) {
      const appid = appids[i];
      const success = await refreshSteamCache(appid);

      res.write(`data: ${JSON.stringify({
        current: i + 1,
        total: appids.length,
        appid,
        success
      })}\n\n`);

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取缓存图片列表
 */
router.get('/images/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid;
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const cacheDir = getSteamCacheDir(storagePath, appid);

    if (!fs.existsSync(cacheDir)) {
      res.json({ success: true, data: { posters: [], screenshots: [] } });
      return;
    }

    const posters: string[] = [];
    const screenshots: string[] = [];

    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.endsWith('.jpg') && file !== 'screenshots') {
        posters.push(file.replace('.jpg', ''));
      }
    }

    const screenshotsDir = path.join(cacheDir, 'screenshots');
    if (fs.existsSync(screenshotsDir)) {
      const ssFiles = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.jpg'));
      for (const ss of ssFiles) {
        screenshots.push(ss.replace('.jpg', ''));
      }
    }

    res.json({ success: true, data: { posters, screenshots } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;