import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { database } from './database';
import { classifyByExtension } from './database';
import { logger } from './logger';
import type { FileInfo } from './types';

interface OperationResult {
  success: boolean;
  error?: string;
  path?: string;
  oldPath?: string;
  newPath?: string;
  sourcePath?: string;
  targetPath?: string;
  info?: FileInfo;
  contents?: DirectoryItem[];
  parentDir?: string;
}

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory?: boolean;
  size?: number;
  modified?: Date;
  error?: string;
}

class FileOperations {
  openInExplorer(filePath: string): OperationResult {
    const platform: string = process.platform;

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    let command: string;
    if (platform === 'win32') {
      command = `explorer /select,"${filePath}"`;
    } else if (platform === 'darwin') {
      command = `open -R "${filePath}"`;
    } else {
      command = `xdg-open "${path.dirname(filePath)}"`;
    }

    exec(command, (err) => {
      if (err) logger.error('打开目录失败: %s', err.message);
    });

    return { success: true };
  }

  createFolder(parentPath: string, folderName: string): OperationResult {
    const newPath: string = path.join(parentPath, folderName);

    if (fs.existsSync(newPath)) {
      return { success: false, error: '文件夹已存在' };
    }

    try {
      fs.mkdirSync(newPath, { recursive: true });
      return { success: true, path: newPath };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }

  renameFile(oldPath: string, newName: string): OperationResult {
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: '文件不存在' };
    }

    const parentDir: string = path.dirname(oldPath);
    const newPath: string = path.join(parentDir, newName);

    if (fs.existsSync(newPath)) {
      return { success: false, error: '目标名称已存在' };
    }

    try {
      fs.renameSync(oldPath, newPath);

      const file = database.getFileByPath(oldPath);
      if (file) {
        database.deleteFile(oldPath);
        const stat: fs.Stats = fs.statSync(newPath);
        database.insertFile(newPath, stat);
      }

      return { success: true, oldPath, newPath };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }

  copyFile(sourcePath: string, targetDir: string): OperationResult {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件不存在' };
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch {
        return { success: false, error: '无法创建目标目录' };
      }
    }

    const fileName: string = path.basename(sourcePath);
    let targetPath: string = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      const ext: string = path.extname(fileName);
      const baseName: string = path.basename(fileName, ext);
      let counter: number = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
        counter++;
      }
    }

    try {
      fs.copyFileSync(sourcePath, targetPath);
      const stat: fs.Stats = fs.statSync(targetPath);
      database.insertFile(targetPath, stat);
      return { success: true, sourcePath, targetPath };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }

  moveFile(sourcePath: string, targetDir: string): OperationResult {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件不存在' };
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch {
        return { success: false, error: '无法创建目标目录' };
      }
    }

    const fileName: string = path.basename(sourcePath);
    const targetPath: string = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      return { success: false, error: '目标位置已存在同名文件' };
    }

    try {
      fs.renameSync(sourcePath, targetPath);

      database.deleteFile(sourcePath);
      const stat: fs.Stats = fs.statSync(targetPath);
      database.insertFile(targetPath, stat);

      return { success: true, sourcePath, targetPath };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EXDEV') {
        try {
          fs.copyFileSync(sourcePath, targetPath);
          fs.unlinkSync(sourcePath);
          database.deleteFile(sourcePath);
          const stat: fs.Stats = fs.statSync(targetPath);
          database.insertFile(targetPath, stat);
          return { success: true, sourcePath, targetPath };
        } catch (copyErr) {
          const copyError = copyErr as Error;
          return { success: false, error: copyError.message };
        }
      }
      return { success: false, error: error.message };
    }
  }

  deleteFile(filePath: string, permanent: boolean = false): OperationResult {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    try {
      if (permanent) {
        fs.unlinkSync(filePath);
      } else {
        const trashPath: string = this.getTrashPath();
        if (!fs.existsSync(trashPath)) {
          fs.mkdirSync(trashPath, { recursive: true });
        }

        const fileName: string = path.basename(filePath);
        let targetPath: string = path.join(trashPath, fileName);
        let counter: number = 1;
        while (fs.existsSync(targetPath)) {
          const ext: string = path.extname(fileName);
          const baseName: string = path.basename(fileName, ext);
          targetPath = path.join(trashPath, `${baseName}_${counter}${ext}`);
          counter++;
        }

        fs.renameSync(filePath, targetPath);
      }

      database.deleteFile(filePath);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }

  getTrashPath(): string {
    const platform: string = process.platform;
    if (platform === 'win32') {
      const userHome: string | undefined = process.env.USERPROFILE;
      return path.join(userHome || '', '.nas-indexer-trash');
    } else {
      const userHome: string | undefined = process.env.HOME;
      return path.join(userHome || '', '.nas-indexer-trash');
    }
  }

  getFileInfo(filePath: string): OperationResult {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    try {
      const stat: fs.Stats = fs.statSync(filePath);
      const ext: string = path.extname(filePath).toLowerCase();
      const name: string = path.basename(filePath);
      const parentDir: string = path.dirname(filePath);
      const category: string = classifyByExtension(ext);

      return {
        success: true,
        info: {
          path: filePath,
          name,
          ext,
          size: stat.size,
          sizeFormatted: this.formatSize(stat.size),
          category,
          created: stat.birthtime,
          modified: stat.mtime,
          accessed: stat.atime,
          parentDir,
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile()
        }
      };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units: string[] = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i: number = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  getDirectoryContent(dirPath: string): OperationResult {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: '目录不存在' };
    }

    try {
      const stat: fs.Stats = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: '路径不是目录' };
      }

      const items: string[] = fs.readdirSync(dirPath);
      const contents: DirectoryItem[] = items.map(item => {
        const fullPath: string = path.join(dirPath, item);
        try {
          const itemStat: fs.Stats = fs.statSync(fullPath);
          return {
            name: item,
            path: fullPath,
            isDirectory: itemStat.isDirectory(),
            size: itemStat.size,
            modified: itemStat.mtime
          };
        } catch (err) {
          const error = err as Error;
          return { name: item, path: fullPath, error: error.message };
        }
      });

      return { success: true, contents, parentDir: path.dirname(dirPath) };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }
}

const fileOps: FileOperations = new FileOperations();

export { fileOps, FileOperations };