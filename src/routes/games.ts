/**
 * 游戏 API 路由
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';
import { database } from '../database';
import { gameDatabase } from '../games/database';
import { scrapeGame, scrapeUnscrapedGames, searchSteamCandidates } from '../games/scraper';
import { runIdentification } from '../games/identifier';
import { PosterService } from '../games/poster-service';
import { initDatabase, loadConfig, getStoragePath, DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE, getGameScanPaths, addToBlacklistPatterns } from '../utils';
import { logger } from '../logger';
import { taskManager } from '../task-manager';
import type { Game, GameRules, GameScrapeConfig, GameQueryOptions, GameGroup, SteamDbEntry } from '../types';
import backupRouter from './backup';

const router: Router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Mount backup router at /backup
router.use('/backup', backupRouter);

/**
 * 初始化游戏数据库（确保表已创建）
 */
async function initGameDatabase(): Promise<void> {
  await initDatabase();
  gameDatabase.createGameTables();
}

/**
 * 打开目录（跨平台）
 */
function openDirectory(dirPath: string): void {
  const platform: string = process.platform;
  if (platform === 'win32') {
    spawn('explorer', [dirPath], { detached: true });
  } else if (platform === 'darwin') {
    spawn('open', [dirPath], { detached: true });
  } else if (platform === 'linux') {
    spawn('xdg-open', [dirPath], { detached: true });
  }
}

/**
 * 获取游戏列表
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { genre, year, search, scraped, favorite, orderBy = 'title', orderDir = 'ASC', page = '1', pageSize = '50' } = req.query;
    const offset: number = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const limit: number = parseInt(pageSize as string);

    const options: GameQueryOptions = {
      genre: genre as string,
      year: year as string,
      search: search as string,
      scraped: scraped as 'true' | 'false' | undefined,
      favorite: favorite as 'true' | 'false' | undefined,
      orderBy: (orderBy as 'title' | 'release_date' | 'rating' | 'scraped_at') || undefined,
      orderDir: (orderDir as 'ASC' | 'DESC') || undefined,
      limit,
      offset
    };

    const games: Game[] = gameDatabase.getGames(options);
    const total: number = gameDatabase.getGameCount(options);

    res.json({
      success: true,
      data: {
        games,
        total,
        page: parseInt(page as string),
        pageSize: limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取游戏统计
 */
