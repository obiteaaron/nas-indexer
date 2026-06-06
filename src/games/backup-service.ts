import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { logger } from '../logger';
import { getBackupDir } from './storage';
import { database } from '../database';


export interface BackupInfo {
  filename: string;
  createdAt: string;
  fileSize: number;
}

export interface BackupMetadata {
  version: string;
  created_at: string;
  game_count: number;
  poster_count: number;
}

export interface RestoreOptions {
  mode: 'merge' | 'overwrite';
}

export class BackupService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Get backup file path
   */
  getBackupPath(filename: string): string {
    return path.join(getBackupDir(this.basePath), filename);
  }

  /**
   * List all backup files
   */
  listBackups(): BackupInfo[] {
    const backupDir = getBackupDir(this.basePath);
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const backups: BackupInfo[] = [];
    const files = fs.readdirSync(backupDir);

    for (const file of files) {
      if (!file.endsWith('.zip')) continue;

      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);

      backups.push({
        filename: file,
        createdAt: stat.mtime.toISOString(),
        fileSize: stat.size
      });
    }

    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Create backup (games.json + posters + groups.json)
   */
  async createBackup(name?: string): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = name ? name + '-' + timestamp + '.zip' : 'backup-' + timestamp + '.zip';
    const backupPath = this.getBackupPath(filename);

    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        logger.info('Backup created: %s (%d bytes)', backupPath, archive.pointer());
        resolve(filename);
      });

      archive.on('error', (err) => {
        logger.error('Backup failed: %s', err.message);
        reject(err);
      });

      archive.pipe(output);

      // Add games.json (export from database)
      const gamesData = database.db!.exec('SELECT * FROM games');
      const gamesJson = JSON.stringify({
        columns: gamesData[0]?.columns || [],
        values: gamesData[0]?.values || []
      }, null, 2);
      archive.append(gamesJson, { name: 'games.json' });

      // Add game_groups.json
      const groupsData = database.db!.exec('SELECT * FROM game_groups');
      const groupsJson = JSON.stringify({
        columns: groupsData[0]?.columns || [],
        values: groupsData[0]?.values || []
      }, null, 2);
      archive.append(groupsJson, { name: 'groups.json' });

      // Add posters directory
      const postersDir = path.join(this.basePath, 'games', 'posters');
      if (fs.existsSync(postersDir)) {
        archive.directory(postersDir, 'posters');
      }

      // Add metadata.json
      const posterCount = this.countPosters();
      const metadata: BackupMetadata = {
        version: '1.6.0',
        created_at: new Date().toISOString(),
        game_count: gamesData[0]?.values.length || 0,
        poster_count: posterCount
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      archive.finalize();
    });
  }

  /**
   * Restore from backup
   */
  restoreBackup(filename: string, options: RestoreOptions): void {
    const backupPath = this.getBackupPath(filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found: ' + filename);
    }

    const zip = new AdmZip(backupPath);
    const tempDir = path.join(this.basePath, 'games', 'temp-restore');

    // Extract to temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    zip.extractAllTo(tempDir, true);

    try {
      // Read games.json
      const gamesJsonPath = path.join(tempDir, 'games.json');
      if (!fs.existsSync(gamesJsonPath)) {
        throw new Error('games.json not found in backup');
      }

      const gamesData = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8'));

      if (options.mode === 'overwrite') {
        // Clear existing data
        database.db!.run('DELETE FROM games');
        database.db!.run('DELETE FROM game_groups');
      }

      // Insert games
      if (gamesData.columns && gamesData.values) {
        for (const row of gamesData.values) {
          const game = this.rowToObject(gamesData.columns, row);
          const existing = database.db!.exec('SELECT id FROM games WHERE source_path = ?', [game.source_path]);

          if (existing[0]?.values.length === 0 || options.mode === 'overwrite') {
            // Insert new game
            this.insertGame(game);
          }
          // Skip if merge mode and game already exists
        }
      }

      // Read groups.json
      const groupsJsonPath = path.join(tempDir, 'groups.json');
      if (fs.existsSync(groupsJsonPath)) {
        const groupsData = JSON.parse(fs.readFileSync(groupsJsonPath, 'utf8'));
        if (groupsData.columns && groupsData.values) {
          for (const row of groupsData.values) {
            const group = this.rowToObject(groupsData.columns, row);
            this.insertGroup(group);
          }
        }
      }

      // Restore posters
      const postersBackupDir = path.join(tempDir, 'posters');
      if (fs.existsSync(postersBackupDir)) {
        const postersTargetDir = path.join(this.basePath, 'games', 'posters');
        if (!fs.existsSync(postersTargetDir)) {
          fs.mkdirSync(postersTargetDir, { recursive: true });
        }

        // Copy poster directories
        const gameDirs = fs.readdirSync(postersBackupDir);
        for (const gameId of gameDirs) {
          const srcDir = path.join(postersBackupDir, gameId);
          const targetDir = path.join(postersTargetDir, gameId);

          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.cpSync(srcDir, targetDir, { recursive: true });
        }
      }

      logger.info('Backup restored: %s (mode=%s)', filename, options.mode);
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Delete backup file
   */
  deleteBackup(filename: string): boolean {
    const backupPath = this.getBackupPath(filename);

    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      logger.info('Backup deleted: %s', filename);
      return true;
    }
    return false;
  }

  /**
   * Cleanup old backups (keep only recent N)
   */
  cleanupOldBackups(maxCount: number): number {
    const backups = this.listBackups();

    if (backups.length <= maxCount) {
      return 0;
    }

    const toDelete = backups.slice(maxCount);
    let deleted = 0;

    for (const backup of toDelete) {
      if (this.deleteBackup(backup.filename)) {
        deleted++;
      }
    }

    logger.info('Cleaned %d old backups (kept %d)', deleted, maxCount);
    return deleted;
  }

  // Private helper methods

  private countPosters(): number {
    const postersDir = path.join(this.basePath, 'games', 'posters');
    if (!fs.existsSync(postersDir)) {
      return 0;
    }

    let count = 0;
    const gameDirs = fs.readdirSync(postersDir);

    for (const gameId of gameDirs) {
      const posterDir = path.join(postersDir, gameId);
      if (fs.statSync(posterDir).isDirectory()) {
        const files = fs.readdirSync(posterDir);
        count += files.filter(f => f.endsWith('.jpg')).length;
      }
    }

    return count;
  }

  private rowToObject(columns: string[], values: unknown[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = values[i];
    }
    return obj;
  }

  private insertGame(game: Record<string, unknown>): void {
    const columns = Object.keys(game).join(', ');
    const placeholders = Object.keys(game).map(() => '?').join(', ');
    const values = Object.values(game);

    database.db!.run(
      'INSERT INTO games (' + columns + ') VALUES (' + placeholders + ')',
      values as unknown[]
    );
  }

  private insertGroup(group: Record<string, unknown>): void {
    const existing = database.db!.exec('SELECT id FROM game_groups WHERE id = ?', [group.id]);
    if (existing[0]?.values.length === 0) {
      const columns = Object.keys(group).join(', ');
      const placeholders = Object.keys(group).map(() => '?').join(', ');
      const values = Object.values(group);

      database.db!.run(
        'INSERT INTO game_groups (' + columns + ') VALUES (' + placeholders + ')',
        values as unknown[]
      );
    }
  }
}
