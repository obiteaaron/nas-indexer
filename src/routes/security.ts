// src/routes/security.ts

import express, { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../utils';
import { generateToken } from '../auth';
import { logger } from '../logger';
import type { Config } from '../types/config';
import { DEFAULT_SECURITY_CONFIG } from '../types/security';

const router: Router = express.Router();

/**
 * 重新生成 API Token
 * POST /api/security/token/regenerate
 */
router.post('/token/regenerate', (req: Request, res: Response): void => {
  try {
    const config: Config = loadConfig();
    const newToken = generateToken();

    // 更新 Token
    if (config.security) {
      config.security.token = newToken;
    } else {
      config.security = {
        ...DEFAULT_SECURITY_CONFIG,
        token: newToken
      };
    }

    saveConfig(config);

    logger.info('🔐 API Token 已重新生成: %s', newToken);
    logger.warn('   请更新浏览器访问 URL');

    // 返回新 Token（仅此一次，用户需记录）
    res.json({
      success: true,
      data: {
        token: newToken,
        message: 'Token 已重新生成，请保存此 Token。后续需通过 URL 参数访问。'
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;