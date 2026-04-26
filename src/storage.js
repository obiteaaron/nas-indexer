const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

/**
 * 存储管理模块 - 统一管理 nas_scan.md 文件的读写和数据处理
 * 
 * 内部数据结构：
 * {
 *   meta: { scanTime, totalFiles, totalSize },
 *   files: [{ path, name, size, ext, localClass }],
 *   stats: { local: {...} }
 * }
 */

// 本地分类映射表 - 基于文件后缀
const EXTENSION_CLASS_MAP = {
  '.mp4': '视频',
  '.mkv': '视频',
  '.avi': '视频',
  '.mov': '视频',
  '.wmv': '视频',
  '.flv': '视频',
  '.webm': '视频',
  '.m4v': '视频',
  '.mpg': '视频',
  '.mpeg': '视频',
  '.mp3': '音频',
  '.wav': '音频',
  '.flac': '音频',
  '.aac': '音频',
  '.ogg': '音频',
  '.wma': '音频',
  '.m4a': '音频',
  '.ape': '音频',
  '.alac': '音频',
  '.jpg': '图片',
  '.jpeg': '图片',
  '.png': '图片',
  '.gif': '图片',
  '.bmp': '图片',
  '.webp': '图片',
  '.svg': '图片',
  '.ico': '图片',
  '.tiff': '图片',
  '.tif': '图片',
  '.pdf': '文档',
  '.doc': '文档',
  '.docx': '文档',
  '.xls': '文档',
  '.xlsx': '文档',
  '.ppt': '文档',
  '.pptx': '文档',
  '.txt': '文档',
  '.rtf': '文档',
  '.odt': '文档',
  '.srt': '字幕',
  '.ass': '字幕',
  '.ssa': '字幕',
  '.sub': '字幕',
  '.vtt': '字幕'
};

/**
 * 根据文件后缀获取本地分类
 */
