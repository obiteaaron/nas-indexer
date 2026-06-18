/**
 * 游戏分组 API 路由（独立模块）
 */

import express, { Router, Request, Response } from 'express';
import { gameDatabase } from '../games/database';
import { groupService } from '../games/group-service';
import { logger } from '../logger';
import type { GameGroup, Game, GameQueryOptions } from '../types';

const router: Router = express.Router();

/**
 * 初始化游戏数据库（确保表已创建）
 */
async function initGameDatabase(): Promise<void> {
  await gameDatabase.init();
  gameDatabase.createGameTables();
}

/**
 * 获取所有分组
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const groups: GameGroup[] = groupService.getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建分组
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { name, pinned } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: '分组名称不能为空' });
      return;
    }
    const group: GameGroup | null = groupService.createGroup(name, pinned);
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
router.post('/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.updateGroup(group.id, req.body);
    res.json({ success: true, data: groupService.getGroupById(group.id) });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除分组
 */
router.post('/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.deleteGroup(group.id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分组排序
 */
router.post('/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { items }: { items: Array<{ id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    groupService.reorderGroups(items);
    res.json({ success: true, data: groupService.getGroups() });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取分组内游戏
 */
router.get('/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
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
    const { games, total } = groupService.getGroupGames(group.id, options);
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
router.post('/:id/games', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { game_ids }: { game_ids: number[] } = req.body;
    if (!game_ids || !Array.isArray(game_ids)) {
      res.status(400).json({ success: false, error: 'game_ids 必须为数组' });
      return;
    }
    const addedCount = groupService.addGamesToGroup(group.id, game_ids);
    res.json({ success: true, data: { addedCount, addedIds: game_ids } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 从分组移除游戏
 */
router.post('/:id/games/remove/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    groupService.removeGameFromGroup(group.id, parseInt(req.params.gameId as string));
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 组内游戏排序
 */
router.post('/:id/games/reorder', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const { items }: { items: Array<{ game_id: number; sort_order: number }> } = req.body;
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items 必须为数组' });
      return;
    }
    groupService.reorderGroupGames(group.id, items);
    res.json({ success: true, data: groupService.getGroupGames(group.id).games });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取不在分组中的游戏（用于添加弹窗的候选列表）
 */
router.get('/:id/games/candidates', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const group: GameGroup | null = groupService.getGroupById(parseInt(req.params.id as string));
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    const games: Game[] = groupService.getGamesNotInGroup(group.id);
    res.json({ success: true, data: games });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个游戏所属的分组列表
 */
router.get('/game/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.gameId as string);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    // 验证游戏是否存在
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const groups: GameGroup[] = groupService.getGroupsForGame(gameId);
    res.json({ success: true, data: groups });
  } catch (err) {
    const error = err as Error;
    logger.error('获取游戏分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 设置游戏分组（覆盖式：移出所有分组，添加到指定分组）
 */
router.post('/game/:gameId', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const gameId = parseInt(req.params.gameId as string);
    if (isNaN(gameId)) {
      res.status(400).json({ success: false, error: '无效的游戏 ID' });
      return;
    }

    // 验证游戏是否存在
    const game: Game | null = gameDatabase.getGameById(gameId);
    if (!game) {
      res.status(404).json({ success: false, error: '游戏不存在' });
      return;
    }

    const { group_ids } = req.body;
    if (!Array.isArray(group_ids)) {
      res.status(400).json({ success: false, error: 'group_ids 必须为数组' });
      return;
    }

    // 验证所有分组 ID 都存在
    const validGroupIds: number[] = [];
    for (const id of group_ids) {
      const numId = Number(id);
      if (!isNaN(numId)) {
        const group = groupService.getGroupById(numId);
        if (group) {
          validGroupIds.push(numId);
        }
      }
    }

    groupService.setGameGroups(gameId, validGroupIds);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('设置游戏分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动触发自动分组
 */
router.post('/auto-group', async (req: Request, res: Response): Promise<void> => {
  await initGameDatabase();
  try {
    const { scanRoots } = req.body;
    const result = groupService.autoGroupByParentDirectory(scanRoots);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err as Error;
    logger.error('自动分组失败: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;