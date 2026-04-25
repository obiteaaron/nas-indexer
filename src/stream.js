const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'];
const PDF_EXTENSION = '.pdf';
const TEXT_EXTENSIONS = ['.txt'];
const MARKDOWN_EXTENSIONS = ['.md'];

function isVideoFile(ext) {
  return VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}

function isImageFile(ext) {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

function isAudioFile(ext) {
  return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

function isPdfFile(ext) {
  return ext.toLowerCase() === PDF_EXTENSION;
}

function isTextFile(ext) {
  return TEXT_EXTENSIONS.includes(ext.toLowerCase());
}

function isMarkdownFile(ext) {
  return MARKDOWN_EXTENSIONS.includes(ext.toLowerCase());
}

function getMimeType(ext) {
  const lowerExt = ext.toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.wma': 'audio/x-ms-wma',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown'
  };
  return mimeTypes[lowerExt] || 'application/octet-stream';
}

function streamFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const ext = path.extname(filePath);
  const mimeType = getMimeType(ext);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
}

function serveImage(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const ext = path.extname(filePath);
  const mimeType = getMimeType(ext);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
}

function servePdf(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Length', stat.size);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
}

function getPreviewType(ext) {
  const lowerExt = ext.toLowerCase();
  if (isVideoFile(lowerExt)) return 'video';
  if (isImageFile(lowerExt)) return 'image';
  if (isAudioFile(lowerExt)) return 'audio';
  if (isPdfFile(lowerExt)) return 'pdf';
  if (isMarkdownFile(lowerExt)) return 'markdown';
  if (isTextFile(lowerExt)) return 'text';
  return 'unknown';
}

module.exports = {
  streamFile,
  serveImage,
  servePdf,
  getMimeType,
  getPreviewType,
  isVideoFile,
  isImageFile,
  isAudioFile,
  isPdfFile,
  isTextFile,
  isMarkdownFile,
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  TEXT_EXTENSIONS,
  MARKDOWN_EXTENSIONS
};