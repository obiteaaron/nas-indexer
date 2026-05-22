import fs from 'fs';
import path from 'path';
import { database } from './database';
import { logger } from './logger';
import type { FileExtensionFilter, ScanProgressEvent } from './types';

interface ScanResult {
  success: boolean;
  timestamp: string;
  results: ScanPathResult[];
  totalFiles: number;
  totalSize: number;
}

interface ScanPathResult {
  path: string;
  files: string[];
  fileCount: number;
}

interface FileWithStat {
  path: string;
  stat: fs.Stats | null;
}

/**
 * 检查文件是否应该被包含（基于后缀过滤）
 */
function shouldIncludeFile(filePath: string, filterConfig: FileExtensionFilter = {}): boolean {
  const ext: string = path.extname(filePath).toLowerCase();

  if (!filterConfig.whitelist || filterConfig.whitelist.length === 0) {
    if (!filterConfig.blacklist || filterConfig.blacklist.length === 0) {
      return true;
    }
  }

  if (filterConfig.whitelist && filterConfig.whitelist.length > 0) {
    const normalizedWhitelist: string[] = filterConfig.whitelist.map(ext =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    if (!normalizedWhitelist.includes(ext)) {
      return false;
    }
  }

  if (filterConfig.blacklist && filterConfig.blacklist.length > 0) {
    const normalizedBlacklist: string[] = filterConfig.blacklist.map(ext =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    if (normalizedBlacklist.includes(ext)) {
      return false;
    }
  }

  return true;
}

/**
 * 让出事件循环，允许其他请求被处理
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * 快速统计目录中的文件数量（异步版本）
 */
async function countFilesAsync(dir: string, excludePatterns: string[] = [], fileExtensionFilter: FileExtensionFilter = {}): Promise<number> {
  let count: number = 0;
  try {
    const items: string[] = await fs.promises.readdir(dir);
    for (const item of items) {
      if (excludePatterns.some(pattern => item.includes(pattern))) {
        continue;
      }
      const fullPath: string = path.join(dir, item);
      try {
        const stat: fs.Stats = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) {
          count += await countFilesAsync(fullPath, excludePatterns, fileExtensionFilter);
        } else {
          if (shouldIncludeFile(fullPath, fileExtensionFilter)) {
            count++;
          }
        }
      } catch {
        // 跳过无法访问的文件/目录
      }
    }
  } catch {
    // 跳过无法读取的目录
  }
  return count;
}

/**
 * 扫描目录并生成文件列表（异步版本）
 */
async function scanDirectoryAsync(dir: string, excludePatterns: string[] = [], fileExtensionFilter: FileExtensionFilter = {}): Promise<string[]> {
  const results: string[] = [];

  try {
    const items: string[] = await fs.promises.readdir(dir);

    for (const item of items) {
      if (excludePatterns.some(pattern => item.includes(pattern))) {
        continue;
      }

      const fullPath: string = path.join(dir, item);

      try {
        const stat: fs.Stats = await fs.promises.stat(fullPath);

        if (stat.isDirectory()) {
          const subResults: string[] = await scanDirectoryAsync(fullPath, excludePatterns, fileExtensionFilter);
          results.push(...subResults);
        } else {
          if (shouldIncludeFile(fullPath, fileExtensionFilter)) {
            results.push(fullPath);
          }
        }
      } catch (err) {
        const error = err as Error;
        logger.warn('无法访问: %s - %s', fullPath, error.message);
      }
    }
  } catch (err) {
    const error = err as Error;
    logger.warn('无法读取目录: %s - %s', dir, error.message);
  }

  return results;
}

/**
 * 执行扫描并写入数据库（支持进度回调）
 */
async function performScanWithDatabase(
  scanPaths: string[],
  excludePatterns: string[] = [],
  fileExtensionFilter: FileExtensionFilter = {},
  onProgress: ((event: ScanProgressEvent) => void) | null = null
): Promise<ScanResult> {
  if (!database.initialized) {
    await database.init();
  }

  logger.info('开始扫描，路径: %s', scanPaths.join(', '));

  const staleCount = database.deleteStaleByScanPaths(scanPaths);
  if (staleCount > 0) {
    logger.info('清理失效文件记录: %d 条（scan_path 已不在配置中）', staleCount);
  }

  const scanResults: ScanPathResult[] = [];
  let totalFiles: number = 0;
  let totalSize: number = 0;

  for (let pathIndex = 0; pathIndex < scanPaths.length; pathIndex++) {
    const scanPath: string = scanPaths[pathIndex];

    // 阶段一：快速统计文件数量
    if (onProgress) {
      onProgress({
        phase: 'counting',
        pathIndex,
        totalPaths: scanPaths.length,
        path: scanPath,
        message: `正在统计文件: ${scanPath}`
      });
    }

    await yieldToEventLoop();
    const totalInPath: number = await countFilesAsync(scanPath, excludePatterns, fileExtensionFilter);
    logger.info('  %s: 统计到 %d 个文件', scanPath, totalInPath);

    database.deleteByScanPath(scanPath);

    // 阶段二：扫描文件列表
    if (onProgress) {
      onProgress({
        phase: 'scanning',
        pathIndex,
        totalPaths: scanPaths.length,
        total: totalInPath,
        path: scanPath,
        message: `正在扫描: ${scanPath}`
      });
    }

    await yieldToEventLoop();
    const files: string[] = await scanDirectoryAsync(scanPath, excludePatterns, fileExtensionFilter);

    // 阶段三：获取文件信息并写入数据库
    let processed: number = 0;
    const filesWithStats: FileWithStat[] = [];

    for (const filePath of files) {
      try {
        const stat: fs.Stats = await fs.promises.stat(filePath);
        totalSize += stat.size;
        processed++;

        // 每处理 100 个文件回调一次进度并让出事件循环
        if (processed % 100 === 0) {
          if (onProgress) {
            const overallProgress: number = Math.round(
              (pathIndex / scanPaths.length) * 100 +
              (processed / (totalInPath || 1)) * (100 / scanPaths.length)
            );
            onProgress({
              phase: 'writing',
              pathIndex,
              totalPaths: scanPaths.length,
              processed,
              total: totalInPath,
              progress: overallProgress,
              path: scanPath,
              message: `正在写入: ${scanPath} (${processed}/${totalInPath})`
            });
          }
          await yieldToEventLoop();
        }

        filesWithStats.push({ path: filePath, stat });
      } catch {
        filesWithStats.push({ path: filePath, stat: null });
      }
    }

    // 最后一次进度回调
    if (onProgress && processed > 0) {
      const overallProgress: number = Math.round(
        ((pathIndex + 1) / scanPaths.length) * 100
      );
      onProgress({
        phase: 'writing',
        pathIndex,
        totalPaths: scanPaths.length,
        processed,
        total: totalInPath,
        progress: overallProgress,
        path: scanPath,
        message: `正在写入数据库: ${scanPath} (${processed} 个文件)`
      });
    }

    database.insertFilesBatch(filesWithStats, scanPath);
    scanResults.push({ path: scanPath, files, fileCount: files.length });
    totalFiles += files.length;
    logger.info('  %s: %d 个文件', scanPath, files.length);
  }

  logger.info('扫描完成，已写入数据库');
  logger.info('  总文件数: %d', totalFiles);
  logger.info('  总大小: %s', formatSize(totalSize));

  return {
    success: true,
    timestamp: new Date().toISOString(),
    results: scanResults,
    totalFiles,
    totalSize
  };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units: string[] = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i: number = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

export {
  scanDirectoryAsync,
  countFilesAsync,
  performScanWithDatabase,
  shouldIncludeFile,
  formatSize
};