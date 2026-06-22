# NAS Indexer 安全认证设计文档

## 概述

为 NAS Indexer 添加安全认证机制，防止数据泄露。参考 OpenClaw 的认证架构，采用简化实用的方案：Bearer Token + IP 白名单（支持 CIDR）。

## 设计目标

1. **默认安全** - 首次启动即开启认证，绑定本地地址
2. **简单易用** - Token 从日志获取，通过 URL 参数传递给前端
3. **灵活配置** - 支持环境变量覆盖，IP 白名单支持网段掩码
4. **最小改动** - 复用现有配置 API，避免过度设计

## 配置结构

### 安全配置类型

```typescript
// src/types/security.ts

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

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enabled: true,
  bindAddress: '127.0.0.1',
  token: '',  // 启动时自动生成
  ipWhitelist: ['127.0.0.1']
};
```

### 配置存储

安全配置作为 `config.json` 的一部分存储：

```json
{
  "storagePath": "...",
  "scanPaths": [...],
  "security": {
    "enabled": true,
    "bindAddress": "127.0.0.1",
    "token": "abc123def456...",
    "ipWhitelist": ["127.0.0.1", "192.168.1.0/24"]
  }
}
```

### 环境变量覆盖

| 环境变量 | 作用 |
|----------|------|
| `NAS_INDEXER_TOKEN` | 覆盖配置文件中的 token |
| `NAS_INDEXER_BIND` | 覆盖绑定地址 |
| `NAS_INDEXER_NO_AUTH` | 禁用认证（仅调试用） |

优先级：环境变量 > 配置文件 > 默认值

## 后端实现

### 模块结构

```
src/
  auth/
    middleware.ts       # Express 认证中间件
    token-generator.ts  # Token 生成逻辑
    ip-checker.ts       # IP 白名单检查（支持 CIDR）
    index.ts            # 导出和初始化
  types/
    security.ts         # 安全配置类型定义
```

### 认证中间件

拦截所有 `/api/*` 请求，执行两层验证：

1. **IP 白名单检查** - 第一层，限制谁可以连接
2. **Token 验证** - 第二层，验证请求合法性

```typescript
// src/auth/middleware.ts

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = loadSecurityConfig();
  
  if (!config.enabled) {
    return next();
  }
  
  // 1. IP 白名单检查
  const clientIP = getClientIP(req);
  if (!isIPAllowed(clientIP, config.ipWhitelist)) {
    return res.status(403).json({ 
      success: false, 
      error: 'IP not allowed',
      code: 'IP_FORBIDDEN'
    });
  }
  
  // 2. Token 验证
  const token = extractToken(req);
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
```

### Token 提取方式

支持三种方式携带 Token：

1. `Authorization: Bearer <token>` - HTTP Header
2. `X-API-Token: <token>` - HTTP Header
3. `?token=<token>` - URL Query Parameter（用于 SSE/WebSocket）

### IP 白名单检查（CIDR 支持）

使用 `ipaddr.js` 库解析 IP 和 CIDR：

```typescript
// src/auth/ip-checker.ts

import ipaddr from 'ipaddr.js';

export function isIPAllowed(clientIP: string, whitelist: string[]): boolean {
  // 本地回环地址始终允许
  if (isLocalIP(clientIP)) {
    return true;
  }
  
  try {
    const addr = ipaddr.parse(clientIP);
    
    for (const entry of whitelist) {
      if (entry.includes('/')) {
        // CIDR 格式
        const range = ipaddr.parseCIDR(entry);
        if (addr.match(range)) {
          return true;
        }
      } else {
        // 单个 IP
        if (clientIP === entry) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  
  return false;
}
```

### Token 生成

使用 crypto 模块生成 40 字符随机串：

```typescript
// src/auth/token-generator.ts

import crypto from 'crypto';

export function generateToken(): string {
  return crypto.randomBytes(32)
    .toString('base64')
    .replace(/[+/=]/g, '')  // 移除特殊字符
    .slice(0, 40);
}
```

### 服务启动改造

```typescript
// src/server.ts 修改要点

import { authMiddleware, initSecurityConfig, loadSecurityConfig } from './auth';

// 认证中间件 - 在路由注册前
app.use('/api', authMiddleware);

// 启动时初始化安全配置
export async function startServer(customPort?: number): Promise<number> {
  const securityConfig = loadSecurityConfig();
  const initializedConfig = initSecurityConfig(securityConfig);
  saveSecurityConfig(initializedConfig);
  
  const bindAddress = process.env.NAS_INDEXER_BIND || initializedConfig.bindAddress;
  
  server = app.listen(port, bindAddress, async () => {
    logger.info('\n🚀 NAS Indexer v1.x.x 服务已启动');
    logger.info('📍 访问地址: http://%s:%d', bindAddress, port);
    logger.info('🔐 API Token: %s', initializedConfig.token);
    logger.info('   请在浏览器中访问: http://%s:%d/?token=%s',
      bindAddress, port, initializedConfig.token);
    logger.info('🌐 IP 白名单: %s\n', initializedConfig.ipWhitelist.join(', '));
  });
}
```

## 前端实现

### Token 获取机制

不通过 API 获取 Token，而是：

1. 服务器启动时打印 Token 到日志
2. 用户复制 Token
3. 用户访问 `http://localhost:3000/?token=xxx`
4. 前端从 URL 提取 Token → 存储到 localStorage
5. 清除 URL 中的 token 参数（避免泄露）
6. 后续请求自动使用存储的 Token

