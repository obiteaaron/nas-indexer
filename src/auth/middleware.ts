// src/auth/middleware.ts

import type { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../utils';
import { DEFAULT_SECURITY_CONFIG } from '../types/security';
import { isIPAllowed, getClientIP } from './ip-checker';
import type { SecurityConfig } from '../types/security';

/**
 * 加载安全配置（用于中间件）
 */
function getSecurityConfig(): SecurityConfig {
  const config = loadConfig();
  return {
    ...DEFAULT_SECURITY_CONFIG,
    ...(config.security || {})
  };
}

/**
 * 从请求中提取 Token
 * 支持三种方式：
 * 1. Authorization: Bearer <token>
 * 2. X-API-Token: <token>
 * 3. URL query parameter ?token=<token>
 */
function extractToken(req: Request): string | null {
  // 方式 1: Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 方式 2: X-API-Token header
  const apiToken = req.headers['x-api-token'] as string;
  if (apiToken) {
    return apiToken;
  }

  // 方式 3: URL query parameter（用于 SSE/WebSocket）
  const queryToken = req.query.token as string;
  if (queryToken) {
    return queryToken;
  }

  return null;
}

/**
 * Express 认证中间件
 * 执行两层验证：
 * 1. IP 白名单检查 - 限制谁可以连接
 * 2. Token 验证 - 验证请求合法性
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getSecurityConfig();

  // 检查认证是否启用
  if (!config.enabled) {
    return next();
  }

  // 环境变量可禁用认证（调试用）
  if (process.env.NAS_INDEXER_NO_AUTH === 'true') {
    return next();
  }

  // 第一层：IP 白名单检查
  const clientIP = getClientIP(req);
  if (!isIPAllowed(clientIP, config.ipWhitelist)) {
    return res.status(403).json({
      success: false,
      error: 'IP not allowed',
      code: 'IP_FORBIDDEN'
    });
  }

  // 第二层：Token 验证
  const token = extractToken(req);
  // 环境变量优先，其次是配置文件
  const expectedToken = process.env.NAS_INDEXER_TOKEN || config.token;

  if (!token || token !== expectedToken) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing token',
      code: 'AUTH_FAILED'
    });
  }

  next();
}

/**
 * 判断请求是否已认证（用于路由守卫等场景）
 */
export function isAuthenticated(req: Request): boolean {
  const config = getSecurityConfig();

  if (!config.enabled || process.env.NAS_INDEXER_NO_AUTH === 'true') {
    return true;
  }

  const clientIP = getClientIP(req);
  if (!isIPAllowed(clientIP, config.ipWhitelist)) {
    return false;
  }

  const token = extractToken(req);
  const expectedToken = process.env.NAS_INDEXER_TOKEN || config.token;

  return token === expectedToken;
}