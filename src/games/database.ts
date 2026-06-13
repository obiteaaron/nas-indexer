/**
 * 游戏数据库操作模块
 */

import fs from 'fs';
import path from 'path';
import { database } from '../database';
import { logger } from '../logger';
import type { Game, GameQueryOptions, GameStatistics, GameGroup, SteamDbEntry, SteamDbImportResult } from '../types';
// metadata-manager no longer used - game.json removed from design

interface QueryResult {
  columns: string[];
  values: unknown[][];
}

class GameDatabase {
  async init(): Promise<this> {
    return this;
  }

  // === 游戏表操作 ===

  createGameTables(): void {
    const existing: QueryResult[] = database.db!.exec(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='games'"
    );
    const isNew: boolean = existing.length === 0 || existing[0].values[0][0] === 0;

    database.db!.run(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL UNIQUE,

        title TEXT NOT NULL,
        title_en TEXT,
        original_name TEXT,

        steam_appid TEXT,

        poster_url TEXT,
        cover_url TEXT,

        developer TEXT,
        publisher TEXT,
        release_date TEXT,
        genres TEXT,
        rating REAL,
        description TEXT,
        short_description TEXT,
        languages TEXT,
        tags TEXT,
        notes TEXT,
        screenshots TEXT,

        metadata_source TEXT DEFAULT 'unknown',

        scraped_at DATETIME,
        is_manually_edited INTEGER DEFAULT 0,
        is_excluded INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        is_root_manually_marked INTEGER DEFAULT 0,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `);

    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_source_path ON games(source_path)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_title ON games(title)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_steam_appid ON games(steam_appid)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_metadata_source ON games(metadata_source)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_release_date ON games(release_date)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_excluded ON games(is_excluded)');

    // 兼容已存在表：检查 is_favorite 列是否存在
    const colCheck: QueryResult[] = database.db!.exec(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('games') WHERE name='is_favorite'"
    );
    const hasFavoriteCol = colCheck.length > 0 && (colCheck[0].values[0][0] as number) > 0;
    if (!hasFavoriteCol) {
      database.db!.run('ALTER TABLE games ADD COLUMN is_favorite INTEGER DEFAULT 0');
      logger.info('游戏数据库: 新增 is_favorite 列');
    }
    // 列确认存在后再创建索引（新表在 CREATE TABLE 中已包含该列，迁移表通过 ALTER 添加）
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(is_favorite)');

    // 兼容已存在表：检查 is_root_manually_marked 列是否存在
    const rootMarkedCheck: QueryResult[] = database.db!.exec(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('games') WHERE name='is_root_manually_marked'"
    );
    const hasRootMarkedCol = rootMarkedCheck.length > 0 && (rootMarkedCheck[0].values[0][0] as number) > 0;
    if (!hasRootMarkedCol) {
      database.db!.run('ALTER TABLE games ADD COLUMN is_root_manually_marked INTEGER DEFAULT 0');
      logger.info('游戏数据库: 新增 is_root_manually_marked 列（P0手动优先级标记）');
    }

    // Steam 数据库表：Steam AppID 与游戏名称映射
    database.db!.run(`
      CREATE TABLE IF NOT EXISTS game_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_game_groups_pinned ON game_groups(pinned)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_game_groups_sort_order ON game_groups(sort_order)');

    // 分组-游戏关联表
    database.db!.run(`
      CREATE TABLE IF NOT EXISTS game_group_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        game_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, game_id)
      )
    `);
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_group_items_group ON game_group_items(group_id)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_group_items_game ON game_group_items(game_id)');

    // Steam 数据库表：Steam AppID 与游戏名称映射
    database.db!.run(`
      CREATE TABLE IF NOT EXISTS steam_db (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_appid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        name_en TEXT,
        aliases TEXT DEFAULT '[]',
        notes TEXT,
        source TEXT DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `);
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_appid ON steam_db(steam_appid)');
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_steam_db_name ON steam_db(name)');

    database.save();
    if (isNew) {
      logger.info('游戏数据库表已创建');
    }
  }

  insertGame(gameData: Partial<Game>): number {
    const {
      source_path,
      title,
      title_en = null,
      original_name = null,
      steam_appid = null,
      poster_url = null,
      cover_url = null,

      developer = null,
      publisher = null,
      release_date = null,
      genres = null,
      rating = null,
      description = null,
      short_description = null,
      languages = null,
      tags = null,
      notes = null,
      screenshots = null,
      metadata_source = 'unknown',

      scraped_at = null,
      is_manually_edited = 0
    } = gameData;

    if (!source_path || !title) {
      logger.warn('插入游戏失败: 缺少 source_path 或 title, source_path=%s, title=%s', source_path, title);
      return 0;
    }

    if (!database.db) {
      logger.error('插入游戏失败: 数据库未初始化');
      return 0;
    }

    logger.debug('准备插入游戏: source_path=%s, title=%s', source_path, title);

    try {
      const existing: Game | null = this.getGameByPath(source_path);
      if (existing) {
        logger.debug('游戏已存在，仅更新基本信息: id=%d, path=%s', existing.id, source_path);
        // 只更新识别相关的基本字段，保留已有的刮削元数据
        database.db!.run(`
          UPDATE games SET
            title = COALESCE(?, title),
            title_en = COALESCE(?, title_en),
            original_name = COALESCE(?, original_name),
            steam_appid = COALESCE(?, steam_appid),
            updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `, [
          title, title_en, original_name, steam_appid,
          existing.id
        ]);
        database.save();
        return existing.id;
      } else {
        logger.debug('插入新游戏: path=%s, title=%s', source_path, title);
        const insertSql = `
          INSERT INTO games (
            source_path, title, title_en, original_name, steam_appid,
            poster_url, cover_url,
            developer, publisher, release_date, genres, rating,
            description, short_description, languages, tags, notes,
            screenshots, metadata_source, scraped_at,
            is_manually_edited
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
          source_path, title, title_en, original_name, steam_appid,
          poster_url, cover_url,
          developer, publisher, release_date, genres, rating,
          description, short_description, languages, tags, notes,
          screenshots, metadata_source, scraped_at,
          is_manually_edited
        ];
        logger.debug('INSERT 参数数量: %d', insertParams.length);
        database.db!.run(insertSql, insertParams);
        database.save();
        const result: QueryResult[] = database.db!.exec('SELECT MAX(id) as id FROM games');
        const newId = (result[0].values[0][0] as number) || 0;
        logger.debug('插入成功, newId=%d', newId);
        return newId;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('插入游戏失败: %s', error.message);
      logger.error('游戏数据: source_path=%s, title=%s', source_path, title);
      logger.error('错误堆栈: %s', error.stack || '无堆栈信息');
      return 0;
    }
  }

  getGameById(id: number): Game | null {
    const result: QueryResult[] = database.db!.exec('SELECT * FROM games WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToGame(result[0], result[0].values[0]);
  }

  getGameByPath(sourcePath: string): Game | null {
    const result: QueryResult[] = database.db!.exec('SELECT * FROM games WHERE source_path = ?', [sourcePath]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToGame(result[0], result[0].values[0]);
  }

  getGames(options: GameQueryOptions = {}): Game[] {
    const { genre, year, search, scraped, excluded, favorite, orderBy = 'title', orderDir = 'ASC', limit = 100, offset = 0 } = options;

    let sql: string = 'SELECT * FROM games';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (genre) {
      conditions.push('genres LIKE ?');
      params.push(`%${genre}%`);
    }

    if (year) {
      conditions.push('release_date LIKE ?');
      params.push(`${year}%`);
    }

    if (search) {
      conditions.push('(title LIKE ? OR title_en LIKE ? OR original_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (scraped === 'true') {
      conditions.push('(scraped_at IS NOT NULL OR metadata_source = \'manual\')');
    } else if (scraped === 'false') {
      conditions.push('(scraped_at IS NULL AND metadata_source != \'manual\')');
    }

    if (excluded === 'true' || excluded === 'only') {
      conditions.push('is_excluded = 1');
    } else {
      conditions.push('is_excluded = 0');
    }

    if (favorite === 'true') {
      conditions.push('is_favorite = 1');
    } else if (favorite === 'false') {
      conditions.push('is_favorite = 0');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // 按年份排序时：无年份的放最后，新到旧
    if (orderBy === 'release_date') {
      sql += ' ORDER BY CASE WHEN release_date IS NULL OR release_date = \'\' THEN 1 ELSE 0 END ASC, release_date DESC LIMIT ? OFFSET ?';
    } else if (orderBy === 'rating') {
      sql += ' ORDER BY CASE WHEN rating IS NULL THEN 1 ELSE 0 END ASC, rating DESC LIMIT ? OFFSET ?';
    } else {
      sql += ` ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    }
    params.push(limit, offset);

    const result: QueryResult[] = database.db!.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToGame(result[0], row));
  }

  getGameCount(options: GameQueryOptions = {}): number {
    const { genre, year, search, scraped, excluded, favorite } = options;

    let sql: string = 'SELECT COUNT(*) as count FROM games';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (genre) {
      conditions.push('genres LIKE ?');
      params.push(`%${genre}%`);
    }

    if (year) {
      conditions.push('release_date LIKE ?');
      params.push(`${year}%`);
    }

    if (search) {
      conditions.push('(title LIKE ? OR title_en LIKE ? OR original_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (scraped === 'true') {
      conditions.push('(scraped_at IS NOT NULL OR metadata_source = \'manual\')');
    } else if (scraped === 'false') {
      conditions.push('(scraped_at IS NULL AND metadata_source != \'manual\')');
    }

    if (excluded === 'true' || excluded === 'only') {
      conditions.push('is_excluded = 1');
    } else {
      conditions.push('is_excluded = 0');
    }

    if (favorite === 'true') {
      conditions.push('is_favorite = 1');
    } else if (favorite === 'false') {
      conditions.push('is_favorite = 0');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const result: QueryResult[] = database.db!.exec(sql, params);
    if (result.length === 0) return 0;
    return result[0].values[0][0] as number;
  }

  updateGame(id: number, data: Partial<Game>): boolean {
    const fields: string[] = [];
    const params: unknown[] = [];

    const allowedFields = [
      'title', 'title_en', 'original_name', 'steam_appid',
      'poster_url', 'cover_url',
      'developer', 'publisher', 'release_date', 'genres', 'rating',
      'description', 'short_description', 'languages', 'tags', 'notes',
      'screenshots',
      'metadata_source', 'scraped_at',  // ✓ 允许更新元数据来源和刮削时间
      'is_manually_edited', 'is_root_manually_marked'
    ];

    for (const field of allowedFields) {
      if (data[field as keyof Game] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field as keyof Game]);
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = datetime("now", "localtime")');
    params.push(id);

    database.db!.run(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`, params);
    database.save();
    return true;
  }

  deleteGame(id: number): boolean {
    // 先删除分组关系，避免孤儿数据
    database.db!.run('DELETE FROM game_group_items WHERE game_id = ?', [id]);
    // 再删除游戏记录
    database.db!.run('DELETE FROM games WHERE id = ?', [id]);
    database.save();
    return true;
  }

  clearAllGames(): void {
    database.db!.run('DELETE FROM games');
    database.save();
  }

  toggleExclude(id: number): Game | null {
    const game: Game | null = this.getGameById(id);
    if (!game) return null;
    const newVal: number = game.is_excluded ? 0 : 1;
    database.db!.run(
      'UPDATE games SET is_excluded = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
      [newVal, id]
    );
    database.save();
    return this.getGameById(id);
  }

  toggleFavorite(id: number): Game | null {
    const game: Game | null = this.getGameById(id);
    if (!game) return null;
    const newVal: number = game.is_favorite ? 0 : 1;
    database.db!.run(
      'UPDATE games SET is_favorite = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
      [newVal, id]
    );
    database.save();
    return this.getGameById(id);
  }

  promoteGame(id: number): { success: boolean; error?: string; game?: Game } {
    const game: Game | null = this.getGameById(id);
    if (!game) return { success: false, error: '游戏不存在' };
    const oldPath = game.source_path;
    const newPath = path.dirname(oldPath);
    if (newPath === oldPath || newPath === path.parse(oldPath).root) {
      return { success: false, error: '无法再向上提升' };
    }

    const existing: Game | null = this.getGameByPath(newPath);
    if (existing) {
      return { success: false, error: `父目录已有游戏记录：${existing.title}（id=${existing.id}）` };
    }

    const newDirName = path.basename(newPath);
    try {
      // 提升目录并标记为用户已确认（P0优先级）
      database.db!.run(
        'UPDATE games SET source_path = ?, original_name = ?, is_root_manually_marked = 1, updated_at = datetime("now", "localtime") WHERE id = ?',
        [newPath, newDirName, id]
      );
      database.save();
      const updatedGame = this.getGameById(id);
      logger.info('[提升目录-P0] 完成: %s -> %s (已标记为用户确认), id=%d', path.basename(oldPath), newDirName, id);
      return { success: true, game: updatedGame ?? undefined };
    } catch (dbErr) {
      const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
      logger.error('[提升目录] 数据库更新失败: %s', error.message);
      return { success: false, error: '数据库更新失败: ' + error.message };
    }
  }

  createManualGame(data: {
    source_path: string;
    title: string;
    title_en?: string;
    steam_appid?: string;
    developer?: string;
    publisher?: string;
    release_date?: string;
    genres?: string;
    short_description?: string;
    notes?: string;
  }): { success: boolean; error?: string; id?: number; game?: Game } {
    const { source_path, title } = data;

    if (!source_path || !title) {
      return { success: false, error: 'source_path 和 title 为必填项' };
    }

    if (!fs.existsSync(source_path)) {
      return { success: false, error: '目录不存在: ' + source_path };
    }

    const existing = this.getGameByPath(source_path);
    if (existing) {
      return { success: false, error: `该路径已有游戏记录: ${existing.title}（id=${existing.id}）` };
    }

    try {
      // 手动添加时标记为用户已确认（P0优先级）
      database.db!.run(
        'INSERT INTO games (source_path, title, title_en, original_name, steam_appid, developer, publisher, release_date, genres, short_description, notes, metadata_source, is_root_manually_marked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "manual", 1)',
        [source_path, title, data.title_en || null, path.basename(source_path), data.steam_appid || null, data.developer || null, data.publisher || null, data.release_date || null, data.genres || null, data.short_description || null, data.notes || null]
      );
      database.save();
      const newId = (database.db!.exec('SELECT MAX(id) as id FROM games')[0].values[0][0]) as number;
      const newGame = this.getGameById(newId);
      logger.info('[手动添加-P0] 游戏创建成功 (已标记为用户确认): %s', title);
      return { success: true, id: newId, game: newGame ?? undefined };
    } catch (dbErr) {
      const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
      logger.error('[手动添加] 创建失败: %s', error.message);
      return { success: false, error: '数据库写入失败: ' + error.message };
    }
  }

  deleteNonexistent(): { deletedCount: number; deletedIds: number[] } {
    const result: QueryResult[] = database.db!.exec('SELECT id, source_path FROM games');
    if (result.length === 0) return { deletedCount: 0, deletedIds: [] };
    const deletedIds: number[] = [];
    for (const row of result[0].values) {
      const id: number = row[0] as number;
      const sourcePath: string = row[1] as string;
      if (!fs.existsSync(sourcePath)) {
        database.db!.run('DELETE FROM games WHERE id = ?', [id]);
        deletedIds.push(id);
      }
    }
    if (deletedIds.length > 0) {
      database.save();
    }
    return { deletedCount: deletedIds.length, deletedIds };
  }

  deleteStaleByScanRoots(scanRoots: string[]): number {
    const normalizedRoots = scanRoots.map(r => path.resolve(r).replace(/\\/g, '/').toLowerCase());
    const result: QueryResult[] = database.db!.exec('SELECT id, source_path FROM games');
    if (result.length === 0) return 0;
    let count = 0;
    for (const row of result[0].values) {
      const id = row[0] as number;
      const gamePath = path.resolve(row[1] as string).replace(/\\/g, '/').toLowerCase();
      const isUnderRoot = normalizedRoots.some(root => gamePath.startsWith(root + '/') || gamePath === root);
      if (!isUnderRoot) {
        database.db!.run('DELETE FROM games WHERE id = ?', [id]);
        count++;
      }
    }
    if (count > 0) database.save();
    return count;
  }

  // === 游戏分组 ===

  createGroup(name: string, pinned: number = 0): GameGroup | null {
    if (!name || name.trim().length === 0) return null;

    // 获取最大 sort_order
    const maxResult: QueryResult[] = database.db!.exec('SELECT MAX(sort_order) as max_order FROM game_groups');
    const maxOrder: number = maxResult.length > 0 && maxResult[0].values[0][0] ? (maxResult[0].values[0][0] as number) : 0;

    database.db!.run(
      'INSERT INTO game_groups (name, pinned, sort_order) VALUES (?, ?, ?)',
      [name.trim(), pinned ? 1 : 0, maxOrder + 1]
    );
    database.save();

    const idResult: QueryResult[] = database.db!.exec('SELECT MAX(id) as id FROM game_groups');
    const newId = (idResult[0]?.values[0][0] as number) || 0;
    return this.getGroupById(newId);
  }

  getGroupById(id: number): GameGroup | null {
    const result: QueryResult[] = database.db!.exec('SELECT * FROM game_groups WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const group: Record<string, unknown> = {};
    cols.forEach((col, i) => { group[col] = row[i]; });
    return group as unknown as GameGroup;
  }

  getGroups(): GameGroup[] {
    // 清理孤儿数据：删除游戏已不存在但分组关系仍存在的记录
    database.db!.run(
      'DELETE FROM game_group_items WHERE game_id NOT IN (SELECT id FROM games)'
    );
    database.save();

    // 统计时只计算实际存在的游戏
    const result: QueryResult[] = database.db!.exec(`
      SELECT g.*, COUNT(ga.id) as game_count
      FROM game_groups g
      LEFT JOIN game_group_items gi ON g.id = gi.group_id
      LEFT JOIN games ga ON gi.game_id = ga.id
      GROUP BY g.id
      ORDER BY g.pinned DESC, g.sort_order ASC
    `);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const cols = result[0].columns;
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as unknown as GameGroup;
    });
  }

  updateGroup(id: number, data: { name?: string; pinned?: number; sort_order?: number }): boolean {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }
    if (data.pinned !== undefined) {
      fields.push('pinned = ?');
      params.push(data.pinned ? 1 : 0);
    }
    if (data.sort_order !== undefined) {
      fields.push('sort_order = ?');
      params.push(data.sort_order);
    }

    if (fields.length === 0) return false;

    params.push(id);
    database.db!.run(`UPDATE game_groups SET ${fields.join(', ')} WHERE id = ?`, params);
    database.save();
    return true;
  }

  deleteGroup(id: number): boolean {
    database.db!.run('DELETE FROM game_group_items WHERE group_id = ?', [id]);
    database.db!.run('DELETE FROM game_groups WHERE id = ?', [id]);
    database.save();
    return true;
  }

  reorderGroups(items: { id: number; sort_order: number }[]): void {
    for (const item of items) {
      database.db!.run('UPDATE game_groups SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
    }
    database.save();
  }

  // === 分组游戏管理 ===

  addGroupGame(groupId: number, gameId: number, sortOrder?: number): boolean {
    try {
      const maxResult: QueryResult[] = database.db!.exec('SELECT MAX(sort_order) as max_order FROM game_group_items WHERE group_id = ?', [groupId]);
      const maxOrder: number = maxResult.length > 0 && maxResult[0].values[0][0] ? (maxResult[0].values[0][0] as number) : 0;
      database.db!.run(
        'INSERT OR IGNORE INTO game_group_items (group_id, game_id, sort_order) VALUES (?, ?, ?)',
        [groupId, gameId, sortOrder ?? maxOrder + 1]
      );
      database.save();
      return true;
    } catch {
      return false;
    }
  }

  removeGroupGame(groupId: number, gameId: number): boolean {
    database.db!.run('DELETE FROM game_group_items WHERE group_id = ? AND game_id = ?', [groupId, gameId]);
    database.save();
    return true;
  }

  getGroupGames(groupId: number, options: GameQueryOptions = {}): Game[] {
    const { genre, year, search, scraped, excluded, favorite, orderBy = 'title', orderDir = 'ASC', limit = 100, offset = 0 } = options;

    let sql: string = `
      SELECT g.* FROM games g
      INNER JOIN game_group_items gi ON g.id = gi.game_id
      WHERE gi.group_id = ?
    `;
    const params: unknown[] = [groupId];
    const conditions: string[] = [];

    if (genre) {
      conditions.push('g.genres LIKE ?');
      params.push(`%${genre}%`);
    }

    if (year) {
      conditions.push('g.release_date LIKE ?');
      params.push(`${year}%`);
    }

    if (search) {
      conditions.push('(g.title LIKE ? OR g.title_en LIKE ? OR g.original_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (scraped === 'true') {
      conditions.push('(g.scraped_at IS NOT NULL OR g.metadata_source = \'local\')');
    } else if (scraped === 'false') {
      conditions.push('(g.scraped_at IS NULL AND g.metadata_source != \'local\')');
    }

    // 分组内游戏默认不显示已排除的，除非明确筛选
    if (excluded === 'true' || excluded === 'only') {
      conditions.push('g.is_excluded = 1');
    } else {
      conditions.push('g.is_excluded = 0');
    }

    if (favorite === 'true') {
      conditions.push('g.is_favorite = 1');
    } else if (favorite === 'false') {
      conditions.push('g.is_favorite = 0');
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    // 按年份排序时：无年份的放最后，新到旧
    if (orderBy === 'release_date') {
      sql += ' ORDER BY CASE WHEN g.release_date IS NULL OR g.release_date = \'\' THEN 1 ELSE 0 END ASC, g.release_date DESC LIMIT ? OFFSET ?';
    } else if (orderBy === 'rating') {
      sql += ' ORDER BY CASE WHEN g.rating IS NULL THEN 1 ELSE 0 END ASC, g.rating DESC LIMIT ? OFFSET ?';
    } else {
      sql += ` ORDER BY gi.sort_order ASC, g.${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    }
    params.push(limit, offset);

    const result: QueryResult[] = database.db!.exec(sql, params);
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToGame(result[0], row));
  }

  getGroupGameCount(groupId: number, options: GameQueryOptions = {}): number {
    const { genre, year, search, scraped, excluded, favorite } = options;

    let sql: string = `
      SELECT COUNT(*) as count FROM games g
      INNER JOIN game_group_items gi ON g.id = gi.game_id
      WHERE gi.group_id = ?
    `;
    const params: unknown[] = [groupId];
    const conditions: string[] = [];

    if (genre) {
      conditions.push('g.genres LIKE ?');
      params.push(`%${genre}%`);
    }

    if (year) {
      conditions.push('g.release_date LIKE ?');
      params.push(`${year}%`);
    }

    if (search) {
      conditions.push('(g.title LIKE ? OR g.title_en LIKE ? OR g.original_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (scraped === 'true') {
      conditions.push('(g.scraped_at IS NOT NULL OR g.metadata_source = \'local\')');
    } else if (scraped === 'false') {
      conditions.push('(g.scraped_at IS NULL AND g.metadata_source != \'local\')');
    }

    if (excluded === 'true' || excluded === 'only') {
      conditions.push('g.is_excluded = 1');
    } else {
      conditions.push('g.is_excluded = 0');
    }

    if (favorite === 'true') {
      conditions.push('g.is_favorite = 1');
    } else if (favorite === 'false') {
      conditions.push('g.is_favorite = 0');
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    const result: QueryResult[] = database.db!.exec(sql, params);
    if (result.length === 0) return 0;
    return result[0].values[0][0] as number;
  }

  getGamesNotInGroup(groupId: number): Game[] {
    const result: QueryResult[] = database.db!.exec(`
      SELECT * FROM games
      WHERE id NOT IN (SELECT game_id FROM game_group_items WHERE group_id = ?)
        AND is_excluded = 0
      ORDER BY title ASC
    `, [groupId]);
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToGame(result[0], row));
  }

  reorderGroupGames(groupId: number, items: { game_id: number; sort_order: number }[]): void {
    for (const item of items) {
      database.db!.run(
        'UPDATE game_group_items SET sort_order = ? WHERE group_id = ? AND game_id = ?',
        [item.sort_order, groupId, item.game_id]
      );
    }
    database.save();
  }

  isGameInGroup(groupId: number, gameId: number): boolean {
    const result: QueryResult[] = database.db!.exec(
      'SELECT 1 FROM game_group_items WHERE group_id = ? AND game_id = ?',
      [groupId, gameId]
    );
    return result.length > 0 && result[0].values.length > 0;
  }

  // === 统计方法 ===

  getStatistics(): GameStatistics {
    const totalResult: QueryResult[] = database.db!.exec('SELECT COUNT(*) as count FROM games');
    const totalGames: number = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

    const scrapedResult: QueryResult[] = database.db!.exec(
      'SELECT COUNT(*) as count FROM games WHERE scraped_at IS NOT NULL OR metadata_source = \'manual\''
    );
    const scrapedGames: number = scrapedResult.length > 0 ? (scrapedResult[0].values[0][0] as number) : 0;

    const unscrapedGames: number = totalGames - scrapedGames;

    const excludedResult: QueryResult[] = database.db!.exec(
      'SELECT COUNT(*) as count FROM games WHERE is_excluded = 1'
    );
    const excludedGames: number = excludedResult.length > 0 ? (excludedResult[0].values[0][0] as number) : 0;

    const favoriteResult: QueryResult[] = database.db!.exec(
      'SELECT COUNT(*) as count FROM games WHERE is_favorite = 1'
    );
    const favoriteGames: number = favoriteResult.length > 0 ? (favoriteResult[0].values[0][0] as number) : 0;

    const yearResult: QueryResult[] = database.db!.exec(`
      SELECT substr(release_date, 1, 4) as year, COUNT(*) as count
      FROM games
      WHERE release_date IS NOT NULL AND release_date != ''
      GROUP BY year
      ORDER BY year DESC
      LIMIT 20
    `);
    const byYear: { year: string; count: number }[] = yearResult.length > 0
      ? yearResult[0].values.map(row => ({ year: row[0] as string, count: row[1] as number }))
      : [];

    // 解析 genres JSON 并统计
    const genreMap: Record<string, number> = {};
    const genreResult: QueryResult[] = database.db!.exec('SELECT genres FROM games WHERE genres IS NOT NULL');
    if (genreResult.length > 0) {
      for (const row of genreResult[0].values) {
        try {
          const genres: string[] = JSON.parse(row[0] as string);
          for (const genre of genres) {
            genreMap[genre] = (genreMap[genre] || 0) + 1;
          }
        } catch {
          // JSON 解析失败，跳过
        }
      }
    }
    const byGenre: { genre: string; count: number }[] = Object.entries(genreMap)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return { totalGames, scrapedGames, unscrapedGames, excludedGames, favoriteGames, byYear, byGenre };
  }

  getGenres(): string[] {
    const genreMap: Record<string, number> = {};
    const result: QueryResult[] = database.db!.exec('SELECT genres FROM games WHERE genres IS NOT NULL');
    if (result.length > 0) {
      for (const row of result[0].values) {
        try {
          const genres: string[] = JSON.parse(row[0] as string);
          for (const genre of genres) {
            genreMap[genre] = (genreMap[genre] || 0) + 1;
          }
        } catch {
          // JSON 解析失败，跳过
        }
      }
    }
    return Object.keys(genreMap).sort();
  }

  getYears(): string[] {
    const result: QueryResult[] = database.db!.exec(`
      SELECT DISTINCT substr(release_date, 1, 4) as year
      FROM games
      WHERE release_date IS NOT NULL AND release_date != ''
      ORDER BY year DESC
    `);
    if (result.length === 0) return [];
    return result[0].values.map(row => row[0] as string);
  }

  // === P0手动优先级辅助方法 ===

  /**
   * 查询指定路径前缀下的所有游戏（用于子目录检查）
   * 例如：查询 "E:\Games\Elden Ring" 可找到 "E:\Games\Elden Ring\Elden Ring"
   */
  getGamesByPathPrefix(prefixPath: string): Game[] {
    const normalizedPrefix = prefixPath.replace(/\\/g, '/');
    const result: QueryResult[] = database.db!.exec(
      'SELECT * FROM games WHERE source_path LIKE ?',
      [normalizedPrefix + '/%']
    );
    if (result.length === 0 || result[0].values.length === 0) return [];
    return result[0].values.map(row => this.rowToGame(result[0], row));
  }

  // === Steam DB 操作 ===

  /**
   * 插入 Steam DB 条目
   */
  insertSteamDbEntry(data: Partial<SteamDbEntry>): number {
    const { steam_appid, name, name_en = null, aliases = [], notes = null, source = 'manual' } = data;

    if (!steam_appid || !name) {
      logger.warn('插入 Steam DB 失败: 缺少 steam_appid 或 name');
      return 0;
    }

    try {
      database.db!.run(
        'INSERT OR REPLACE INTO steam_db (steam_appid, name, name_en, aliases, notes, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now", "localtime"))',
        [steam_appid, name, name_en, JSON.stringify(aliases), notes, source]
      );
      database.save();

      const result: QueryResult[] = database.db!.exec('SELECT id FROM steam_db WHERE steam_appid = ?', [steam_appid]);
      return result.length > 0 && result[0].values.length > 0 ? (result[0].values[0][0] as number) : 0;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('插入 Steam DB 失败: %s', error.message);
      return 0;
    }
  }

  /**
   * 根据 ID 获取 Steam DB 条目
   */
  getSteamDbById(id: number): SteamDbEntry | null {
    const result: QueryResult[] = database.db!.exec('SELECT * FROM steam_db WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToSteamDbEntry(result[0], result[0].values[0]);
  }

  /**
   * 根据 AppID 获取 Steam DB 条目
   */
  getSteamDbByAppid(appid: string): SteamDbEntry | null {
    const result: QueryResult[] = database.db!.exec('SELECT * FROM steam_db WHERE steam_appid = ?', [appid]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToSteamDbEntry(result[0], result[0].values[0]);
  }

  /**
   * 获取所有 Steam DB 条目（支持分页）
   */
  getAllSteamDbEntries(options: { search?: string; orderBy?: string; orderDir?: string; limit?: number; offset?: number } = {}): { entries: SteamDbEntry[]; total: number } {
    const { search, orderBy = 'name', orderDir = 'ASC', limit, offset } = options;

    // 先查询总数
    let countSql = 'SELECT COUNT(*) as count FROM steam_db';
    const countParams: unknown[] = [];
    if (search) {
      countSql += ' WHERE (name LIKE ? OR name_en LIKE ? OR aliases LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countResult: QueryResult[] = database.db!.exec(countSql, countParams);
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    // 查询数据
    let sql = 'SELECT * FROM steam_db';
    const params: unknown[] = [];

    if (search) {
      sql += ' WHERE (name LIKE ? OR name_en LIKE ? OR aliases LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY ${orderBy} ${orderDir}`;

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    if (offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    const result: QueryResult[] = database.db!.exec(sql, params);
    const entries = result.length === 0 ? [] : result[0].values.map(row => this.rowToSteamDbEntry(result[0], row));

    return { entries, total };
  }

  /**
   * 更新 Steam DB 条目
   */
  updateSteamDbEntry(id: number, data: Partial<SteamDbEntry>): boolean {
    const fields: string[] = [];
    const params: unknown[] = [];

    const allowedFields = ['steam_appid', 'name', 'name_en', 'aliases', 'notes', 'source'];
    for (const field of allowedFields) {
      if (data[field as keyof SteamDbEntry] !== undefined) {
        if (field === 'aliases') {
          fields.push('aliases = ?');
          params.push(JSON.stringify(data.aliases));
        } else {
          fields.push(`${field} = ?`);
          params.push(data[field as keyof SteamDbEntry]);
        }
      }
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = datetime("now", "localtime")');
    params.push(id);

    database.db!.run(`UPDATE steam_db SET ${fields.join(', ')} WHERE id = ?`, params);
    database.save();
    return true;
  }

  /**
   * 将 SteamDB 的名称同步到所有使用该 AppID 的游戏
   * @param steam_appid Steam AppID
   * @param updates 要更新的字段 { name?, name_en? }
   * @returns 更新的游戏数量
   */
  syncSteamDbToGames(steam_appid: string, updates: { name?: string; name_en?: string }): number {
    try {
      const fields: string[] = [];
      const params: (string | null)[] = [];

      if (updates.name !== undefined) {
        fields.push('title = ?');
        params.push(updates.name);
      }
      if (updates.name_en !== undefined) {
        fields.push('title_en = ?');
        params.push(updates.name_en || null);
      }

      if (fields.length === 0) return 0;

      params.push(steam_appid);

      const sql = `UPDATE games SET ${fields.join(', ')} WHERE steam_appid = ?`;
      database.db!.run(sql, params);

      const changes: QueryResult[] = database.db!.exec('SELECT changes()');
      const count = (changes[0]?.values[0]?.[0] as number) || 0;

      if (count > 0) {
        database.save();
        logger.info('SteamDB 同步: appid %s 更新了 %d 个游戏的名称', steam_appid, count);
      }

      return count;
    } catch (err) {
      const error = err as Error;
      logger.warn('SteamDB 同步失败: appid %s - %s', steam_appid, error.message);
      return 0;
    }
  }

  /**
   * 删除 Steam DB 条目
   */
  deleteSteamDbEntry(id: number): boolean {
    database.db!.run('DELETE FROM steam_db WHERE id = ?', [id]);
    database.save();
    return true;
  }

  /**
   * 根据名称查找 Steam AppID（匹配 name、name_en 或任意 aliases）
   * 用于游戏识别时快速获取 appid
   */
  lookupSteamDbByName(searchName: string): { steam_appid: string; name: string } | null {
    if (!searchName) return null;

    const normalizedSearch = searchName.trim().toLowerCase();

    // 1. 直接匹配 name
    const nameResult: QueryResult[] = database.db!.exec(
      'SELECT steam_appid, name FROM steam_db WHERE LOWER(name) = ?',
      [normalizedSearch]
    );
    if (nameResult.length > 0 && nameResult[0].values.length > 0) {
      return {
        steam_appid: nameResult[0].values[0][0] as string,
        name: nameResult[0].values[0][1] as string
      };
    }

    // 2. 直接匹配 name_en
    const nameEnResult: QueryResult[] = database.db!.exec(
      'SELECT steam_appid, name FROM steam_db WHERE LOWER(name_en) = ?',
      [normalizedSearch]
    );
    if (nameEnResult.length > 0 && nameEnResult[0].values.length > 0) {
      return {
        steam_appid: nameEnResult[0].values[0][0] as string,
        name: nameEnResult[0].values[0][1] as string
      };
    }

    // 3. 查找所有条目，遍历 aliases JSON 数组进行匹配
    const allResult: QueryResult[] = database.db!.exec('SELECT steam_appid, name, aliases FROM steam_db');
    if (allResult.length > 0) {
      for (const row of allResult[0].values) {
        const aliasesStr = row[2] as string;
        if (aliasesStr) {
          try {
            const aliases: string[] = JSON.parse(aliasesStr);
            for (const alias of aliases) {
              if (alias.toLowerCase() === normalizedSearch) {
                return {
                  steam_appid: row[0] as string,
                  name: row[1] as string
                };
              }
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }
      }
    }

    return null;
  }

  /**
   * 导出 Steam DB（返回纯数据数组，不含 id/created_at/updated_at）
   */
  exportSteamDb(): SteamDbEntry[] {
    const result: QueryResult[] = database.db!.exec(
      'SELECT steam_appid, name, name_en, aliases, notes, source FROM steam_db ORDER BY name ASC'
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      steam_appid: row[0] as string,
      name: row[1] as string,
      name_en: row[2] as string || undefined,
      aliases: JSON.parse(row[3] as string || '[]'),
      notes: row[4] as string || undefined,
      source: row[5] as 'manual' | 'imported' | 'auto' | 'scraper'
    }));
  }

  /**
   * 导入 Steam DB
   */
  importSteamDb(entries: SteamDbEntry[], mode: 'merge' | 'overwrite' = 'merge'): SteamDbImportResult {
    const result: SteamDbImportResult = { added: 0, updated: 0, skipped: 0 };

    for (const entry of entries) {
      if (!entry.steam_appid || !entry.name) {
        result.skipped++;
        continue;
      }

      const existing: QueryResult[] = database.db!.exec(
        'SELECT id FROM steam_db WHERE steam_appid = ?',
        [entry.steam_appid]
      );

      if (existing.length > 0 && existing[0].values.length > 0) {
        if (mode === 'overwrite') {
          // 覆盖模式：更新现有条目
          const id = existing[0].values[0][0] as number;
          database.db!.run(
            'UPDATE steam_db SET name = ?, name_en = ?, aliases = ?, notes = ?, source = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
            [entry.name, entry.name_en || null, JSON.stringify(entry.aliases || []), entry.notes || null, 'imported', id]
          );
          result.updated++;
        } else {
          // 合并模式：跳过已存在的
          result.skipped++;
        }
      } else {
        // 新条目：插入
        database.db!.run(
          'INSERT INTO steam_db (steam_appid, name, name_en, aliases, notes, source) VALUES (?, ?, ?, ?, ?, ?)',
          [entry.steam_appid, entry.name, entry.name_en || null, JSON.stringify(entry.aliases || []), entry.notes || null, 'imported']
        );
        result.added++;
      }
    }

    database.save();
    logger.info('Steam DB 导入完成: 新增 %d, 更新 %d, 跳过 %d', result.added, result.updated, result.skipped);
    return result;
  }

  /**
   * Steam DB 条目行转对象
   */
  private rowToSteamDbEntry(resultMeta: QueryResult, row: unknown[]): SteamDbEntry {
    const obj: Record<string, unknown> = {};
    resultMeta.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    const entry = obj as unknown as SteamDbEntry;

    // 解析 aliases JSON
    if (typeof entry.aliases === 'string') {
      try {
        entry.aliases = JSON.parse(entry.aliases);
      } catch {
        entry.aliases = [];
      }
    }

    return entry;
  }

  // === 海报路径处理 ===



  private rowToGame(resultMeta: QueryResult, row: unknown[]): Game {
    const obj: Record<string, unknown> = {};
    resultMeta.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    const game = obj as unknown as Game;

    // 解析 JSON 字段
    if (game.genres) {
      try {
        game.genresArray = JSON.parse(game.genres);
      } catch {
        game.genresArray = [];
      }
    } else {
      game.genresArray = [];
    }

    // 计算本地海报路径
    // Poster paths are now derived from storage functions
    // posterLocal is calculated dynamically when needed
    return game;
  }
}

const gameDatabase: GameDatabase = new GameDatabase();

export { gameDatabase, GameDatabase };