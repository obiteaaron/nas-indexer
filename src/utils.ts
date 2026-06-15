import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from './logger';
import type { Config } from './types';
import { DEFAULT_GAMES_CONFIG } from './types/games-config';

const PROJECT_ROOT: string = path.join(__dirname, '..');
const DEFAULT_STORAGE_PATH: string = path.join(PROJECT_ROOT, 'profiles');
const DEFAULT_CONFIG_FILE: string = path.join(PROJECT_ROOT, 'config.default.json');

let dbInitialized: boolean = false;

async function initDatabase(): Promise<void> {
  if (!dbInitialized) {
    // 使用 require 避免循环依赖问题（database 尚未迁移到 TS）
    const { database } = require('./database');
    await database.init();
    dbInitialized = true;
  }
}

function getStoragePath(config: Config): string {
  if (config.storagePath && config.storagePath.trim() !== '') {
    let storagePath: string = config.storagePath;
    if (!path.isAbsolute(storagePath)) {
      storagePath = path.resolve(PROJECT_ROOT, storagePath);
    }
    return storagePath;
  }
  return DEFAULT_STORAGE_PATH;
}

function getStorageFilePath(config: Config, filename: string): string {
  const storagePath: string = getStoragePath(config);
  return path.join(storagePath, filename);
}

function ensureStorageDir(config: Config): string {
  const storagePath: string = getStoragePath(config);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
    logger.info('已创建存储目录: %s', storagePath);
  }
  return storagePath;
}

function getDefaultConfig(): Config {
  const builtinDefault: Config = {
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
    categories: ['电影/视频', '音乐/音频', '文档/资料', '软件/安装包', '图片/照片', '项目/代码', '备份/归档', '其他'],
    gamesEnabled: false,
    gameScanPathsEnabled: DEFAULT_GAMES_CONFIG.gameScanPathsEnabled,
    gameScanPaths: DEFAULT_GAMES_CONFIG.gameScanPaths,
    gamesRules: DEFAULT_GAMES_CONFIG.gamesRules,
    gamesScrape: DEFAULT_GAMES_CONFIG.gamesScrape
  };

  try {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      const rawDefaultConfig = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8'));

      // 深度合并内置默认值和文件配置
      const mergedConfig: Config = {
        ...builtinDefault,
        ...rawDefaultConfig,
        gamesRules: {
          ...builtinDefault.gamesRules!,
          ...(rawDefaultConfig.gamesRules || {}),
          heuristicRules: {
            ...builtinDefault.gamesRules!.heuristicRules,
            ...(rawDefaultConfig.gamesRules?.heuristicRules || {})
          }
        },
        gamesScrape: {
          ...builtinDefault.gamesScrape!,
          ...(rawDefaultConfig.gamesScrape || {})
        }
      };

      return mergedConfig;
    }
  } catch (err) {
    const error = err as Error;
    logger.warn('加载默认配置文件失败，使用内置默认值: %s', error.message);
  }

  return builtinDefault;
}

function loadConfig(): Config {
  try {
    const defaultConfig: Config = getDefaultConfig();

    const profilesConfigPath: string = path.join(DEFAULT_STORAGE_PATH, 'config.json');
    if (fs.existsSync(profilesConfigPath)) {
      const rawConfig = JSON.parse(fs.readFileSync(profilesConfigPath, 'utf-8'));
      logger.debug('从 profiles 目录加载配置: %s', profilesConfigPath);

      // 合并默认值，确保所有字段都存在
      const config: Config = {
        ...defaultConfig,
        ...rawConfig,
        // 特殊处理嵌套对象，确保默认值存在
        gamesRules: {
          ...defaultConfig.gamesRules!,
          ...(rawConfig.gamesRules || {}),
          heuristicRules: {
            ...defaultConfig.gamesRules!.heuristicRules,
            ...(rawConfig.gamesRules?.heuristicRules || {})
          }
        },
        gamesScrape: {
          ...defaultConfig.gamesScrape!,
          ...(rawConfig.gamesScrape || {})
        }
      };

      return config;
    }

    const envStoragePath: string | undefined = process.env.NAS_STORAGE_PATH;
    if (envStoragePath) {
      const envConfigPath: string = path.join(envStoragePath, 'config.json');
      if (fs.existsSync(envConfigPath)) {
        const rawConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf-8'));
        logger.info('从环境变量指定路径加载配置: %s', envConfigPath);

        // 合并默认值
        const config: Config = {
          ...defaultConfig,
          ...rawConfig,
          gamesRules: {
            ...defaultConfig.gamesRules!,
            ...(rawConfig.gamesRules || {}),
            heuristicRules: {
              ...defaultConfig.gamesRules!.heuristicRules,
              ...(rawConfig.gamesRules?.heuristicRules || {})
            }
          },
          gamesScrape: {
            ...defaultConfig.gamesScrape!,
            ...(rawConfig.gamesScrape || {})
          }
        };

        return config;
      }
    }

    const userHome: string = process.env.USERPROFILE || process.env.HOME || os.homedir();
    const legacyConfigPath: string = path.join(userHome, 'nasscanclassllm', 'config.json');
    if (fs.existsSync(legacyConfigPath)) {
      const rawConfig = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
      logger.info('检测到旧版本配置，正在迁移到 profiles 目录...');

      // 合并默认值
      const config: Config = {
        ...defaultConfig,
        ...rawConfig,
        gamesRules: {
          ...defaultConfig.gamesRules!,
          ...(rawConfig.gamesRules || {}),
          heuristicRules: {
            ...defaultConfig.gamesRules!.heuristicRules,
            ...(rawConfig.gamesRules?.heuristicRules || {})
          }
        },
        gamesScrape: {
          ...defaultConfig.gamesScrape!,
          ...(rawConfig.gamesScrape || {})
        }
      };

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
    const error = err as Error;
    logger.error('加载配置失败: %s', error.message);
    return getDefaultConfig();
  }
}

function saveConfig(config: Config): boolean {
  ensureStorageDir(config);
  const configFilePath: string = getStorageFilePath(config, 'config.json');
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('配置已保存: %s', configFilePath);
  return true;
}

function getFileScanPaths(config: Config): string[] {
  return config.scanPaths;
}

export {
  PROJECT_ROOT,
  DEFAULT_STORAGE_PATH,
  DEFAULT_CONFIG_FILE,
  initDatabase,
  getStoragePath,
  getStorageFilePath,
  ensureStorageDir,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  getFileScanPaths
};