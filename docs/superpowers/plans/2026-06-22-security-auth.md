# NAS Indexer 安全认证功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 NAS Indexer 添加 Bearer Token 认证和 IP 白名单功能，防止数据泄露。

**Architecture:** 采用双层防护：IP 白名单限制谁可以连接，Token 认证验证请求合法性。安全配置存储在 config.json，支持环境变量覆盖。Token 通过 URL 参数传递给前端，存储在 localStorage。

**Tech Stack:** Node.js + Express + TypeScript + Vue 3 + ipaddr.js

---

## 文件结构

### 新增文件
| 文件 | 责任 |
|------|------|
| `src/types/security.ts` | 安全配置类型定义和默认值 |
| `src/auth/token-generator.ts` | Token 生成逻辑（crypto） |
| `src/auth/ip-checker.ts` | IP 白名单检查（CIDR 支持） |
| `src/auth/middleware.ts` | Express 认证中间件 |
| `src/auth/index.ts` | 导出和初始化函数 |
| `src/routes/security.ts` | Token 重新生成 API 端点 |
| `frontend/src/api/auth.ts` | 前端 Token 获取和存储 |
| `frontend/src/views/AuthRequired.vue` | 认证提示页面 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `package.json` | 添加 ipaddr.js 依赖 |
| `src/types/config.ts` | 添加 security 字段 |
| `src/utils.ts` | 添加安全配置加载/保存函数 |
| `src/server.ts` | 集成认证中间件和启动流程 |
| `src/routes/config.ts` | GET 时隐藏 Token，POST 时保护 Token |
| `frontend/src/api/index.ts` | 请求自动携带 Token |
| `frontend/src/router/index.ts` | 路由守卫检查 Token |
| `frontend/src/main.ts` | 启动时初始化 Token |

---

## Task 1: 添加 ipaddr.js 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 ipaddr.js 依赖**

```bash
npm install ipaddr.js
```

- [ ] **Step 2: 安装类型定义（如有）**

```bash
npm install --save-dev @types/ipaddr.js
```

如果 `@types/ipaddr.js` 不存在，跳过此步骤，ipaddr.js 自带类型定义。

- [ ] **Step 3: 验证 package.json 更新**

检查 `package.json` 的 dependencies 部分：
```json
"dependencies": {
  "ipaddr.js": "^2.x"
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 ipaddr.js 依赖用于 IP 白名单 CIDR 支持"
```

---

## Task 2: 创建安全配置类型定义

**Files:**
- Create: `src/types/security.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/security.ts
git commit -m "feat: 添加安全配置类型定义"
```

---

## Task 3: 创建 Token 生成模块

**Files:**
- Create: `src/auth/token-generator.ts`

- [ ] **Step 1: 创建 auth 目录**

```bash
mkdir -p src/auth
```

