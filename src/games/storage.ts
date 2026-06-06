import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

const GAMES_DIR = 'games';
const POSTERS_DIR = 'posters';
const BACKUPS_DIR = 'backups';

const POSTER_TYPES = ['horizontal', 'vertical', 'banner', 'background', 'custom'] as const;
type PosterType = typeof POSTER_TYPES[number];

/**
 * Ensure games directory structure exists
 */
export function ensureGamesDirs(basePath: string): void {
  const dirs = [
    path.join(basePath, GAMES_DIR, POSTERS_DIR),
    path.join(basePath, GAMES_DIR, BACKUPS_DIR),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created directory: %s', dir);
    }
  }
}

/**
 * Get poster directory for a game
 */
export function getPosterDir(basePath: string, gameId: number): string {
  return path.join(basePath, GAMES_DIR, POSTERS_DIR, String(gameId));
}

/**
 * Get poster file path
 */
export function getPosterPath(basePath: string, gameId: number, type: PosterType): string {
  const filename = type + '.jpg';
  return path.join(getPosterDir(basePath, gameId), filename);
}

/**
 * Get backup directory
 */
export function getBackupDir(basePath: string): string {
  return path.join(basePath, GAMES_DIR, BACKUPS_DIR);
}

/**
 * Ensure poster directory exists for a game
 */
export function ensurePosterDir(basePath: string, gameId: number): string {
  const posterDir = getPosterDir(basePath, gameId);
  if (!fs.existsSync(posterDir)) {
    fs.mkdirSync(posterDir, { recursive: true });
    logger.debug('Created poster directory: %s', posterDir);
  }
  return posterDir;
}

/**
 * Check if poster exists
 */
export function hasPoster(basePath: string, gameId: number, type: PosterType): boolean {
  const posterPath = getPosterPath(basePath, gameId, type);
  return fs.existsSync(posterPath);
}

/**
 * List all poster files for a game
 */
export function listGamePosters(basePath: string, gameId: number): PosterType[] {
  const posterDir = getPosterDir(basePath, gameId);
  if (!fs.existsSync(posterDir)) {
    return [];
  }

  const files = fs.readdirSync(posterDir);
  return POSTER_TYPES.filter(type => {
    const filename = type + '.jpg';
    return files.some(f => f === filename);
  });
}
