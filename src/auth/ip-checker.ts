// src/auth/ip-checker.ts

import ipaddr from 'ipaddr.js';
import type { Request } from 'express';

/**
 * 判断是否为本地回环地址
 */
export function isLocalIP(ip: string): boolean {
  // 处理 IPv6 映射的 IPv4 地址
  const normalizedIP = normalizeIP(ip);
  return normalizedIP === '127.0.0.1' ||
         normalizedIP === '::1' ||
         normalizedIP.startsWith('127.');
}

/**
 * 规范化 IP 地址（处理 IPv6 映射）
 */
function normalizeIP(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);  // 去掉 ::ffff: 前缀
  }
  return ip;
}

/**
 * 检查 IP 是否在白名单中（支持 CIDR）
 */
export function isIPAllowed(clientIP: string, whitelist: string[]): boolean {
  // 本地回环地址始终允许
  if (isLocalIP(clientIP)) {
    return true;
  }

  const normalizedClientIP = normalizeIP(clientIP);

  try {
    const addr = ipaddr.parse(normalizedClientIP);

    for (const entry of whitelist) {
      const normalizedEntry = normalizeIP(entry);

      if (normalizedEntry.includes('/')) {
        // CIDR 格式：192.168.1.0/24
        try {
          const cidr = ipaddr.parseCIDR(normalizedEntry);
          // 检查 IP 类型是否匹配
          if (addr.kind() === cidr[0].kind()) {
            // 使用正确的 match 调用方式
            if ((addr as any).match(cidr as any)) {
              return true;
            }
          }
        } catch {
          // CIDR 解析失败，跳过此条目
          continue;
        }
      } else {
        // 单个 IP
        if (normalizedClientIP === normalizedEntry) {
          return true;
        }
      }
    }
  } catch {
    // IP 解析失败
    return false;
  }

  return false;
}

/**
 * 从 Express Request 获取客户端真实 IP
 * 考虑反向代理场景（X-Forwarded-For, X-Real-IP）
 */
export function getClientIP(req: Request): string {
  // 优先从代理头获取
  const forwarded = req.headers['x-forwarded-for'] as string;
  if (forwarded) {
    // X-Forwarded-For 可能包含多个 IP，取第一个
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers['x-real-ip'] as string;
  if (realIP) {
    return realIP;
  }

  // 直接连接，使用 req.ip 或 socket 地址
  // Express trust proxy 设置会影响 req.ip
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}