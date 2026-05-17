import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';

const VIDEO_EXTENSIONS: string[] = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'];
const IMAGE_EXTENSIONS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
const AUDIO_EXTENSIONS: string[] = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'];
const PDF_EXTENSION: string = '.pdf';
const TEXT_EXTENSIONS: string[] = ['.txt'];
const MARKDOWN_EXTENSIONS: string[] = ['.md'];

function isVideoFile(ext: string): boolean {
  return VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}

function isImageFile(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

function isAudioFile(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

function isPdfFile(ext: string): boolean {
  return ext.toLowerCase() === PDF_EXTENSION;
}

function isTextFile(ext: string): boolean {
  return TEXT_EXTENSIONS.includes(ext.toLowerCase());
}

function isMarkdownFile(ext: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(ext.toLowerCase());
}

function getMimeType(ext: string): string {
  const lowerExt: string = ext.toLowerCase();
  const mimeTypes: Record<string, string> = {
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

function streamFile(req: Request, res: Response, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  const ext: string = path.extname(filePath);
  const mimeType: string = getMimeType(ext);
  const stat: fs.Stats = fs.statSync(filePath);
  const fileSize: number = stat.size;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');

  const range: string | undefined = req.headers.range;

  if (range) {
    const parts: string[] = range.replace(/bytes=/, '').split('-');
    const start: number = parseInt(parts[0], 10);
    const end: number = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize: number = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    const fileStream: fs.ReadStream = fs.createReadStream(filePath, { start, end });
    fileStream.pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    const fileStream: fs.ReadStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
}

function serveImage(res: Response, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  const ext: string = path.extname(filePath);
  const mimeType: string = getMimeType(ext);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const fileStream: fs.ReadStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
}

function servePdf(res: Response, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stat: fs.Stats = fs.statSync(filePath);
  res.setHeader('Content-Length', stat.size);

  const fileStream: fs.ReadStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
}

function getPreviewType(ext: string): string {
  const lowerExt: string = ext.toLowerCase();
  if (isVideoFile(lowerExt)) return 'video';
  if (isImageFile(lowerExt)) return 'image';
  if (isAudioFile(lowerExt)) return 'audio';
  if (isPdfFile(lowerExt)) return 'pdf';
  if (isMarkdownFile(lowerExt)) return 'markdown';
  if (isTextFile(lowerExt)) return 'text';
  return 'unknown';
}

export {
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