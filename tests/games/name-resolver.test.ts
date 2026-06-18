/**
 * 路径名称提取测试
 */

import path from 'path';
import fs from 'fs';
import { extractNamesFromPath, hasChinese } from '../../src/games/name-resolver';

// Mock fs.readdirSync
jest.mock('fs', () => ({
  readdirSync: jest.fn(),
  existsSync: jest.fn(() => true),
}));

describe('路径名称提取', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasChinese', () => {
    it('应正确识别中文字符', () => {
      expect(hasChinese('巫师3')).toBe(true);
      expect(hasChinese('艾尔登法环')).toBe(true);
      expect(hasChinese('黑神话：悟空')).toBe(true);
      expect(hasChinese('赛博朋克2077')).toBe(true);
    });

    it('应正确识别纯英文字符', () => {
      expect(hasChinese('The Witcher 3')).toBe(false);
      expect(hasChinese('Elden Ring')).toBe(false);
      expect(hasChinese('Cyberpunk 2077')).toBe(false);
    });

    it('应正确识别混合字符', () => {
      expect(hasChinese('巫师3 Wild Hunt')).toBe(true);
      expect(hasChinese('Elden Ring 老头环')).toBe(true);
    });
  });

  describe('extractNamesFromPath - 中文目录', () => {
    it('中文目录名应作为 title', () => {
      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.source.titleFrom).toBe('dir');
    });

    it('中文目录+英文子目录应提取中英文名', () => {
      // Mock 子目录返回英文游戏名
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'The Witcher 3 Wild Hunt', isDirectory: () => true, isFile: () => false },
        { name: 'setup.exe', isDirectory: () => false, isFile: () => true },
      ]);

      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.titleEn).toBe('The Witcher 3 Wild Hunt');
      expect(result.source.titleEnFrom).toBe('child_dir');
    });

    it('中文目录+英文安装包应提取英文名', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'Witcher3.exe', isDirectory: () => false, isFile: () => true },
        { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
      ]);

      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.titleEn).toBe('Witcher3');
      expect(result.source.titleEnFrom).toBe('file');
    });

    it('应跳过常见非游戏文件', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'Setup.exe', isDirectory: () => false, isFile: () => true },
        { name: 'Uninstall.exe', isDirectory: () => false, isFile: () => true },
        { name: 'Readme.txt', isDirectory: () => false, isFile: () => true },
      ]);

      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.titleEn).toBeNull();
    });

    it('应选择最长的英文名候选', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'Witcher', isDirectory: () => true, isFile: () => false },
        { name: 'The Witcher 3 Wild Hunt GOTY', isDirectory: () => true, isFile: () => false },
      ]);

      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.titleEn).toBe('The Witcher 3 Wild Hunt GOTY');
    });
  });

  describe('extractNamesFromPath - 英文目录', () => {
    it('英文目录名应作为 title_en', () => {
      const result = extractNamesFromPath('E:/Games/The Witcher 3', 'E:/Games');
      expect(result.titleEn).toBe('The Witcher 3');
    });

    it('英文目录+中文父目录应从父目录提取中文名', () => {
      const result = extractNamesFromPath('E:/Games/巫师3/The Witcher 3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.source.titleFrom).toBe('parent');
      expect(result.titleEn).toBe('The Witcher 3');
    });

    it('英文目录+英文父目录应使用英文目录名作为 title', () => {
      const result = extractNamesFromPath('E:/Games/RPG/The Witcher 3', 'E:/Games');
      expect(result.title).toBe('The Witcher 3');
      expect(result.titleEn).toBe('The Witcher 3');
    });
  });

  describe('extractNamesFromPath - 边界情况', () => {
    it('无子内容的中文目录应返回 null title_en', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = extractNamesFromPath('E:/Games/巫师3', 'E:/Games');
      expect(result.title).toBe('巫师3');
      expect(result.titleEn).toBeNull();
    });

    it('扫描根目录下的游戏不应从父目录提取', () => {
      const result = extractNamesFromPath('E:/Games/The Witcher 3', 'E:/Games');
      // 父目录是扫描根目录，不应作为 title 来源
      expect(result.source.titleFrom).toBe('dir');
    });

    it('应正确处理带版本号的目录名', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = extractNamesFromPath('E:/Games/巫师3 [GOG]', 'E:/Games');
      // cleanGameName 会清理标签
      expect(result.title).toBe('巫师3');
      expect(result.originalName).toBe('巫师3 [GOG]');
    });
  });
});