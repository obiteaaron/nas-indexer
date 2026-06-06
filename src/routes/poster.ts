/**
 * Poster API routes
 */

import express, { Router, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import { gameDatabase } from '../games/database';
import { PosterService, PosterType } from '../games/poster-service';
import { hasPoster } from '../games/storage';
import { initDatabase, loadConfig, getStoragePath } from '../utils';
import { logger } from '../logger';

const router: Router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const VALID_POSTER_TYPES: PosterType[] = ['horizontal', 'vertical', 'banner', 'background', 'custom'];

async function getPosterService(): Promise<PosterService> {
  await initDatabase();
  const config = loadConfig();
  const storagePath = getStoragePath(config);
  return new PosterService(storagePath);
}

/**
 * Get poster file
 */
router.get('/:id/:type', async (req: Request, res: Response): Promise<void> => {
  const gameId = parseInt(req.params.id as string, 10);
  const type = req.params.type as string as PosterType;

  if (isNaN(gameId)) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }

  if (!VALID_POSTER_TYPES.includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid poster type' });
    return;
  }

  const service = await getPosterService();
  const posterPath = service.getPosterPath(gameId, type);

  if (!fs.existsSync(posterPath)) {
    res.status(404).json({ success: false, error: 'Poster not found' });
    return;
  }

  res.sendFile(posterPath);
});

/**
 * Upload custom poster
 */
router.post('/:id/upload', upload.single('poster'), async (req: Request, res: Response): Promise<void> => {
  const gameId = parseInt(req.params.id as string, 10);
  const type = (req.body.type || 'custom') as PosterType;

  if (isNaN(gameId)) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }

  if (!VALID_POSTER_TYPES.includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid poster type' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  gameDatabase.createGameTables();
  const game = gameDatabase.getGameById(gameId);
  if (!game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  try {
    const service = await getPosterService();
    
    // Save uploaded file to temp, then copy
    const tempPath = service.getPosterPath(gameId, type) + '.tmp';
    fs.writeFileSync(tempPath, req.file.buffer);
    service.saveFromFile(gameId, type, tempPath);
    fs.unlinkSync(tempPath);

    // Update has_local_poster flag
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const hasAnyPoster = VALID_POSTER_TYPES.some(t => hasPoster(storagePath, gameId, t));
    gameDatabase.updateGame(gameId, { has_local_poster: hasAnyPoster ? 1 : 0 });

    res.json({ success: true, data: { type, path: service.getPosterPath(gameId, type) } });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to upload poster: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete poster
 */
router.delete('/:id/:type', async (req: Request, res: Response): Promise<void> => {
  const gameId = parseInt(req.params.id as string, 10);
  const type = req.params.type as string as PosterType;

  if (isNaN(gameId)) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }

  if (!VALID_POSTER_TYPES.includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid poster type' });
    return;
  }

  gameDatabase.createGameTables();
  const game = gameDatabase.getGameById(gameId);
  if (!game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  try {
    const service = await getPosterService();
    const deleted = service.deletePoster(gameId, type);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Poster not found' });
      return;
    }

    // Update has_local_poster flag
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const hasAnyPoster = VALID_POSTER_TYPES.some(t => hasPoster(storagePath, gameId, t));
    gameDatabase.updateGame(gameId, { has_local_poster: hasAnyPoster ? 1 : 0 });

    res.json({ success: true });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to delete poster: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Re-download poster from Steam
 */
router.post('/:id/redownload', async (req: Request, res: Response): Promise<void> => {
  const gameId = parseInt(req.params.id as string, 10);
  const type = (req.body.type || 'horizontal') as PosterType;

  if (isNaN(gameId)) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }

  if (!VALID_POSTER_TYPES.includes(type)) {
    res.status(400).json({ success: false, error: 'Invalid poster type' });
    return;
  }

  gameDatabase.createGameTables();
  const game = gameDatabase.getGameById(gameId);
  if (!game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  if (!game.steam_appid) {
    res.status(400).json({ success: false, error: 'Game has no Steam appid' });
    return;
  }

  try {
    const service = await getPosterService();
    
    // Get Steam poster URL
    const steamBaseUrl = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
    let posterUrl: string;
    
    if (type === 'vertical') {
      posterUrl = steamBaseUrl + '/' + game.steam_appid + '/capsule_236x175.jpg';
    } else if (type === 'banner') {
      posterUrl = steamBaseUrl + '/' + game.steam_appid + '/header.jpg';
    } else if (type === 'background') {
      posterUrl = steamBaseUrl + '/' + game.steam_appid + '/' + game.steam_appid + '_page_bg_raw.jpg';
    } else {
      posterUrl = steamBaseUrl + '/' + game.steam_appid + '/capsule_616x353.jpg';
    }

    await service.saveFromUrl(gameId, type, posterUrl);

    // Update has_local_poster flag
    const config = loadConfig();
    const storagePath = getStoragePath(config);
    const hasAnyPoster = VALID_POSTER_TYPES.some(t => hasPoster(storagePath, gameId, t));
    gameDatabase.updateGame(gameId, { has_local_poster: hasAnyPoster ? 1 : 0 });

    res.json({ success: true, data: { type, path: service.getPosterPath(gameId, type) } });
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to redownload poster: %s', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
