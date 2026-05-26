import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { fileOps } from '../file-ops';
import { formatSize } from '../scanner';
import { initDatabase } from '../utils';
import type { File } from '../types';

const router: Router = express.Router();

// 获取文件列表
router.get('/', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { category, search, orderBy, orderDir, page = '1', pageSize = '50', minSize, maxSize, modifiedAfter, modifiedBefore } = req.query;
    const offset: number = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const limit: number = parseInt(pageSize as string);

    if (search && (search as string).trim()) {
      database.addSearchHistory((search as string).trim());
    }

    const files: File[] = database.getFiles({
      category: category as string,
      search: search as string,
      orderBy: (orderBy as 'name' | 'size' | 'modified_at' | 'scanned_at' | 'id') || 'name',
      orderDir: (orderDir as 'ASC' | 'DESC') || 'ASC',
      limit,
      offset,
      minSize: minSize as string,
      maxSize: maxSize as string,
      modifiedAfter: modifiedAfter as string,
      modifiedBefore: modifiedBefore as string
    });

    const total: number = database.getFileCount({
      category: category as string,
      search: search as string,
      minSize: minSize as string,
      maxSize: maxSize as string,
      modifiedAfter: modifiedAfter as string,
      modifiedBefore: modifiedBefore as string
    });

    const formattedFiles = files.map(f => ({
      ...f,
      sizeFormatted: formatSize(f.size || 0)
    }));

    res.json({
      success: true,
      data: {
        files: formattedFiles,
        total,
        page: parseInt(page as string),
        pageSize: limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 按标签获取文件
router.get('/by-tags', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { tagIds, matchAll, page, pageSize, orderBy, orderDir } = req.query;
    if (!tagIds) {
      res.status(400).json({ success: false, error: '请提供标签ID' });
      return;
    }
    const tagIdArray: number[] = (tagIds as string).split(',').map(id => parseInt(id.trim()));
    const result = database.getFilesByTags(tagIdArray, {
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 50,
      orderBy: (orderBy as 'name' | 'size' | 'modified_at' | 'scanned_at' | 'id') || 'name',
      orderDir: (orderDir as 'ASC' | 'DESC') || 'ASC',
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
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 50,
        totalPages: Math.ceil(result.total / (parseInt(pageSize as string) || 50))
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个文件详情
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const info = fileOps.getFileInfo(file.path);
    res.json({ success: true, data: { ...file, ...info.info, sizeFormatted: formatSize(file.size || 0) } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 打开文件位置
router.post('/:id/open', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const result = fileOps.openInExplorer(file.path);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重命名文件
router.post('/:id/rename', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const { newName } = req.body;
    if (!newName) {
      res.status(400).json({ success: false, error: '请提供新名称' });
      return;
    }

    const result = fileOps.renameFile(file.path, newName);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 复制文件
router.post('/:id/copy', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const { targetDir } = req.body;
    if (!targetDir) {
      res.status(400).json({ success: false, error: '请提供目标目录' });
      return;
    }

    const result = fileOps.copyFile(file.path, targetDir);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 移动文件
router.post('/:id/move', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const { targetDir } = req.body;
    if (!targetDir) {
      res.status(400).json({ success: false, error: '请提供目标目录' });
      return;
    }

    const result = fileOps.moveFile(file.path, targetDir);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除文件
router.post('/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const file: File | null = database.getFileById(parseInt(req.params.id as string));
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }

    const { permanent } = req.body;
    const result = fileOps.deleteFile(file.path, permanent === true);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建文件夹
router.post('/folder', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { parentPath, folderName } = req.body;
    if (!parentPath || !folderName) {
      res.status(400).json({ success: false, error: '请提供父目录和文件夹名称' });
      return;
    }

    const result = fileOps.createFolder(parentPath, folderName);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取目录内容
router.get('/directory', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { path: dirPath } = req.query;
    if (!dirPath) {
      res.status(400).json({ success: false, error: '请提供目录路径' });
      return;
    }

    const result = fileOps.getDirectoryContent(dirPath as string);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取收藏列表
router.get('/favorites', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const favorites: File[] = database.getFavorites();
    const formatted = favorites.map(f => ({
      ...f,
      sizeFormatted: formatSize(f.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加收藏
router.post('/favorites/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    database.addFavorite(parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除收藏
router.post('/favorites/remove/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    database.removeFavorite(parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量获取文件标签
router.get('/batch/tags', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { fileIds } = req.query;
    if (!fileIds) {
      res.status(400).json({ success: false, error: '请提供文件ID列表' });
      return;
    }
    const fileIdArray: number[] = (fileIds as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (fileIdArray.length === 0) {
      res.status(400).json({ success: false, error: '无效的文件ID' });
      return;
    }
    const tagsMap = database.getFileTagsBatch(fileIdArray);
    res.json({ success: true, data: tagsMap });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量操作文件标签
router.post('/batch/tags', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { fileIds, tagIds, action } = req.body;
    if (!fileIds || !fileIds.length || !tagIds || !tagIds.length) {
      res.status(400).json({ success: false, error: '请提供文件ID和标签ID' });
      return;
    }
    if (action === 'add') {
      database.batchAddFileTags(fileIds, tagIds);
    } else if (action === 'remove') {
      database.batchRemoveFileTags(fileIds, tagIds);
    } else {
      res.status(400).json({ success: false, error: '无效的操作类型' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取文件标签
router.get('/:id/tags', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const fileId: number = parseInt(req.params.id as string);
    const file = database.getFileById(fileId);
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加文件标签
router.post('/:id/tags', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const fileId: number = parseInt(req.params.id as string);
    const file = database.getFileById(fileId);
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    const { tagId } = req.body;
    if (!tagId) {
      res.status(400).json({ success: false, error: '请提供标签ID' });
      return;
    }
    database.addFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 移除文件标签
router.post('/:id/tags/remove/:tagId', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const fileId: number = parseInt(req.params.id as string);
    const tagId: number = parseInt(req.params.tagId as string);
    const file = database.getFileById(fileId);
    if (!file) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    database.removeFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;