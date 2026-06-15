/**
 * 游戏配置 API 路由
 */

import { Router, Request, Response } from 'express';
import { loadGamesConfig, saveGamesConfig } from '../games-config';
import type { GamesConfig } from '../types/games-config';

const router: Router = Router();

/**
 * 获取游戏配置
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    const config = loadGamesConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 保存游戏配置
 */
router.put('/', (req: Request, res: Response): void => {
  try {
    const newConfig: Partial<GamesConfig> = req.body;

    // 合并现有配置
    const existingConfig = loadGamesConfig();
    const mergedConfig: GamesConfig = {
      ...existingConfig,
      ...newConfig,
      gamesRules: {
        ...existingConfig.gamesRules,
        ...(newConfig.gamesRules || {}),
        heuristicRules: {
          ...existingConfig.gamesRules.heuristicRules,
          ...(newConfig.gamesRules?.heuristicRules || {})
        }
      },
      gamesScrape: {
        ...existingConfig.gamesScrape,
        ...(newConfig.gamesScrape || {})
      }
    };

    const success = saveGamesConfig(mergedConfig);
    if (success) {
      res.json({ success: true, data: mergedConfig });
    } else {
      res.status(500).json({ success: false, error: '保存配置失败' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;