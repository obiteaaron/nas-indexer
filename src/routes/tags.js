const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { initDatabase } = require('../utils');

// 获取分类列表
router.get('/categories', async (req, res) => {
  await initDatabase();
  try {
    const stats = database.getStatistics();
    const categories = stats.map(s => s.category);
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取标签分组
router.get('/tag-groups', async (req, res) => {
  await initDatabase();
  try {
    const groups = database.getTagGroups();
    const groupsWithTags = groups.map(group => {
      const tags = database.getTags(group.id);
      return { ...group, tags };
    });
    res.json({ success: true, data: groupsWithTags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建标签分组
router.post('/tag-groups', async (req, res) => {
  await initDatabase();
  try {
    const { name, color, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '请提供分组名称' });
    }
    const id = database.createTagGroup(name, color || '#6366f1', sortOrder || 0);
    const group = database.getTagGroupById(id);
    res.json({ success: true, data: { ...group, tags: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新标签分组
router.put('/tag-groups/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const group = database.getTagGroupById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: '分组不存在' });
    }
    database.updateTagGroup(id, req.body);
    const updated = database.getTagGroupById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除标签分组
router.delete('/tag-groups/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const group = database.getTagGroupById(id);
    if (!group) {
      return res.status(404).json({ success: false, error: '分组不存在' });
    }
    database.deleteTagGroup(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取标签列表
router.get('/tags', async (req, res) => {
  await initDatabase();
  try {
    const { groupId } = req.query;
    const tags = groupId ? database.getTags(parseInt(groupId)) : database.getAllTagsWithGroup();
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建标签
router.post('/tags', async (req, res) => {
  await initDatabase();
  try {
    const { name, groupId, color, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: '请提供标签名称' });
    }
    const id = database.createTag(name, groupId || null, color || '#6366f1', sortOrder || 0);
    const tag = database.getTagById(id);
    res.json({ success: true, data: tag });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新标签
router.put('/tags/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const tag = database.getTagById(id);
    if (!tag) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    database.updateTag(id, req.body);
    const updated = database.getTagById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除标签
router.delete('/tags/:id', async (req, res) => {
  await initDatabase();
  try {
    const id = parseInt(req.params.id);
    const tag = database.getTagById(id);
    if (!tag) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }
    database.deleteTag(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取标签统计
router.get('/tags/stats', async (req, res) => {
  await initDatabase();
  try {
    const stats = database.getTagStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取文件标签
router.get('/files/:id/tags', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 添加文件标签
router.post('/files/:id/tags', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    const { tagId } = req.body;
    if (!tagId) {
      return res.status(400).json({ success: false, error: '请提供标签ID' });
    }
    database.addFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除文件标签
router.delete('/files/:id/tags/:tagId', async (req, res) => {
  await initDatabase();
  try {
    const fileId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);
    const file = database.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    database.removeFileTag(fileId, tagId);
    const tags = database.getFileTags(fileId);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 批量操作文件标签
router.post('/files/batch/tags', async (req, res) => {
  await initDatabase();
  try {
    const { fileIds, tagIds, action } = req.body;
    if (!fileIds || !fileIds.length || !tagIds || !tagIds.length) {
      return res.status(400).json({ success: false, error: '请提供文件ID和标签ID' });
    }
    if (action === 'add') {
      database.batchAddFileTags(fileIds, tagIds);
    } else if (action === 'remove') {
      database.batchRemoveFileTags(fileIds, tagIds);
    } else {
      return res.status(400).json({ success: false, error: '无效的操作类型' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
