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
import type { SteamDbEntry } from '../types';

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
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
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
 * 导出 Steam DB（必须在 /:appid 之前）
 */
router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const entries = gameDatabase.exportSteamDb();
    res.json({ success: true, data: entries });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 按名称查找 Steam AppID（必须在 /:appid 之前）
 */
router.get('/lookup', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const name = req.query.name as string;
    if (!name) {
      res.status(400).json({ success: false, error: '请提供 name 参数' });
      return;
    }

    const entry = gameDatabase.lookupSteamDbByName(name);
    if (entry) {
      res.json({ success: true, data: { steam_appid: entry.steam_appid, name: entry.name } });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量刷新所有缓存（必须在 /:appid 之前，使用 GET 因为 EventSource 只支持 GET）
 * 客户端断开后仍继续后台执行
 */
router.get('/refresh-all', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appids = gameDatabase.getAllSteamDbAppids();

    if (appids.length === 0) {
      res.json({ success: true, message: '无缓存需要刷新' });
      return;
    }

    // 监听客户端断开事件
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      logger.info('刷新缓存：客户端断开连接，继续后台执行');
    });

    // 使用 SSE 返回进度
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    for (let i = 0; i < appids.length; i++) {
      const appid = appids[i];
      const success = await refreshSteamCache(appid);

      // 只有客户端还在时才写 SSE
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({
          current: i + 1,
          total: appids.length,
          appid,
          success
        })}\n\n`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 只有客户端还在时才发送完成消息
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }

    logger.info('刷新缓存完成：共 %d 条，实际刷新 %d 条', appids.length, appids.length);
  } catch (err) {
    const error = err as Error;
    logger.error('刷新缓存失败: %s', error.message);
    // 只有客户端还在时才返回错误
    if (!res.writableEnded) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

/**
 * 刷新缺失元数据的缓存（必须在 /:appid 之前）
 * 只刷新 raw_data 为空的条目
 */
router.get('/refresh-missing', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appids = gameDatabase.getMissingSteamDbAppids();

    if (appids.length === 0) {
      res.json({ success: true, message: '无缺失元数据的记录' });
      return;
    }

    // 监听客户端断开事件
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      logger.info('刷新缺失元数据：客户端断开连接，继续后台执行');
    });

    // 使用 SSE 返回进度
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();

    for (let i = 0; i < appids.length; i++) {
      const appid = appids[i];
      const success = await refreshSteamCache(appid);

      // 只有客户端还在时才写 SSE
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({
          current: i + 1,
          total: appids.length,
          appid,
          success
        })}\n\n`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 只有客户端还在时才发送完成消息
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }

    logger.info('刷新缺失元数据完成：共 %d 条', appids.length);
  } catch (err) {
    const error = err as Error;
    logger.error('刷新缺失元数据失败: %s', error.message);
    if (!res.writableEnded) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

/**
 * 获取缓存图片列表（必须在 /:appid 之前）
 */
router.get('/images/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid as string;
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

// === Steam DB CRUD 功能 ===

/**
 * 创建 Steam DB 条目（必须在 /:appid 之前）
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const data: Partial<SteamDbEntry> = req.body;

    if (!data.steam_appid || !data.name) {
      res.status(400).json({ success: false, error: 'steam_appid 和 name 为必填项' });
      return;
    }

    // 检查是否已存在
    const existing = gameDatabase.getSteamDbByAppid(data.steam_appid);
    if (existing) {
      res.status(400).json({ success: false, error: `AppID ${data.steam_appid} 已存在` });
      return;
    }

    const id = gameDatabase.insertSteamDbEntry(data);
    if (id === 0) {
      res.status(500).json({ success: false, error: '创建失败' });
      return;
    }

    const entry = gameDatabase.getSteamDbById(id);
    res.json({ success: true, data: entry });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 导入 Steam DB（必须在 /:appid 之前）
 */
router.post('/import', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const { entries, mode = 'merge' } = req.body;

    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({ success: false, error: '请提供 entries 数组' });
      return;
    }

    const result = gameDatabase.importSteamDb(entries as SteamDbEntry[], mode);
    res.json({ success: true, data: result });
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
    const appid = req.params.appid as string;
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
    let imageUrl: { header?: string; capsule?: string; background?: string; screenshots?: string[] } | undefined = undefined;
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
    const appid = req.params.appid as string;
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
    const appid = req.params.appid as string;

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
 * 更新 Steam DB 条目（按 appid）
 */
router.post('/update/:appid', async (req: Request, res: Response): Promise<void> => {
  await init();
  try {
    const appid = req.params.appid as string;
    const entry = gameDatabase.getSteamDbByAppid(appid);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在' });
      return;
    }

    const data: Partial<SteamDbEntry> = req.body;

    // 更新 SteamDB
    gameDatabase.updateSteamDbEntry(entry.id!, data);
    const updated = gameDatabase.getSteamDbById(entry.id!);

    // 同步到关联游戏（仅在更新 name 或 name_en 时）
    if (updated && (data.name !== undefined || data.name_en !== undefined)) {
      const syncCount = gameDatabase.syncSteamDbToGames(
        updated.steam_appid,
        { name: data.name, name_en: data.name_en }
      );
      logger.info('SteamDB 同步完成: appid=%s, 更新了%d个游戏', updated.steam_appid, syncCount);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;