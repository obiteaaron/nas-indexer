/**
 * 刮削插件索引和注册
 */

import { scraperRegistry } from './registry';
import { SteamPlugin } from './steam-plugin';
import { TheGamesDBPlugin } from './tgdb-plugin';

/**
 * 注册内置插件
 */
export function registerBuiltinPlugins(): void {
  scraperRegistry.register(new SteamPlugin());
  scraperRegistry.register(new TheGamesDBPlugin());
  // 后续插件在此注册:
  // scraperRegistry.register(new NFOPlugin());
  // scraperRegistry.register(new IGDBPlugin());
  // scraperRegistry.register(new GiantBombPlugin());
}

// 自动注册内置插件
registerBuiltinPlugins();

// 导出
export { scraperRegistry } from './registry';
export { scraperManager } from './manager';
export { BaseScraperPlugin } from './base';
export { SteamPlugin } from './steam-plugin';
export { TheGamesDBPlugin } from './tgdb-plugin';