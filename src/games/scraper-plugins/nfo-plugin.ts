/**
 * NFO 文件解析插件
 * 本地文件解析，无需网络请求
 * 支持键值对格式和 XML 格式（xbmc/Kodi 标准）
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger';
import { loadConfig, getStoragePath } from '../../utils';
import { BaseScraperPlugin } from './base';
import { ensurePosterDir, getPosterPath } from '../storage';
import type {
  ScrapeCandidate,
  ScraperMetadata,
  ScraperImageUrls,
  ScraperImagePaths
} from '../../types/scraper';

/**
 * NFO 键值对格式解析结果
 */
interface NFOKeyValueData {
  title?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  genre?: string;
  rating?: string;
  description?: string;
}

/**
 * NFO XML 格式解析结果（xbmc/Kodi 标准）
 */
interface NFOXmlData {
  title?: string;
  originaltitle?: string;
  developer?: string;
  publisher?: string;
  year?: string;
  releasedate?: string;
  genre?: string[];
  rating?: string;
  plot?: string;
  esrb?: string;
}

/**
 * NFO 刮削插件
 * 本地文件解析，无需网络请求
 */
export class NFOPlugin extends BaseScraperPlugin {
  name = 'nfo';
  displayName = 'NFO File';
  priority = 3;
  requiresAuth = false;
  enabled = true;

  // 当前游戏路径
  private gamePath: string | null = null;
  // 扫描根路径
  private scanRoot: string | null = null;

  /**
   * 设置当前游戏路径
   * 在刮削前调用，用于确定 NFO 文件查找范围
   */
  setGamePath(gamePath: string, scanRoot?: string): void {
    this.gamePath = gamePath;
    this.scanRoot = scanRoot || null;
    logger.debug('[NFO] 设置游戏路径: %s (scanRoot: %s)', gamePath, scanRoot);
  }

  /**
   * 搜索方法 - NFO 不做搜索
   * 返回虚拟候选，标识为本地文件
   */
  async search(query: string): Promise<ScrapeCandidate[]> {
    // NFO 插件不做搜索，返回虚拟候选
    // 当用户选择 NFO 作为数据源时，直接调用 getDetails
    return [{
      id: 'local-nfo',
      title: query + ' (本地 NFO)',
      source: 'nfo',
      thumbnail: undefined
    }];
  }

  /**
   * 获取游戏详情
   * 从游戏目录查找并解析 NFO 文件
   */
  async getDetails(_id: string): Promise<ScraperMetadata | null> {
    // 检查是否设置了游戏路径
    if (!this.gamePath) {
      logger.warn('[NFO] 未设置游戏路径，无法查找 NFO 文件');
      return null;
    }

    // 查找 NFO 文件
    const nfoFile = this.findNfoFile();
    if (!nfoFile) {
      logger.info('[NFO] 未找到 NFO 文件: %s', this.gamePath);
      return null;
    }

    logger.info('[NFO] 找到 NFO 文件: %s', nfoFile);

    // 解析 NFO 文件
    const nfoData = this.parseNfoFile(nfoFile);
    if (!nfoData) {
      logger.warn('[NFO] NFO 文件解析失败: %s', nfoFile);
      return null;
    }

    // 查找本地图片
    const images = this.findLocalImages(nfoFile);

    // 组装元数据
    return this.buildMetadata(nfoData, images, nfoFile);
  }

  /**
   * 下载图片 - NFO 使用本地复制
   * 重写基类方法，改为复制本地图片
   */
  async downloadImages(urls: ScraperImageUrls, gameId: number): Promise<ScraperImagePaths> {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    ensurePosterDir(storagePath, gameId);

    const paths: ScraperImagePaths = {};

    // 复制横版海报（URL 实际上是本地路径）
    if (urls.horizontal) {
      const destPath = getPosterPath(storagePath, gameId, 'horizontal');
      await this.copyLocalImage(urls.horizontal, destPath);
      paths.horizontal = destPath;
    }

    // 复制竖版海报
    if (urls.vertical) {
      const destPath = getPosterPath(storagePath, gameId, 'vertical');
      await this.copyLocalImage(urls.vertical, destPath);
      paths.vertical = destPath;
    }

    // 复制背景图
    if (urls.background) {
      const destPath = getPosterPath(storagePath, gameId, 'background');
      await this.copyLocalImage(urls.background, destPath);
      paths.background = destPath;
    }

    return paths;
  }

