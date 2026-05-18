import fs from 'fs';
import path from 'path';
import os from 'os';
import { Database } from '../src/database';

describe('Database', () => {
  let db: Database;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = path.join(os.tmpdir(), `test_db_${Date.now()}.db`);
    db = new Database();
    await db.init(tempDbPath);
  });

  afterEach(() => {
    if (db && db.db) {
      db.db.close();
    }
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('classifyFile', () => {
    test('should classify video files correctly', () => {
      expect(db.classifyFile('test.mp4', '.mp4')).toBe('视频');
      expect(db.classifyFile('test.mkv', '.mkv')).toBe('视频');
      expect(db.classifyFile('test.avi', '.avi')).toBe('视频');
    });

    test('should classify audio files correctly', () => {
      expect(db.classifyFile('test.mp3', '.mp3')).toBe('音频');
      expect(db.classifyFile('test.wav', '.wav')).toBe('音频');
      expect(db.classifyFile('test.flac', '.flac')).toBe('音频');
    });

    test('should classify image files correctly', () => {
      expect(db.classifyFile('test.jpg', '.jpg')).toBe('图片');
      expect(db.classifyFile('test.png', '.png')).toBe('图片');
      expect(db.classifyFile('test.gif', '.gif')).toBe('图片');
    });

    test('should classify document files correctly', () => {
      expect(db.classifyFile('test.pdf', '.pdf')).toBe('文档');
      expect(db.classifyFile('test.doc', '.doc')).toBe('文档');
      expect(db.classifyFile('test.txt', '.txt')).toBe('文档');
    });

    test('should classify subtitle files correctly', () => {
      expect(db.classifyFile('test.srt', '.srt')).toBe('字幕');
      expect(db.classifyFile('test.ass', '.ass')).toBe('字幕');
    });

    test('should classify unknown files as 其他', () => {
      expect(db.classifyFile('test.xyz', '.xyz')).toBe('其他');
    });

    test('should use path prefix rules when available', () => {
      db.setCategoryPathRules([
        { pathPrefix: '/movies/', category: '电影' },
        { pathPrefix: '/music/', category: '音乐' }
      ]);

      expect(db.classifyFile('/movies/test.mp4', '.mp4')).toBe('电影');
      expect(db.classifyFile('/music/test.mp3', '.mp3')).toBe('音乐');
    });
  });

  describe('addFile and getFileById', () => {
    test('should add and retrieve a file', async () => {
      const fileId = db.insertFile('/test/file.mp4', {
        size: 1024,
        mtime: new Date().toISOString()
      });

      const file = db.getFileById(fileId);
      expect(file).toBeDefined();
      expect(file!.name).toBe('file.mp4');
      expect(file!.ext).toBe('.mp4');
      expect(file!.size).toBe(1024);
    });
  });

  describe('getFiles', () => {
    beforeEach(() => {
      db.insertFile('/test/movie.mp4', {
        size: 1024,
        mtime: new Date().toISOString()
      });
      db.insertFile('/test/song.mp3', {
        size: 512,
        mtime: new Date().toISOString()
      });
    });

    test('should get all files', () => {
      const files = db.getFiles({});
      expect(files.length).toBe(2);
    });

    test('should filter files by category', () => {
      const files = db.getFiles({ category: '音频' });
      expect(files.length).toBe(1);
      expect(files[0].name).toBe('song.mp3');
    });
  });
});