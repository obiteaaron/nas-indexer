/**
 * 刮削器插件注册中心
 * 管理所有插件的注册、获取、状态查询
 */

import { logger } from '../../logger';
import type { ScraperPlugin, ScraperStatus, ScrapersConfig, ScraperPluginConfig } from '../../types/scraper';
import { DEFAULT_SCRAPERS_CONFIG } from '../../types/scraper';

/**
 * 插件注册中心
 */
class ScraperRegistry {
  private plugins: Map<string, ScraperPlugin> = new Map();
  private config: ScrapersConfig;

  constructor() {
    // 使用默认配置
    this.config = JSON.parse(JSON.stringify(DEFAULT_SCRAPERS_CONFIG));
  }

  /**
   * 注册插件
   */
  register(plugin: ScraperPlugin): void {
    this.plugins.set(plugin.name, plugin);
    logger.info('[ScraperRegistry] 注册插件: %s (priority=%d)', plugin.displayName, plugin.priority);
  }

  /**
   * 获取插件
   */
  get(name: string): ScraperPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有已启用的插件（按优先级排序）
   */
  getEnabledPlugins(): ScraperPlugin[] {
    const enabledNames = this.config.priority.filter(name => {
      const plugin = this.plugins.get(name);
      if (!plugin) return false;
      const pluginConfig = this.config.plugins[name];
      return pluginConfig?.enabled !== false;
    });

    return enabledNames
      .map(name => this.plugins.get(name))
      .filter((p): p is ScraperPlugin => p !== undefined);
  }

  /**
   * 获取所有插件状态
   */
  getPluginStatus(): ScraperStatus[] {
    return Array.from(this.plugins.values()).map(plugin => {
      const pluginConfig = this.config.plugins[plugin.name] || {};
      const hasAuthConfig = this.checkAuthConfig(plugin.name, pluginConfig);

      return {
        name: plugin.name,
        displayName: plugin.displayName,
        enabled: pluginConfig.enabled !== false,
        requiresAuth: plugin.requiresAuth,
        hasAuthConfig
      };
    });
  }

  /**
   * 检查认证配置是否完整
   */
  private checkAuthConfig(name: string, config: ScraperPluginConfig): boolean {
    if (name === 'igdb') {
      return Boolean(config.clientId && config.clientSecret);
    }
    if (name === 'giantbomb') {
      return Boolean(config.apiKey);
    }
    // 不需要认证的插件，返回 true
    return true;
  }

  /**
   * 更新配置
   */
  updateConfig(config: ScrapersConfig): void {
    this.config = config;

    // 应用启用状态到插件
    for (const [name, plugin] of this.plugins) {
      const pluginConfig = config.plugins[name];
      if (pluginConfig) {
        plugin.enabled = pluginConfig.enabled !== false;
      }
    }

    logger.info('[ScraperRegistry] 配置已更新');
  }

  /**
   * 获取当前配置
   */
  getConfig(): ScrapersConfig {
    return this.config;
  }

  /**
   * 从环境变量加载认证配置
   */
  loadEnvAuthConfig(): void {
    // IGDB
    if (process.env.IGDB_CLIENT_ID) {
      this.config.plugins['igdb'] = {
        ...this.config.plugins['igdb'],
        clientId: process.env.IGDB_CLIENT_ID
      };
    }
    if (process.env.IGDB_CLIENT_SECRET) {
      this.config.plugins['igdb'] = {
        ...this.config.plugins['igdb'],
        clientSecret: process.env.IGDB_CLIENT_SECRET
      };
    }

    // Giant Bomb
    if (process.env.GIANTBOMB_API_KEY) {
      this.config.plugins['giantbomb'] = {
        ...this.config.plugins['giantbomb'],
        apiKey: process.env.GIANTBOMB_API_KEY
      };
    }

    logger.info('[ScraperRegistry] 从环境变量加载认证配置');
  }
}

// 单例导出
export const scraperRegistry = new ScraperRegistry();