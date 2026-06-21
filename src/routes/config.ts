import express, { Router, Request, Response } from 'express';
import { loadConfig, saveConfig, getStoragePath } from '../utils';
import { initProxy } from '../games/scraper';
import type { Config } from '../types';

const router: Router = express.Router();

/**
 * 安全处理配置中的 Token（隐藏完整值）
 */
function sanitizeConfigToken(config: Config): Partial<Config> {
  return {
    ...config,
    security: config.security ? {
      enabled: config.security.enabled,
      bindAddress: config.security.bindAddress,
      ipWhitelist: config.security.ipWhitelist,
      // Token 仅显示前 8 位
      token: config.security.token
        ? config.security.token.slice(0, 8) + '...'
        : null,
      tokenSet: !!config.security.token  // 标记是否已设置
    } : undefined
  };
}

// 获取配置
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    // 安全处理：隐藏完整 Token
    const safeConfig = sanitizeConfigToken(config);
    res.json({ success: true, data: safeConfig });
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

    // 安全处理：不允许通过 POST 更新 Token
    if (newConfig.security) {
      // 保持原有 Token，忽略用户传入的 token
      newConfig.security.token = config.security?.token;

      // 确保 IP 白名单包含本地地址
      if (newConfig.security.ipWhitelist &&
          !newConfig.security.ipWhitelist.includes('127.0.0.1')) {
        newConfig.security.ipWhitelist.push('127.0.0.1');
      }
    }

    const updatedConfig: Config = { ...config, ...newConfig };
    saveConfig(updatedConfig);

    // 如果代理配置变更，重新初始化
    if (newConfig.proxyUrl !== undefined) {
      initProxy();
    }

    // 返回时隐藏完整 Token
    const safeConfig = sanitizeConfigToken(updatedConfig);

    res.json({ success: true, data: safeConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取完整配置（包含默认值）
router.get('/full', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    // 安全处理：隐藏完整 Token
    const safeConfig = sanitizeConfigToken(config);
    res.json({ success: true, data: safeConfig });
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