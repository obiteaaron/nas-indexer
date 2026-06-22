// src/auth/index.ts

import type { SecurityConfig } from '../types/security';
import { DEFAULT_SECURITY_CONFIG } from '../types/security';
import { generateToken } from './token-generator';
import { loadConfig, saveConfig } from '../utils';
import { logger } from '../logger';

// 导出子模块
export { authMiddleware, isAuthenticated } from './middleware';
export { generateToken } from './token-generator';
export { isIPAllowed, getClientIP, isLocalIP } from './ip-checker';

/**
 * 加载安全配置
 */
export function loadSecurityConfig(): SecurityConfig {
  const config = loadConfig();

  // 合并默认值
  const security: SecurityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
    ...(config.security || {})
  };

  return security;
}

/**
 * 保存安全配置
 */
export function saveSecurityConfig(security: SecurityConfig): void {
  const config = loadConfig();
  config.security = security;
  saveConfig(config);
}

/**
 * 初始化安全配置
 * - Token 为空时自动生成
 * - IP 白名单确保包含本地地址
 */
export function initSecurityConfig(security: SecurityConfig): SecurityConfig {
  const result = { ...security };

  // Token 为空时自动生成
  if (!result.token || result.token.trim() === '') {
    result.token = generateToken();
    logger.info('🔐 已自动生成 API Token: %s', result.token);
  }

  // 确保 IP 白名单包含本地地址
  if (!result.ipWhitelist.includes('127.0.0.1')) {
    result.ipWhitelist.push('127.0.0.1');
  }

  return result;
}

/**
 * 获取有效的绑定地址
 * 环境变量优先
 */
export function getBindAddress(security: SecurityConfig): string {
  return process.env.NAS_INDEXER_BIND || security.bindAddress || '127.0.0.1';
}

/**
 * 获取有效的 Token
 * 环境变量优先
 */
export function getEffectiveToken(security: SecurityConfig): string {
  return process.env.NAS_INDEXER_TOKEN || security.token || '';
}