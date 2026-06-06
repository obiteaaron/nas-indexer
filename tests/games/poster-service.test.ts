import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { PosterService } from '../../src/games/poster-service';
import { ensureGamesDirs } from '../../src/games/storage';

describe('PosterService', () => {
  const testBase = path.join(process.cwd(), 'test-temp-poster');
  let service: PosterService;

  beforeEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testBase, { recursive: true });
    ensureGamesDirs(testBase);
    service = new PosterService(testBase);
  });

  afterEach(() => {
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
  });

  test('getPosterPath returns correct path', () => {
    const posterPath = service.getPosterPath(123, 'horizontal');
    expect(posterPath).toContain('123');
    expect(posterPath).toContain('horizontal.jpg');
  });

  test('saveFromFile creates file', () => {
    const srcPath = path.join(testBase, 'test-src.jpg');
    fs.writeFileSync(srcPath, 'fake-image');

    service.saveFromFile(123, 'horizontal', srcPath);

    const destPath = service.getPosterPath(123, 'horizontal');
    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.readFileSync(destPath, 'utf8')).toBe('fake-image');
  });

  test('deletePoster removes file', () => {
    const posterPath = service.getPosterPath(123, 'horizontal');
    fs.mkdirSync(path.dirname(posterPath), { recursive: true });
    fs.writeFileSync(posterPath, 'fake-image');

    const result = service.deletePoster(123, 'horizontal');

    expect(result).toBe(true);
    expect(fs.existsSync(posterPath)).toBe(false);
  });

  test('deletePoster returns false when file not exists', () => {
    const result = service.deletePoster(999, 'horizontal');
    expect(result).toBe(false);
  });

  test('deleteAllPosters removes directory', () => {
    const posterDir = path.join(testBase, 'games', 'posters', '123');
    fs.mkdirSync(posterDir, { recursive: true });
    fs.writeFileSync(service.getPosterPath(123, 'horizontal'), 'img1');
    fs.writeFileSync(service.getPosterPath(123, 'vertical'), 'img2');

    const result = service.deleteAllPosters(123);

    expect(result).toBe(true);
    expect(fs.existsSync(posterDir)).toBe(false);
  });

  test('cleanupOrphanedPosters removes orphan dirs', () => {
    const posterDir123 = path.join(testBase, 'games', 'posters', '123');
    const posterDir456 = path.join(testBase, 'games', 'posters', '456');
    fs.mkdirSync(posterDir123, { recursive: true });
    fs.mkdirSync(posterDir456, { recursive: true });

    const cleaned = service.cleanupOrphanedPosters([123]);

    expect(cleaned).toBe(1);
    expect(fs.existsSync(posterDir123)).toBe(true);
    expect(fs.existsSync(posterDir456)).toBe(false);
  });
});