  /**
   * 查找 NFO 文件
   * 从游戏目录向上查找，最多 3 层
   * 优先选择: game.nfo, 与目录同名的.nfo
   */
  private findNfoFile(): string | null {
    if (!this.gamePath) return null;

    const gameDir = fs.statSync(this.gamePath).isDirectory()
      ? this.gamePath
      : path.dirname(this.gamePath);

    const dirName = path.basename(gameDir);
    const maxLevels = 3;

    // 优先级列表
    const priorityNames = [
      'game.nfo',
      `${dirName}.nfo`
    ];

    // 从游戏目录向上查找
    let currentDir = gameDir;
    let level = 0;

    while (level < maxLevels) {
      // 检查优先级文件名
      for (const priorityName of priorityNames) {
        const nfoPath = path.join(currentDir, priorityName);
        if (fs.existsSync(nfoPath)) {
          return nfoPath;
        }
      }

      // 检查目录下所有 .nfo 文件
      const nfoFiles = this.findNfoFilesInDir(currentDir);
      if (nfoFiles.length > 0) {
        // 如果有多个，选择最匹配的
        return nfoFiles[0];
      }

      // 向上一级
      const parentDir = path.dirname(currentDir);

      // 检查是否到达扫描根路径
      if (this.scanRoot && parentDir === this.scanRoot) {
        break;
      }

      // 检查是否到达根目录
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
      level++;
    }

    return null;
  }

  /**
   * 查找目录下的所有 .nfo 文件
   */
  private findNfoFilesInDir(dir: string): string[] {
    try {
      const files = fs.readdirSync(dir);
      return files
        .filter(f => f.toLowerCase().endsWith('.nfo'))
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }

  /**
   * 解析 NFO 文件
   * 支持键值对格式和 XML 格式
   */
  private parseNfoFile(nfoPath: string): NFOKeyValueData | NFOXmlData | null {
    try {
      const content = fs.readFileSync(nfoPath, 'utf-8');

      // 尝试 XML 格式解析
      if (content.trim().startsWith('<')) {
        return this.parseXmlNfo(content);
      }

      // 键值对格式解析
      return this.parseKeyValueNfo(content);
    } catch (err) {
      const error = err as Error;
      logger.error('[NFO] 文件读取失败: %s - %s', nfoPath, error.message);
      return null;
    }
  }

  /**
   * 解析键值对格式 NFO
   * 格式: Title: 赛博朋克2077
   */
  private parseKeyValueNfo(content: string): NFOKeyValueData {
    const data: NFOKeyValueData = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 解析键值对
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
        const value = trimmed.substring(colonIndex + 1).trim();

        // 映射常见字段名
        switch (key) {
          case 'title':
          case 'name':
          case 'game':
            data.title = value;
            break;
          case 'developer':
          case 'developer':
          case 'creator':
            data.developer = value;
            break;
          case 'publisher':
          case 'distributor':
            data.publisher = value;
            break;
          case 'release date':
          case 'releasedate':
          case 'release':
          case 'year':
            data.releaseDate = this.normalizeDate(value);
            break;
          case 'genre':
          case 'genres':
            data.genre = value;
            break;
          case 'rating':
          case 'score':
            data.rating = value;
            break;
          case 'description':
          case 'overview':
          case 'plot':
          case 'summary':
            data.description = value;
            break;
        }
      }
    }

