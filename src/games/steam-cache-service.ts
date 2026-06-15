/**
 * Steam 缓存图片管理服务
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

const STEAM_CACHE_DIR = 'steam-cache';
const SCREENSHOTS_DIR = 'screenshots';

export interface SteamCacheImageStatus {
  hasHeader: boolean;
  hasCapsule: boolean;
  hasBackground: boolean;
  screenshotCount: number;
}

export interface SteamCacheStats {
  totalEntries: number;
  totalPosters: number;
  totalScreenshots: number;
  totalSizeMB: number;
}

/**
 * 获取 Steam 缓存根目录
 */
function getSteamCacheRoot(storagePath: string): string {
  return path.join(storagePath, 'games', STEAM_CACHE_DIR);
}

/**
 * 获取指定 AppID 的缓存目录
 */
function getSteamCacheDir(storagePath: string, appid: string): string {
  return path.join(getSteamCacheRoot(storagePath), appid);
}

/**
 * 确保 Steam 缓存目录存在
 */
function ensureSteamCacheDir(storagePath: string, appid: string): string {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  const screenshotsDir = path.join(cacheDir, SCREENSHOTS_DIR);

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    logger.debug('创建 Steam 缓存目录: %s', cacheDir);
  }
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  return cacheDir;
}

/**
 * 检查缓存图片状态
 */
function checkCacheStatus(storagePath: string, appid: string): SteamCacheImageStatus {
  const cacheDir = getSteamCacheDir(storagePath, appid);

  return {
    hasHeader: fs.existsSync(path.join(cacheDir, 'header.jpg')),
    hasCapsule: fs.existsSync(path.join(cacheDir, 'capsule.jpg')),
    hasBackground: fs.existsSync(path.join(cacheDir, 'background.jpg')),
    screenshotCount: fs.existsSync(path.join(cacheDir, SCREENSHOTS_DIR))
      ? fs.readdirSync(path.join(cacheDir, SCREENSHOTS_DIR))
          .filter(f => f.endsWith('.jpg')).length
      : 0
  };
}

/**
 * 保存图片到缓存
 */
function saveImageToCache(storagePath: string, appid: string, type: string, buffer: Buffer): void {
  ensureSteamCacheDir(storagePath, appid);
  const filePath = path.join(getSteamCacheDir(storagePath, appid), `${type}.jpg`);
  fs.writeFileSync(filePath, buffer);
  logger.debug('保存 Steam 缓存图片: %s', filePath);
}

/**
 * 保存截图到缓存
 */
function saveScreenshotToCache(storagePath: string, appid: string, index: number, buffer: Buffer): void {
  ensureSteamCacheDir(storagePath, appid);
  const filePath = path.join(getSteamCacheDir(storagePath, appid), SCREENSHOTS_DIR, `${index}.jpg`);
  fs.writeFileSync(filePath, buffer);
  logger.debug('保存 Steam 缓存截图: %s', filePath);
}

/**
 * 获取缓存图片路径（用于静态服务）
 */
function getCacheImagePath(storagePath: string, appid: string, type: string): string {
  return path.join(getSteamCacheDir(storagePath, appid), `${type}.jpg`);
}

/**
 * 获取截图路径
 */
function getScreenshotPath(storagePath: string, appid: string, index: number): string {
  return path.join(getSteamCacheDir(storagePath, appid), SCREENSHOTS_DIR, `${index}.jpg`);
}

/**
 * 删除缓存目录
 */
function deleteSteamCache(storagePath: string, appid: string): boolean {
  const cacheDir = getSteamCacheDir(storagePath, appid);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    logger.info('删除 Steam 缓存: %s', cacheDir);
    return true;
  }
  return false;
}

/**
 * 统计缓存大小
 */