router.get('/statistics', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const stats = gameDatabase.getStatistics();
    res.json({ success: true, data: stats });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取类型列表
 */
router.get('/genres', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const genres: string[] = gameDatabase.getGenres();
    res.json({ success: true, data: genres });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取年份列表
 */
router.get('/years', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const years: string[] = gameDatabase.getYears();
    res.json({ success: true, data: years });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取所有分组
 */
router.get('/groups', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const groups: GameGroup[] = gameDatabase.getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建分组
 */
router.post('/groups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { name, pinned } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: '分组名称不能为空' });
      return;
    }
    const group: GameGroup | null = gameDatabase.createGroup(name, pinned || 0);
    if (!group) {
      res.status(400).json({ success: false, error: '创建分组失败' });
      return;
    }
    res.json({ success: true, data: group });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新分组
 */
router.post('/groups/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    gameDatabase.updateGroup(group.id, req.body);
    res.json({ success: true, data: gameDatabase.getGroupById(group.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除分组
 */
router.post('/groups/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    gameDatabase.deleteGroup(group.id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分组排序
 */
router.post('/groups/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { items }: { items: Array<{ id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    gameDatabase.reorderGroups(items);
    res.json({ success: true, data: gameDatabase.getGroups() });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取分组内游戏
 */
router.get('/groups/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { genre, year, search, scraped, favorite, orderBy = 'title', orderDir = 'ASC', page = '1', pageSize = '50' } = req.query;
    const options: GameQueryOptions = {
      genre: genre as string,
      year: year as string,
      search: search as string,
      scraped: scraped as 'true' | 'false' | undefined,
      favorite: favorite as 'true' | 'false' | undefined,
      orderBy: orderBy as 'title' | 'rating' | 'release_date',
      orderDir: orderDir as 'ASC' | 'DESC',
      limit: parseInt(pageSize as string),
      offset: (parseInt(page as string) - 1) * parseInt(pageSize as string)
    };
    const games: Game[] = gameDatabase.getGroupGames(group.id, options);
    const total: number = gameDatabase.getGroupGameCount(group.id, options);
    res.json({
      success: true,
      data: {
        games,
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加游戏到分组
 */
router.post('/groups/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { game_ids }: { game_ids: number[] } = req.body;
    if (!game_ids || !Array.isArray(game_ids)) {
      res.status(400).json({ success: false, error: 'game_ids 必须为数组' });
      return;
    }
    const added: number[] = [];
    for (const gameId of game_ids) {
      if (gameDatabase.addGroupGame(group.id, gameId)) {
        added.push(gameId);
      }
    }
    res.json({ success: true, data: { addedCount: added.length, addedIds: added } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 从分组移除游戏
 */
router.post('/groups/:id/games/remove/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    gameDatabase.removeGroupGame(group.id, parseInt(req.params.gameId as string));
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 组内游戏排序
 */
router.post('/groups/:id/games/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { items }: { items: Array<{ game_id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    gameDatabase.reorderGroupGames(group.id, items);
    res.json({ success: true, data: gameDatabase.getGroupGames(group.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取不在分组中的游戏（用于添加弹窗的候选列表）
 */
router.get('/groups/:id/games/candidates', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = gameDatabase.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const games: Game[] = gameDatabase.getGamesNotInGroup(group.id);
    res.json({ success: true, data: games });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// === 下面是游戏路由（必须在分组路由之后） ===

/**
 * 获取游戏详情
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }
    res.json({ success: true, data: game });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取游戏目录下的文件列表
 */
router.get('/:id/files', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const gamePath: string = game.source_path;
    if (!gamePath || !fs.existsSync(gamePath)) {
      res.status(404).json({ success: false, error: '游戏目录不存在' });
      return;
    }

    // 查询该目录下的所有文件
    const files = database.getFilesByPathPrefix(gamePath);

    res.json({
      success: true,
      data: {
        files,
        gamePath
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新游戏元数据
 */
router.post('/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const updateData: Partial<Game> = req.body;
    gameDatabase.updateGame(game.id, updateData);

    res.json({ success: true, data: gameDatabase.getGameById(game.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除游戏
 */
router.post('/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    gameDatabase.deleteGame(game.id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 排除游戏：加入黑名单并删除
 */
router.post('/:id/exclude', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id as string);
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    // 将路径加入黑名单
    addToBlacklistPatterns(game.source_path);

    // 删除游戏记录
    gameDatabase.deleteGame(gameId);

    res.json({ success: true, data: { deletedId: gameId, blacklistPath: game.source_path } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 切换游戏收藏状态
 */
router.post('/:id/favorite', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const updated: Game | null = gameDatabase.toggleFavorite(parseInt(req.params.id as string));
    if (!updated) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 提升游戏目录至父级
 */
router.post('/:id/promote', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const result = gameDatabase.promoteGame(parseInt(req.params.id as string));
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result.game });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 移除所有不存在的游戏目录
 */
router.post('/remove-nonexistent', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const result = gameDatabase.deleteNonexistent();
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清理已移除路径下的游戏记录
 */
router.post('/cleanup-stale', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const config = loadConfig();
    const gameRoots = getGameScanPaths(config);
    const count = gameDatabase.deleteStaleByScanRoots(gameRoots);
    res.json({ success: true, data: { deletedCount: count } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 刮削单个游戏
 */
router.post('/:id/scrape', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { downloadPosters = true } = req.body;
    const result: Game | null = await scrapeGame(game.id, downloadPosters);

    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(500).json({ success: false, error: '刮削失败' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量刮削未刮削游戏
 */
router.post('/scrape/batch', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { downloadPosters = true } = req.body;

    // 检查是否有正在运行的刮削任务
    if (taskManager.hasRunningTask('game-scrape')) {
      res.status(409).json({ success: false, error: '已有刮削任务正在执行' });
      return;
    }

    const task = taskManager.createTask('game-scrape');
    res.json({ success: true, data: { taskId: task.id } });

    // 异步执行刮削
    (async () => {
      try {
        const scrapedIds = await scrapeUnscrapedGames(downloadPosters, (current, total, gameTitle) => {
          taskManager.updateTask(task.id, {
            progress: Math.round((current / total) * 100),
            message: `正在刮削: ${gameTitle} (${current}/${total})`
          });
        });

        taskManager.completeTask(task.id, {
          message: `批量刮削完成，共刮削 ${scrapedIds.length} 个游戏`
        });
      } catch (err) {
        const error = err as Error;
        taskManager.failTask(task.id, error.message);
      }
    })();
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取海报备份列表
 */
router.get('/:id/poster/backups', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' = (req.query.type as 'horizontal' | 'vertical' | 'banner' | 'background') || 'horizontal';
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const backups = new PosterService(storagePath).listBackups(game.id, type);

    res.json({ success: true, data: backups });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取海报备份图片
 */
router.get('/:id/poster/backups/:filename', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id as string);
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: 'Game not found' });
      return;
    }

    const filename = req.params.filename as string;
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const backupPath = path.join(storagePath, 'games', 'posters', String(gameId), filename);

    if (fs.existsSync(backupPath)) {
      res.sendFile(backupPath);
    } else {
      res.status(404).json({ success: false, error: 'Backup not found' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取海报
 */
router.get('/:id/poster/:type', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.id as string);
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: 'Game not found' });
      return;
    }

    const type = req.params.type as 'horizontal' | 'vertical' | 'banner' | 'background';
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const posterService = new PosterService(storagePath);
    const posterPath = posterService.getPosterPath(gameId, type);

    if (fs.existsSync(posterPath)) {
      res.sendFile(posterPath);
    } else {
      res.status(404).json({ success: false, error: 'Poster not found' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
/**
 * 上传海报
 */
router.post('/:id/poster/upload', upload.single('poster'), async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom' = (req.body.type || 'custom') as 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom';

    if (!req.file) {
      res.status(400).json({ success: false, error: '请上传海报文件' });
      return;
    }

    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const maxBackups = config.maxPosterBackups || 5;
    new PosterService(storagePath, maxBackups).saveFromBuffer(game.id, type, req.file.buffer);

    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除海报
 */
router.delete('/:id/poster/:type', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom' = req.params.type as 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom';
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    new PosterService(storagePath).deletePoster(game.id, type);

    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 恢复海报备份
 */
router.post('/:id/poster/restore', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { type, filename } = req.body;
    if (!type || !filename) {
      res.status(400).json({ success: false, error: '缺少 type 或 filename 参数' });
      return;
    }

    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const maxBackups = config.maxPosterBackups || 5;
    const result = new PosterService(storagePath, maxBackups).restoreBackup(game.id, type, filename);

    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: '备份文件不存在' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除海报备份
 */
router.post('/:id/poster/backup/delete', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ success: false, error: '缺少 filename 参数' });
      return;
    }

    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const result = new PosterService(storagePath).deleteBackup(game.id, filename);

    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: '备份文件不存在' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 重新下载海报（从Steam）
 */
router.post('/:id/poster/redownload', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    if (!game.steam_appid) {
      res.status(400).json({ success: false, error: '游戏缺少Steam AppID' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' = (req.body.type || 'horizontal') as 'horizontal' | 'vertical' | 'banner' | 'background';

    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const posterService = new PosterService(storagePath);

    // 根据类型构建Steam CDN URL
    const steamBaseUrl = 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.steam_appid;
    let posterUrl: string;

    if (type === 'vertical') {
      posterUrl = steamBaseUrl + '/capsule_236x175.jpg';
    } else if (type === 'banner') {
      posterUrl = steamBaseUrl + '/header.jpg';
    } else if (type === 'background') {
      posterUrl = steamBaseUrl + '/' + game.steam_appid + '_page_bg_raw.jpg';
    } else {
      posterUrl = steamBaseUrl + '/capsule_616x353.jpg';
    }

    await posterService.saveFromUrl(game.id, type, posterUrl);

    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 打开游戏目录
 */
router.post('/:id/open', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    if (!game.source_path || !fs.existsSync(game.source_path)) {
      res.status(404).json({ success: false, error: '游戏目录不存在' });
      return;
    }

    openDirectory(game.source_path);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 重新识别游戏
 */
router.post('/identify', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const config = loadConfig();
    let { scanRoots } = req.body;

    if (!scanRoots || scanRoots.length === 0) {
      scanRoots = getGameScanPaths(config);
    }

    const rules: GameRules = config.gamesRules || DEFAULT_GAME_RULES;
    const scrapeConfig: GameScrapeConfig = config.gamesScrape || DEFAULT_GAME_SCRAPE;

    const { games, ids } = await runIdentification(scanRoots, rules, scrapeConfig);

    res.json({ success: true, data: { gamesCount: games.length, ids } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动创建游戏
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { source_path, title, title_en, steam_appid, developer, publisher, release_date, genres, short_description, notes } = req.body;
    const result = gameDatabase.createManualGame({
      source_path,
      title,
      title_en,
      steam_appid: steam_appid ? String(steam_appid) : undefined,
      developer,
      publisher,
      release_date,
      genres,
      short_description,
      notes
    });
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    // 如果提供了 steam_appid，自动刮削
    if (steam_appid && result.game) {
      scrapeGame(result.game.id, true).catch(err => logger.warn('自动刮削失败: %s', err.message));
    }
    res.json({ success: true, data: result.game });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清空游戏数据
 */
router.post('/clear', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    gameDatabase.clearAllGames();
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 搜索 Steam 游戏（返回候选列表供手动选择）
 */
router.get('/steam/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ success: false, error: '请提供搜索关键词' });
      return;
    }

    const candidates = await searchSteamCandidates(q.trim());
    res.json({ success: true, data: candidates });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动绑定 Steam AppID 到游戏并刮削
 */
router.post('/:id/bind-steam', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(String(req.params.id)));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { appid } = req.body;
    if (!appid || typeof appid !== 'number') {
      res.status(400).json({ success: false, error: '请提供有效的 Steam AppID' });
      return;
    }

    // 更新 steam_appid
    gameDatabase.updateGame(game.id, { steam_appid: String(appid) });

    // 执行刮削（刮削成功后会自动存储到 steam_db）
    const result: Game | null = await scrapeGame(game.id, true);

    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(500).json({ success: false, error: '刮削失败' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Steam DB 路由 ===

/**
 * 获取 Steam DB 列表
 */
router.get('/steam-db/list', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { search, orderBy = 'name', orderDir = 'ASC', page = '1', pageSize = '20' } = req.query;
    const pageNum = parseInt(String(page)) || 1;
    const pageSizeNum = parseInt(String(pageSize)) || 20;
    const offset = (pageNum - 1) * pageSizeNum;

    const result = gameDatabase.getAllSteamDbEntries({
      search: search as string,
      orderBy: orderBy as string,
      orderDir: orderDir as string,
      limit: pageSizeNum,
      offset
    });

    res.json({
      success: true,
      data: {
        entries: result.entries,
        total: result.total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(result.total / pageSizeNum)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个 Steam DB 条目
 */
router.get('/steam-db/get/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const id = parseInt(String(req.params.id));
    const entry = gameDatabase.getSteamDbById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在' });
      return;
    }
    res.json({ success: true, data: entry });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建 Steam DB 条目
 */
router.post('/steam-db/create', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
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
 * 更新 Steam DB 条目
 */
router.post('/steam-db/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const id = parseInt(String(req.params.id));
    const entry = gameDatabase.getSteamDbById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在' });
      return;
    }

    const data: Partial<SteamDbEntry> = req.body;

    // 如果要更新 steam_appid，检查是否与其他条目冲突
    if (data.steam_appid && data.steam_appid !== entry.steam_appid) {
      const existing = gameDatabase.getSteamDbByAppid(data.steam_appid);
      if (existing) {
        res.status(400).json({ success: false, error: `AppID ${data.steam_appid} 已被其他条目使用` });
        return;
      }
    }

    // 更新 SteamDB
    gameDatabase.updateSteamDbEntry(id, data);
    const updated = gameDatabase.getSteamDbById(id);

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

/**
 * 删除 Steam DB 条目
 */
router.post('/steam-db/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const id = parseInt(String(req.params.id));
    const entry = gameDatabase.getSteamDbById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在' });
      return;
    }

    gameDatabase.deleteSteamDbEntry(id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 导出 Steam DB
 */
router.get('/steam-db/export', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const entries = gameDatabase.exportSteamDb();
    res.json({ success: true, data: entries });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 导入 Steam DB
 */
router.post('/steam-db/import', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
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
 * 按名称查找 Steam AppID
 */
router.get('/steam-db/lookup', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { name } = req.query;
    if (!name) {
      res.status(400).json({ success: false, error: '请提供 name 参数' });
      return;
    }

    const result = gameDatabase.lookupSteamDbByName(name as string);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;