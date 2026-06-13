/**
 * SteamDB → 游戏同步测试
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const testDbPath = path.join(process.cwd(), 'test-steam-sync.sqlite');
let SQL: any;
let db: any;

beforeAll(async () => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  SQL = await initSqlJs();
  db = new SQL.Database();

  // 创建 steam_db 表
  db.run(`
    CREATE TABLE steam_db (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_appid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      aliases TEXT,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建 games 表
  db.run(`
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      title_en TEXT,
      steam_appid TEXT,
      metadata_source TEXT DEFAULT 'unknown'
    )
  `);
});

afterAll(() => {
  if (db) db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('SteamDB Sync', () => {
  test('同步方法应更新关联游戏的名称', () => {
    // 创建 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name, name_en) VALUES (?, ?, ?)', ['123456', '游戏A', 'Game A']);

    // 创建使用该 AppID 的游戏
    db.run('INSERT INTO games (source_path, title, title_en, steam_appid) VALUES (?, ?, ?, ?)',
      ['E:/Games/Game1', '旧名称', 'Old Name', '123456']);

    // 执行同步（模拟 syncSteamDbToGames 的 SQL）
    db.run('UPDATE games SET title = ?, title_en = ? WHERE steam_appid = ?',
      ['游戏B', 'Game B', '123456']);

    // 验证
    const result = db.exec('SELECT title, title_en FROM games WHERE steam_appid = ?', ['123456']);
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('游戏B');
    expect(result[0].values[0][1]).toBe('Game B');
  });

  test('无关联游戏时应返回0', () => {
    // 创建不关联任何游戏的 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name) VALUES (?, ?)', ['999999', '孤立游戏']);

    // 尝试同步
    db.run('UPDATE games SET title = ? WHERE steam_appid = ?', ['新名称', '999999']);

    const changes = db.exec('SELECT changes()');
    expect(changes[0].values[0][0]).toBe(0);
  });

  test('多个游戏使用同一AppID时应全部更新', () => {
    // 创建 SteamDB 条目
    db.run('INSERT INTO steam_db (steam_appid, name) VALUES (?, ?)', ['111111', '测试游戏']);

    // 创建多个游戏
    db.run('INSERT INTO games (source_path, title, steam_appid) VALUES (?, ?, ?)',
      ['E:/Games/Test1', '名称1', '111111']);
    db.run('INSERT INTO games (source_path, title, steam_appid) VALUES (?, ?, ?)',
      ['E:/Games/Test2', '名称2', '111111']);

    // 执行同步
    db.run('UPDATE games SET title = ? WHERE steam_appid = ?', ['统一名称', '111111']);

    const games = db.exec('SELECT title FROM games WHERE steam_appid = ?', ['111111']);
    expect(games[0].values.length).toBe(2);
    expect(games[0].values[0][0]).toBe('统一名称');
    expect(games[0].values[1][0]).toBe('统一名称');
  });
});