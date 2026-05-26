import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { formatSize } from '../scanner';
import { initDatabase, loadConfig } from '../utils';
import type { Config, Recommendation, PreferencesData } from '../types';

const router: Router = express.Router();

// 获取偏好分析
router.get('/preferences', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const config: Config = loadConfig();
    const trackingEnabled: boolean = config.trackingConfig?.trackingEnabled ?? true;
    if (!trackingEnabled) {
      res.json({ success: true, data: { enabled: false, categories: [], tags: [], keywords: [] } });
      return;
    }
    const prefs: PreferencesData = database.calculatePreferences();
    res.json({ success: true, data: { enabled: true, ...prefs } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清除偏好数据
router.post('/preferences/clear', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    database.clearPreferencesData();
    res.json({ success: true, message: '偏好数据已清除' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取推荐列表
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const type: string | null = (req.query.type as string) || null;
    const limit: number = parseInt(req.query.limit as string) || 20;
    const recs: Recommendation[] = database.getRecommendations(type, limit);
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 生成推荐
router.post('/generate', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const recs: Recommendation[] = database.generateRecommendations();
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted, message: '推荐已生成' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;