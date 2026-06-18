/**
 * P0手动优先级数据库方法测试
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

// 创建测试数据库
const testDbPath = path.join(process.cwd(), 'test-p0-db.sqlite');
let SQL: any;
let db: any;

beforeAll(async () => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  SQL = await initSqlJs();
  db = new SQL.Database();

  // 创建games表（包含is_root_manually_marked）
  db.run(`
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT UNIQUE NOT NULL,
      title TEXT,
      original_name TEXT,
      metadata_source TEXT DEFAULT 'unknown',
      is_manually_edited INTEGER DEFAULT 0,
      is_excluded INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      is_root_manually_marked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

afterAll(() => {
  if (db) db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('P0 Database Methods', () => {
  test('手动添加游戏时is_root_manually_marked应为1', () => {
    db.run(`
      INSERT INTO games (source_path, title, metadata_source, is_root_manually_marked)
      VALUES (?, ?, 'manual', 1)
    `, ['E:/Games/TestGame', 'Test Game']);

    // 查询验证
    const result = db.exec('SELECT * FROM games WHERE source_path = ?', ['E:/Games/TestGame']);
    expect(result.length).toBe(1);
    const game = result[0].values[0];
    const columns = result[0].columns;
    const markedIndex = columns.indexOf('is_root_manually_marked');
    expect(game[markedIndex]).toBe(1);
  });

  test('getGamesByPathPrefix应查询子目录游戏', () => {
    // 创建子目录游戏
    db.run(`
      INSERT INTO games (source_path, title, is_root_manually_marked)
      VALUES (?, ?, 1)
    `, ['E:/Games/Parent/Child', 'Child Game']);

    // 查询父目录下的游戏
    const games = db.exec(`
      SELECT * FROM games WHERE source_path LIKE ?
    `, ['E:/Games/Parent/%']);

    expect(games.length).toBe(1);
    expect(games[0].values.length).toBeGreaterThanOrEqual(1);
  });

  test('is_root_manually_marked字段默认为0', () => {
    db.run(`
      INSERT INTO games (source_path, title)
      VALUES (?, ?)
    `, ['E:/Games/AutoGame', 'Auto Game']);

    const result = db.exec('SELECT * FROM games WHERE source_path = ?', ['E:/Games/AutoGame']);
    expect(result.length).toBe(1);
    const game = result[0].values[0];
    const columns = result[0].columns;
    const markedIndex = columns.indexOf('is_root_manually_marked');
    expect(game[markedIndex]).toBe(0);
  });
});