/**
 * 游戏名智能处理模块
 * 用于统一处理 Steam DB 和游戏记录的中英文名称
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { cleanGameName } from './name-cleaner';

/**
 * 判断字符串是否包含中文
 */
export function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/**
 * 游戏名处理结果
 */
export interface NameResolveResult {
  /** 中文名称 */
  name: string;
  /** 英文名称 */
  nameEn?: string;
  /** 别名列表 */
  aliases: string[];
}

/**
 * 路径提取名称结果
 */
export interface PathExtractResult {
  /** 中文名称（从中文目录提取） */
  title: string;
  /** 英文名称（从英文子目录/文件名提取） */
  titleEn: string | null;
  /** 原始目录名 */
  originalName: string;
  /** 提取来源详情 */
  source: {
    titleFrom: 'dir' | 'parent';
    titleEnFrom: 'child_dir' | 'file' | 'none';
    detail?: string;
  };
}

/**
 * 从子目录/文件中查找英文名称
 * 优先级：子目录名 > 安装包文件名 > 其他可执行文件
 */
function findEnglishNameInChildren(dirPath: string): { name: string; source: 'child_dir' | 'file'; detail: string } | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    const dirCandidates: string[] = [];
    const fileCandidates: string[] = [];

    for (const entry of entries) {
      const name = entry.name;

      // 跳过明显无关文件/目录
      if (name.startsWith('.') ||
          name.toLowerCase() === 'readme' ||
          name.toLowerCase() === 'manual' ||
          name.toLowerCase() === 'docs' ||
          name.toLowerCase() === 'support' ||
          name.toLowerCase() === 'redist' ||
          name.toLowerCase() === 'common') continue;

      if (entry.isDirectory()) {
        // 子目录：如果不是中文，作为候选
        if (!hasChinese(name)) {
          const cleaned = cleanGameName(name);
          if (cleaned.length >= 3) {
            dirCandidates.push(cleaned);
          }
        }
      } else if (entry.isFile()) {
        // 安装包/可执行文件
        const ext = path.extname(name).toLowerCase();
        if (['.exe', '.msi', '.iso', '.bin'].includes(ext)) {
          const baseName = path.basename(name, ext);
          // 跳过常见非游戏文件
          const skipNames = ['setup', 'install', 'uninstall', 'launcher', 'config', 'readme', 'setup-', 'installer'];
          if (skipNames.some(s => baseName.toLowerCase().startsWith(s))) continue;

          if (!hasChinese(baseName)) {
            const cleaned = cleanGameName(baseName);
            if (cleaned.length >= 3) {
              fileCandidates.push(cleaned);
            }
          }
        }
      }
    }

    // 优先使用子目录名，其次文件名
    if (dirCandidates.length > 0) {
      // 选择最长的候选（通常是完整名称）
      const selected = dirCandidates.sort((a, b) => b.length - a.length)[0];
      return { name: selected, source: 'child_dir', detail: `子目录: ${selected}` };
    }

    if (fileCandidates.length > 0) {
      // 选择最长的候选
      const selected = fileCandidates.sort((a, b) => b.length - a.length)[0];
      return { name: selected, source: 'file', detail: `文件: ${selected}` };
    }

    return null;
  } catch (err) {
    logger.debug('[路径名称提取] 读取目录失败: %s', dirPath);
    return null;
  }
}

/**
 * 从路径提取中英文名称
 *
 * 规则：
 * 1. 目录名是中文 → title = 目录名，titleEn = 从子内容提取英文名
 * 2. 目录名是英文 → titleEn = 目录名，title = 从父目录提取中文名（如果有）
 *
 * @param gamePath 游戏目录完整路径
 * @param scanRoot 扫描根目录（用于判断父目录边界）
 */
