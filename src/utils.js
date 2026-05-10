const path = require('path');
const fs = require('fs');
const { database } = require('./database');
const { logger } = require('./logger');

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

function loadConfig() {
  try {
    const defaultConfig = getDefaultConfig();

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
  ensureStorageDir(config);
  const configFilePath = getStorageFilePath(config, 'config.json');
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('配置已保存: %s', configFilePath);
  return true;
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_STORAGE_PATH,
  DEFAULT_CONFIG_FILE,
  initDatabase,
  getStoragePath,
  getStorageFilePath,
  ensureStorageDir,
  getDefaultConfig,
  loadConfig,
  saveConfig
};
