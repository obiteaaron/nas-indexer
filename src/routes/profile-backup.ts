/**
 * Profile Backup API routes
 * 备份 profiles 目录为 zip 文件
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
// archiver v8 改变了导出方式，直接导出类而非函数
import { ZipArchive } from 'archiver';
import { PROJECT_ROOT, loadConfig, getStoragePath } from '../utils';
import { logger } from '../logger';

const router: Router = express.Router();

// 备份目录：项目根目录下的 .backup/
const BACKUP_DIR = path.join(PROJECT_ROOT, '.backup');

// 确保备份目录存在
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    logger.info('Created backup directory: %s', BACKUP_DIR);
  }
}

// 获取 profiles 目录路径
function getProfilesPath(): string {
  const config = loadConfig();
  return getStoragePath(config);
}

// 格式化日期时间：YYYYMMDD_HHMMSS
function formatTimestamp(): string {
  const now = new Date();
  return now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * 创建备份
 */
router.post('/create', async (_req: Request, res: Response): Promise<void> => {
  try {
    ensureBackupDir();
    const profilesPath = getProfilesPath();

    if (!fs.existsSync(profilesPath)) {
      res.status(400).json({ success: false, error: 'profiles 目录不存在' });
      return;
    }

    const timestamp = formatTimestamp();
    const filename = `profiles_backup_${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, filename);

    // 使用 archiver 创建 zip
    const output = fs.createWriteStream(backupPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => {
        logger.info('Backup created: %s (%s)', filename, formatFileSize(archive.pointer()));
        resolve();
      });

      archive.on('error', (err) => {
        logger.error('Backup failed: %s', err.message);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(profilesPath, 'profiles');
      archive.finalize();
    });

    const stat = fs.statSync(backupPath);
    res.json({
      success: true,
      data: {
        filename,
        size: stat.size,
        createdAt: stat.birthtime.toISOString()
      }
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to create backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取备份列表
 */
router.get('/list', async (_req: Request, res: Response): Promise<void> => {
  try {
    ensureBackupDir();

    const files = fs.readdirSync(BACKUP_DIR);
    const backups: Array<{ filename: string; size: number; createdAt: string }> = [];

    for (const file of files) {
      if (!file.startsWith('profiles_backup_') || !file.endsWith('.zip')) continue;

      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);

      backups.push({
        filename: file,
        size: stat.size,
        createdAt: stat.birthtime.toISOString()
      });
    }

    // 按创建时间降序排列
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ success: true, data: backups });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to list backups: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 下载备份
 */
router.get('/download/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = String(req.params.filename);

  if (!filename.startsWith('profiles_backup_') || !filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: '无效的备份文件名' });
    return;
  }

  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '备份文件不存在' });
    return;
  }

  res.download(filePath, filename);
});

/**
 * 删除备份
 */
router.post('/delete/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = String(req.params.filename);

  if (!filename.startsWith('profiles_backup_') || !filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: '无效的备份文件名' });
    return;
  }

  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '备份文件不存在' });
    return;
  }

  try {
    fs.unlinkSync(filePath);
    logger.info('Backup deleted: %s', filename);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to delete backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;