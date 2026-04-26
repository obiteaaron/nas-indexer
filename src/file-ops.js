const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { database } = require('./database');
const { logger } = require('./logger');

class FileOperations {
  openInExplorer(filePath) {
    const platform = process.platform;
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    let command;
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

  createFolder(parentPath, folderName) {
    const newPath = path.join(parentPath, folderName);
    
    if (fs.existsSync(newPath)) {
      return { success: false, error: '文件夹已存在' };
    }

    try {
      fs.mkdirSync(newPath, { recursive: true });
      return { success: true, path: newPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  renameFile(oldPath, newName) {
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: '文件不存在' };
    }

    const parentDir = path.dirname(oldPath);
    const newPath = path.join(parentDir, newName);

    if (fs.existsSync(newPath)) {
      return { success: false, error: '目标名称已存在' };
    }

    try {
      fs.renameSync(oldPath, newPath);
      
      const file = database.getFileByPath(oldPath);
      if (file) {
        database.deleteFile(oldPath);
        const stat = fs.statSync(newPath);
        database.insertFile(newPath, stat);
      }

      return { success: true, oldPath, newPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  copyFile(sourcePath, targetDir) {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件不存在' };
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (err) {
        return { success: false, error: '无法创建目标目录' };
      }
    }

    const fileName = path.basename(sourcePath);
    let targetPath = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
        counter++;
      }
    }

    try {
      fs.copyFileSync(sourcePath, targetPath);
      const stat = fs.statSync(targetPath);
      database.insertFile(targetPath, stat);
      return { success: true, sourcePath, targetPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  moveFile(sourcePath, targetDir) {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源文件不存在' };
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (err) {
        return { success: false, error: '无法创建目标目录' };
      }
    }

    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      return { success: false, error: '目标位置已存在同名文件' };
    }

    try {
      fs.renameSync(sourcePath, targetPath);
      
      database.deleteFile(sourcePath);
      const stat = fs.statSync(targetPath);
      database.insertFile(targetPath, stat);

      return { success: true, sourcePath, targetPath };
    } catch (err) {
      if (err.code === 'EXDEV') {
        try {
          fs.copyFileSync(sourcePath, targetPath);
          fs.unlinkSync(sourcePath);
          database.deleteFile(sourcePath);
          const stat = fs.statSync(targetPath);
          database.insertFile(targetPath, stat);
          return { success: true, sourcePath, targetPath };
        } catch (copyErr) {
          return { success: false, error: copyErr.message };
        }
      }
      return { success: false, error: err.message };
    }
  }

  deleteFile(filePath, permanent = false) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    try {
      if (permanent) {
        fs.unlinkSync(filePath);
      } else {
        const trashPath = this.getTrashPath();
        if (!fs.existsSync(trashPath)) {
          fs.mkdirSync(trashPath, { recursive: true });
        }
        
        const fileName = path.basename(filePath);
        let targetPath = path.join(trashPath, fileName);
        let counter = 1;
        while (fs.existsSync(targetPath)) {
          const ext = path.extname(fileName);
          const baseName = path.basename(fileName, ext);
          targetPath = path.join(trashPath, `${baseName}_${counter}${ext}`);
          counter++;
        }
        
        fs.renameSync(filePath, targetPath);
      }

      database.deleteFile(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getTrashPath() {
    const platform = process.platform;
    if (platform === 'win32') {
      const userHome = process.env.USERPROFILE;
      return path.join(userHome, '.nas-indexer-trash');
    } else {
      const userHome = process.env.HOME;
      return path.join(userHome, '.nas-indexer-trash');
    }
  }

  getFileInfo(filePath) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    try {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      const parentDir = path.dirname(filePath);
      const { classifyByExtension } = require('./database');
      const category = classifyByExtension(ext);

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
      return { success: false, error: err.message };
    }
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  getDirectoryContent(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: '目录不存在' };
    }

    try {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: '路径不是目录' };
      }

      const items = fs.readdirSync(dirPath);
      const contents = items.map(item => {
        const fullPath = path.join(dirPath, item);
        try {
          const itemStat = fs.statSync(fullPath);
          return {
            name: item,
            path: fullPath,
            isDirectory: itemStat.isDirectory(),
            size: itemStat.size,
            modified: itemStat.mtime
          };
        } catch (err) {
          return { name: item, path: fullPath, error: err.message };
        }
      });

      return { success: true, contents, parentDir: path.dirname(dirPath) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

const fileOps = new FileOperations();

module.exports = { fileOps, FileOperations };