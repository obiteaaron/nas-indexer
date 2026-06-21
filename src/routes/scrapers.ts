/**
 * 刮削器管理 API 路由
 */

import { Router, Request, Response } from 'express';
import { scraperRegistry } from '../games/scraper-plugins/registry';
import { scraperManager } from '../games/scraper-manager';
import { loadGamesConfig, saveGamesConfig } from '../games-config';
import type { ScrapersConfig, ScraperStatus } from '../types/scraper';

const router: Router = Router();

/**
 * GET /list - 获取刮削器列表及状态
 */
router.get('/list', (_req: Request, res: Response): void => {
  try {
    const status: ScraperStatus[] = scraperRegistry.getPluginStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /config - 获取刮削器配置
 */
router.get('/config', (_req: Request, res: Response): void => {
  try {
    const gamesConfig = loadGamesConfig();
    // 返回刮削器相关配置
    const scrapersConfig: ScrapersConfig = gamesConfig.scrapers || {
      priority: ['steam', 'tgdb', 'nfo', 'igdb', 'giantbomb'],
      plugins: {
        steam: { enabled: true },
        tgdb: { enabled: true },
        nfo: { enabled: true },
        igdb: { enabled: true, clientId: '', clientSecret: '' },
        giantbomb: { enabled: false, apiKey: '' }
      }
    };
    res.json({ success: true, data: scrapersConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /config - 更新刮削器配置
 */
router.patch('/config', (req: Request, res: Response): void => {
  try {
    const newScrapersConfig: Partial<ScrapersConfig> = req.body;

    // 加载现有游戏配置
    const existingConfig = loadGamesConfig();

    // 合并刮削器配置
    const mergedScrapers: ScrapersConfig = {
      priority: newScrapersConfig.priority || existingConfig.scrapers?.priority || ['steam', 'tgdb', 'nfo', 'igdb', 'giantbomb'],
      plugins: {
        ...existingConfig.scrapers?.plugins,
        ...(newScrapersConfig.plugins || {})
      }
    };

    // 更新游戏配置
    const mergedConfig = {
      ...existingConfig,
      scrapers: mergedScrapers
    };

    // 保存配置
    const success = saveGamesConfig(mergedConfig);
    if (success) {
      // 同步更新注册中心配置
      scraperRegistry.updateConfig(mergedScrapers);
      res.json({ success: true, data: mergedScrapers });
    } else {
      res.status(500).json({ success: false, error: '保存配置失败' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /game/:id/scrape-with - 使用指定刮削器重新刮削
 */
router.post('/game/:id/scrape-with', async (req: Request, res: Response): Promise<void> => {
  try {
    const idParam = req.params.id as string;
    const gameId = parseInt(idParam, 10);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    const { scraper, downloadPosters = true } = req.body;
    if (!scraper) {
      res.status(400).json({ success: false, error: '缺少刮削器名称' });
      return;
    }

    // 检查插件是否存在
    const plugin = scraperRegistry.get(scraper);
    if (!plugin) {
      res.status(404).json({ success: false, error: `刮削器 "${scraper}" 不存在` });
      return;
    }

    // 执行刮削
    const result = await scraperManager.scrapeWith(gameId, scraper, downloadPosters);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /game/:id/log - 获取游戏刮削日志
 */
router.get('/game/:id/log', (req: Request, res: Response): void => {
  try {
    const idParam = req.params.id as string;
    const gameId = parseInt(idParam, 10);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    const log = scraperManager.getScrapeLog(gameId);
    if (log) {
      res.json({ success: true, data: log });
    } else {
      res.json({ success: true, data: null, message: '暂无刮削日志' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;