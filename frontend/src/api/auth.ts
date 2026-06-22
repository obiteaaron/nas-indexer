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