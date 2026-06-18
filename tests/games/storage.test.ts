import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  ensureGamesDirs,
  getPosterDir,
  getPosterPath,
  ensurePosterDir,
  hasPoster,
  listGamePosters
} from '../../src/games/storage';

describe('Storage Utilities', () => {
  const testBase = path.join(process.cwd(), 'test-temp-storage');

  beforeEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
  });

  test('ensureGamesDirs creates required directories', () => {
    ensureGamesDirs(testBase);

    expect(fs.existsSync(path.join(testBase, 'games', 'posters'))).toBe(true);
  });

  test('getPosterDir returns correct path', () => {
    const posterDir = getPosterDir(testBase, 123);
    expect(posterDir).toBe(path.join(testBase, 'games', 'posters', '123'));
  });

  test('getPosterPath returns correct file path', () => {
    const posterPath = getPosterPath(testBase, 123, 'horizontal');
    expect(posterPath).toBe(path.join(testBase, 'games', 'posters', '123', 'horizontal.jpg'));
  });

  test('ensurePosterDir creates directory if not exists', () => {
    ensureGamesDirs(testBase);
    const posterDir = ensurePosterDir(testBase, 456);

    expect(fs.existsSync(posterDir)).toBe(true);
  });

  test('hasPoster returns false when poster not exists', () => {
    ensureGamesDirs(testBase);
    expect(hasPoster(testBase, 123, 'horizontal')).toBe(false);
  });

  test('hasPoster returns true when poster exists', () => {
    ensureGamesDirs(testBase);
    ensurePosterDir(testBase, 123);
    const posterPath = getPosterPath(testBase, 123, 'horizontal');
    fs.writeFileSync(posterPath, 'test-image');

    expect(hasPoster(testBase, 123, 'horizontal')).toBe(true);
  });

  test('listGamePosters returns empty array when no posters', () => {
    ensureGamesDirs(testBase);
    expect(listGamePosters(testBase, 123)).toEqual([]);
  });

  test('listGamePosters returns existing poster types', () => {
    ensureGamesDirs(testBase);
    ensurePosterDir(testBase, 123);
    fs.writeFileSync(getPosterPath(testBase, 123, 'horizontal'), 'img');
    fs.writeFileSync(getPosterPath(testBase, 123, 'vertical'), 'img');

    const posters = listGamePosters(testBase, 123);
    expect(posters).toContain('horizontal');
    expect(posters).toContain('vertical');
    expect(posters.length).toBe(2);
  });
});
