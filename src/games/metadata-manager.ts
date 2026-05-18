/**
 * 游戏元数据管理模块
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import type { Game } from '../types';

const GAME_JSON_NAME = 'game.json';

const POSTER_NAMES = {
  horizontal: 'poster-horizontal.jpg',
  vertical: 'poster-vertical.jpg',
  banner: 'poster-banner.jpg',
  background: 'background.jpg'
};

/**
 * 检查游戏目录是否存在 game.json
 */
export function hasLocalMetadata(gamePath: string): boolean {
  const jsonPath = path.join(gamePath, GAME_JSON_NAME);
  return fs.existsSync(jsonPath);
}

/**
 * 读取本地 game.json 元数据
 */
export function readLocalMetadata(gamePath: string): Partial<Game> | null {
  const jsonPath = path.join(gamePath, GAME_JSON_NAME);

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const metadata = JSON.parse(content) as Partial<Game>;

    // 补充元数据来源信息
    metadata.metadata_source = 'local';
    metadata.metadata_path = jsonPath;

    logger.info('读取本地元数据成功: %s', gamePath);
    return metadata;
  } catch (err) {
    const error = err as Error;
    logger.warn('读取本地元数据失败: %s - %s', gamePath, error.message);
    return null;
  }
}

/**
 * 写入本地 game.json 元数据
 */
export function writeLocalMetadata(gamePath: string, metadata: Partial<Game>): boolean {
  const jsonPath = path.join(gamePath, GAME_JSON_NAME);

  try {
    // 确保目录存在
    if (!fs.existsSync(gamePath)) {
      logger.warn('游戏目录不存在: %s', gamePath);
      return false;
    }

    // 提取需要保存的字段
    const saveData = {
      title: metadata.title,
      title_en: metadata.title_en,
      original_name: metadata.original_name,
      steam_appid: metadata.steam_appid,
      developer: metadata.developer,
      publisher: metadata.publisher,
      release_date: metadata.release_date,
      genres: metadata.genres ? JSON.parse(metadata.genres) : [],
      rating: metadata.rating,
      description: metadata.description,
      short_description: metadata.short_description,
      languages: metadata.languages ? JSON.parse(metadata.languages) : [],
      tags: metadata.tags ? JSON.parse(metadata.tags) : [],
      notes: metadata.notes,
      screenshots: metadata.screenshots ? JSON.parse(metadata.screenshots) : [],
      metadata_source: metadata.metadata_source,
      scraped_at: metadata.scraped_at
    };

    fs.writeFileSync(jsonPath, JSON.stringify(saveData, null, 2), 'utf-8');
    logger.info('写入本地元数据成功: %s', jsonPath);
    return true;
  } catch (err) {
    const error = err as Error;
    logger.error('写入本地元数据失败: %s - %s', gamePath, error.message);
    return false;
  }
}

/**
 * 检查本地海报是否存在
 */
export function hasLocalPoster(gamePath: string, type: 'horizontal' | 'vertical' | 'banner' | 'background'): boolean {
  const posterPath = path.join(gamePath, POSTER_NAMES[type]);
  return fs.existsSync(posterPath);
}

/**
 * 获取本地海报路径
 */
export function getLocalPosterPath(gamePath: string, type: 'horizontal' | 'vertical' | 'banner' | 'background'): string | null {
  const posterPath = path.join(gamePath, POSTER_NAMES[type]);
  if (fs.existsSync(posterPath)) {
    return posterPath;
  }
  return null;
}

/**
 * 检查所有本地海报
 */
export function checkLocalPosters(gamePath: string): {
  horizontal: string | null;
  vertical: string | null;
  banner: string | null;
  background: string | null;
} {
  return {
    horizontal: getLocalPosterPath(gamePath, 'horizontal'),
    vertical: getLocalPosterPath(gamePath, 'vertical'),
    banner: getLocalPosterPath(gamePath, 'banner'),
    background: getLocalPosterPath(gamePath, 'background')
  };
}

/**
 * 保存海报到本地
 */
export function savePoster(gamePath: string, type: 'horizontal' | 'vertical' | 'banner' | 'background', imageData: Buffer): string {
  const posterPath = path.join(gamePath, POSTER_NAMES[type]);

  try {
    fs.writeFileSync(posterPath, imageData);
    logger.info('保存海报成功: %s', posterPath);
    return posterPath;
  } catch (err) {
    const error = err as Error;
    logger.error('保存海报失败: %s - %s', posterPath, error.message);
    throw error;
  }
}

/**
 * 删除本地海报
 */
export function deletePoster(gamePath: string, type: 'horizontal' | 'vertical' | 'banner' | 'background'): boolean {
  const posterPath = path.join(gamePath, POSTER_NAMES[type]);

  if (fs.existsSync(posterPath)) {
    try {
      fs.unlinkSync(posterPath);
      logger.info('删除海报成功: %s', posterPath);
      return true;
    } catch (err) {
      const error = err as Error;
      logger.error('删除海报失败: %s - %s', posterPath, error.message);
      return false;
    }
  }
  return false;
}