export function extractNamesFromPath(gamePath: string, scanRoot?: string): PathExtractResult {
  const dirName = path.basename(gamePath);
  const cleanedDirName = cleanGameName(dirName);
  const dirIsChinese = hasChinese(dirName);

  const result: PathExtractResult = {
    title: cleanedDirName,
    titleEn: null,
    originalName: dirName,
    source: {
      titleFrom: 'dir',
      titleEnFrom: 'none'
    }
  };

  if (dirIsChinese) {
    // 目录名是中文 → title = 目录名
    result.title = cleanedDirName;
    result.source.titleFrom = 'dir';

    // 从子目录/文件提取英文名
    const englishResult = findEnglishNameInChildren(gamePath);
    if (englishResult) {
      result.titleEn = englishResult.name;
      result.source.titleEnFrom = englishResult.source;
      result.source.detail = englishResult.detail;

      logger.debug('[路径名称提取] 中文目录提取成功: %s → title="%s", titleEn="%s" (%s)',
        dirName, result.title, result.titleEn, englishResult.detail);
    }
  } else {
    // 目录名是英文 → titleEn = 目录名
    result.titleEn = cleanedDirName;
    result.source.titleEnFrom = 'child_dir';  // 实际上是当前目录

    // 尝试从父目录提取中文名
    const parentPath = path.dirname(gamePath);
    const parentName = path.basename(parentPath);

    // 父目录不是扫描根目录，且父目录名是中文
    if (scanRoot && parentPath !== path.resolve(scanRoot) && parentPath !== scanRoot) {
      if (hasChinese(parentName)) {
        result.title = cleanGameName(parentName);
        result.source.titleFrom = 'parent';

        logger.debug('[路径名称提取] 英文目录提取成功: %s → title="%s" (父目录), titleEn="%s"',
          dirName, result.title, result.titleEn);
      } else {
        // 父目录也不是中文，title 使用英文目录名
        result.title = cleanedDirName;
        result.source.titleFrom = 'dir';
      }
    } else {
      // 无父目录或父目录是扫描根，title 使用英文目录名
      result.title = cleanedDirName;
      result.source.titleFrom = 'dir';
    }
  }

  return result;
}

/**
 * 智能处理游戏名称
 * 根据 Steam 名称和目录名的中英文特征，智能分配 name/name_en/aliases
 *
 * 规则：
 * 1. Steam 名是中文 → name = Steam名，目录名作为别名（如果不同）
 * 2. Steam 名是英文 → nameEn = Steam名
 *    - 目录名是中文 → name = 目录名
 *    - 目录名作为别名（如果不是主名称）
 * 3. 如果提供了 steamNameEn，直接使用作为 nameEn
 *
 * @param steamName Steam API 返回的游戏名
 * @param dirName 游戏目录名（original_name）
 * @param existingAliases 已有别名列表（用于合并）
 * @param steamNameEn Steam API 返回的英文名（可选，如果有则直接使用）
 */
export function resolveGameNames(
  steamName: string,
  dirName?: string,
  existingAliases: string[] = [],
  steamNameEn?: string
): NameResolveResult {
  const steamNameHasChinese = hasChinese(steamName);
  const dirNameHasChinese = dirName ? hasChinese(dirName) : false;

  const result: NameResolveResult = {
    name: '',
    nameEn: undefined,
    aliases: [...existingAliases]
  };

  if (steamNameHasChinese) {
    // Steam 名是中文 → name = Steam 名
    result.name = steamName;
    // 如果有英文名，直接使用
    if (steamNameEn) {
      result.nameEn = steamNameEn;
    }
    // 目录名如果不是 Steam 名，作为别名
    if (dirName && dirName !== steamName && !result.aliases.includes(dirName)) {
      result.aliases.push(dirName);
    }
  } else {
    // Steam 名是英文 → nameEn = Steam 名
    result.nameEn = steamNameEn || steamName;
    // 目录名如果是中文，则作为中文名
    if (dirNameHasChinese && dirName) {
      result.name = dirName;
    } else {
      // 目录名不是中文，使用 Steam 名作为默认 name
      result.name = steamName;
    }
    // 目录名如果不是主名称，作为别名
    if (dirName && dirName !== steamName && dirName !== result.name && !result.aliases.includes(dirName)) {
      result.aliases.push(dirName);
    }
  }

  return result;
}