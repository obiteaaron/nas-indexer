const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { performScanWithDatabase, formatSize } = require('./scanner');
const { database } = require('./database');
const { fileOps } = require('./file-ops');
const { streamFile, serveImage, servePdf, getPreviewType } = require('./stream');
const { logger } = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_STORAGE_PATH = path.join(PROJECT_ROOT, 'profiles');
const DEFAULT_CONFIG_FILE = path.join(PROJECT_ROOT, 'config.default.json');

let dbInitialized = false;

async function initDatabase() {
  if (!dbInitialized) {
    await database.init();
    dbInitialized = true;
  }
}

function getStoragePath(config) {
  if (config.storagePath && config.storagePath.trim() !== '') {
    let storagePath = config.storagePath;
    if (!path.isAbsolute(storagePath)) {
      storagePath = path.resolve(PROJECT_ROOT, storagePath);
    }
    return storagePath;
  }
  return DEFAULT_STORAGE_PATH;
}

function getStorageFilePath(config, filename) {
  const storagePath = getStoragePath(config);
  return path.join(storagePath, filename);
}

function ensureStorageDir(config) {
  const storagePath = getStoragePath(config);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
    logger.info('已创建存储目录: %s', storagePath);
  }
  return storagePath;
}

function loadConfig() {
  try {
    let defaultConfig = getDefaultConfig();
    
    const profilesConfigPath = path.join(DEFAULT_STORAGE_PATH, 'config.json');
    if (fs.existsSync(profilesConfigPath)) {
      const config = JSON.parse(fs.readFileSync(profilesConfigPath, 'utf-8'));
      logger.info('从 profiles 目录加载配置: %s', profilesConfigPath);
      return config;
    }
    
    const envStoragePath = process.env.NAS_STORAGE_PATH;
    if (envStoragePath) {
      const envConfigPath = path.join(envStoragePath, 'config.json');
      if (fs.existsSync(envConfigPath)) {
        const config = JSON.parse(fs.readFileSync(envConfigPath, 'utf-8'));
        logger.info('从环境变量指定路径加载配置: %s', envConfigPath);
        return config;
      }
    }
    
    const userHome = process.env.USERPROFILE || process.env.HOME || require('os').homedir();
    const legacyConfigPath = path.join(userHome, 'nasscanclassllm', 'config.json');
    if (fs.existsSync(legacyConfigPath)) {
      const config = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
      logger.info('检测到旧版本配置，正在迁移到 profiles 目录...');
      if (!config.storagePath) {
        config.storagePath = '';
      }
      ensureStorageDir(defaultConfig);
      fs.writeFileSync(profilesConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      logger.info('配置已迁移: %s', profilesConfigPath);
      return config;
    }
    
    ensureStorageDir(defaultConfig);
    fs.writeFileSync(profilesConfigPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    logger.info('使用默认配置，已保存到: %s', profilesConfigPath);
    return defaultConfig;
  } catch (err) {
    logger.error('加载配置失败: %s', err.message);
    return getDefaultConfig();
  }
}

function saveConfig(config) {
  const storagePath = ensureStorageDir(config);
  const configFilePath = getStorageFilePath(config, 'config.json');
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('配置已保存: %s', configFilePath);
  return true;
}

function getDefaultConfig() {
  try {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      const defaultConfig = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8'));
      return defaultConfig;
    }
  } catch (err) {
    logger.warn('加载默认配置文件失败，使用内置默认值: %s', err.message);
  }
  
  return {
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
    categories: ['电影/视频', '音乐/音频', '文档/资料', '软件/安装包', '图片/照片', '项目/代码', '备份/归档', '其他']
  };
}

let scanJob = null;
let scanningPaths = new Set();

function scheduleScan(config) {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
  }

  if (config.scanPaths && config.scanPaths.length > 0) {
    scanJob = cron.schedule(config.scanTime, async () => {
      logger.info('[%s] 定时扫描开始', new Date().toLocaleString());
      await runScan(config);
    }, {
      timezone: 'Asia/Shanghai'
    });
    logger.info('定时扫描已设置: %s', config.scanTime);
  }
}

async function runScan(config) {
  try {
    ensureStorageDir(config);
    
    await initDatabase();
    
    if (config.categoryRules) {
      database.setCategoryRules(config.categoryRules);
    }
    if (config.categoryPathRules) {
      database.setCategoryPathRules(config.categoryPathRules);
    }
    
    const result = await performScanWithDatabase(
      config.scanPaths,
      config.excludePatterns || [],
      config.fileExtensionFilter || { whitelist: [], blacklist: [] }
    );

    return result;
  } catch (err) {
    logger.error('扫描失败: %s', err.message);
    throw err;
  }
}

