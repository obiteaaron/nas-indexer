const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { logger } = require('./logger');

const DEFAULT_CATEGORY_RULES = {
  '视频': ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'],
  '音频': ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.ape', '.alac'],
  '图片': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif'],
  '文档': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt'],
  '字幕': ['.srt', '.ass', '.ssa', '.sub', '.vtt']
};

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

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function classifyByPathPrefix(filePath, categoryPathRules) {
  if (!categoryPathRules || categoryPathRules.length === 0) return null;
  const normalizedFilePath = normalizePath(filePath);
  for (const rule of categoryPathRules) {
    const normalizedPrefix = normalizePath(rule.pathPrefix);
    if (normalizedFilePath.startsWith(normalizedPrefix)) {
      return rule.category;
    }
  }
  return null;
}

function classifyByExtension(ext, categoryRules) {
  const normalizedExt = (ext || '').toLowerCase();
  if (categoryRules) {
    for (const [category, extensions] of Object.entries(categoryRules)) {
      if (extensions.some(e => e.toLowerCase() === normalizedExt)) {
        return category;
      }
    }
  }
  return EXTENSION_CLASS_MAP[normalizedExt] || '其他';
}

class Database {
  constructor() {
    this.db = null;
    this.dbPath = null;
    this.initialized = false;
    this.categoryRules = DEFAULT_CATEGORY_RULES;
    this.categoryPathRules = [];
  }

  setCategoryRules(rules) {
    this.categoryRules = rules || DEFAULT_CATEGORY_RULES;
  }

  setCategoryPathRules(rules) {
    this.categoryPathRules = rules || [];
  }

  classifyFile(filePath, ext) {
    const pathCategory = classifyByPathPrefix(filePath, this.categoryPathRules);
    if (pathCategory) return pathCategory;
    return classifyByExtension(ext, this.categoryRules);
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
    }
    