- [ ] **Step 2: 创建 Token 生成模块**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/token-generator.ts
git commit -m "feat: 添加 Token 生成模块"
```

---

## Task 4: 创建 IP 白名单检查模块

**Files:**
- Create: `src/auth/ip-checker.ts`

- [ ] **Step 1: 创建 IP 白名单检查模块**

```typescript
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
  if (ip.startsWith '::ffff:') {
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
          const range = ipaddr.parseCIDR(normalizedEntry);
          if (addr.match(range)) {
            return true;
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
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/ip-checker.ts
git commit -m "feat: 添加 IP 白名单检查模块（支持 CIDR）"
```

---

## Task 5: 创建认证中间件

**Files:**
- Create: `src/auth/middleware.ts`

- [ ] **Step 1: 创建认证中间件**

```typescript
// src/auth/middleware.ts

import type { Request, Response, NextFunction } from 'express';
import { loadSecurityConfig } from './index';
import { isIPAllowed, getClientIP } from './ip-checker';

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
  const config = loadSecurityConfig();
  
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
  const config = loadSecurityConfig();
  
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
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/middleware.ts
git commit -m "feat: 添加认证中间件"
```

---

## Task 6: 创建 auth 模块入口和初始化函数

**Files:**
- Create: `src/auth/index.ts`

- [ ] **Step 1: 创建 auth 模块入口**

```typescript
// src/auth/index.ts

import type { SecurityConfig } from '../types/security';
import { DEFAULT_SECURITY_CONFIG } from '../types/security';
import { generateToken } from './token-generator';
import { loadConfig, saveConfig, ensureStorageDir, getStoragePath } from '../utils';
import type { Config } from '../types/config';
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
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/index.ts
git commit -m "feat: 添加 auth 模块入口和初始化函数"
```

---

## Task 7: 修改 Config 类型添加 security 字段

**Files:**
- Modify: `src/types/config.ts`

- [ ] **Step 1: 添加 security 字段到 Config 类型**

在 `src/types/config.ts` 文件末尾添加 import 和字段：

```typescript
// 在文件顶部添加 import
import type { SecurityConfig } from './security';

// 在 Config interface 中添加 security 字段
export interface Config {
  // ...现有字段保持不变
  
  /** 安全配置 */
  security?: SecurityConfig;
}
```

完整修改后的 Config 类型：

```typescript
/**
 * 配置相关类型定义
 */

import type { SecurityConfig } from './security';

export interface FileExtensionFilter {
  whitelist?: string[];
  blacklist?: string[];
}

export interface CategoryRule {
  [category: string]: string[];
}

export interface CategoryPathRule {
  pathPrefix: string;
  category: string;
}

export interface TrackingConfig {
  trackingEnabled: boolean;
  trackingLevel: 'minimal' | 'full';
}

export interface Config {
  // 全局配置
  storagePath: string;
  scanPaths: string[];
  scanTime: string;
  excludePatterns: string[];
  fileExtensionFilter: FileExtensionFilter;
  categories?: string[];
  categoryRules?: CategoryRule;
  categoryPathRules?: CategoryPathRule[];
  trackingConfig?: TrackingConfig;

  // 仅保留游戏模块开关（详细配置已移至 games-config.json）
  gamesEnabled?: boolean;

  // 预览开关配置
  thumbnailPreviewEnabled?: boolean;  // 是否启用图片缩略图预览
  thumbnailSizeLimit?: number;        // 图片预览大小限制（MB），0 表示不限制
  videoPreviewEnabled?: boolean;      // 是否启用视频元数据显示（时长、分辨率）

  /** 安全配置 */
  security?: SecurityConfig;

  // 以下字段已废弃，保留类型定义以支持迁移读取
  gameScanPathsEnabled?: boolean;
  gameScanPaths?: string[];
  gamesRules?: import('./game').GameRules;
  gamesScrape?: import('./game').GameScrapeConfig;
  maxPosterBackups?: number;
  proxyUrl?: string;
}

export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  '$Recycle.Bin',
  'System Volume Information',
  '.git',
  'node_modules',
  '__pycache__',
  '.cache'
];

export const DEFAULT_SCAN_TIME: string = '0 3 * * *';
```

- [ ] **Step 2: Commit**

```bash
git add src/types/config.ts
git commit -m "feat: Config 类型添加 security 字段"
```

---

## Task 8: 修改 utils.ts 添加安全配置支持

**Files:**
- Modify: `src/utils.ts`

- [ ] **Step 1: 在 getDefaultConfig 函数中添加 security 默认值**

修改 `getDefaultConfig` 函数，添加 security 字段：

```typescript
import type { SecurityConfig } from './types/security';
import { DEFAULT_SECURITY_CONFIG } from './types/security';

function getDefaultConfig(): Config {
  const builtinDefault: Config = {
    storagePath: '',
    scanPaths: [],
    scanTime: '0 2 * * *',
    excludePatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__', '.cache'],
    fileExtensionFilter: {
      whitelist: [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif',
        '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg',
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.ape', '.alac',
        '.srt', '.ass', '.ssa', '.sub', '.vtt',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt'
      ],
      blacklist: [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs',
        '.php', '.rb', '.swift', '.kt', '.scala', '.r', '.m', '.mm', '.vue', '.html', '.css',
        '.lnk', '.url', '.desktop', '.alias',
        '.cache', '.tmp', '.temp', '.swp', '.bak', '.old', '.log',
        '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz'
      ]
    },
    categories: ['电影/视频', '音乐/音频', '文档/资料', '软件/安装包', '图片/照片', '项目/代码', '备份/归档', '其他'],
    gamesEnabled: false,
    gameScanPathsEnabled: DEFAULT_GAMES_CONFIG.gameScanPathsEnabled,
    gameScanPaths: DEFAULT_GAMES_CONFIG.gameScanPaths,
    gamesRules: DEFAULT_GAMES_CONFIG.gamesRules,
    gamesScrape: DEFAULT_GAMES_CONFIG.gamesScrape,
    // 新增：安全配置默认值
    security: DEFAULT_SECURITY_CONFIG
  };
  
  // ... 后续代码保持不变
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils.ts
git commit -m "feat: utils.ts 添加安全配置默认值"
```

---

## Task 9: 修改 server.ts 集成认证中间件和启动流程

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: 导入 auth 模块**

在文件顶部添加导入：

```typescript
import {
  authMiddleware,
  loadSecurityConfig,
  initSecurityConfig,
  saveSecurityConfig,
  getBindAddress
} from './auth';
import type { SecurityConfig } from './types/security';
```

- [ ] **Step 2: 在路由注册前添加认证中间件**

在 `app.use(express.json())` 之后、路由注册之前添加：

```typescript
app.use(cors());
app.use(express.json());

// 认证中间件 - 拦截所有 /api/* 请求
app.use('/api', authMiddleware);

// API Routes
app.use('/api/config', configRouter);
```

- [ ] **Step 3: 修改 startServer 函数**

修改 `startServer` 函数，集成安全配置初始化：

```typescript
export async function startServer(customPort?: number): Promise<number> {
  const port = customPort || PORT;

  // 1. 加载并初始化安全配置
  const securityConfig = loadSecurityConfig();
  const initializedSecurity = initSecurityConfig(securityConfig);
  saveSecurityConfig(initializedSecurity);

  // 2. 获取绑定地址（环境变量优先）
  const bindAddress = getBindAddress(initializedSecurity);

  return new Promise((resolve, reject) => {
    server = app.listen(port, bindAddress, async () => {
      try {
        await initDatabase();

        // 初始化代理（用于 Steam API 刲削）
        initProxy();

        const config: Config = loadConfig();
        const storagePath: string = getStoragePath(config);
        ensureGamesDirs(storagePath);

        // 3. 打印启动日志（含安全信息）
        logger.info('\n🚀 NAS Indexer v1.6.0 服务已启动');
        logger.info('📍 访问地址: http://%s:%d', bindAddress, port);
        logger.info('📁 默认存储目录: %s', DEFAULT_STORAGE_PATH);
        logger.info('📂 当前存储目录: %s', storagePath);
        
        // 安全信息
        if (initializedSecurity.enabled) {
          logger.info('🔐 认证已启用');
          logger.info('   API Token: %s', initializedSecurity.token);
          logger.info('   请在浏览器中访问: http://%s:%d/?token=%s',
            bindAddress, port, initializedSecurity.token);
          logger.info('🌐 IP 白名单: %s', initializedSecurity.ipWhitelist.join(', '));
        } else {
          logger.warn('⚠️ 认证已禁用（不推荐）');
        }
        logger.info('');

        scheduleScan(config);

        resolve(port);
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: server.ts 集成认证中间件和安全启动流程"
```

---

## Task 10: 修改 routes/config.ts 保护 Token

**Files:**
- Modify: `src/routes/config.ts`

- [ ] **Step 1: 修改 GET 端点隐藏完整 Token**

修改 GET `/` 端点：

```typescript
// 获取配置
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config: Config = loadConfig();
    
    // 安全处理：隐藏完整 Token
    const safeConfig = {
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
    
    res.json({ success: true, data: safeConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 2: 修改 POST 端点保护 Token**

修改 POST `/` 端点：

```typescript
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
    const safeConfig = {
      ...updatedConfig,
      security: updatedConfig.security ? {
        enabled: updatedConfig.security.enabled,
        bindAddress: updatedConfig.security.bindAddress,
        ipWhitelist: updatedConfig.security.ipWhitelist,
        token: updatedConfig.security.token 
          ? updatedConfig.security.token.slice(0, 8) + '...'
          : null,
        tokenSet: !!updatedConfig.security.token
      } : undefined
    };

    res.json({ success: true, data: safeConfig });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/config.ts
git commit -m "feat: config API 保护 Token，GET 时隐藏完整值"
```

---

## Task 11: 创建 routes/security.ts Token 重新生成端点

**Files:**
- Create: `src/routes/security.ts`
- Modify: `src/server.ts` (注册路由)

- [ ] **Step 1: 创建 security 路由**

```typescript
// src/routes/security.ts

import express, { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../utils';
import { generateToken } from '../auth';
import { logger } from '../logger';
import type { Config } from '../types/config';

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
        enabled: true,
        bindAddress: '127.0.0.1',
        token: newToken,
        ipWhitelist: ['127.0.0.1']
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
```

- [ ] **Step 2: 在 server.ts 注册路由**

在 `src/server.ts` 的路由注册部分添加：

```typescript
// 导入
import securityRouter from './routes/security';

// 注册路由（在现有路由列表中添加）
app.use('/api/security', securityRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/security.ts src/server.ts
git commit -m "feat: 添加 Token 重新生成 API 端点"
```

---

## Task 12: 创建前端 auth.ts 模块

**Files:**
- Create: `frontend/src/api/auth.ts`

- [ ] **Step 1: 创建前端 auth 模块**

```typescript
// frontend/src/api/auth.ts

/**
 * 前端认证模块
 * Token 通过 URL 参数获取，存储在 localStorage
 */

const TOKEN_KEY = 'nas_api_token';

/**
 * 从 URL 或 localStorage 获取 Token
 * 
 * 流程：
 * 1. 检查 URL 参数 ?token=xxx
 * 2. 如果存在，存储到 localStorage 并清除 URL 参数
 * 3. 返回 Token（URL 或 localStorage）
 */
export function initTokenFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  
  if (urlToken && urlToken.trim() !== '') {
    // 存储 Token 到 localStorage
    localStorage.setItem(TOKEN_KEY, urlToken.trim());
    
    // 清除 URL 中的 token 参数（避免泄露）
    urlParams.delete('token');
    const newSearch = urlParams.toString();
    const newUrl = newSearch
      ? `${window.location.pathname}?${newSearch}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    
    return urlToken.trim();
  }
  
  // 从 localStorage 获取
  return getApiToken();
}

/**
 * 获取当前存储的 Token
 */
export function getApiToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 设置 Token（手动输入场景）
 */
export function setApiToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * 清除 Token
 */
export function clearApiToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 检查是否已认证（有 Token）
 */
export function hasApiToken(): boolean {
  return !!getApiToken();
}

/**
 * 构建带 Token 的 URL（用于 SSE/WebSocket 等场景）
 */
export function buildUrlWithToken(baseUrl: string): string {
  const token = getApiToken();
  if (!token) {
    return baseUrl;
  }
  
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/auth.ts
git commit -m "feat: 前端添加 auth 模块，Token 从 URL 获取并存储"
```

---

## Task 13: 修改前端 api/index.ts 请求携带 Token

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: 导入 auth 模块**

在文件顶部添加导入：

```typescript
import { getApiToken, clearApiToken, buildUrlWithToken } from './auth';
```

- [ ] **Step 2: 修改 request 函数**

修改 `request` 函数，添加 Token 注入和 401 处理：

```typescript
async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getApiToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  
  // 注入 Token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await fetch(API_BASE + url, {
    headers,
    ...options
  });
  
  // 处理 401 认证失败
  if (res.status === 401) {
    clearApiToken();
    // 抛出错误，让上层处理
    throw new Error('AUTH_FAILED');
  }
  
  return res.json() as Promise<ApiResponse<T>>;
}
```

- [ ] **Step 3: 修改 getStreamUrl 和 getTaskStreamUrl**

修改需要 SSE/WebSocket 的 URL 构建函数：

```typescript
export function getStreamUrl(id: number): string {
  const baseUrl = API_BASE + '/preview/stream/' + id;
  return buildUrlWithToken(baseUrl);
}

export function getTaskStreamUrl(): string {
  const baseUrl = API_BASE + '/scan/tasks/stream';
  return buildUrlWithToken(baseUrl);
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: 前端 API 请求自动携带 Token"
```

---

## Task 14: 创建 AuthRequired.vue 认证提示页面

**Files:**
- Create: `frontend/src/views/AuthRequired.vue`

- [ ] **Step 1: 创建认证提示页面**

```vue
<!-- frontend/src/views/AuthRequired.vue -->

<template>
  <div class="auth-required-page">
    <div class="auth-card">
      <div class="auth-icon">🔐</div>
      <h1>需要认证</h1>
      <p class="auth-desc">NAS Indexer 已启用安全认证</p>
      
      <div class="auth-instruction">
        <p>请在服务器日志中获取 Token，然后访问：</p>
        <code class="auth-url">http://localhost:3000/?token=YOUR_TOKEN</code>
      </div>
      
      <div class="auth-manual">
        <p>或手动输入 Token：</p>
        <div class="auth-input-group">
          <input 
            v-model="manualToken" 
            type="text" 
            placeholder="输入 API Token" 
            class="auth-input"
          />
          <button @click="applyToken" class="auth-btn" :disabled="!manualToken">
            确认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { setApiToken } from '../api/auth';

const router = useRouter();
const manualToken = ref('');

function applyToken() {
  if (manualToken.value.trim()) {
    setApiToken(manualToken.value.trim());
    router.push('/');
  }
}
</script>

<style scoped>
.auth-required-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--bg-color, #f5f5f5);
}

.auth-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.auth-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.auth-card h1 {
  margin: 0 0 8px;
  color: #333;
}

.auth-desc {
  color: #666;
  margin-bottom: 24px;
}

.auth-instruction {
  background: #f0f0f0;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.auth-instruction p {
  margin: 0 0 8px;
  color: #555;
}

.auth-url {
  display: block;
  background: #333;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  word-break: break-all;
}

.auth-manual p {
  margin: 0 0 12px;
  color: #555;
}

.auth-input-group {
  display: flex;
  gap: 8px;
}

.auth-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.auth-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.auth-btn {
  padding: 10px 20px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.auth-btn:hover:not(:disabled) {
  background: #3a80c9;
}

.auth-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/AuthRequired.vue
git commit -m "feat: 添加认证提示页面"
```

---

## Task 15: 修改前端 router/index.ts 路由守卫

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 添加认证提示页面路由**

```typescript
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// 路由懒加载
const HomeView = () => import('../views/HomeView.vue')
const FileListView = () => import('../views/FileListView.vue')
const SearchView = () => import('../views/SearchView.vue')
const StatisticsView = () => import('../views/StatisticsView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const TagManagerView = () => import('../views/TagManagerView.vue')
const GameWallView = () => import('../views/game/GameWallView.vue')
const GameSteamView = () => import('../views/game/GameSteamView.vue')
const GameSettingsView = () => import('../views/game/GameSettingsView.vue')
const ProfileBackupView = () => import('../views/game/ProfileBackupView.vue')
const AuthRequiredView = () => import('../views/AuthRequired.vue')

const routes: RouteRecordRaw[] = [
  { path: '/auth-required', name: 'auth-required', component: AuthRequiredView },
  { path: '/', name: 'home', component: HomeView },
  // ... 其他路由保持不变
]
```

- [ ] **Step 2: 添加路由守卫**

```typescript
import { hasApiToken } from '../api/auth'

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫：检查 Token
router.beforeEach((to, from, next) => {
  // 认证提示页面无需 Token
  if (to.name === 'auth-required') {
    next();
    return;
  }
  
  // 其他页面需要 Token
  if (!hasApiToken()) {
    next({ name: 'auth-required' });
    return;
  }
  
  next();
})

export default router
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router/index.ts
git commit -m "feat: 前端路由守卫检查 Token"
```

---

## Task 16: 修改前端 main.ts 初始化 Token

**Files:**
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: 在 main.ts 初始化 Token**

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { RecycleScroller } from 'vue-virtual-scroller'
import { initTokenFromUrl } from './api/auth'

// 启动时从 URL 提取 Token（如有）
initTokenFromUrl()

const app = createApp(App)
app.use(router)
app.component('RecycleScroller', RecycleScroller)
app.mount('#app')
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/main.ts
git commit -m "feat: 前端启动时从 URL 提取 Token"
```

---

## Task 17: 更新类型导出

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 导出 SecurityConfig 类型**

```typescript
// src/types/index.ts

export * from './config';
export * from './file';
export * from './game';
export * from './games-config';
export * from './api';
export * from './tag';
export * from './tracking';
export * from './security';  // 新增
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: 导出 SecurityConfig 类型"
```

---

## Task 18: 构建验证

**Files:**
- None (验证步骤)

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npm run typecheck
```

预期：无类型错误

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

预期：构建成功

- [ ] **Step 3: 运行测试（如有）**

```bash
npm test
```

预期：测试通过

- [ ] **Step 4: Commit（如有修复）**

如有修复，提交：

```bash
git add -A
git commit -m "fix: 修复编译问题"
```

---

## Self-Review Checklist

**1. Spec Coverage:**

| 设计要求 | 实现任务 |
|----------|----------|
| 安全配置类型定义 | Task 2 |
| Token 生成模块 | Task 3 |
| IP 白名单检查（CIDR） | Task 4 |
| 认证中间件 | Task 5 |
| auth 模块入口 | Task 6 |
| Config 类型添加 security | Task 7 |
| utils.ts 默认配置 | Task 8 |
| server.ts 启动流程 | Task 9 |
| config.ts 保护 Token | Task 10 |
| Token 重新生成端点 | Task 11 |
| 前端 auth.ts | Task 12 |
| 前端 API Token 注入 | Task 13 |
| 认证提示页面 | Task 14 |
| 路由守卫 | Task 15 |
| main.ts 初始化 | Task 16 |

所有设计要求已覆盖。

**2. Placeholder Scan:**

无 TBD、TODO 或模糊描述。所有代码完整。

**3. Type Consistency:**

- `SecurityConfig` 类型在 Task 2 定义，后续所有任务使用相同结构
- `generateToken()` 返回 string，各处调用一致
- `loadSecurityConfig()` 返回 SecurityConfig，Task 6 和 Task 9 使用一致

---

**Plan complete.** 准备执行。