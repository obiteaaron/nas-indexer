/**
 * 游戏名清理模块
 */

const REMOVE_PATTERNS = [
  /\[.*?\]/g,          // [GOG], [Steam], [CRACK], [中文版] 等
  /\(.*?\)/g,          // (v1.0), (中文版), (GOG) 等
  /\.v\d+.*$/i,        // .v1.0.0 版本号
  /-\d+$/,             // -12345 尾部数字
  /_steam$/i,          // _steam 后缀
  /_gog$/i,            // _gog 后缀
  /_crack$/i,          // _crack 后缀
  /\s+v\d+(\.\d+)*$/i, // v1.0 版本号（带空格）
  /\s+build\s*\d+$/i,  // build 12345
  /\s+final$/i,        // final 后缀
  /\s+complete$/i,     // complete 后缀
  /\s+deluxe$/i,       // deluxe 后缀
  /\s+edition$/i,      // edition 后缀
  /\s+remastered$/i,   // remastered 后缀
];

const TRIM_CHARS = [' ', '-', '_', '.'];

/**
 * 清理游戏名，提取纯净的标题
 */
export function cleanGameName(folderName: string): string {
  let cleaned = folderName;

  // 应用所有移除模式
  for (const pattern of REMOVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 移除首尾多余字符
  for (const char of TRIM_CHARS) {
    while (cleaned.startsWith(char)) {
      cleaned = cleaned.slice(1);
    }
    while (cleaned.endsWith(char)) {
      cleaned = cleaned.slice(0, -1);
    }
  }

  // 替换多个空格为单个
  cleaned = cleaned.replace(/\s+/g, ' ');

  // 如果清理后为空，返回原名
  if (!cleaned || cleaned.length < 2) {
    return folderName;
  }

  return cleaned;
}

/**
 * 从文件夹名提取可能的搜索关键词
 */
export function extractSearchKeywords(folderName: string): string[] {
  const cleaned = cleanGameName(folderName);
  const keywords: string[] = [cleaned];

  // 尝试拆分可能的副标题
  const parts = cleaned.split(/[:\-\|]/);
  if (parts.length > 1) {
    // 第一部分通常是主标题
    keywords.push(parts[0].trim());
  }

  return keywords.filter(k => k && k.length > 2);
}