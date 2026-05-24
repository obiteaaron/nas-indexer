/**
 * 游戏数据库操作模块
 */

import fs from 'fs';
import path from 'path';
import { database } from '../database';
import { logger } from '../logger';
import type { Game, GameQueryOptions, GameStatistics } from '../types';
import {
  hasLocalMetadata,
  writeLocalMetadata,
  readLocalMetadata,
  checkLocalPosters
} from './metadata-manager';

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
        poster_horizontal_path TEXT,
        poster_vertical_path TEXT,
        poster_banner_path TEXT,
        background_path TEXT,
        has_local_poster INTEGER DEFAULT 0,

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
        metadata_path TEXT,
        scraped_at DATETIME,
        is_manually_edited INTEGER DEFAULT 0,
        is_excluded INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,

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

    // 别名映射表：文件夹名 → steam_appid
    database.db!.run(`
      CREATE TABLE IF NOT EXISTS game_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_name TEXT NOT NULL,
        steam_appid TEXT NOT NULL,
        source TEXT DEFAULT 'auto',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(folder_name)
      )
    `);
    database.db!.run('CREATE INDEX IF NOT EXISTS idx_game_aliases_folder ON game_aliases(folder_name)');

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
      poster_horizontal_path = null,
      poster_vertical_path = null,
      poster_banner_path = null,
      background_path = null,
      has_local_poster = 0,
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
      metadata_path = null,
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
        logger.debug('游戏已存在，更新: id=%d, path=%s', existing.id, source_path);
        database.db!.run(`
          UPDATE games SET
            title = ?, title_en = ?, original_name = ?, steam_appid = ?,
            poster_url = ?, cover_url = ?, poster_horizontal_path = ?, poster_vertical_path = ?,
            poster_banner_path = ?, background_path = ?, has_local_poster = ?,
            developer = ?, publisher = ?, release_date = ?, genres = ?, rating = ?,
            description = ?, short_description = ?, languages = ?, tags = ?, notes = ?,
            screenshots = ?, metadata_source = ?, metadata_path = ?, scraped_at = ?,
            is_manually_edited = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `, [
          title, title_en, original_name, steam_appid,
          poster_url, cover_url, poster_horizontal_path, poster_vertical_path,
          poster_banner_path, background_path, has_local_poster,
          developer, publisher, release_date, genres, rating,
          description, short_description, languages, tags, notes,
          screenshots, metadata_source, metadata_path, scraped_at,
          is_manually_edited, existing.id
        ]);
        database.save();
        return existing.id;
      } else {
        logger.debug('插入新游戏: path=%s, title=%s', source_path, title);
        const insertSql = `
          INSERT INTO games (
            source_path, title, title_en, original_name, steam_appid,
            poster_url, cover_url, poster_horizontal_path, poster_vertical_path,
            poster_banner_path, background_path, has_local_poster,
            developer, publisher, release_date, genres, rating,
            description, short_description, languages, tags, notes,
            screenshots, metadata_source, metadata_path, scraped_at,
            is_manually_edited
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
          source_path, title, title_en, original_name, steam_appid,
          poster_url, cover_url, poster_horizontal_path, poster_vertical_path,
          poster_banner_path, background_path, has_local_poster,
          developer, publisher, release_date, genres, rating,
          description, short_description, languages, tags, notes,
          screenshots, metadata_source, metadata_path, scraped_at,
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
      conditions.push('(scraped_at IS NOT NULL OR metadata_source = \'local\')');
    } else if (scraped === 'false') {
      conditions.push('(scraped_at IS NULL AND metadata_source != \'local\')');
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
      conditions.push('(scraped_at IS NOT NULL OR metadata_source = \'local\')');
    } else if (scraped === 'false') {
      conditions.push('(scraped_at IS NULL AND metadata_source != \'local\')');
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
      'poster_url', 'cover_url', 'poster_horizontal_path', 'poster_vertical_path',
      'poster_banner_path', 'background_path', 'has_local_poster',
      'developer', 'publisher', 'release_date', 'genres', 'rating',
      'description', 'short_description', 'languages', 'tags', 'notes',
      'screenshots', 'metadata_source', 'metadata_path', 'scraped_at',
      'is_manually_edited'
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
      return { success: false, error: '无法再向上提升，已是根目录' };
    }

    // 检查父目录是否已有游戏记录
    const existing: Game | null = this.getGameByPath(newPath);
    if (existing) {
      return { success: false, error: `父目录已有游戏记录：${existing.title}（id=${existing.id}）` };
    }

    const newDirName = path.basename(newPath);

    // === 1. 处理 game.json ===
    const oldHasGameJson = hasLocalMetadata(oldPath);
    if (oldHasGameJson) {
      // 读取旧的 game.json，写入到新目录
      const meta = readLocalMetadata(oldPath);
      if (meta) {
        writeLocalMetadata(newPath, meta);
        fs.unlinkSync(path.join(oldPath, 'game.json'));
        logger.info('[提升目录] game.json 已移动: %s -> %s', oldPath, newPath);
      }
    } else {
      // 不存在 game.json，从 DB 创建新的
      logger.info('[提升目录] 从数据库创建 game.json: %s', newPath);
    }

    // === 2. 处理海报文件 ===
    const posterTypes: Array<'horizontal' | 'vertical' | 'banner' | 'background'> = ['horizontal', 'vertical', 'banner', 'background'];
    const newPosterPaths: Record<string, string | null> = {};

    for (const type of posterTypes) {
      const dbField = `poster_${type}_path` as keyof Game;
      const oldPosterPath = game[dbField] as string | undefined;

      // 先检查 DB 记录的路径
      let actualOldPath: string | null = null;
      if (oldPosterPath && fs.existsSync(oldPosterPath)) {
        actualOldPath = oldPosterPath;
      } else {
        // DB 路径不存在，检查旧目录下的标准文件名
        const standardName = {
          horizontal: 'poster-horizontal.jpg',
          vertical: 'poster-vertical.jpg',
          banner: 'poster-banner.jpg',
          background: 'background.jpg'
        }[type];
        const candidate = path.join(oldPath, standardName);
        if (fs.existsSync(candidate)) {
          actualOldPath = candidate;
        }
      }

      if (actualOldPath) {
        const standardName = {
          horizontal: 'poster-horizontal.jpg',
          vertical: 'poster-vertical.jpg',
          banner: 'poster-banner.jpg',
          background: 'background.jpg'
        }[type];
        const newPosterPath = path.join(newPath, standardName);
        fs.renameSync(actualOldPath, newPosterPath);
        newPosterPaths[`poster_${type}_path`] = newPosterPath;
        logger.info('[提升目录] 海报已移动: %s -> %s', actualOldPath, newPosterPath);
      } else {
        newPosterPaths[`poster_${type}_path`] = null;
      }
    }

    // === 3. 更新数据库 ===
    try {
      const updateData: Record<string, unknown> = {
        source_path: newPath,
        original_name: newDirName,
        // title/title_en 保留原值（刮削后的准确标题）
        metadata_source: 'local',
        metadata_path: path.join(newPath, 'game.json'),
        poster_horizontal_path: newPosterPaths.poster_horizontal_path ?? null,
        poster_vertical_path: newPosterPaths.poster_vertical_path ?? null,
        poster_banner_path: newPosterPaths.poster_banner_path ?? null,
        background_path: newPosterPaths.background_path ?? null,
        has_local_poster: Object.values(newPosterPaths).some(v => v !== null) ? 1 : (game.has_local_poster ?? 0)
      };

      logger.debug('[提升目录] 更新数据: %j', updateData);

      const fields: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(updateData)) {
        // SQLite 不接受 undefined，转换为 null
        fields.push(`${key} = ?`);
        params.push(value === undefined ? null : value);
      }
      fields.push('updated_at = datetime("now", "localtime")');
      params.push(id);

      const sql = `UPDATE games SET ${fields.join(', ')} WHERE id = ?`;
      logger.debug('[提升目录] SQL: %s, params: %j', sql, params);
      database.db!.run(sql, params);

      // 确保新目录的 game.json 包含最新 DB 数据
      const updatedGame = this.getGameById(id);
      if (updatedGame) {
        writeLocalMetadata(newPath, updatedGame);
      }

      database.save();
      logger.info('[提升目录] 完成: %s -> %s, id=%d', path.basename(oldPath), newDirName, id);
      return { success: true, game: updatedGame ?? undefined };
    } catch (dbErr) {
      const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
      logger.error('[提升目录] 数据库更新失败: %s', error.message);
      logger.error('[提升目录] 错误堆栈: %s', error.stack || '无');
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

    // 检查是否已有该路径的游戏记录
    const existing = this.getGameByPath(source_path);
    if (existing) {
      return { success: false, error: `该路径已有游戏记录: ${existing.title}（id=${existing.id}）` };
    }

    const posters = checkLocalPosters(source_path);
    const hasPoster = posters.horizontal || posters.vertical ? 1 : 0;

    try {
      const insertSql = `
        INSERT INTO games (
          source_path, title, title_en, original_name, steam_appid,
          poster_horizontal_path, poster_vertical_path, poster_banner_path,
          background_path, has_local_poster,
          developer, publisher, release_date, genres,
          short_description, notes,
          metadata_source, metadata_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
      `;
      const params = [
        source_path,
        title,
        data.title_en || null,
        path.basename(source_path),
        data.steam_appid || null,
        posters.horizontal,
        posters.vertical,
        posters.banner,
        posters.background,
        hasPoster,
        data.developer || null,
        data.publisher || null,
        data.release_date || null,
        data.genres || null,
        data.short_description || null,
        data.notes || null,
        path.join(source_path, 'game.json')
      ];

      database.db!.run(insertSql, params);

      // 创建 game.json
      writeLocalMetadata(source_path, this.getGameById((database.db!.exec('SELECT MAX(id) as id FROM games')[0].values[0][0]) as number)!);

      database.save();
      logger.info('[手动添加] 游戏创建成功: %s', title);
      const newId = (database.db!.exec('SELECT MAX(id) as id FROM games')[0].values[0][0]) as number;
      const newGame = this.getGameById(newId);
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

  // === 统计方法 ===

  getStatistics(): GameStatistics {
    const totalResult: QueryResult[] = database.db!.exec('SELECT COUNT(*) as count FROM games');
    const totalGames: number = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

    const scrapedResult: QueryResult[] = database.db!.exec(
      'SELECT COUNT(*) as count FROM games WHERE scraped_at IS NOT NULL OR metadata_source = \'local\''
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

  // === 别名映射操作 ===

  saveAlias(folderName: string, steamAppid: string, source: string = 'auto'): void {
    database.db!.run(
      'INSERT OR REPLACE INTO game_aliases (folder_name, steam_appid, source) VALUES (?, ?, ?)',
      [folderName, steamAppid, source]
    );
    database.save();
  }

  lookupAlias(folderName: string): string | null {
    const result: QueryResult[] = database.db!.exec(
      'SELECT steam_appid FROM game_aliases WHERE folder_name = ?',
      [folderName]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  // === 海报路径处理 ===

  getPosterPath(game: Game, type: 'horizontal' | 'vertical' | 'banner' | 'background'): string | null {
    const pathField = `poster_${type}_path` as keyof Game;
    const localPath = game[pathField] as string | undefined;
    if (localPath && fs.existsSync(localPath)) {
      return localPath;
    }
    return null;
  }

  updatePosterPath(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background', filePath: string): void {
    const field = `poster_${type}_path`;
    database.db!.run(`UPDATE games SET ${field} = ?, has_local_poster = 1, updated_at = datetime('now', 'localtime') WHERE id = ?`, [filePath, id]);
    database.save();
  }

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
    if (game.poster_horizontal_path) {
      game.posterLocal = game.poster_horizontal_path;
    } else if (game.poster_vertical_path) {
      game.posterLocal = game.poster_vertical_path;
    }

    return game;
  }
}

const gameDatabase: GameDatabase = new GameDatabase();

export { gameDatabase, GameDatabase };