    return data;
  }

  /**
   * 解析 XML 格式 NFO（xbmc/Kodi 标准）
   * 格式: <game><title>赛博朋克2077</title>...</game>
   */
  private parseXmlNfo(content: string): NFOXmlData {
    const data: NFOXmlData = {};

    // 简单的正则解析（避免依赖 XML 解析库）
    // 提取 <game> 或 <movie> 标签内的内容
    const gameMatch = content.match(/<(?:game|movie)[^>]*>([\s\S]*?)<\/(?:game|movie)>/i);
    const innerContent = gameMatch ? gameMatch[1] : content;

    // 提取各个字段
    data.title = this.extractXmlTag(innerContent, 'title');
    data.originaltitle = this.extractXmlTag(innerContent, 'originaltitle');
    data.developer = this.extractXmlTag(innerContent, 'developer');
    data.publisher = this.extractXmlTag(innerContent, 'publisher');
    data.year = this.extractXmlTag(innerContent, 'year');
    data.releasedate = this.extractXmlTag(innerContent, 'releasedate');
    data.rating = this.extractXmlTag(innerContent, 'rating');
    data.plot = this.extractXmlTag(innerContent, 'plot') || this.extractXmlTag(innerContent, 'overview');
    data.esrb = this.extractXmlTag(innerContent, 'esrb');

    // 提取多个 genre 标签
    const genreMatches = innerContent.match(/<genre[^>]*>(.*?)<\/genre>/gi);
    if (genreMatches) {
      data.genre = genreMatches.map(g => {
        const match = g.match(/<genre[^>]*>(.*?)<\/genre>/i);
        return match ? match[1].trim() : '';
      }).filter(g => g);
    }

    return data;
  }

  /**
   * 提取 XML 标签内容
   */
  private extractXmlTag(content: string, tagName: string): string | undefined {
    const match = content.match(new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>`, 'i'));
    return match ? match[1].trim() : undefined;
  }

  /**
   * 标准化日期格式
   */
  private normalizeDate(dateStr: string): string {
    // 已经是 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // 仅年份
    if (/^\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    // 其他格式尝试解析
    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().substring(0, 10);
      }
    } catch {
      // 解析失败，返回原始值
    }

    return dateStr;
  }

  /**
   * 查找本地图片文件
   * 在 NFO 文件所在目录查找
   */
  private findLocalImages(nfoPath: string): ScraperImageUrls {
    const images: ScraperImageUrls = {};
    const nfoDir = path.dirname(nfoPath);

    // 图片文件优先级
    const horizontalPriority = ['poster.jpg', 'cover.jpg', 'boxart.jpg', 'folder.jpg'];
    const verticalPriority = ['banner.jpg', 'banner.png'];
    const backgroundPriority = ['fanart.jpg', 'background.jpg', 'fanart.png', 'background.png'];

    // 查找横版海报
    for (const imgName of horizontalPriority) {
      const imgPath = path.join(nfoDir, imgName);
      if (fs.existsSync(imgPath)) {
        images.horizontal = imgPath;
        break;
      }
    }

    // 查找竖版海报/横幅
    for (const imgName of verticalPriority) {
      const imgPath = path.join(nfoDir, imgName);
      if (fs.existsSync(imgPath)) {
        images.vertical = imgPath;
        break;
      }
    }

    // 查找背景图
    for (const imgName of backgroundPriority) {
      const imgPath = path.join(nfoDir, imgName);
      if (fs.existsSync(imgPath)) {
        images.background = imgPath;
        break;
      }
    }

    // 查找截图目录
    const screenshotsDir = path.join(nfoDir, 'screenshots');
    if (fs.existsSync(screenshotsDir)) {
      const screenshotFiles = fs.readdirSync(screenshotsDir)
        .filter(f => /\.(jpg|png)$/i.test(f))
        .slice(0, 5)
        .map(f => path.join(screenshotsDir, f));

      if (screenshotFiles.length > 0) {
        images.screenshots = screenshotFiles;
      }
    }

    return images;
  }

  /**
   * 复制本地图片
   */
  private async copyLocalImage(srcPath: string, destPath: string): Promise<void> {
    try {
      // 目标已存在则跳过
      if (fs.existsSync(destPath)) {
        logger.debug('[NFO] 图片已存在，跳过: %s', destPath);
        return;
      }

      // 检查源文件是否存在
      if (!fs.existsSync(srcPath)) {
        logger.warn('[NFO] 源图片不存在: %s', srcPath);
        return;
      }

      // 复制文件
      await fs.promises.copyFile(srcPath, destPath);
      logger.info('[NFO] 图片复制成功: %s -> %s', srcPath, destPath);
    } catch (err) {
      const error = err as Error;
      logger.warn('[NFO] 图片复制失败: %s - %s', srcPath, error.message);
    }
  }

  /**
   * 组装元数据
   */
  private buildMetadata(
    nfoData: NFOKeyValueData | NFOXmlData,
    images: ScraperImageUrls,
    nfoPath: string
  ): ScraperMetadata {
    // 判断是键值对格式还是 XML 格式
    const isXml = 'originaltitle' in nfoData || 'plot' in nfoData;

    let genres: string[] | undefined;
    let rating: number | undefined;
    let releaseDate: string | undefined;

    if (isXml) {
      const xmlData = nfoData as NFOXmlData;
      genres = xmlData.genre;

      // XML 格式的 rating 可能是字符串或数字
      if (xmlData.rating) {
        const parsed = parseFloat(xmlData.rating);
        if (!isNaN(parsed)) {
          rating = parsed;
        }
      }

      // XML 格式的 releaseDate
      releaseDate = xmlData.releasedate || xmlData.year;
    } else {
      const kvData = nfoData as NFOKeyValueData;

      // 键值对格式的 genre 可能是逗号分隔的字符串
      if (kvData.genre) {
        genres = kvData.genre.split(/[,;，]/).map(g => g.trim()).filter(g => g);
      }

      // 键值对格式的 rating
      if (kvData.rating) {
        const parsed = parseFloat(kvData.rating);
        if (!isNaN(parsed)) {
          rating = parsed;
        }
      }

      releaseDate = kvData.releaseDate;
    }

    // 获取标题
    const title = isXml
      ? (nfoData as NFOXmlData).title || (nfoData as NFOXmlData).originaltitle
      : (nfoData as NFOKeyValueData).title;

    return {
      title,
      titleEn: isXml ? (nfoData as NFOXmlData).originaltitle : undefined,
      developer: nfoData.developer,
      publisher: nfoData.publisher,
      releaseDate,
      genres,
      rating,
      description: isXml ? (nfoData as NFOXmlData).plot : (nfoData as NFOKeyValueData).description,
      images,
      source: 'nfo',
      raw: { nfoPath, nfoData }
    };
  }

  /**
   * 匹配置信度计算 - NFO 始终返回 100（本地文件）
   */
  matchConfidence(_result: ScrapeCandidate, _query: string): number {
    // NFO 是本地文件，置信度始终为 100
    return 100;
  }
}