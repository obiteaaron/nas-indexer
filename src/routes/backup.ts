/**
 * Backup API routes
 */

import express, { Router, Request, Response } from 'express';
import { BackupService, RestoreOptions } from '../games/backup-service';
import { initDatabase, loadConfig, getStoragePath } from '../utils';
import { logger } from '../logger';

const router: Router = express.Router();

async function getBackupService(): Promise<BackupService> {
  await initDatabase();
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  return new BackupService(storagePath);
}

/**
 * List all backups
 */
router.get('/list', async (_req: Request, res: Response): Promise<void> => {
  try {
    const service = await getBackupService();
    const backups = service.listBackups();
    
    res.json({ success: true, data: backups });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to list backups: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create backup
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  const name = req.body.name as string | undefined;
  
  try {
    const service = await getBackupService();
    const filename = await service.createBackup(name);
    
    res.json({ success: true, data: { filename } });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to create backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Restore backup
 */
router.post('/:filename/restore', async (req: Request, res: Response): Promise<void> => {
  const filename = req.params.filename as string;
  const mode = (req.body.mode || 'merge') as 'merge' | 'overwrite';
  
  if (!filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: 'Invalid backup filename' });
    return;
  }
  
  try {
    const service = await getBackupService();
    service.restoreBackup(filename, { mode } as RestoreOptions);
    
    res.json({ success: true, data: { filename, mode } });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to restore backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete backup
 */
router.delete('/:filename', async (req: Request, res: Response): Promise<void> => {
  const filename = req.params.filename as string;
  
  if (!filename.endsWith('.zip')) {
    res.status(400).json({ success: false, error: 'Invalid backup filename' });
    return;
  }
  
  try {
    const service = await getBackupService();
    const deleted = service.deleteBackup(filename);
    
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Backup not found' });
      return;
    }
    
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to delete backup: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
