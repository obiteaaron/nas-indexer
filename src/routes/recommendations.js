const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { formatSize } = require('../scanner');
const { initDatabase, loadConfig } = require('../utils');

// 获取偏好分析
router.get('/preferences', async (req, res) => {
  await initDatabase();
  try {
    const config = loadConfig();
    const trackingEnabled = config.trackingConfig?.trackingEnabled ?? true;
    if (!trackingEnabled) {
      return res.json({ success: true, data: { enabled: false, categories: [], tags: [], keywords: [] } });
    }
    const prefs = database.calculatePreferences();
    res.json({ success: true, data: { enabled: true, ...prefs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 清除偏好数据
router.delete('/preferences/clear', async (req, res) => {
  await initDatabase();
  try {
    database.clearPreferencesData();
    res.json({ success: true, message: '偏好数据已清除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取推荐列表
router.get('/recommendations', async (req, res) => {
  await initDatabase();
  try {
    const type = req.query.type || null;
    const limit = parseInt(req.query.limit) || 20;
    const recs = database.getRecommendations(type, limit);
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 生成推荐
router.post('/recommendations/generate', async (req, res) => {
  await initDatabase();
  try {
    const recs = database.generateRecommendations();
    const formatted = recs.map(r => ({
      ...r,
      sizeFormatted: formatSize(r.size || 0)
    }));
    res.json({ success: true, data: formatted, message: '推荐已生成' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
