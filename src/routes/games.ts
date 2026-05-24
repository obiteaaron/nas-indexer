/**
 * 游戏 API 路由
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import { spawn } from 'child_process';
import multer from 'multer';
import { database } from '../database';
import { gameDatabase } from '../games/database';
import { scrapeGame, scrapeUnscrapedGames, searchSteamCandidates } from '../games/scraper';
import { runIdentification } from '../games/identifier';
import { savePoster, deletePoster } from '../games/metadata-manager';
import { initDatabase, loadConfig, DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE, getGameScanPaths } from '../utils';
import { logger } from '../logger';
import type { Game, GameRules, GameScrapeConfig, GameQueryOptions } from '../types';

const router: Router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
    const { genre, year, search, scraped, excluded, orderBy = 'title', orderDir = 'ASC', page = '1', pageSize = '50' } = req.query;
    const offset: number = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const limit: number = parseInt(pageSize as string);

    const options: GameQueryOptions = {
      genre: genre as string,
      year: year as string,
      search: search as string,
      scraped: scraped as 'true' | 'false' | undefined,
      excluded: excluded as 'true' | 'false' | 'only' | undefined,
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
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const updateData: Partial<Game> = req.body;
    gameDatabase.updateGame(game.id, updateData);

    // 如果有本地元数据，同步更新 game.json
    if (game.source_path && game.metadata_source === 'local') {
      const updatedGame = gameDatabase.getGameById(game.id);
      if (updatedGame) {
        const { writeLocalMetadata } = require('../games/metadata-manager');
        writeLocalMetadata(game.source_path, updatedGame);
      }
    }

    res.json({ success: true, data: gameDatabase.getGameById(game.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除游戏
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
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
 * 切换游戏排除状态
 */
router.post('/:id/exclude', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const updated: Game | null = gameDatabase.toggleExclude(parseInt(req.params.id as string));
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
    const scrapedIds: number[] = await scrapeUnscrapedGames(downloadPosters);
    res.json({ success: true, data: { scrapedCount: scrapedIds.length, scrapedIds } });
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
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' = req.params.type as 'horizontal' | 'vertical' | 'banner' | 'background';
    const posterPath: string | null = gameDatabase.getPosterPath(game, type);

    if (posterPath && fs.existsSync(posterPath)) {
      res.sendFile(posterPath);
    } else {
      res.status(404).json({ success: false, error: '海报不存在' });
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 上传海报
 */
router.post('/:id/poster/:type', upload.single('poster'), async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' = req.params.type as 'horizontal' | 'vertical' | 'banner' | 'background';

    if (!req.file) {
      res.status(400).json({ success: false, error: '请上传海报文件' });
      return;
    }

    const posterPath: string = savePoster(game.source_path, type, req.file.buffer);
    gameDatabase.updatePosterPath(game.id, type, posterPath);

    res.json({ success: true, data: { posterPath } });
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

    const type: 'horizontal' | 'vertical' | 'banner' | 'background' = req.params.type as 'horizontal' | 'vertical' | 'banner' | 'background';
    deletePoster(game.source_path, type);
    gameDatabase.updateGame(game.id, { [`poster_${type}_path`]: undefined, has_local_poster: 0 });

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
    const game: Game | null = gameDatabase.getGameById(parseInt(req.params.id as string));
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { appid } = req.body;
    if (!appid || typeof appid !== 'number') {
      res.status(400).json({ success: false, error: '请提供有效的 Steam AppID' });
      return;
    }

    // 保存别名映射
    if (game.original_name) {
      gameDatabase.saveAlias(game.original_name, String(appid));
    }

    // 更新 steam_appid
    gameDatabase.updateGame(game.id, { steam_appid: String(appid) });

    // 执行刮削
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

export default router;