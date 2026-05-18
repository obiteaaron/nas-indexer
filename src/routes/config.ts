import express, { Router, Request, Response } from 'express';
import { loadConfig, saveConfig, getStoragePath } from '../utils';
import type { Config } from '../types';

const router: Router = express.Router();

// 获取配置
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新配置
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const newConfig: Partial<Config> = req.body;
    const config: Config = loadConfig();
    const updatedConfig: Config = { ...config, ...newConfig };
    saveConfig(updatedConfig);
    res.json({ success: true, data: updatedConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取完整配置（包含默认值）
router.get('/full', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取存储路径
router.get('/storage/path', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    const storagePath: string = getStoragePath(config);
    res.json({ success: true, data: { storagePath } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;