const express = require('express');
const router = express.Router();
const { loadConfig, saveConfig, getStoragePath } = require('../utils');

// 获取配置
router.get('/', async (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新配置
router.post('/', async (req, res) => {
  try {
    const newConfig = req.body;
    const config = loadConfig();
    const updatedConfig = { ...config, ...newConfig };
    saveConfig(updatedConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取完整配置（包含默认值）
router.get('/full', async (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取存储路径
router.get('/storage/path', async (req, res) => {
  try {
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    res.json({ storagePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
