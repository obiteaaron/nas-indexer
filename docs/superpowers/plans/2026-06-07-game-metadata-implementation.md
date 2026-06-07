# Game Metadata Refactor - Implementation Plan (Simplified)

> REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development

**Goal**: Centralize poster storage and add backup/restore functionality

**Architecture**: PosterService for poster management, BackupService for backup operations. Paths derivable from game_id. No status fields in database.

**Tech Stack**: Node.js, TypeScript, Express, sql.js, fs, path

---

## File Structure

| File | Purpose |
|------|---------|
| src/games/storage.ts | Directory init, path utilities |
| src/games/poster-service.ts | Poster CRUD operations |
| src/games/backup-service.ts | Backup create/restore |
| src/routes/poster.ts | Poster API endpoints |
| src/routes/backup.ts | Backup API endpoints |

---

## Task 1: Storage Utilities

- [ ] Create src/games/storage.ts
- [ ] Implement ensureGamesDirs(basePath)
- [ ] Implement getPosterPath(gameId, type)
- [ ] Implement getBackupDir()
- [ ] Write tests
- [ ] Commit

---

## Task 2: PosterService

- [ ] Create src/games/poster-service.ts
- [ ] Implement saveFromUrl(gameId, type, url)
- [ ] Implement saveFromFile(gameId, type, srcPath)
- [ ] Implement getPosterPath(gameId, type)
- [ ] Implement deletePoster(gameId, type)
- [ ] Implement deleteAllPosters(gameId)
- [ ] Implement cleanupOrphanedPosters()
- [ ] Write tests
- [ ] Commit

---

## Task 3: BackupService

- [ ] Create src/games/backup-service.ts
- [ ] Implement createBackup(name)
- [ ] Implement restoreBackup(filename, mode)
- [ ] Implement listBackups()
- [ ] Implement deleteBackup(filename)
- [ ] Implement cleanupOldBackups(maxCount)
- [ ] Write tests
- [ ] Commit

---

## Task 4: Database Schema Update

- [ ] Remove: metadata_path, poster_*_path, background_path
- [ ] No new fields needed
- [ ] Write tests
- [ ] Commit

---

## Task 5: Poster API Routes

- [ ] GET /api/games/:id/poster/:type
- [ ] POST /api/games/:id/poster/upload
- [ ] DELETE /api/games/:id/poster/:type
- [ ] POST /api/games/:id/poster/redownload
- [ ] Mount routes in server.ts
- [ ] Commit

---

## Task 6: Backup API Routes

- [ ] POST /api/games/backup/create
- [ ] GET /api/games/backup/list
- [ ] POST /api/games/backup/:id/restore
- [ ] DELETE /api/games/backup/:id
- [ ] Mount routes in server.ts
- [ ] Commit

---

## Task 7: Server Startup

- [ ] Import storage module
- [ ] Call ensureGamesDirs on startup
- [ ] Commit

---

## Execution Handoff

Plan saved. Two options:

1. **Subagent-Driven** - Fresh subagent per task
2. **Inline Execution** - Execute in current session

Which approach?
