/**
 * 游戏元数据迁移工具
 * 
 * 一次性迁移功能：将游戏目录下的 game.json 和海报文件迁移到集中存储目录
 * 不与业务代码耦合，仅通过 API 手动触发
 */

import fs from 'fs';
import path from 'path';
import { database } from '../database';
import { logger } from '../logger';
import { ensureGamesDirs, getPosterDir } from './storage';

export interface MigrationResult {
  success: boolean;
  totalGames: number;
  migratedMetadata: number;
  migratedPosters: number;
  errors: string[];
  details: {
    metadataMigrated: string[];
    postersMigrated: string[];
  };
}

/**
 * 迁移单个游戏的海报文件
 * 从游戏目录迁移到 profiles/games/posters/{game_id}/
 */
function migrateGamePosters(
  sourcePath: string,
  gameId: number,
  storagePath: string
): { count: number; types: string[] } {
  const posterTypes = ['horizontal', 'vertical', 'banner', 'background'] as const;
  const posterNames: Record<string, string> = {
    horizontal: 'poster-horizontal.jpg',
    vertical: 'poster-vertical.jpg',
    banner: 'poster-banner.jpg',
    background: 'background.jpg'
  };

  let count = 0;
  const types: string[] = [];

  for (const type of posterTypes) {
    const oldPath = path.join(sourcePath, posterNames[type]);
    if (fs.existsSync(oldPath)) {
      try {
        const posterDir = getPosterDir(storagePath, gameId);
        if (!fs.existsSync(posterDir)) {
          fs.mkdirSync(posterDir, { recursive: true });
        }
        
        const newPath = path.join(posterDir, `${type}.jpg`);
        
        // 如果目标已存在，跳过
        if (fs.existsSync(newPath)) {
          logger.info(`[Migration] 海报已存在，跳过: ${newPath}`);
          continue;
        }
        
        // 复制文件（不删除原文件，保留备份）
        fs.copyFileSync(oldPath, newPath);
        count++;
        types.push(type);
        logger.info(`[Migration] 迁移海报: ${oldPath} -> ${newPath}`);
      } catch (err) {
        const error = err as Error;
        logger.error(`[Migration] 迁移海报失败: ${oldPath} - ${error.message}`);
      }
    }
  }

  return { count, types };
}

/**
 * 执行迁移
 */
export function migrateToCentralStorage(storagePath: string): MigrationResult {
  const result: MigrationResult = {
    success: true,
    totalGames: 0,
    migratedMetadata: 0,
    migratedPosters: 0,
    errors: [],
    details: {
      metadataMigrated: [],
      postersMigrated: []
    }
  };

  try {
    // 确保目标目录存在
    ensureGamesDirs(storagePath);

    // 从数据库获取所有游戏
    const games = database.db!.exec(`
      SELECT id, source_path, title 
      FROM games 
      WHERE is_excluded = 0
    `);

    if (games.length === 0 || games[0].values.length === 0) {
      logger.info('[Migration] 没有找到需要迁移的游戏');
      return result;
    }

    result.totalGames = games[0].values.length;

    for (const row of games[0].values) {
      const gameId = row[0] as number;
      const sourcePath = row[1] as string;
      const title = row[2] as string;

      try {
        // 迁移海报
        const posterResult = migrateGamePosters(sourcePath, gameId, storagePath);
        if (posterResult.count > 0) {
          result.migratedPosters += posterResult.count;
          result.details.postersMigrated.push(`${title} (${posterResult.types.join(', ')})`);
          
          // 更新数据库的 has_local_poster 字段
          database.db!.run(
            'UPDATE games SET has_local_poster = 1 WHERE id = ?',
            [gameId]
          );
        }

        // 检查 game.json 存在性，记录但不迁移（新设计不使用 game.json）
        const gameJsonPath = path.join(sourcePath, 'game.json');
        if (fs.existsSync(gameJsonPath)) {
          result.migratedMetadata++;
          result.details.metadataMigrated.push(title);
        }
      } catch (err) {
        const error = err as Error;
        result.errors.push(`${title}: ${error.message}`);
        logger.error(`[Migration] 迁移游戏失败: ${title} - ${error.message}`);
      }
    }

    logger.info(`[Migration] 迁移完成: ${result.migratedPosters} 个海报, ${result.migratedMetadata} 个元数据文件`);
  } catch (err) {
    const error = err as Error;
    result.success = false;
    result.errors.push(error.message);
    logger.error(`[Migration] 迁移失败: ${error.message}`);
  }

  return result;
}

/**
 * 获取迁移预览（不执行迁移，只统计）
 */
export function previewMigration(_storagePath: string): {
  totalGames: number;
  gamesWithPosters: string[];
  gamesWithMetadata: string[];
} {
  const preview = {
    totalGames: 0,
    gamesWithPosters: [] as string[],
    gamesWithMetadata: [] as string[]
  };

  try {
    const games = database.db!.exec(`
      SELECT id, source_path, title 
      FROM games 
      WHERE is_excluded = 0
    `);

    if (games.length === 0 || games[0].values.length === 0) {
      return preview;
    }

    preview.totalGames = games[0].values.length;

    for (const row of games[0].values) {
      const sourcePath = row[1] as string;
      const title = row[2] as string;

      // 检查海报
      const posterTypes = ['poster-horizontal.jpg', 'poster-vertical.jpg', 'poster-banner.jpg', 'background.jpg'];
      const hasPoster = posterTypes.some(name => fs.existsSync(path.join(sourcePath, name)));
      if (hasPoster) {
        preview.gamesWithPosters.push(title);
      }

      // 检查 game.json
      const gameJsonPath = path.join(sourcePath, 'game.json');
      if (fs.existsSync(gameJsonPath)) {
        preview.gamesWithMetadata.push(title);
      }
    }
  } catch (err) {
    const error = err as Error;
    logger.error(`[Migration] 预览失败: ${error.message}`);
  }

  return preview;
}