// API Routes

app.get('/api/config', async (req, res) => {
  await initDatabase();
  const config = loadConfig();
  res.json(config);
});

app.post('/api/config', async (req, res) => {
  await initDatabase();
  try {
    const newConfig = { ...loadConfig(), ...req.body };
    saveConfig(newConfig);
    scheduleScan(newConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/config/full', async (req, res) => {
  await initDatabase();
  const config = loadConfig();
  res.json(config);
});

app.get('/api/storage/path', async (req, res) => {
  await initDatabase();
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const profilesPath = DEFAULT_STORAGE_PATH;
    
    res.json({
      success: true,
      storagePath,
      profilesPath,
      isCustom: config.storagePath && config.storagePath.trim() !== '',
      exists: fs.existsSync(storagePath)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scan', async (req, res) => {
  try {
    await initDatabase();
    const config = loadConfig();

    if (!config.scanPaths || config.scanPaths.length === 0) {
      return res.status(400).json({ success: false, error: '请先配置扫描路径' });
    }

    const result = await runScan(config);

    res.json({
      success: true,
      message: '扫描完成',
      data: {
        scannedPaths: result.results.map(r => ({ path: r.path, fileCount: r.fileCount || 0 })),
        totalFiles: result.totalFiles,
        totalSize: formatSize(result.totalSize)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scan/path', async (req, res) => {
    try {
      await initDatabase();
      const { path: scanPath } = req.body;
      
      if (!scanPath) {
        return res.status(400).json({ success: false, error: '请提供扫描路径' });
      }
      
      if (!fs.existsSync(scanPath)) {
        return res.status(400).json({ success: false, error: '路径不存在' });
      }

      if (scanningPaths.has(scanPath)) {
        return res.status(409).json({ success: false, error: '该路径正在扫描中，请稍后再试' });
      }

      scanningPaths.add(scanPath);
      
      const config = loadConfig();
      
      if (config.categoryRules) {
        database.setCategoryRules(config.categoryRules);
      }
      if (config.categoryPathRules) {
        database.setCategoryPathRules(config.categoryPathRules);
      }
      
      try {
        const result = await performScanWithDatabase(
          [scanPath],
          config.excludePatterns || [],
          config.fileExtensionFilter || { whitelist: [], blacklist: [] }
        );

        res.json({
          success: true,
          message: '扫描完成',
          data: {
            scannedPath: scanPath,
            fileCount: result.results[0]?.fileCount || 0,
            totalFiles: result.totalFiles,
            totalSize: formatSize(result.totalSize)
          }
        });
      } finally {
        scanningPaths.delete(scanPath);
      }
    } catch (err) {
      scanningPaths.delete(req.body.path);
      res.status(500).json({ success: false, error: err.message });
    }
  });

app.get('/api/statistics', async (req, res) => {
  await initDatabase();
  try {
    const categoryStats = database.getStatistics();
    const totalStats = database.getTotalStats();

    const formattedStats = categoryStats.map(stat => ({
      category: stat.category,
      count: stat.count,
      size: formatSize(stat.totalSize),
      sizeBytes: stat.totalSize,
      percent: totalStats.totalSize > 0 ? ((stat.totalSize / totalStats.totalSize) * 100).toFixed(1) : 0
    }));

    res.json({
      success: true,
      stats: {
        meta: {
          totalFiles: totalStats.totalFiles,
          totalSize: formatSize(totalStats.totalSize),
          totalSizeBytes: totalStats.totalSize
        },
        categories: formattedStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/status', async (req, res) => {
  await initDatabase();
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);

    const totalStats = database.getTotalStats();
    const hasData = totalStats.totalFiles > 0;

    res.json({
      success: true,
      status: {
        storagePath,
        hasData,
        totalFiles: totalStats.totalFiles,
        totalSize: formatSize(totalStats.totalSize),
        scheduled: scanJob !== null,
        nextScan: scanJob ? '按 cron 计划执行' : '未设置'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// File Management API

app.get('/api/files', async (req, res) => {
  await initDatabase();
  try {
    const { category, search, orderBy, orderDir, page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    if (search && search.trim()) {
      database.addSearchHistory(search.trim());
    }

    const files = database.getFiles({
      category,
      search,
      orderBy: orderBy || 'name',
      orderDir: orderDir || 'ASC',
      limit,
      offset
    });

    const total = database.getFileCount({ category, search });

    const formattedFiles = files.map(f => ({
      ...f,
      sizeFormatted: formatSize(f.size || 0)
    }));

    res.json({
      success: true,
      data: {
        files: formattedFiles,
        total,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/files/by-tags', async (req, res) => {
  await initDatabase();
  try {
    const { tagIds, matchAll, page, pageSize, orderBy, orderDir } = req.query;
    if (!tagIds) {
      return res.status(400).json({ success: false, error: '请提供标签ID' });
    }
    const tagIdArray = tagIds.split(',').map(id => parseInt(id.trim()));
    const result = database.getFilesByTags(tagIdArray, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
      orderBy: orderBy || 'name',
      orderDir: orderDir || 'ASC',
      matchAll: matchAll === 'true'
    });
    const formattedFiles = result.files.map(f => ({
      ...f,
      sizeFormatted: formatSize(f.size || 0)
    }));
    res.json({
      success: true,
      data: {
        files: formattedFiles,
        total: result.total,
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 50,
        totalPages: Math.ceil(result.total / (parseInt(pageSize) || 50))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/files/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const info = fileOps.getFileInfo(file.path);
    res.json({ success: true, data: { ...file, ...info.info, sizeFormatted: formatSize(file.size || 0) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/open', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const result = fileOps.openInExplorer(file.path);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/rename', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const { newName } = req.body;
    if (!newName) {
      return res.status(400).json({ success: false, error: '请提供新名称' });
    }

    const result = fileOps.renameFile(file.path, newName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/copy', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const { targetDir } = req.body;
    if (!targetDir) {
      return res.status(400).json({ success: false, error: '请提供目标目录' });
    }

    const result = fileOps.copyFile(file.path, targetDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/move', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const { targetDir } = req.body;
    if (!targetDir) {
      return res.status(400).json({ success: false, error: '请提供目标目录' });
    }

    const result = fileOps.moveFile(file.path, targetDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/files/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const { permanent } = req.query;
    const result = fileOps.deleteFile(file.path, permanent === 'true');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/folder', async (req, res) => {
  await initDatabase();
  try {
    const { parentPath, folderName } = req.body;
    if (!parentPath || !folderName) {
      return res.status(400).json({ success: false, error: '请提供父目录和文件夹名称' });
    }

    const result = fileOps.createFolder(parentPath, folderName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/directory', async (req, res) => {
  await initDatabase();
  try {
    const { path: dirPath } = req.query;
    if (!dirPath) {
      return res.status(400).json({ success: false, error: '请提供目录路径' });
    }

    const result = fileOps.getDirectoryContent(dirPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Favorites API

app.get('/api/favorites', async (req, res) => {
  await initDatabase();
  try {
    const favorites = database.getFavorites();
    const formatted = favorites.map(f => ({
      ...f,
      sizeFormatted: formatSize(f.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/favorites/:id', async (req, res) => {
  await initDatabase();
  try {
    database.addFavorite(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/favorites/:id', async (req, res) => {
  await initDatabase();
  try {
    database.removeFavorite(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Preview API

app.get('/api/preview/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const previewType = getPreviewType(file.ext);
    res.json({
      success: true,
      data: {
        path: file.path,
        name: file.name,
        ext: file.ext,
        previewType,
        previewUrl: `/api/stream/${file.id}`
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stream/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const previewType = getPreviewType(file.ext);
    
    if (previewType === 'image') {
      serveImage(res, file.path);
    } else if (previewType === 'pdf') {
      servePdf(res, file.path);
    } else {
      streamFile(req, res, file.path);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search History API

app.get('/api/search/history', async (req, res) => {
  await initDatabase();
  try {
    const history = database.getSearchHistory(10);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/search/history', async (req, res) => {
  await initDatabase();
  try {
    database.clearSearchHistory();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Categories API

app.get('/api/categories', async (req, res) => {
  await initDatabase();
  try {
    const stats = database.getStatistics();
    const categories = stats.map(s => s.category);
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tag Groups API

app.get('/api/tag-groups', async (req, res) => {
  await initDatabase();
  try {
    const groups = database.getTagGroups();
    const groupsWithTags = groups.map(group => {
      const tags = database.getTags(group.id);
      return { ...group, tags };
    });
    res.json({ success: true, data: groupsWithTags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tag-groups', async (req, res) => {
  await initDatabase();
  try {
    const { name, color, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '请提供分组名称' });
    }
    const id = database.createTagGroup(name, color || '#6366f1', sortOrder || 0);
    const group = database.getTagGroupById(id);
    res.json({ success: true, data: { ...group, tags: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/tag-groups/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const group = database.getTagGroupById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: '分组不存在' });
    }
    database.updateTagGroup(id, req.body);
    const updated = database.getTagGroupById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tag-groups/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const group = database.getTagGroupById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: '分组不存在' });
    }
    database.deleteTagGroup(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tags API

app.get('/api/tags', async (req, res) => {
  await initDatabase();
  try {
    const { groupId } = req.query;
    const tags = groupId ? database.getTags(parseInt(groupId)) : database.getAllTagsWithGroup();
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tags', async (req, res) => {
  await initDatabase();
  try {
    const { name, groupId, color, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '请提供标签名称' });
    }
    const id = database.createTag(name, groupId || null, color || '#6366f1', sortOrder || 0);
    const tag = database.getTagById(id);
    res.json({ success: true, data: tag });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/tags/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const tag = database.getTagById(id);
    if (!tag) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    database.updateTag(id, req.body);
    const updated = database.getTagById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const tag = database.getTagById(id);
    if (!tag) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    database.deleteTag(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tags/stats', async (req, res) => {
  await initDatabase();
  try {
    const stats = database.getTagStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// File Tags API

app.get('/api/files/:id/tags', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/tags', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const { tagId } = req.body;
    if (!tagId) {
      return res.status(400).json({ success: false, error: '请提供标签ID' });
    }
    database.addFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/files/:id/tags/:tagId', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    database.removeFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/batch/tags', async (req, res) => {
  await initDatabase();
  try {
    const { fileIds, tagIds, action } = req.body;
    if (!fileIds || !fileIds.length || !tagIds || !tagIds.length) {
      return res.status(400).json({ success: false, error: '请提供文件ID和标签ID' });
    }
    if (action === 'add') {
      database.batchAddFileTags(fileIds, tagIds);
    } else if (action === 'remove') {
      database.batchRemoveFileTags(fileIds, tagIds);
    } else {
      return res.status(400).json({ success: false, error: '无效的操作类型' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 行为追踪 API

app.post('/api/files/:id/view', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const { playDuration } = req.body;
    database.recordFileView(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/preview', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const { playDuration } = req.body;
    database.recordFilePreview(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/:id/action', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const { actionType, tagId, ...extraData } = req.body;
    if (!actionType) {
      return res.status(400).json({ success: false, error: '请提供操作类型' });
    }
    if (actionType !== 'search') {
      const file = database.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: '文件不存在' });
      }
    }
    database.recordUserAction(actionType, { file_id: fileId || null, tag_id: tagId, ...extraData });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/files/views', async (req, res) => {
  await initDatabase();
  try {
    const limit = parseInt(req.query.limit) || 50;
    const views = database.getFileViews(limit);
    const formatted = views.map(v => ({
      ...v,
      sizeFormatted: formatSize(v.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 偏好分析 API

app.get('/api/preferences', async (req, res) => {
  await initDatabase();
  try {
    const config = loadConfig();
    const trackingEnabled = config.trackingConfig?.trackingEnabled ?? true;
    if (!trackingEnabled) {
      return res.json({ success: true, data: { enabled: false, categories: [], tags: [], keywords: [] } });
    }
    const prefs = database.calculatePreferences();
    res.json({ success: true, data: { enabled: true, ...prefs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/preferences/clear', async (req, res) => {
  await initDatabase();
  try {
    database.clearPreferencesData();
    res.json({ success: true, message: '偏好数据已清除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 推荐 API

app.get('/api/recommendations', async (req, res) => {
  await initDatabase();
  try {
    const type = req.query.type || null;
    const limit = parseInt(req.query.limit) || 20;
    const recs = database.getRecommendations(type, limit);
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/recommendations/generate', async (req, res) => {
  await initDatabase();
  try {
    const recs = database.generateRecommendations();
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted, message: '推荐已生成' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Static files - serve Vue frontend
const frontendPath = path.join(PROJECT_ROOT, 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  app.use(express.static(path.join(__dirname, '../public')));
}

const server = app.listen(PORT, async () => {
  await initDatabase();
  logger.info('\n🚀 NAS Indexer v1.0.5 服务已启动');
  logger.info('📍 访问地址: http://localhost:%d', PORT);
  logger.info('📁 默认存储目录: %s\n', DEFAULT_STORAGE_PATH);

  const config = loadConfig();
  const storagePath = getStoragePath(config);
  logger.info('📂 当前存储目录: %s', storagePath);
  
  scheduleScan(config);
});

module.exports = { app, server };