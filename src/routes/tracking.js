const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { formatSize } = require('../scanner');

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await database.init();
    dbInitialized = true;
  }
}

// Search History
router.get('/search-history', async (req, res) => {
  await ensureDb();
  try {
    const history = database.getSearchHistory(10);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/search-history', async (req, res) => {
  await ensureDb();
  try {
    database.clearSearchHistory();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Behavior Tracking
router.post('/view', async (req, res) => {
  await ensureDb();
  try {
    const { fileId, playDuration } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: '请提供文件ID' });
    }
    const file = database.getFileById(parseInt(fileId));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    database.recordFileView(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/preview', async (req, res) => {
  await ensureDb();
  try {
    const { fileId, playDuration } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: '请提供文件ID' });
    }
    const file = database.getFileById(parseInt(fileId));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
    database.recordFilePreview(fileId, playDuration || 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/action', async (req, res) => {
  await ensureDb();
  try {
    const { fileId, actionType, tagId, ...extraData } = req.body;
    if (!actionType) {
      return res.status(400).json({ success: false, error: '请提供操作类型' });
    }
    if (actionType !== 'search') {
      const file = database.getFileById(parseInt(fileId));
      if (!file) {
        return res.status(404).json({ success: false, error: '文件不存在' });
      }
    }
    database.recordUserAction(actionType, { file_id: fileId || null, tag_id: tagId, ...extraData });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/views', async (req, res) => {
  await ensureDb();
  try {
    const limit = parseInt(req.query.limit) || 50;
    const views = database.getFileViews(limit);
    const formatted = views.map(v => ({
      ...v,
      sizeFormatted: formatSize(v.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
