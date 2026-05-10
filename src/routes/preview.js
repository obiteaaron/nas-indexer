const express = require('express');
const router = express.Router();
const { database } = require('../database');
const { streamFile, serveImage, servePdf, getPreviewType } = require('../stream');
const { initDatabase } = require('../utils');

// 获取预览信息
router.get('/preview/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const previewType = getPreviewType(file.ext);
    res.json({
      success: true,
      data: {
        path: file.path,
        name: file.name,
        ext: file.ext,
        previewType,
        previewUrl: `/api/stream/${file.id}`
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 流式传输文件
router.get('/stream/:id', async (req, res) => {
  await initDatabase();
  try {
    const file = database.getFileById(parseInt(req.params.id));
    if (!file) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const previewType = getPreviewType(file.ext);

    if (previewType === 'image') {
      serveImage(res, file.path);
    } else if (previewType === 'pdf') {
      servePdf(res, file.path);
    } else {
      streamFile(req, res, file.path);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
