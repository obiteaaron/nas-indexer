import express, { Router, Request, Response } from 'express';
import { database } from '../database';
import { initDatabase } from '../utils';
import type { TagGroup, Tag, TagWithGroup, TagStats } from '../types';

const router: Router = express.Router();

// 获取分类列表
router.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const stats = database.getStatistics();
    const categories: string[] = stats.map(s => s.category);
    res.json({ success: true, data: categories });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取标签分组
router.get('/tag-groups', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const groups: TagGroup[] = database.getTagGroups();
    const groupsWithTags = groups.map(group => {
      const tags: Tag[] = database.getTags(group.id);
      return { ...group, tags };
    });
    res.json({ success: true, data: groupsWithTags });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建标签分组
router.post('/tag-groups', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { name, color, sortOrder } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: '请提供分组名称' });
      return;
    }
    const id: number = database.createTagGroup(name, color || '#6366f1', sortOrder || 0);
    const group: TagGroup | null = database.getTagGroupById(id);
    res.json({ success: true, data: { ...group, tags: [] } });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新标签分组
router.post('/tag-groups/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const id: number = parseInt(req.params.id as string);
    const group: TagGroup | null = database.getTagGroupById(id);
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    database.updateTagGroup(id, req.body);
    const updated: TagGroup | null = database.getTagGroupById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除标签分组
router.post('/tag-groups/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const id: number = parseInt(req.params.id as string);
    const group: TagGroup | null = database.getTagGroupById(id);
    if (!group) {
      res.status(404).json({ success: false, error: '分组不存在' });
      return;
    }
    database.deleteTagGroup(id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取标签列表
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { groupId } = req.query;
    const tags: Tag[] | TagWithGroup[] = groupId ? database.getTags(parseInt(groupId as string)) : database.getAllTagsWithGroup();
    res.json({ success: true, data: tags });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建标签
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const { name, groupId, color, sortOrder } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: '请提供标签名称' });
      return;
    }
    const id: number = database.createTag(name, groupId || null, color || '#6366f1', sortOrder || 0);
    const tag: Tag | null = database.getTagById(id);
    res.json({ success: true, data: tag });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新标签
router.post('/update/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const id: number = parseInt(req.params.id as string);
    const tag: Tag | null = database.getTagById(id);
    if (!tag) {
      res.status(404).json({ success: false, error: '标签不存在' });
      return;
    }
    database.updateTag(id, req.body);
    const updated: Tag | null = database.getTagById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除标签
router.post('/delete/:id', async (req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const id: number = parseInt(req.params.id as string);
    const tag: Tag | null = database.getTagById(id);
    if (!tag) {
      res.status(404).json({ success: false, error: '标签不存在' });
      return;
    }
    database.deleteTag(id);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取标签统计
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  await initDatabase();
  try {
    const stats: TagStats[] = database.getTagStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;