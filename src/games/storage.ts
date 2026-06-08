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

/**
 * Generate backup filename with timestamp
 * Format: {type}_{YYYYMMDD_HHMMSS}.jpg
 */
export function generateBackupFilename(type: PosterType): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `${type}_${timestamp}.jpg`;
}

/**
 * Get poster backup path
 */
export function getPosterBackupPath(basePath: string, gameId: number, backupFilename: string): string {
  return path.join(getPosterDir(basePath, gameId), backupFilename);
}

/**
 * Backup current poster before replacing
 * Returns the backup filename if successful, null if no poster to backup
 */
export function backupPoster(basePath: string, gameId: number, type: PosterType): string | null {
  const posterPath = getPosterPath(basePath, gameId, type);
  if (!fs.existsSync(posterPath)) {
    return null;
  }

  const backupFilename = generateBackupFilename(type);
  const backupPath = getPosterBackupPath(basePath, gameId, backupFilename);

  fs.renameSync(posterPath, backupPath);
  logger.info('Backed up poster: gameId=%d type=%s backup=%s', gameId, type, backupFilename);
  return backupFilename;
}

/**
 * List all backups for a poster type
 * Returns array of { filename, createdAt, size }
 */
export function listPosterBackups(basePath: string, gameId: number, type: PosterType): Array<{ filename: string; createdAt: string; size: number }> {
  const posterDir = getPosterDir(basePath, gameId);
  if (!fs.existsSync(posterDir)) {
    return [];
  }

  const files = fs.readdirSync(posterDir);
  const backupPrefix = type + '_';
  const backups: Array<{ filename: string; createdAt: string; size: number }> = [];

  for (const file of files) {
    if (file.startsWith(backupPrefix) && file.endsWith('.jpg')) {
      const filePath = path.join(posterDir, file);
      const stat = fs.statSync(filePath);

      // Parse timestamp from filename: {type}_{YYYYMMDD_HHMMSS}.jpg
      const timestampMatch = file.match(/_(\d{8}_\d{6})\.jpg$/);
      let createdAt = '';
      if (timestampMatch) {
        // Convert YYYYMMDD_HHMMSS to YYYY-MM-DD HH:MM:SS
        const ts = timestampMatch[1];
        createdAt = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
      }

      backups.push({
        filename: file,
        createdAt,
        size: stat.size
      });
    }
  }

  // Sort by creation time (newest first)
  backups.sort((a, b) => b.filename.localeCompare(a.filename));
  return backups;
}

/**
 * Restore a backup to be the current poster
 * Returns true if successful
 */
export function restorePosterBackup(basePath: string, gameId: number, type: PosterType, backupFilename: string): boolean {
  const backupPath = getPosterBackupPath(basePath, gameId, backupFilename);
  const posterPath = getPosterPath(basePath, gameId, type);

  if (!fs.existsSync(backupPath)) {
    logger.warn('Backup file not found: %s', backupFilename);
    return false;
  }

  // Backup current poster if exists
  if (fs.existsSync(posterPath)) {
    const newBackupFilename = generateBackupFilename(type);
    const newBackupPath = getPosterBackupPath(basePath, gameId, newBackupFilename);
    fs.renameSync(posterPath, newBackupPath);
    logger.info('Backed up current poster before restore: %s', newBackupFilename);
  }

  // Move backup to be current poster
  fs.renameSync(backupPath, posterPath);
  logger.info('Restored poster backup: gameId=%d type=%s backup=%s', gameId, type, backupFilename);
  return true;
}

/**
 * Delete a backup file
 */
export function deletePosterBackup(basePath: string, gameId: number, backupFilename: string): boolean {
  const backupPath = getPosterBackupPath(basePath, gameId, backupFilename);
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
    logger.info('Deleted poster backup: %s', backupFilename);
    return true;
  }
  return false;
}

/**
 * Clean up old backups, keep only maxBackups newest ones
 * Returns number of deleted backups
 */
export function cleanupOldBackups(basePath: string, gameId: number, type: PosterType, maxBackups: number): number {
  const backups = listPosterBackups(basePath, gameId, type);
  if (backups.length <= maxBackups) {
    return 0;
  }

  const toDelete = backups.slice(maxBackups);
  let deleted = 0;
  for (const backup of toDelete) {
    if (deletePosterBackup(basePath, gameId, backup.filename)) {
      deleted++;
    }
  }

  if (deleted > 0) {
    logger.info('Cleaned up %d old backups for gameId=%d type=%s', deleted, gameId, type);
  }
  return deleted;
}
