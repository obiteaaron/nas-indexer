// src/types/security.ts

/**
 * 安全配置类型定义
 */

export interface SecurityConfig {
  /** 是否启用认证（默认 true） */
  enabled: boolean;

  /** 绑定地址（默认 '127.0.0.1'） */
  bindAddress: string;

  /** API Token（自动生成或用户设置） */
  token?: string;

  /** IP 白名单（支持 CIDR 掩码，如 '192.168.1.0/24'） */
  ipWhitelist: string[];
}

/** 默认安全配置 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enabled: true,
  bindAddress: '127.0.0.1',
  token: '',  // 启动时自动生成
  ipWhitelist: ['127.0.0.1']
};