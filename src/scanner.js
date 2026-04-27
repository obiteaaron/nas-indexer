const fs = require('fs');
const path = require('path');
const { database } = require('./database');
const { logger } = require('./logger');

/**
 * 检查文件是否应该被包含（基于后缀过滤）
 * @param {string} filePath - 文件路径
 * @param {Object} filterConfig - 过滤配置 {whitelist: [], blacklist: []}
 * @returns {boolean} - 是否应该包含该文件
 */
function shouldIncludeFile(filePath, filterConfig = {}) {
  const ext = path.extname(filePath).toLowerCase();
  
  // 如果没有配置任何过滤规则，则包含所有文件
  if (!filterConfig.whitelist || filterConfig.whitelist.length === 0) {
    if (!filterConfig.blacklist || filterConfig.blacklist.length === 0) {
      return true;
    }
  }

  // 如果有白名单，只包含白名单中的扩展名
  if (filterConfig.whitelist && filterConfig.whitelist.length > 0) {
    const normalizedWhitelist = filterConfig.whitelist.map(ext => 
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    if (!normalizedWhitelist.includes(ext)) {
      return false;
    }
  }

  // 排除黑名单中的扩展名
  if (filterConfig.blacklist && filterConfig.blacklist.length > 0) {
    const normalizedBlacklist = filterConfig.blacklist.map(ext => 
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    if (normalizedBlacklist.includes(ext)) {
      return false;
    }
  }

  return true;
}

/**
 * 扫描目录并生成文件列表
 * @param {string} dir - 要扫描的目录
 * @param {string[]} excludePatterns - 要排除的模式
 * @param {Object} fileExtensionFilter - 文件扩展名过滤配置
 * @returns {string[]} - 文件全路径列表
 */
function scanDirectory(dir, excludePatterns = [], fileExtensionFilter = {}) {
  const results = [];

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      // 检查是否应该排除
      if (excludePatterns.some(pattern => item.includes(pattern))) {
        continue;
      }

      const fullPath = path.join(dir, item);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // 递归扫描子目录
          results.push(...scanDirectory(fullPath, excludePatterns, fileExtensionFilter));
        } else {
          // 检查文件扩展名过滤
          if (shouldIncludeFile(fullPath, fileExtensionFilter)) {
            results.push(fullPath);
          }
        }
      } catch (err) {
        // 跳过无法访问的文件/目录
        logger.warn('无法访问: %s - %s', fullPath, err.message);
      }
    }
  } catch (err) {
    logger.warn('无法读取目录: %s - %s', dir, err.message);
  }

  return results;
}

async function performScanWithDatabase(scanPaths, excludePatterns = [], fileExtensionFilter = {}) {
  if (!database.initialized) {
    await database.init();
  }

  logger.info('开始扫描，路径: %s', scanPaths.join(', '));

  const scanResults = [];
  let totalFiles = 0;
  let totalSize = 0;

  for (const scanPath of scanPaths) {
    database.deleteByScanPath(scanPath);

    const files = scanDirectory(scanPath, excludePatterns, fileExtensionFilter);
    const filesWithStats = files.map(filePath => {
      try {
        const stat = fs.statSync(filePath);
        totalSize += stat.size;
        return { path: filePath, stat };
      } catch (err) {
        return { path: filePath, stat: null };
      }
    });
    
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

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

module.exports = {
  scanDirectory,
  performScanWithDatabase,
  shouldIncludeFile,
  formatSize
};
