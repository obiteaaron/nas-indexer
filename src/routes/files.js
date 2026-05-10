const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { fileOps } = require('../file-ops');
const { formatSize } = require('../scanner');
const { initDatabase } = require('../utils');

// 获取文件列表
router.get('/', async (req, res) => {
  await initDatabase();
  try {
    const { category, search, orderBy, orderDir, page = 1, pageSize = 50, minSize, maxSize, modifiedAfter, modifiedBefore } = req.query;
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
      offset,
      minSize,
      maxSize,
      modifiedAfter,
      modifiedBefore
    });

    const total = database.getFileCount({ category, search, minSize, maxSize, modifiedAfter, modifiedBefore });

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

// 按标签获取文件
router.get('/by-tags', async (req, res) => {
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

// 获取单个文件详情
router.get('/:id', async (req, res) => {
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

// 打开文件位置
router.post('/:id/open', async (req, res) => {
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

// 重命名文件
router.post('/:id/rename', async (req, res) => {
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

// 复制文件
router.post('/:id/copy', async (req, res) => {
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

// 移动文件
router.post('/:id/move', async (req, res) => {
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

// 删除文件
router.delete('/:id', async (req, res) => {
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

// 创建文件夹
router.post('/folder', async (req, res) => {
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

// 获取目录内容
router.get('/directory', async (req, res) => {
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

// 获取收藏列表
router.get('/favorites', async (req, res) => {
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

// 添加收藏
router.post('/favorites/:id', async (req, res) => {
  await initDatabase();
  try {
    database.addFavorite(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除收藏
router.delete('/favorites/:id', async (req, res) => {
  await initDatabase();
  try {
    database.removeFavorite(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
