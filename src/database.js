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
      CREATE TABLE IF NOT EXISTS ai_search_history (
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

    // 用户行为追踪表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_file_views (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL,
        view_count INTEGER DEFAULT 0,
        last_viewed_at DATETIME,
        preview_count INTEGER DEFAULT 0,
        play_duration INTEGER DEFAULT 0,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_user_actions (
        id INTEGER PRIMARY KEY,
        action_type TEXT NOT NULL,
        file_id INTEGER,
        tag_id INTEGER,
        search_query TEXT,
        action_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_user_preferences (
        id INTEGER PRIMARY KEY,
        preference_type TEXT NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value REAL,
        data_source TEXT,
        last_updated DATETIME,
        UNIQUE(preference_type, preference_key)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_recommendations (
        id INTEGER PRIMARY KEY,
        rec_type TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        score REAL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_ai_file_views_file ON ai_file_views(file_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_ai_user_actions_type ON ai_user_actions(action_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_ai_user_actions_created ON ai_user_actions(created_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON ai_recommendations(rec_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_file ON ai_recommendations(file_id)`);

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
    this.db.run('INSERT INTO ai_search_history (query) VALUES (?)', [query]);
    this.save();
  }

  getSearchHistory(limit = 10) {
    const result = this.db.exec(`
      SELECT query FROM ai_search_history
      ORDER BY searched_at DESC
      LIMIT ?
    `, [limit]);
    if (result.length === 0) return [];
    return result[0].values.map(row => row[0]);
  }

  clearSearchHistory() {
    this.db.run('DELETE FROM ai_search_history');
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

  // === 行为追踪方法 ===

  recordFileView(fileId, playDuration = 0) {
    const now = new Date().toISOString();
    const existing = this.db.exec('SELECT id, view_count FROM ai_file_views WHERE file_id = ?', [fileId]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      const row = existing[0].values[0];
      this.db.run(
        'UPDATE ai_file_views SET view_count = ?, last_viewed_at = ?, play_duration = play_duration + ? WHERE file_id = ?',
        [row[1] + 1, now, playDuration, fileId]
      );
    } else {
      this.db.run(
        'INSERT INTO ai_file_views (file_id, view_count, last_viewed_at, play_duration) VALUES (?, 1, ?, ?)',
        [fileId, now, playDuration]
      );
    }
    this.recordUserAction('view', { file_id: fileId });
    this.save();
  }

  recordFilePreview(fileId, playDuration = 0) {
    const now = new Date().toISOString();
    const existing = this.db.exec('SELECT id, preview_count FROM ai_file_views WHERE file_id = ?', [fileId]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      const row = existing[0].values[0];
      this.db.run(
        'UPDATE ai_file_views SET preview_count = ?, last_viewed_at = ?, play_duration = play_duration + ? WHERE file_id = ?',
        [row[1] + 1, now, playDuration, fileId]
      );
    } else {
      this.db.run(
        'INSERT INTO ai_file_views (file_id, view_count, preview_count, last_viewed_at, play_duration) VALUES (?, 1, 1, ?, ?)',
        [fileId, now, playDuration]
      );
    }
    this.recordUserAction('preview', { file_id: fileId, play_duration: playDuration });
    this.save();
  }

  recordUserAction(actionType, data = {}) {
    const { file_id, tag_id, search_query, ...extraData } = data;
    const actionData = Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null;
    this.db.run(
      'INSERT INTO ai_user_actions (action_type, file_id, tag_id, search_query, action_data) VALUES (?, ?, ?, ?, ?)',
      [actionType, file_id || null, tag_id || null, search_query || null, actionData]
    );
    this.save();
  }

  getFileViews(limit = 50) {
    const sql = `
      SELECT fv.*, f.name, f.path, f.ext, f.category, f.size
      FROM ai_file_views fv
      JOIN files f ON fv.file_id = f.id
      ORDER BY fv.last_viewed_at DESC
      LIMIT ?
    `;
    const result = this.db.exec(sql, [limit]);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  getUserActions(limit = 50) {
    const result = this.db.exec(
      'SELECT * FROM ai_user_actions ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  // === 偏好分析方法 ===

  calculatePreferences() {
    this._calculateCategoryPreferences();
    this._calculateTagPreferences();
    this._calculateKeywordPreferences();
    return this.getPreferences();
  }

  _calculateCategoryPreferences() {
    const sql = `
      SELECT f.category,
             COUNT(DISTINCT fv.file_id) as view_count,
             COUNT(DISTINCT CASE WHEN f.is_favorite = 1 THEN fv.file_id END) as fav_count,
             COUNT(DISTINCT ft.file_id) as tag_count
      FROM ai_file_views fv
      JOIN files f ON fv.file_id = f.id
      LEFT JOIN file_tags ft ON ft.file_id = f.id
      GROUP BY f.category
    `;
    const result = this.db.exec(sql);
    const categoryScores = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      for (const row of result[0].values) {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        const totalActions = obj.view_count * 0.3 + obj.fav_count * 0.5 + obj.tag_count * 0.2;
        categoryScores.push({
          category: obj.category,
          score: totalActions,
          view_count: obj.view_count,
          fav_count: obj.fav_count,
          tag_count: obj.tag_count
        });
      }
    }

    const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0);
    this.db.run('DELETE FROM ai_user_preferences WHERE preference_type = ?', ['category']);
    for (const cat of categoryScores) {
      this.db.run(
        'INSERT INTO ai_user_preferences (preference_type, preference_key, preference_value, data_source, last_updated) VALUES (?, ?, ?, ?, ?)',
        ['category', cat.category, totalScore > 0 ? cat.score / totalScore : 0, 'combined', new Date().toISOString()]
      );
    }
    this.save();
  }

  _calculateTagPreferences() {
    const sql = `
      SELECT t.id, t.name,
             COUNT(DISTINCT fv.file_id) as viewed_count,
             COUNT(DISTINCT ua.file_id) as action_count
      FROM tags t
      JOIN file_tags ft ON ft.tag_id = t.id
      LEFT JOIN ai_file_views fv ON fv.file_id = ft.file_id
      LEFT JOIN ai_user_actions ua ON ua.file_id = ft.file_id AND ua.tag_id = t.id
      GROUP BY t.id
    `;
    const result = this.db.exec(sql);
    const tagScores = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      for (const row of result[0].values) {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        const totalFilesWithTag = this.db.exec('SELECT COUNT(*) FROM file_tags WHERE tag_id = ?', [obj.id]);
        const totalFiles = totalFilesWithTag.length > 0 ? totalFilesWithTag[0].values[0][0] : 1;
        const score = (obj.viewed_count || 0) / totalFiles;
        tagScores.push({ tag_id: obj.id, name: obj.name, score });
      }
    }

    this.db.run('DELETE FROM ai_user_preferences WHERE preference_type = ?', ['tag']);
    for (const tag of tagScores) {
      if (tag.score > 0) {
        this.db.run(
          'INSERT INTO ai_user_preferences (preference_type, preference_key, preference_value, data_source, last_updated) VALUES (?, ?, ?, ?, ?)',
          ['tag', tag.name, tag.score, 'views', new Date().toISOString()]
        );
      }
    }
    this.save();
  }

  _calculateKeywordPreferences() {
    const sql = `
      SELECT search_query, COUNT(*) as query_count
      FROM ai_user_actions
      WHERE action_type = 'search' AND search_query IS NOT NULL
      GROUP BY search_query
      ORDER BY query_count DESC
      LIMIT 50
    `;
    const result = this.db.exec(sql);
    const keywordScores = [];
    if (result.length > 0) {
      const columns = result[0].columns;
      const maxCount = result[0].values.length > 0 ? result[0].values[0][1] : 1;
      for (const row of result[0].values) {
        keywordScores.push({
          keyword: row[0],
          score: row[1] / maxCount
        });
      }
    }

    this.db.run('DELETE FROM ai_user_preferences WHERE preference_type = ?', ['keyword']);
    for (const kw of keywordScores) {
      this.db.run(
        'INSERT INTO ai_user_preferences (preference_type, preference_key, preference_value, data_source, last_updated) VALUES (?, ?, ?, ?, ?)',
        ['keyword', kw.keyword, kw.score, 'search', new Date().toISOString()]
      );
    }
    this.save();
  }

  getPreferences() {
    const result = this.db.exec(
      'SELECT * FROM ai_user_preferences ORDER BY preference_value DESC'
    );
    if (result.length === 0) return { categories: [], tags: [], keywords: [] };
    const rows = result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
    return {
      categories: rows.filter(r => r.preference_type === 'category'),
      tags: rows.filter(r => r.preference_type === 'tag'),
      keywords: rows.filter(r => r.preference_type === 'keyword')
    };
  }

  clearPreferencesData() {
    this.db.run('DELETE FROM ai_user_preferences');
    this.db.run('DELETE FROM ai_file_views');
    this.db.run('DELETE FROM ai_user_actions');
    this.db.run('DELETE FROM ai_recommendations');
    this.db.run('DELETE FROM ai_search_history');
    this.save();
  }

  // === 推荐引擎方法 ===

  getRecommendations(type = null, limit = 20) {
    let sql = `
      SELECT r.*, f.name, f.path, f.ext, f.category, f.size
      FROM ai_recommendations r
      JOIN files f ON r.file_id = f.id
      WHERE r.expires_at IS NULL OR r.expires_at > datetime('now')
    `;
    const params = [];
    if (type) {
      sql += ' AND r.rec_type = ?';
      params.push(type);
    }
    sql += ' ORDER BY r.score DESC LIMIT ?';
    params.push(limit);

    const result = this.db.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  generateRecommendations() {
    const prefs = this.getPreferences();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    this.db.run('DELETE FROM ai_recommendations');

    const topCategories = prefs.categories.slice(0, 3).map(c => c.preference_key);
    const topTags = prefs.tags.slice(0, 5).map(t => t.preference_key);

    if (topCategories.length > 0) {
      const placeholders = topCategories.map(() => '?').join(',');
      const sql = `
        SELECT f.id, f.name, f.category
        FROM files f
        LEFT JOIN ai_file_views fv ON fv.file_id = f.id
        WHERE f.category IN (${placeholders}) AND (fv.file_id IS NULL OR fv.view_count = 0)
        ORDER BY f.scanned_at DESC
        LIMIT 20
      `;
      const result = this.db.exec(sql, topCategories);
      if (result.length > 0) {
        for (const row of result[0].values) {
          const fileId = row[0];
          const category = row[2];
          const score = prefs.categories.find(c => c.preference_key === category)?.preference_value || 0.5;
          this.db.run(
            'INSERT INTO ai_recommendations (rec_type, file_id, score, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['category_based', fileId, score, `基于你对「${category}」类别的偏好`, now, expiresAt]
          );
        }
      }
    }

    if (topTags.length > 0) {
      const placeholders = topTags.map(() => '?').join(',');
      const sql = `
        SELECT DISTINCT f.id, f.name
        FROM files f
        JOIN file_tags ft ON ft.file_id = f.id
        JOIN tags t ON t.id = ft.tag_id
        LEFT JOIN ai_file_views fv ON fv.file_id = f.id
        WHERE t.name IN (${placeholders}) AND (fv.file_id IS NULL OR fv.view_count = 0)
        ORDER BY f.scanned_at DESC
        LIMIT 20
      `;
      const result = this.db.exec(sql, topTags);
      if (result.length > 0) {
        for (const row of result[0].values) {
          const fileId = row[0];
          const score = 0.7;
          this.db.run(
            'INSERT INTO ai_recommendations (rec_type, file_id, score, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['tag_based', fileId, score, `基于你的标签偏好`, now, expiresAt]
          );
        }
      }
    }

    this.save();
    return this.getRecommendations(null, 20);
  }

  clearRecommendations() {
    this.db.run('DELETE FROM ai_recommendations');
    this.save();
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