/**
 * 迁移 API 路由
 * 
 * 提供一次性迁移功能，将游戏目录下的海报迁移到集中存储
 */

import { Router, Request, Response } from 'express';
import { migrateToCentralStorage, previewMigration } from '../games/migration';
import { loadConfig, getStoragePath } from '../utils';
import { logger } from '../logger';

const router = Router();

/**
 * GET /api/migration/preview
 * 预览迁移情况（不执行迁移）
 */
router.get('/preview', (_req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    
    const preview = previewMigration(storagePath);
    
    res.json({
      success: true,
      data: preview
    });
  } catch (error) {
    const err = error as Error;
    logger.error('预览迁移失败: %s', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/migration/execute
 * 执行迁移
 */
router.post('/execute', (_req: Request, res: Response) => {
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    
    logger.info('开始迁移游戏元数据到集中存储...');
    
    const result = migrateToCentralStorage(storagePath);
    
    res.json({
      success: result.success,
      data: {
        totalGames: result.totalGames,
        migratedMetadata: result.migratedMetadata,
        migratedPosters: result.migratedPosters,
        errors: result.errors,
        details: result.details
      }
    });
  } catch (error) {
    const err = error as Error;
    logger.error('执行迁移失败: %s', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