    this.db.run('PRAGMA foreign_keys = ON');
    this.createTables();
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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tag_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES tag_groups(id) ON DELETE SET NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(file_id, tag_id)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_category ON files(category)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tags_group ON tags(group_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_tags_file ON file_tags(file_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id)`);
    
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
    const category = this.classifyFile(filePath, ext);
    const modifiedAt = stat ? new Date(stat.mtime).toISOString() : null;
    
    try {
      const existing = this.getFileByPath(filePath);
      if (existing) {
        this.db.run(`
          UPDATE files SET name = ?, ext = ?, size = ?, category = ?, modified_at = ?, scanned_at = datetime('now', 'localtime'), scan_path = ?
          WHERE id = ?
        `, [name, ext, stat ? stat.size : 0, category, modifiedAt, scanPath, existing.id]);
      } else {
        this.db.run(`
          INSERT INTO files (path, name, ext, size, category, modified_at, scanned_at, scan_path)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
        `, [filePath, name, ext, stat ? stat.size : 0, category, modifiedAt, scanPath]);
      }
      this.save();
      return true;
    } catch (err) {
      logger.error('插入文件失败: %s', err.message);
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

  createTagGroup(name, color = '#6366f1', sortOrder = 0) {
    this.db.run(
      'INSERT INTO tag_groups (name, color, sort_order) VALUES (?, ?, ?)',
      [name, color, sortOrder]
    );
    this.save();
    const result = this.db.exec('SELECT MAX(id) as id FROM tag_groups');
    return result[0].values[0][0] || 0;
  }

  getTagGroups() {
    const result = this.db.exec('SELECT * FROM tag_groups ORDER BY sort_order, id');
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToObject(result[0], row));
  }

  getTagGroupById(id) {
    const result = this.db.exec('SELECT * FROM tag_groups WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToObject(result[0], result[0].values[0]);
  }

  updateTagGroup(id, data) {
    const fields = [];
    const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (fields.length === 0) return false;
    params.push(id);
    this.db.run(`UPDATE tag_groups SET ${fields.join(', ')} WHERE id = ?`, params);
    this.save();
    return true;
  }

  deleteTagGroup(id) {
    this.db.run('UPDATE tags SET group_id = NULL WHERE group_id = ?', [id]);
    this.db.run('DELETE FROM tag_groups WHERE id = ?', [id]);
    this.save();
    return true;
  }

  createTag(name, groupId = null, color = '#6366f1', sortOrder = 0) {
    this.db.run(
      'INSERT INTO tags (name, group_id, color, sort_order) VALUES (?, ?, ?, ?)',
      [name, groupId, color, sortOrder]
    );
    this.save();
    const result = this.db.exec('SELECT MAX(id) as id FROM tags');
    return result[0].values[0][0] || 0;
  }

  getTags(groupId = null) {
    let sql = 'SELECT * FROM tags';
    const params = [];
    if (groupId !== null) {
      sql += ' WHERE group_id = ?';
      params.push(groupId);
    }
    sql += ' ORDER BY sort_order, id';
    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToObject(result[0], row));
  }

  getAllTagsWithGroup() {
    const sql = `
      SELECT t.*, tg.name as group_name, tg.color as group_color
      FROM tags t
      LEFT JOIN tag_groups tg ON t.group_id = tg.id
      ORDER BY tg.sort_order, t.sort_order, t.id
    `;
    const result = this.db.exec(sql);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  getTagById(id) {
    const result = this.db.exec('SELECT * FROM tags WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToObject(result[0], result[0].values[0]);
  }

  updateTag(id, data) {
    const fields = [];
    const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    const groupId = data.group_id !== undefined ? data.group_id : data.groupId;
    if (groupId !== undefined) { fields.push('group_id = ?'); params.push(groupId); }
    if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (fields.length === 0) return false;
    params.push(id);
    this.db.run(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`, params);
    this.save();
    return true;
  }

  deleteTag(id) {
    this.db.run('DELETE FROM file_tags WHERE tag_id = ?', [id]);
    this.db.run('DELETE FROM tags WHERE id = ?', [id]);
    this.save();
    return true;
  }

  addFileTag(fileId, tagId) {
    try {
      this.db.run(
        'INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)',
        [fileId, tagId]
      );
      this.save();
      return true;
    } catch (err) {
      return false;
    }
  }

  removeFileTag(fileId, tagId) {
    this.db.run('DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?', [fileId, tagId]);
    this.save();
    return true;
  }

  removeFileTags(fileId) {
    this.db.run('DELETE FROM file_tags WHERE file_id = ?', [fileId]);
    this.save();
    return true;
  }

  getFileTags(fileId) {
    const sql = `
      SELECT t.*, tg.name as group_name, tg.color as group_color
      FROM file_tags ft
      JOIN tags t ON ft.tag_id = t.id
      LEFT JOIN tag_groups tg ON t.group_id = tg.id
      WHERE ft.file_id = ?
      ORDER BY tg.sort_order, t.sort_order, t.id
    `;
    const result = this.db.exec(sql, [fileId]);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  getFilesByTag(tagId, options = {}) {
    const { page = 1, pageSize = 50, orderBy = 'name', orderDir = 'ASC' } = options;
    const offset = (page - 1) * pageSize;
    
    const countSql = 'SELECT COUNT(*) as count FROM file_tags WHERE tag_id = ?';
    const countResult = this.db.exec(countSql, [tagId]);
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

    const sql = `
      SELECT f.* FROM files f
      JOIN file_tags ft ON f.id = ft.file_id
      WHERE ft.tag_id = ?
      ORDER BY f.${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const result = this.db.exec(sql, [tagId, pageSize, offset]);
    if (result.length === 0) return { files: [], total };
    
    return {
      files: result[0].values.map(row => this.rowToObject(result[0], row)),
      total
    };
  }

  getFilesByTags(tagIds, options = {}) {
    const { page = 1, pageSize = 50, orderBy = 'name', orderDir = 'ASC', matchAll = false } = options;
    const offset = (page - 1) * pageSize;
    const placeholders = tagIds.map(() => '?').join(',');

    if (matchAll) {
      const countSql = `
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        WHERE f.id IN (
          SELECT file_id FROM file_tags WHERE tag_id IN (${placeholders})
          GROUP BY file_id HAVING COUNT(DISTINCT tag_id) = ?
        )
      `;
      const countResult = this.db.exec(countSql, [...tagIds, tagIds.length]);
      const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

      const sql = `
        SELECT f.* FROM files f
        WHERE f.id IN (
          SELECT file_id FROM file_tags WHERE tag_id IN (${placeholders})
          GROUP BY file_id HAVING COUNT(DISTINCT tag_id) = ?
        )
        ORDER BY f.${orderBy} ${orderDir}
        LIMIT ? OFFSET ?
      `;
      const result = this.db.exec(sql, [...tagIds, tagIds.length, pageSize, offset]);
      if (result.length === 0) return { files: [], total };
      return {
        files: result[0].values.map(row => this.rowToObject(result[0], row)),
        total
      };
    } else {
      const countSql = `
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        JOIN file_tags ft ON f.id = ft.file_id
        WHERE ft.tag_id IN (${placeholders})
      `;
      const countResult = this.db.exec(countSql, tagIds);
      const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

      const sql = `
        SELECT DISTINCT f.* FROM files f
        JOIN file_tags ft ON f.id = ft.file_id
        WHERE ft.tag_id IN (${placeholders})
        ORDER BY f.${orderBy} ${orderDir}
        LIMIT ? OFFSET ?
      `;
      const result = this.db.exec(sql, [...tagIds, pageSize, offset]);
      if (result.length === 0) return { files: [], total };
      return {
        files: result[0].values.map(row => this.rowToObject(result[0], row)),
        total
      };
    }
  }

  batchAddFileTags(fileIds, tagIds) {
    for (const fileId of fileIds) {
      for (const tagId of tagIds) {
        this.db.run(
          'INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)',
          [fileId, tagId]
        );
      }
    }
    this.save();
    return true;
  }

  batchRemoveFileTags(fileIds, tagIds) {
    const filePlaceholders = fileIds.map(() => '?').join(',');
    const tagPlaceholders = tagIds.map(() => '?').join(',');
    this.db.run(
      `DELETE FROM file_tags WHERE file_id IN (${filePlaceholders}) AND tag_id IN (${tagPlaceholders})`,
      [...fileIds, ...tagIds]
    );
    this.save();
    return true;
  }

  getTagStats() {
    const sql = `
      SELECT t.id, t.group_id, t.name, t.color, tg.name as group_name, COUNT(ft.file_id) as file_count
      FROM tags t
      LEFT JOIN tag_groups tg ON t.group_id = tg.id
      LEFT JOIN file_tags ft ON t.id = ft.tag_id
      GROUP BY t.id
      ORDER BY tg.sort_order, t.sort_order, t.id
    `;
    const result = this.db.exec(sql);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
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

module.exports = { 
  database, 
  Database, 
  classifyByExtension, 
  classifyByPathPrefix,
  EXTENSION_CLASS_MAP,
  DEFAULT_CATEGORY_RULES
};