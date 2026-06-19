/**
 * 分组业务逻辑层
 */

import path from 'path';
import { gameDatabase } from './database';
import { getGameScanPathsFromConfig } from '../games-config';
import { logger } from '../logger';
import type { GameGroup, Game, GameQueryOptions, AutoGroupResult } from '../types';

class GroupService {
  /**
   * 自动按上一级目录分组
   * 仅针对"集合型"目录（≥2个游戏）
   * 跳过扫描根路径和根目录标识符
   */
  autoGroupByParentDirectory(scanRoots?: string[]): AutoGroupResult {
    // 1. 获取所有游戏路径
    const games = gameDatabase.getAllGamePaths();

    if (games.length === 0) {
      return {
        createdGroups: [],
        updatedGroups: [],
        totalGamesGrouped: 0
      };
    }

    // 2. 获取扫描根路径（用于过滤）
    const roots = scanRoots || getGameScanPathsFromConfig();
    const normalizedRoots = roots.map(r =>
      path.resolve(r).replace(/\\/g, '/').toLowerCase()
    );

    // 3. 按 parent_directory 分组
    const dirMap = new Map<string, number[]>();
    for (const game of games) {
      const parentDir = path.dirname(game.source_path);
      const gameIds = dirMap.get(parentDir) || [];
      gameIds.push(game.id);
      dirMap.set(parentDir, gameIds);
    }

    // 4. 筛选符合条件的目录
    const result: AutoGroupResult = {
      createdGroups: [],
      updatedGroups: [],
      totalGamesGrouped: 0
    };

    for (const [dirPath, gameIds] of dirMap.entries()) {
      // 必须有 ≥2 个游戏
      if (gameIds.length < 2) continue;

      // 获取目录名
      const groupName = path.basename(dirPath);

      // 跳过空名称和根目录标识符
      if (!groupName || groupName.match(/^[A-Za-z]:$|^[/\\]$/)) continue;

      // 跳过扫描根路径
      const normalizedDir = path.resolve(dirPath).replace(/\\/g, '/').toLowerCase();
      if (normalizedRoots.includes(normalizedDir)) continue;

      // 创建或更新分组
      const existingGroup = gameDatabase.getGroupByName(groupName);

      if (existingGroup) {
        // 已存在同名分组，追加未加入的游戏
        const addedCount = gameDatabase.addGamesToGroup(existingGroup.id, gameIds);
        if (addedCount > 0) {
          result.updatedGroups.push({ name: groupName, addedGames: addedCount });
          result.totalGamesGrouped += addedCount;
        }
      } else {
        // 创建新分组
        const newGroup = gameDatabase.createGroup(groupName);
        if (newGroup) {
          gameDatabase.addGamesToGroup(newGroup.id, gameIds);
          result.createdGroups.push({ name: groupName, gameCount: gameIds.length });
          result.totalGamesGrouped += gameIds.length;
        }
      }
    }

    logger.info('自动分组完成: 创建 %d 个分组, 更新 %d 个分组, 共 %d 个游戏',
      result.createdGroups.length,
      result.updatedGroups.length,
      result.totalGamesGrouped
    );

    return result;
  }

  // === 分组管理方法（封装数据库操作） ===

  getGroups(): GameGroup[] {
    return gameDatabase.getGroups();
  }

  getGroupById(id: number): GameGroup | null {
    return gameDatabase.getGroupById(id);
  }

  createGroup(name: string, pinned: boolean = false): GameGroup | null {
    return gameDatabase.createGroup(name, pinned ? 1 : 0);
  }

  updateGroup(id: number, data: { name?: string; pinned?: boolean; sort_order?: number }): boolean {
    return gameDatabase.updateGroup(id, {
      name: data.name,
      pinned: data.pinned ? 1 : 0,
      sort_order: data.sort_order
    });
  }

  deleteGroup(id: number): boolean {
    return gameDatabase.deleteGroup(id);
  }

  reorderGroups(items: { id: number; sort_order: number }[]): void {
    gameDatabase.reorderGroups(items);
  }

  // === 分组内游戏管理 ===

  getGroupGames(groupId: number, options?: GameQueryOptions): { games: Game[]; total: number } {
    const games = gameDatabase.getGroupGames(groupId, options);
    const total = gameDatabase.getGroupGameCount(groupId, options);
    return { games, total };
  }

  addGamesToGroup(groupId: number, gameIds: number[]): number {
    return gameDatabase.addGamesToGroup(groupId, gameIds);
  }

  removeGameFromGroup(groupId: number, gameId: number): boolean {
    return gameDatabase.removeGroupGame(groupId, gameId);
  }

  reorderGroupGames(groupId: number, items: { game_id: number; sort_order: number }[]): void {
    gameDatabase.reorderGroupGames(groupId, items);
  }

  getGamesNotInGroup(groupId: number): Game[] {
    return gameDatabase.getGamesNotInGroup(groupId);
  }

  // === 单个游戏的分组 ===

  getGroupsForGame(gameId: number): GameGroup[] {
    return gameDatabase.getGroupsForGame(gameId);
  }

  setGameGroups(gameId: number, groupIds: number[]): void {
    gameDatabase.setGameGroups(gameId, groupIds);
  }
}

export const groupService = new GroupService();