```typescript
// frontend/src/api/auth.ts

export function initTokenFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  
  if (urlToken && urlToken.trim() !== '') {
    localStorage.setItem('nas_api_token', urlToken);
    
    // 清除 URL 中的 token 参数
    urlParams.delete('token');
    const newUrl = urlParams.toString()
      ? `${window.location.pathname}?${urlParams.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    
    return urlToken;
  }
  
  return localStorage.getItem('nas_api_token');
}
```

### API 请求改造

```typescript
// frontend/src/api/index.ts

import { getApiToken, clearApiToken } from './auth';

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getApiToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await fetch(API_BASE + url, { headers, ...options });
  
  if (res.status === 401) {
    clearApiToken();
    throw new Error('认证失败，请在 URL 中带上 token 参数访问');
  }
  
  return res.json() as Promise<ApiResponse<T>>;
}
```

### 无 Token 时的处理

显示认证提示页面，引导用户带 Token 访问：

```vue
<!-- frontend/src/views/AuthRequired.vue -->

<template>
  <div class="auth-required">
    <h1>🔐 需要认证</h1>
    <p>NAS Indexer 已启用安全认证。</p>
    <p>请在服务器日志中获取 Token，然后访问：</p>
    <code>http://localhost:3000/?token=YOUR_TOKEN</code>
    
    <p>或手动输入 Token：</p>
    <input v-model="manualToken" placeholder="输入 API Token" />
    <button @click="applyToken">确认</button>
  </div>
</template>
```

## 配置 API 改造

复用现有 `/api/config` 端点，GET 时隐藏完整 Token：

```typescript
// src/routes/config.ts

router.get('/', async (_req: Request, res: Response): void => {
  const config: Config = loadConfig();
  
  // 隐藏完整 Token
  const safeConfig = {
    ...config,
    security: {
      ...config.security,
      token: config.security?.token 
        ? config.security.token.slice(0, 8) + '...'
        : null,
      tokenSet: !!config.security?.token
    }
  };
  
  res.json({ success: true, data: safeConfig });
});

router.post('/', async (req: Request, res: Response): void => {
  const newConfig: Partial<Config> = req.body;
  const config: Config = loadConfig();
  
  // 不允许通过 POST 更新 token
  if (newConfig.security) {
    newConfig.security.token = config.security?.token;
  }
  
  const updatedConfig: Config = { ...config, ...newConfig };
  saveConfig(updatedConfig);
  
  res.json({ success: true, data: updatedConfig });
});
```

### Token 重新生成

单独的端点，返回新 Token（仅此一次）：

```typescript
// src/routes/security.ts

router.post('/token/regenerate', (req, res) => {
  const newToken = generateToken();
  const config = loadConfig();
  
  config.security.token = newToken;
  saveConfig(config);
  
  logger.info('🔐 API Token 已重新生成: %s', newToken);
  
  res.json({
    success: true,
    data: { token: newToken }
  });
});
```

## 启动流程

### 首次启动（无配置文件）

```
1. 使用默认配置
2. 自动生成 Token
3. 保存配置到 profiles/config.json
4. 绑定 127.0.0.1:3000
5. 打印启动日志（含 Token）
```

### 已有配置启动

```
1. 加载 profiles/config.json
2. Token 为空 → 自动生成
3. ipWhitelist 不含 127.0.0.1 → 自动添加
4. 应用环境变量覆盖
5. 启动服务器
6. 打印启动日志
```

## 默认安全策略

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `security.enabled` | `true` | 默认开启认证 |
| `security.bindAddress` | `'127.0.0.1'` | 默认仅本地访问 |
| `security.token` | 自动生成 | 40 字符随机串 |
| `security.ipWhitelist` | `['127.0.0.1']` | 默认仅本地 IP |

## 依赖

需要添加 `ipaddr.js` 用于 IP 解析和 CIDR 匹配：

```json
{
  "dependencies": {
    "ipaddr.js": "^2.x"
  }
}
```

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/types/security.ts` | 新增 | 安全配置类型定义 |
| `src/auth/middleware.ts` | 新增 | 认证中间件 |
| `src/auth/token-generator.ts` | 新增 | Token 生成逻辑 |
| `src/auth/ip-checker.ts` | 新增 | IP 白名单检查 |
| `src/auth/index.ts` | 新增 | 导出和初始化函数 |
| `src/types/config.ts` | 修改 | 添加 security 字段 |
| `src/utils.ts` | 修改 | 默认配置添加 security |
| `src/server.ts` | 修改 | 集成认证中间件和启动流程 |
| `src/routes/config.ts` | 修改 | GET 时隐藏 Token |
| `src/routes/security.ts` | 新增 | Token 重新生成端点 |
| `frontend/src/api/auth.ts` | 新增 | Token 获取和存储 |
| `frontend/src/api/index.ts` | 修改 | 请求自动携带 Token |
| `frontend/src/views/AuthRequired.vue` | 新增 | 认证提示页面 |
| `frontend/src/router/index.ts` | 修改 | 路由守卫检查 Token |
| `package.json` | 修改 | 添加 ipaddr.js 依赖 |

## 测试要点

1. 首次启动自动生成 Token
2. Token 通过 URL 参数传递并存储
3. 无 Token 时显示认证提示页面
4. Token 验证失败返回 401
5. IP 白名单 CIDR 匹配正确
6. 环境变量覆盖配置文件
7. Token 重新生成后旧 Token 失效