import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { formatSize } from '../scanner';
import type { File, FileView } from '../types';

const router: Router = express.Router();

let dbInitialized: boolean = false;

async function ensureDb(): Promise<void> {
  if (!dbInitialized) {
    await database.init();
    dbInitialized = true;
  }
}

// Search History
router.get('/search-history', async (_req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    const history: string[] = database.getSearchHistory(10);
    res.json({ success: true, data: history });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/search-history', async (_req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    database.clearSearchHistory();
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// Behavior Tracking
router.post('/view', async (req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    const { fileId, playDuration } = req.body;
    if (!fileId) {
      res.status(400).json({ success: false, error: '请提供文件ID' });
      return;
    }
    const file: File | null = database.getFileById(parseInt(fileId));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    database.recordFileView(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    const { fileId, playDuration } = req.body;
    if (!fileId) {
      res.status(400).json({ success: false, error: '请提供文件ID' });
      return;
    }
    const file: File | null = database.getFileById(parseInt(fileId));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    database.recordFilePreview(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/action', async (req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    const { fileId, actionType, tagId, ...extraData } = req.body;
    if (!actionType) {
      res.status(400).json({ success: false, error: '请提供操作类型' });
      return;
    }
    if (actionType !== 'search') {
      const file: File | null = database.getFileById(parseInt(fileId));
      if (!file) {
        res.status(404).json({ success: false, error: '文件不存在' });
        return;
      }
    }
    database.recordUserAction(actionType, { file_id: fileId || null, tag_id: tagId, ...extraData });
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/views', async (req: Request, res: Response): Promise<void> => {
  await ensureDb();
  try {
    const limit: number = parseInt(req.query.limit as string) || 50;
    const views: FileView[] = database.getFileViews(limit);
    const formatted = views.map(v => ({
      ...v,
      sizeFormatted: formatSize(v.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;