/**
 * 游戏名智能处理模块
 * 用于统一处理 Steam DB 和游戏记录的中英文名称
 */

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
 * 智能处理游戏名称
 * 根据 Steam 名称和目录名的中英文特征，智能分配 name/name_en/aliases
 *
 * 规则：
 * 1. Steam 名是中文 → name = Steam名，目录名作为别名（如果不同）
 * 2. Steam 名是英文 → nameEn = Steam名
 *    - 目录名是中文 → name = 目录名
 *    - 目录名作为别名（如果不是主名称）
 *
 * @param steamName Steam API 返回的游戏名
 * @param dirName 游戏目录名（original_name）
 * @param existingAliases 已有别名列表（用于合并）
 */
export function resolveGameNames(
  steamName: string,
  dirName?: string,
  existingAliases: string[] = []
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
    // 目录名如果不是 Steam 名，作为别名
    if (dirName && dirName !== steamName && !result.aliases.includes(dirName)) {
      result.aliases.push(dirName);
    }
  } else {
    // Steam 名是英文 → nameEn = Steam 名
    result.nameEn = steamName;
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