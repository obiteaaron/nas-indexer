import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { getPosterDir, getPosterPath, ensurePosterDir } from './storage';

export type PosterType = 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom';

export class PosterService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Get poster file path
   */
  getPosterPath(gameId: number, type: PosterType): string {
    return getPosterPath(this.basePath, gameId, type);
  }

  /**
   * Save poster from URL (download)
   */
  async saveFromUrl(gameId: number, type: PosterType, url: string): Promise<void> {
    ensurePosterDir(this.basePath, gameId);
    const destPath = this.getPosterPath(gameId, type);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('HTTP error: ' + response.status);
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
      logger.info('Saved poster from URL: gameId=%d type=%s path=%s', gameId, type, destPath);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to download poster: %s', error.message);
      throw error;
    }
  }

  /**
   * Save poster from local file (upload)
   */
  saveFromFile(gameId: number, type: PosterType, srcPath: string): void {
    ensurePosterDir(this.basePath, gameId);
    const destPath = this.getPosterPath(gameId, type);

    if (!fs.existsSync(srcPath)) {
      throw new Error('Source file not found: ' + srcPath);
    }

    fs.copyFileSync(srcPath, destPath);
    logger.info('Saved poster from file: gameId=%d type=%s', gameId, type);
  }

  /**
   * Save poster from buffer (upload)
   */
  saveFromBuffer(gameId: number, type: PosterType, buffer: Buffer): void {
    ensurePosterDir(this.basePath, gameId);
    const destPath = this.getPosterPath(gameId, type);
    fs.writeFileSync(destPath, buffer);
    logger.info('Saved poster from buffer: gameId=%d type=%s', gameId, type);
  }

  /**
   * Delete single poster
   */
  deletePoster(gameId: number, type: PosterType): boolean {
    const posterPath = this.getPosterPath(gameId, type);

    if (fs.existsSync(posterPath)) {
      fs.unlinkSync(posterPath);
      logger.info('Deleted poster: gameId=%d type=%s', gameId, type);

      // Clean up empty directory
      const posterDir = getPosterDir(this.basePath, gameId);
      if (fs.existsSync(posterDir)) {
        const files = fs.readdirSync(posterDir);
        if (files.length === 0) {
          fs.rmSync(posterDir, { recursive: true });
          logger.debug('Removed empty poster directory: gameId=%d', gameId);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Delete all posters for a game
   */
  deleteAllPosters(gameId: number): boolean {
    const posterDir = getPosterDir(this.basePath, gameId);

    if (fs.existsSync(posterDir)) {
      fs.rmSync(posterDir, { recursive: true, force: true });
      logger.info('Deleted all posters: gameId=%d', gameId);
      return true;
    }
    return false;
  }

  /**
   * Clean up orphaned posters (game deleted but posters remain)
   */
  cleanupOrphanedPosters(existingGameIds: number[]): number {
    const postersRoot = path.join(this.basePath, 'games', 'posters');
    if (!fs.existsSync(postersRoot)) {
      return 0;
    }

    let cleaned = 0;
    const dirs = fs.readdirSync(postersRoot);

    for (const dir of dirs) {
      const gameId = parseInt(dir, 10);
      if (!isNaN(gameId) && !existingGameIds.includes(gameId)) {
        const dirPath = path.join(postersRoot, dir);
        fs.rmSync(dirPath, { recursive: true, force: true });
        cleaned++;
        logger.info('Cleaned orphaned poster: gameId=%d', gameId);
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned %d orphaned poster directories', cleaned);
    }
    return cleaned;
  }
}
