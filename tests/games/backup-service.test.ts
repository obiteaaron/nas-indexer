import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { BackupService } from '../../src/games/backup-service';
import { ensureGamesDirs, getBackupDir } from '../../src/games/storage';

describe('BackupService', () => {
  const testBase = path.join(process.cwd(), 'test-temp-backup');
  let service: BackupService;

  beforeEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testBase, { recursive: true });
    ensureGamesDirs(testBase);
    service = new BackupService(testBase);
  });

  afterEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
  });

  test('getBackupPath returns correct path', () => {
    const backupPath = service.getBackupPath('test-backup.zip');
    expect(backupPath).toBe(path.join(testBase, 'games', 'backups', 'test-backup.zip'));
  });

  test('listBackups returns empty array when no backups', () => {
    const backups = service.listBackups();
    expect(backups).toEqual([]);
  });

  test('listBackups returns all backup files', () => {
    const backupDir = getBackupDir(testBase);
    
    fs.writeFileSync(path.join(backupDir, 'backup-2026-01-01.zip'), 'data1');
    fs.writeFileSync(path.join(backupDir, 'backup-2026-01-02.zip'), 'data2');
    fs.writeFileSync(path.join(backupDir, 'backup-2026-01-03.zip'), 'data3');

    const backups = service.listBackups();
    expect(backups.length).toBe(3);
    
    // All files should be present (order depends on filesystem mtime)
    const filenames = backups.map(b => b.filename);
    expect(filenames).toContain('backup-2026-01-01.zip');
    expect(filenames).toContain('backup-2026-01-02.zip');
    expect(filenames).toContain('backup-2026-01-03.zip');
  });

  test('listBackups ignores non-zip files', () => {
    const backupDir = getBackupDir(testBase);
    fs.writeFileSync(path.join(backupDir, 'backup.zip'), 'data');
    fs.writeFileSync(path.join(backupDir, 'readme.txt'), 'text');

    const backups = service.listBackups();
    expect(backups.length).toBe(1);
    expect(backups[0].filename).toBe('backup.zip');
  });

  test('deleteBackup removes file', () => {
    const backupDir = getBackupDir(testBase);
    fs.writeFileSync(path.join(backupDir, 'test-delete.zip'), 'data');

    const result = service.deleteBackup('test-delete.zip');

    expect(result).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'test-delete.zip'))).toBe(false);
  });

  test('deleteBackup returns false when file not exists', () => {
    const result = service.deleteBackup('nonexistent.zip');
    expect(result).toBe(false);
  });

  test('cleanupOldBackups removes excess backups', () => {
    const backupDir = getBackupDir(testBase);
    
    for (let i = 1; i <= 5; i++) {
      const filename = 'backup-2026-01-0' + i + '.zip';
      const content = 'data' + i;
      fs.writeFileSync(path.join(backupDir, filename), content);
    }

    const deletedCount = service.cleanupOldBackups(3);

    expect(deletedCount).toBe(2);
    const backups = service.listBackups();
    expect(backups.length).toBe(3);
  });

  test('cleanupOldBackups returns 0 when backups count is less than max', () => {
    const backupDir = getBackupDir(testBase);
    fs.writeFileSync(path.join(backupDir, 'backup.zip'), 'data');

    const deletedCount = service.cleanupOldBackups(5);
    expect(deletedCount).toBe(0);
  });

  test('BackupInfo contains correct metadata', () => {
    const backupDir = getBackupDir(testBase);
    const filePath = path.join(backupDir, 'test-info.zip');
    fs.writeFileSync(filePath, 'test-content');

    const backups = service.listBackups();
    expect(backups.length).toBe(1);
    
    const backup = backups[0];
    expect(backup.filename).toBe('test-info.zip');
    expect(backup.fileSize).toBe(12);
    expect(backup.createdAt).toBeDefined();
  });
});