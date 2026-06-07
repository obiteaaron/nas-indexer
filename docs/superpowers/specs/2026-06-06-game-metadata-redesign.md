# Game Metadata Refactor Design (Simplified)

> Date: 2026-06-07
> Version: v2.1 (Simplified)
> Status: Ready for implementation

---

## Core Problem

Game metadata stored in game directory causes data loss when directory is moved/renamed.

## Solution

Centralize poster storage to profiles/games/posters/{game_id}/ and add backup/restore functionality.

---

## Directory Structure

```text
profiles/
├── games/
│   ├── posters/{game_id}/
│   │   ├── horizontal.jpg
│   │   ├── vertical.jpg
│   │   ├── banner.jpg
│   │   ├── background.jpg
│   │   └── custom.jpg        # User uploaded poster
│   └── backups/
│       └── backup-{name}-{date}.zip
```

---

## Database Changes

### Remove Fields

| Field | Reason |
|-------|--------|
| metadata_path | Metadata in database, no external file |
| poster_horizontal_path | Path derivable: posters/{id}/horizontal.jpg |
| poster_vertical_path | Same |
| poster_banner_path | Same |
| background_path | Same |

### No New Fields

Poster status determined by file existence check (fs.existsSync). No need to cache in database.

---

## API Design

### Poster API

| API | Purpose |
|-----|---------|
| GET /api/games/:id/poster/:type | Get poster image |
| POST /api/games/:id/poster/upload | Upload custom poster |
| DELETE /api/games/:id/poster/:type | Delete single poster |
| POST /api/games/:id/poster/redownload | Redownload from Steam |

### Backup API

| API | Purpose |
|-----|---------|
| POST /api/games/backup/create | Create backup (manual only) |
| GET /api/games/backup/list | List backups |
| POST /api/games/backup/:id/restore | Restore backup |
| DELETE /api/games/backup/:id | Delete backup |

---

## Service Methods

### PosterService

| Method | Purpose |
|--------|---------|
| saveFromUrl(gameId, type, url) | Download from Steam |
| saveFromFile(gameId, type, path) | Save uploaded file |
| getPosterPath(gameId, type) | Derive path |
| deletePoster(gameId, type) | Delete single poster |
| deleteAllPosters(gameId) | Delete all posters for game |
| cleanupOrphanedPosters() | Clean up orphan posters |

### BackupService

| Method | Purpose |
|--------|---------|
| createBackup(name) | Create backup zip |
| restoreBackup(filename) | Restore from backup |
| listBackups() | List backup files |
| deleteBackup(filename) | Delete backup file |
| cleanupOldBackups(maxCount) | Keep only recent N backups |

---

## Configuration

| Field | Default | Purpose |
|-------|---------|---------|
| posterMaxSizeMB | 5 | Limit for user uploaded posters |

No autoBackup configuration needed.

---

## Backup File Format

```text
backup-{name}.zip
├── games.json      # All game records
├── posters/{id}/   # Poster images
├── groups.json     # Game groups
└── metadata.json   # Backup info
```

---

## Implementation Tasks

| Task | File |
|------|------|
| 1. Storage utilities | src/games/storage.ts |
| 2. PosterService | src/games/poster-service.ts |
| 3. BackupService | src/games/backup-service.ts |
| 4. Database schema update | src/games/database.ts |
| 5. Poster API routes | src/routes/poster.ts |
| 6. Backup API routes | src/routes/backup.ts |
| 7. Server startup | src/server.ts |
