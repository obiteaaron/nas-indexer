import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { streamFile, serveImage, servePdf, getPreviewType } from '../stream';
import { initDatabase } from '../utils';
import type { File } from '../types';

const router: Router = express.Router();

// 获取预览信息
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const previewType: string = getPreviewType(file.ext || '');
    res.json({
      success: true,
      data: {
        path: file.path,
        name: file.name,
        ext: file.ext,
        previewType,
        previewUrl: `/api/preview/stream/${file.id}`
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 流式传输文件
router.get('/stream/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const previewType: string = getPreviewType(file.ext || '');

    if (previewType === 'image') {
      serveImage(res, file.path);
    } else if (previewType === 'pdf') {
      servePdf(res, file.path);
    } else {
      streamFile(req, res, file.path);
    }
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;