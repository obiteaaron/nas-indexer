// src/auth/token-generator.ts

import crypto from 'crypto';

/**
 * 生成随机 API Token
 * 使用 crypto.randomBytes 生成 32 字节，转为 Base64 后取前 40 字符
 * 移除特殊字符 +/= 便于复制
 */
export function generateToken(): string {
  return crypto.randomBytes(32)
    .toString('base64')
    .replace(/[+/=]/g, '')  // 移除特殊字符
    .slice(0, 40);          // 取前 40 字符
}