function classifyByExtension(ext) {
  const normalizedExt = ext.toLowerCase();
  return EXTENSION_CLASS_MAP[normalizedExt] || '其他';
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

/**
 * 解析文件大小字符串为字节
 */
function parseSize(sizeStr) {
  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units = { 'B': 0, 'KB': 1, 'MB': 2, 'GB': 3, 'TB': 4 };
  return value * Math.pow(1024, units[unit]);
}

class FileStorage {
  constructor() {
    this.data = {
      meta: {
        scanTime: null,
        totalFiles: 0,
        totalSize: 0
      },
      files: [],
      stats: {
        local: {}
      }
    };
    this.filePath = null;
  }

  /**
   * 初始化存储 - 设置文件路径并加载现有数据
   * @param {string} filePath - nas_scan.md 文件路径
   */
  init(filePath) {
    this.filePath = filePath;
    
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 加载现有文件
    if (fs.existsSync(filePath)) {
      this.load();
    }
    
    return this;
  }

  /**
   * 从 Markdown 文件加载数据
   */
  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return this.data;
    }

    const content = fs.readFileSync(this.filePath, 'utf-8');
    this.data = this.parseMarkdown(content);
    return this.data;
  }

  /**
   * 解析 Markdown 内容为内部数据结构
   */
  parseMarkdown(content) {
    const data = {
      meta: { scanTime: null, totalFiles: 0, totalSize: 0 },
      files: [],
      stats: { local: {} }
    };

    const lines = content.split('\n');
    let inTable = false;
    let tableHeaders = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('扫描时间：') || line.startsWith('扫描时间:')) {
        data.meta.scanTime = line.replace(/扫描时间[：:]\s*/, '');
        continue;
      }

      if (line.startsWith('| 文件路径')) {
        inTable = true;
        tableHeaders = line.split('|').map(h => h.trim()).filter(h => h);
        continue;
      }

      if (inTable && line.match(/^\|[\s\-:]+\|/)) {
        continue;
      }

      if (inTable && line.startsWith('|') && !line.match(/^\|[\s\-:]+\|/)) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 4) {
          const fileData = {
            path: cells[0] || '',
            name: cells[1] || path.basename(cells[0] || ''),
            size: cells[2] || '0 B',
            ext: cells[3] || path.extname(cells[0] || ''),
            localClass: cells[4] || classifyByExtension(cells[3] || '')
          };
          data.files.push(fileData);
        }
        continue;
      }

      if (inTable && !line.startsWith('|')) {
        inTable = false;
      }

      if (!inTable && line.startsWith('- ') && !line.includes('|')) {
        const filePath = line.substring(2).trim();
        if (filePath) {
          const ext = path.extname(filePath).toLowerCase();
          data.files.push({
            path: filePath,
            name: path.basename(filePath),
            size: '0 B',
            ext: ext,
            localClass: classifyByExtension(ext)
          });
        }
      }
    }

    data.meta.totalFiles = data.files.length;
    data.meta.totalSize = data.files.reduce((sum, f) => sum + parseSize(f.size), 0);
    data.stats = this.calculateStatistics(data.files);

    return data;
  }

  /**
   * 保存数据到 Markdown 文件
   */
  save() {
    if (!this.filePath) {
      throw new Error('存储未初始化，请先调用 init()');
    }

    const content = this.generateMarkdown();
    fs.writeFileSync(this.filePath, content, 'utf-8');
    return true;
  }

  /**
   * 生成 Markdown 内容
   */
  generateMarkdown() {
    const data = this.data;
    let output = '# NAS 文件索引\n\n';

    output += `扫描时间：${data.meta.scanTime || new Date().toLocaleString('zh-CN')}\n`;
    output += `总文件数：${data.meta.totalFiles}\n`;
    output += `总大小：${formatSize(data.meta.totalSize)}\n\n`;
    output += '---\n\n';

    output += '## 文件列表\n\n';
    output += '| 文件路径 | 文件名 | 大小 | 后缀 | 本地分类 |\n';
    output += '|----------|--------|------|------|----------|\n';

    for (const file of data.files) {
      output += `| ${file.path} | ${file.name} | ${file.size} | ${file.ext} | ${file.localClass} |\n`;
    }

    output += '\n---\n\n';

    output += '## 统计汇总\n\n';
    output += '| 分类 | 文件数 | 大小 | 占比 |\n';
    output += '|------|--------|------|------|\n';

    const localStats = data.stats.local || {};
    const localCategories = Object.keys(localStats).sort((a, b) => 
      (localStats[b]?.totalSize || 0) - (localStats[a]?.totalSize || 0)
    );

    for (const cat of localCategories) {
      const stat = localStats[cat];
      const percent = data.meta.totalSize > 0 
        ? ((stat.totalSize / data.meta.totalSize) * 100).toFixed(1) 
        : 0;
      output += `| ${cat} | ${stat.count} | ${formatSize(stat.totalSize)} | ${percent}% |\n`;
    }

    return output;
  }

  /**
   * 计算统计数据
   */
  calculateStatistics(files) {
    const stats = {
      local: {}
    };

    for (const file of files) {
      const localClass = file.localClass || '其他';
      if (!stats.local[localClass]) {
        stats.local[localClass] = { count: 0, totalSize: 0 };
      }
      stats.local[localClass].count++;
      stats.local[localClass].totalSize += parseSize(file.size);
    }

    return stats;
  }

  updateFromScan(scanResults) {
    const newFiles = [];

    for (const result of scanResults) {
      if (!result.files || result.files.length === 0) continue;

      for (const filePath of result.files) {
        let fileSize = 0;
        try {
          const stat = fs.statSync(filePath);
          fileSize = stat.size;
        } catch (err) {
          logger.warn('无法获取文件大小: %s', filePath);
        }

        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);
        const localClass = classifyByExtension(ext);

        newFiles.push({
          path: filePath,
          name: fileName,
          size: formatSize(fileSize),
          ext: ext,
          localClass: localClass
        });
      }
    }

    this.data.files = newFiles;
    this.data.meta.scanTime = new Date().toLocaleString('zh-CN');
    this.data.meta.totalFiles = newFiles.length;
    this.data.meta.totalSize = newFiles.reduce((sum, f) => sum + parseSize(f.size), 0);
    this.data.stats = this.calculateStatistics(newFiles);

    this.save();

    return this.data;
  }

  getStatistics() {
    return {
      meta: this.data.meta,
      local: this.data.stats.local
    };
  }

  searchFiles(query) {
    if (!query) return this.data.files;

    const lowerQuery = query.toLowerCase();
    return this.data.files.filter(f => 
      f.path.toLowerCase().includes(lowerQuery) ||
      f.name.toLowerCase().includes(lowerQuery) ||
      f.localClass.toLowerCase().includes(lowerQuery)
    );
  }

  getFilesByCategory(category) {
    return this.data.files.filter(f => f.localClass === category);
  }

  getAllFiles() {
    return this.data.files;
  }

  getFilePaths() {
    return this.data.files.map(f => f.path);
  }

  getMarkdownContent() {
    return this.generateMarkdown();
  }

  clear() {
    this.data = {
      meta: { scanTime: null, totalFiles: 0, totalSize: 0 },
      files: [],
      stats: { local: {} }
    };
    return this;
  }

  hasData() {
    return this.data.files.length > 0;
  }
}

// 导出单例
const storage = new FileStorage();

module.exports = {
  storage,
  FileStorage,
  classifyByExtension,
  formatSize,
  parseSize,
  EXTENSION_CLASS_MAP
};