function calculateCacheStats(storagePath: string, appids: string[]): SteamCacheStats {
  let totalPosters = 0;
  let totalScreenshots = 0;
  let totalSize = 0;

  for (const appid of appids) {
    const cacheDir = getSteamCacheDir(storagePath, appid);
    if (!fs.existsSync(cacheDir)) continue;

    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.endsWith('.jpg') && file !== SCREENSHOTS_DIR) {
        totalPosters++;
        const filePath = path.join(cacheDir, file);
        totalSize += fs.statSync(filePath).size;
      }
    }

    const screenshotsDir = path.join(cacheDir, SCREENSHOTS_DIR);
    if (fs.existsSync(screenshotsDir)) {
      const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.jpg'));
      totalScreenshots += screenshots.length;
      for (const ss of screenshots) {
        totalSize += fs.statSync(path.join(screenshotsDir, ss)).size;
      }
    }
  }

  return {
    totalEntries: appids.length,
    totalPosters,
    totalScreenshots,
    totalSizeMB: Math.round(totalSize / 1024 / 1024)
  };
}

/**
 * 下载图片
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('下载图片失败: %s (status %d)', url, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    const error = err as Error;
    logger.warn('下载图片失败: %s - %s', url, error.message);
    return null;
  }
}

export class SteamCacheService {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * 下载并保存所有图片到缓存
   */
  async downloadAllImages(appid: string, data: {
    header_image?: string;
    capsule_image?: string;
    background?: string;
    screenshots?: string[];
  }): Promise<void> {
    // 下载海报
    if (data.header_image) {
      const buffer = await downloadImage(data.header_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'header', buffer);
    }
    if (data.capsule_image) {
      const buffer = await downloadImage(data.capsule_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'capsule', buffer);
    }
    if (data.background) {
      const buffer = await downloadImage(data.background);
      if (buffer) saveImageToCache(this.storagePath, appid, 'background', buffer);
    }

    // 下载所有截图
    if (data.screenshots && data.screenshots.length > 0) {
      for (let i = 0; i < data.screenshots.length; i++) {
        const buffer = await downloadImage(data.screenshots[i]);
        if (buffer) saveScreenshotToCache(this.storagePath, appid, i + 1, buffer);
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * 增量下载缺失图片
   */
  async downloadMissingImages(appid: string, data: {
    header_image?: string;
    capsule_image?: string;
    background?: string;
    screenshots?: string[];
  }): Promise<void> {
    const status = checkCacheStatus(this.storagePath, appid);

    // 只下载缺失的
    if (!status.hasHeader && data.header_image) {
      const buffer = await downloadImage(data.header_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'header', buffer);
    }
    if (!status.hasCapsule && data.capsule_image) {
      const buffer = await downloadImage(data.capsule_image);
      if (buffer) saveImageToCache(this.storagePath, appid, 'capsule', buffer);
    }
    if (!status.hasBackground && data.background) {
      const buffer = await downloadImage(data.background);
      if (buffer) saveImageToCache(this.storagePath, appid, 'background', buffer);
    }

    // 增量下载新截图
    if (data.screenshots && data.screenshots.length > status.screenshotCount) {
      for (let i = status.screenshotCount; i < data.screenshots.length; i++) {
        const buffer = await downloadImage(data.screenshots[i]);
        if (buffer) saveScreenshotToCache(this.storagePath, appid, i + 1, buffer);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  checkStatus(appid: string): SteamCacheImageStatus {
    return checkCacheStatus(this.storagePath, appid);
  }

  deleteCache(appid: string): boolean {
    return deleteSteamCache(this.storagePath, appid);
  }

  getStats(appids: string[]): SteamCacheStats {
    return calculateCacheStats(this.storagePath, appids);
  }

  getImagePath(appid: string, type: string): string {
    return getCacheImagePath(this.storagePath, appid, type);
  }

  getScreenshotPath(appid: string, index: number): string {
    return getScreenshotPath(this.storagePath, appid, index);
  }
}

// 导出辅助函数
export {
  getSteamCacheRoot,
  getSteamCacheDir,
  ensureSteamCacheDir,
  checkCacheStatus,
  downloadImage
};