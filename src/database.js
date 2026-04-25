const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const EXTENSION_CLASS_MAP = {
  '.mp4': '视频', '.mkv': '视频', '.avi': '视频', '.mov': '视频',
  '.wmv': '视频', '.flv': '视频', '.webm': '视频', '.m4v': '视频',
  '.mpg': '视频', '.mpeg': '视频',
  '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频',
  '.ogg': '音频', '.wma': '音频', '.m4a': '音频', '.ape': '音频',
  '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片',
  '.bmp': '图片', '.webp': '图片', '.svg': '图片', '.ico': '图片',
  '.pdf': '文档', '.doc': '文档', '.docx': '文档', '.xls': '文档',
  '.xlsx': '文档', '.ppt': '文档', '.pptx': '文档', '.txt': '文档',
  '.srt': '字幕', '.ass': '字幕', '.ssa': '字幕', '.sub': '字幕', '.vtt': '字幕'
};

function classifyByExtension(ext) {
  const normalizedExt = (ext || '').toLowerCase();
  return EXTENSION_CLASS_MAP[normalizedExt] || '其他';
}

class Database {
  constructor() {
    this.db = null;
    this.dbPath = null;
    this.initialized = false;
  }

  async init(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../profiles/nas_index.db');
    
    const SQL = await initSqlJs();
    
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.createTables();
    }
    
    this.initialized = true;
    return this;
  }

  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        ext TEXT,
        size INTEGER DEFAULT 0,
        category TEXT DEFAULT '其他',
        modified_at DATETIME,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_favorite INTEGER DEFAULT 0,
        scan_path TEXT
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS scan_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_scan DATETIME
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_category ON files(category)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`);
    
    this.save();
  }

  save() {
    if (!this.db || !this.dbPath) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  insertFile(filePath, stat, scanPath = null) {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const category = classifyByExtension(ext);
    const modifiedAt = stat ? new Date(stat.mtime).toISOString() : null;
    
    try {
      this.db.run(`
        INSERT OR REPLACE INTO files (path, name, ext, size, category, modified_at, scanned_at, scan_path)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
      `, [filePath, name, ext, stat ? stat.size : 0, category, modifiedAt, scanPath]);
      return true;
    } catch (err) {
      console.error('插入文件失败:', err.message);
      return false;
    }
  }

  insertFilesBatch(files, scanPath = null) {
    for (const file of files) {
      this.insertFile(file.path, file.stat, scanPath);
    }
    this.save();
  }

  deleteFile(filePath) {
    this.db.run('DELETE FROM files WHERE path = ?', [filePath]);
    this.save();
  }

  deleteFileById(id) {
    this.db.run('DELETE FROM files WHERE id = ?', [id]);
    this.save();
  }

  clearAllFiles() {
    this.db.run('DELETE FROM files');
    this.save();
  }

  deleteByScanPath(scanPath) {
    this.db.run('DELETE FROM files WHERE scan_path = ?', [scanPath]);
    this.save();
  }

  getScanPaths() {
    const result = this.db.exec(`
      SELECT DISTINCT scan_path, COUNT(*) as file_count, MAX(scanned_at) as last_scan
      FROM files
      WHERE scan_path IS NOT NULL
      GROUP BY scan_path
    `);
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      path: row[0],
      fileCount: row[1],
      lastScan: row[2]
    }));
  }

  getFileById(id) {
    const result = this.db.exec('SELECT * FROM files WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToObject(result[0], result[0].values[0]);
  }

  getFileByPath(filePath) {
    const result = this.db.exec('SELECT * FROM files WHERE path = ?', [filePath]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToObject(result[0], result[0].values[0]);
  }

  getFiles(options = {}) {
    const { category, search, orderBy = 'name', orderDir = 'ASC', limit = 100, offset = 0 } = options;
    
    let sql = 'SELECT * FROM files';
    const params = [];
    const conditions = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(name LIKE ? OR path LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToObject(result[0], row));
  }

  getFileCount(options = {}) {
    const { category, search } = options;
    
    let sql = 'SELECT COUNT(*) as count FROM files';
    const params = [];
    const conditions = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(name LIKE ? OR path LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const result = this.db.exec(sql, params);
    if (result.length === 0) return 0;
    return result[0].values[0][0];
  }

  getStatistics() {
    const result = this.db.exec(`
      SELECT category, COUNT(*) as count, SUM(size) as totalSize
      FROM files
      GROUP BY category
      ORDER BY totalSize DESC
    `);

    if (result.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => ({
      category: row[0],
      count: row[1],
      totalSize: row[2]
    }));
  }

  getTotalStats() {
    const result = this.db.exec(`
      SELECT COUNT(*) as totalFiles, SUM(size) as totalSize
      FROM files
    `);

    if (result.length === 0) return { totalFiles: 0, totalSize: 0 };
    return {
      totalFiles: result[0].values[0][0] || 0,
      totalSize: result[0].values[0][1] || 0
    };
  }

  addFavorite(id) {
    this.db.run('UPDATE files SET is_favorite = 1 WHERE id = ?', [id]);
    this.save();
  }

  removeFavorite(id) {
    this.db.run('UPDATE files SET is_favorite = 0 WHERE id = ?', [id]);
    this.save();
  }

  getFavorites() {
    const result = this.db.exec('SELECT * FROM files WHERE is_favorite = 1 ORDER BY scanned_at DESC');
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToObject(result[0], row));
  }

  addSearchHistory(query) {
    this.db.run('INSERT INTO search_history (query) VALUES (?)', [query]);
    this.save();
  }

  getSearchHistory(limit = 10) {
    const result = this.db.exec(`
      SELECT query FROM search_history
      ORDER BY searched_at DESC
      LIMIT ?
    `, [limit]);
    if (result.length === 0) return [];
    return result[0].values.map(row => row[0]);
  }

  clearSearchHistory() {
    this.db.run('DELETE FROM search_history');
    this.save();
  }

  rowToObject(resultMeta, row) {
    const obj = {};
    resultMeta.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}

const database = new Database();

module.exports = { database, Database, classifyByExtension, EXTENSION_CLASS_MAP };