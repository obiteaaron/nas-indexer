import type {
  ApiResponse,
  Config,
  StatusResponse,
  File,
  FileWithTags,
  FilesResponse,
  PathStatus,
  PreviewResponse,
  StatisticsResponse,
  TagGroup,
  Tag,
  TagStats,
  TagWithGroup,
  Task,
  Recommendation,
  Preferences,
  FileView,
  Game,
  GamesResponse,
  SteamSearchItem,
  GameStatistics,
  GameGroup,
  PosterBackup,
  SteamDbEntry,
  SteamDbImportResult
} from '../types'

const API_BASE = '/api'

interface CacheEntry<T> {
  data: T
  time: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL = 5 * 60 * 1000

function clearCache(pattern?: string): void {
  if (!pattern) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key)
    }
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  return res.json() as Promise<ApiResponse<T>>
}

async function cachedGet<T>(url: string): Promise<ApiResponse<T>> {
  const cached = cache.get(url) as CacheEntry<ApiResponse<T>> | undefined
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data
  }
  const data = await request<T>(url)
  cache.set(url, { data, time: Date.now() })
  return data
}

export function getConfig(): Promise<ApiResponse<Config>> {
  return cachedGet<Config>('/config')
}

export function saveConfig(data: Partial<Config>): Promise<ApiResponse<void>> {
  clearCache('/config')
  return request<void>('/config', { method: 'POST', body: JSON.stringify(data) })
}

export function getStatus(): Promise<ApiResponse<StatusResponse>> {
  return request<StatusResponse>('/stats/status')
}

export function scanFiles(): Promise<ApiResponse<{ taskId: string }>> {
  return request<{ taskId: string }>('/scan', { method: 'POST' })
}

export function scanSinglePath(path: string): Promise<ApiResponse<{ taskId: string }>> {
  return request<{ taskId: string }>('/scan/path', {
    method: 'POST',
    body: JSON.stringify({ path })
  })
}

export function checkPath(path: string): Promise<ApiResponse<PathStatus>> {
  return request<PathStatus>('/scan/check-path', {
    method: 'POST',
    body: JSON.stringify({ path })
  })
}

export function checkAllPaths(): Promise<ApiResponse<PathStatus[]>> {
  return request<PathStatus[]>('/scan/check-all-paths', { method: 'POST' })
}

export function getFiles(params: Record<string, string | number | undefined> = {}): Promise<ApiResponse<FilesResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<FilesResponse>('/files?' + query)
}

export function getFile(id: number): Promise<ApiResponse<FileWithTags>> {
  return request<FileWithTags>('/files/' + id)
}

export function openFile(id: number): Promise<ApiResponse<void>> {
  return request<void>('/files/' + id + '/open', { method: 'POST' })
}

export function renameFile(id: number, newName: string): Promise<ApiResponse<void>> {
  return request<void>('/files/' + id + '/rename', {
    method: 'POST',
    body: JSON.stringify({ newName })
  })
}

export function copyFile(id: number, targetDir: string): Promise<ApiResponse<void>> {
  return request<void>('/files/' + id + '/copy', {
    method: 'POST',
    body: JSON.stringify({ targetDir })
  })
}

export function moveFile(id: number, targetDir: string): Promise<ApiResponse<void>> {
  return request<void>('/files/' + id + '/move', {
    method: 'POST',
    body: JSON.stringify({ targetDir })
  })
}

export function deleteFile(id: number, permanent: boolean = false): Promise<ApiResponse<void>> {
  return request<void>('/files/delete/' + id, { method: 'POST', body: JSON.stringify({ permanent }) })
}

export function createFolder(parentPath: string, folderName: string): Promise<ApiResponse<void>> {
  return request<void>('/folder', {
    method: 'POST',
    body: JSON.stringify({ parentPath, folderName })
  })
}

export function getDirectory(path: string): Promise<ApiResponse<{ files: { name: string; path: string; isDirectory: boolean }[] }>> {
  return request('/directory?path=' + encodeURIComponent(path))
}

export function getFavorites(): Promise<ApiResponse<File[]>> {
  return request<File[]>('/favorites')
}

export function addFavorite(id: number): Promise<ApiResponse<void>> {
  return request<void>('/favorites/' + id, { method: 'POST' })
}

export function removeFavorite(id: number): Promise<ApiResponse<void>> {
  return request<void>('/files/favorites/remove/' + id, { method: 'POST' })
}

export function getPreview(id: number): Promise<ApiResponse<PreviewResponse>> {
  return request<PreviewResponse>('/preview/' + id)
}

export function getStreamUrl(id: number): string {
  return API_BASE + '/preview/stream/' + id
}

export function getStatistics(): Promise<ApiResponse<StatisticsResponse>> {
  return cachedGet<StatisticsResponse>('/stats/statistics')
}

export function getCategories(): Promise<ApiResponse<string[]>> {
  return cachedGet<string[]>('/tags/categories')
}

export function getSearchHistory(): Promise<ApiResponse<string[]>> {
  return request<string[]>('/tracking/search-history')
}

export function clearSearchHistory(): Promise<ApiResponse<void>> {
  return request<void>('/tracking/search-history/clear', { method: 'POST' })
}

export function getTagGroups(): Promise<ApiResponse<TagGroup[]>> {
  return cachedGet<TagGroup[]>('/tags/tag-groups')
}

export function createTagGroup(data: { name: string; color?: string; sortOrder?: number }): Promise<ApiResponse<TagGroup>> {
  clearCache('/tags/tag-groups')
  clearCache('/tags')
  return request<TagGroup>('/tags/tag-groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTagGroup(id: number, data: Partial<TagGroup>): Promise<ApiResponse<TagGroup>> {
  clearCache('/tags/tag-groups')
  clearCache('/tags')
  return request<TagGroup>('/tags/tag-groups/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteTagGroup(id: number): Promise<ApiResponse<void>> {
  clearCache('/tags/tag-groups')
  clearCache('/tags')
  return request<void>('/tags/tag-groups/delete/' + id, { method: 'POST' })
}

export function getTags(groupId?: number | null): Promise<ApiResponse<Tag[] | TagWithGroup[]>> {
  const query = groupId ? '?groupId=' + groupId : ''
  return cachedGet<Tag[] | TagWithGroup[]>('/tags/list' + query)
}

export function createTag(data: { name: string; groupId?: number | null; color?: string; sortOrder?: number }): Promise<ApiResponse<Tag>> {
  clearCache('/tags')
  return request<Tag>('/tags/create', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTag(id: number, data: Partial<Tag>): Promise<ApiResponse<Tag>> {
  clearCache('/tags')
  return request<Tag>('/tags/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteTag(id: number): Promise<ApiResponse<void>> {
  clearCache('/tags')
  return request<void>('/tags/delete/' + id, { method: 'POST' })
}

export function getTagStats(): Promise<ApiResponse<TagStats[]>> {
  return request<TagStats[]>('/tags/stats')
}

export function getFileTags(fileId: number): Promise<ApiResponse<TagWithGroup[]>> {
  return request<TagWithGroup[]>('/files/' + fileId + '/tags')
}

export function getFileTagsBatch(fileIds: number[]): Promise<ApiResponse<Record<number, TagWithGroup[]>>> {
  return request<Record<number, TagWithGroup[]>>('/files/batch/tags?fileIds=' + fileIds.join(','))
}

export function addFileTag(fileId: number, tagId: number): Promise<ApiResponse<TagWithGroup[]>> {
  return request<TagWithGroup[]>('/files/' + fileId + '/tags', { method: 'POST', body: JSON.stringify({ tagId }) })
}

export function removeFileTag(fileId: number, tagId: number): Promise<ApiResponse<TagWithGroup[]>> {
  return request<TagWithGroup[]>('/files/' + fileId + '/tags/remove/' + tagId, { method: 'POST' })
}

export function batchFileTags(fileIds: number[], tagIds: number[], action: 'add' | 'remove'): Promise<ApiResponse<void>> {
  return request<void>('/files/batch/tags', { method: 'POST', body: JSON.stringify({ fileIds, tagIds, action }) })
}

export function getFilesByTags(params: { tagIds: string; matchAll?: boolean; page?: number; pageSize?: number; orderBy?: string; orderDir?: string }): Promise<ApiResponse<FilesResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<FilesResponse>('/files/by-tags?' + query)
}

export function recordFileView(fileId: number, data: { playDuration?: number } = {}): Promise<ApiResponse<void>> {
  return request<void>('/tracking/view', { method: 'POST', body: JSON.stringify({ fileId, ...data }) })
}

export function recordFilePreview(fileId: number, data: { playDuration?: number } = {}): Promise<ApiResponse<void>> {
  return request<void>('/tracking/preview', { method: 'POST', body: JSON.stringify({ fileId, ...data }) })
}

export function recordUserAction(fileId: number | null, actionType: string, data: Record<string, unknown> = {}): Promise<ApiResponse<void>> {
  return request<void>('/tracking/action', { method: 'POST', body: JSON.stringify({ fileId, actionType, ...data }) })
}

export function getFileViews(params: { limit?: number } = {}): Promise<ApiResponse<FileView[]>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<FileView[]>('/tracking/views?' + query)
}

export function getPreferences(): Promise<ApiResponse<Preferences & { enabled: boolean }>> {
  return request<Preferences & { enabled: boolean }>('/recommendations/preferences')
}

export function clearPreferencesData(): Promise<ApiResponse<void>> {
  return request<void>('/recommendations/preferences/clear', { method: 'POST' })
}

export function getRecommendations(params: { type?: string; limit?: number } = {}): Promise<ApiResponse<Recommendation[]>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<Recommendation[]>('/recommendations/list?' + query)
}

export function generateRecommendations(): Promise<ApiResponse<Recommendation[]>> {
  return request<Recommendation[]>('/recommendations/generate', { method: 'POST' })
}

export function getTasks(): Promise<ApiResponse<Task[]>> {
  return request<Task[]>('/scan/tasks')
}

export function getTaskStreamUrl(): string {
  return API_BASE + '/scan/tasks/stream'
}

// 游戏 API
export function getGames(params: Record<string, string | number | undefined> = {}): Promise<ApiResponse<GamesResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  clearCache('/games')
  return request<GamesResponse>('/games?' + query)
}

export function getGame(id: number): Promise<ApiResponse<Game>> {
  return request<Game>('/games/' + id)
}

export function updateGame(id: number, data: Partial<Game>): Promise<ApiResponse<Game>> {
  clearCache('/games')
  return request<Game>('/games/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteGame(id: number): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/delete/' + id, { method: 'POST' })
}

export function scrapeGame(id: number, downloadPosters: boolean = true): Promise<ApiResponse<Game>> {
  clearCache('/games')
  return request<Game>('/games/' + id + '/scrape', { method: 'POST', body: JSON.stringify({ downloadPosters }) })
}

export function scrapeGamesBatch(downloadPosters: boolean = true): Promise<ApiResponse<{ taskId: string }>> {
  clearCache('/games')
  return request<{ taskId: string }>('/games/scrape/batch', { method: 'POST', body: JSON.stringify({ downloadPosters }) })
}

export function getGamePosterUrl(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background' = 'horizontal'): string {
  return API_BASE + '/games/' + id + '/poster/' + type
}

export function uploadGamePoster(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom' = 'custom', file: globalThis.File): Promise<ApiResponse<{ posterPath: string }>> {
  clearCache('/games')
  const formData = new FormData()
  formData.append('poster', file)
  formData.append('type', type)
  return fetch(API_BASE + '/games/' + id + '/poster/upload', { method: 'POST', body: formData })
    .then(res => res.json() as Promise<ApiResponse<{ posterPath: string }>>)
}

export function deleteGamePoster(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background' | 'custom'): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/' + id + '/poster/' + type, { method: 'DELETE' })
}

export function redownloadGamePoster(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background' = 'horizontal'): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/' + id + '/poster/redownload', {
    method: 'POST',
    body: JSON.stringify({ type })
  })
}

export function getGamePosterBackups(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background' = 'horizontal'): Promise<ApiResponse<PosterBackup[]>> {
  return request<PosterBackup[]>('/games/' + id + '/poster/backups?type=' + type)
}

export function restoreGamePosterBackup(id: number, type: 'horizontal' | 'vertical' | 'banner' | 'background', filename: string): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/' + id + '/poster/restore', {
    method: 'POST',
    body: JSON.stringify({ type, filename })
  })
}

export function deleteGamePosterBackup(id: number, filename: string): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/' + id + '/poster/backup/delete', {
    method: 'POST',
    body: JSON.stringify({ filename })
  })
}

export function openGame(id: number): Promise<ApiResponse<void>> {
  return request<void>('/games/' + id + '/open', { method: 'POST' })
}

export function excludeAndDeleteGame(id: number): Promise<ApiResponse<{ deletedId: number; blacklistPath: string }>> {
  clearCache('/games')
  return request<{ deletedId: number; blacklistPath: string }>('/games/' + id + '/exclude', { method: 'POST' })
}

export function toggleFavoriteGame(id: number): Promise<ApiResponse<Game>> {
  clearCache('/games')
  return request<Game>('/games/' + id + '/favorite', { method: 'POST' })
}

export function createGame(data: {
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
}): Promise<ApiResponse<Game>> {
  clearCache('/games')
  return request<Game>('/games/create', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export function removeNonexistentGames(): Promise<ApiResponse<{ deletedCount: number; deletedIds: number[] }>> {
  clearCache('/games')
  return request<{ deletedCount: number; deletedIds: number[] }>('/games/remove-nonexistent', { method: 'POST' })
}

export function cleanupStaleFiles(): Promise<ApiResponse<{ deletedCount: number }>> {
  clearCache('/files')
  return request<{ deletedCount: number }>('/scan/cleanup-stale', { method: 'POST' })
}

export function cleanupStaleGames(): Promise<ApiResponse<{ deletedCount: number }>> {
  clearCache('/games')
  return request<{ deletedCount: number }>('/games/cleanup-stale', { method: 'POST' })
}

export function getGameFiles(id: number): Promise<ApiResponse<{ files: File[]; gamePath: string }>> {
  return request<{ files: File[]; gamePath: string }>('/games/' + id + '/files')
}

export function getGameStatistics(): Promise<ApiResponse<GameStatistics>> {
  return cachedGet<GameStatistics>('/games/statistics')
}

export function getGameGenres(): Promise<ApiResponse<string[]>> {
  return cachedGet<string[]>('/games/genres')
}

export function getGameYears(): Promise<ApiResponse<string[]>> {
  return cachedGet<string[]>('/games/years')
}

export function identifyGames(scanRoots?: string[]): Promise<ApiResponse<{ gamesCount: number; ids: number[] }>> {
  clearCache('/games')
  return request<{ gamesCount: number; ids: number[] }>('/games/identify', { method: 'POST', body: JSON.stringify({ scanRoots }) })
}

export function clearGames(): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/clear', { method: 'POST' })
}

export function searchSteamGames(query: string): Promise<ApiResponse<SteamSearchItem[]>> {
  return request<SteamSearchItem[]>('/games/steam/search?q=' + encodeURIComponent(query))
}

export function bindSteamGame(id: number, appid: number): Promise<ApiResponse<Game>> {
  clearCache('/games')
  return request<Game>('/games/' + id + '/bind-steam', { method: 'POST', body: JSON.stringify({ appid }) })
}

// === 游戏分组 API ===

export function getGameGroups(): Promise<ApiResponse<GameGroup[]>> {
  return cachedGet<GameGroup[]>('/games/groups')
}

export function createGameGroup(data: { name: string; pinned?: number }): Promise<ApiResponse<GameGroup>> {
  clearCache('/games')
  return request<GameGroup>('/games/groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateGameGroup(id: number, data: { name?: string; pinned?: number; sort_order?: number }): Promise<ApiResponse<GameGroup>> {
  clearCache('/games')
  return request<GameGroup>('/games/groups/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteGameGroup(id: number): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/groups/delete/' + id, { method: 'POST' })
}

export function reorderGameGroups(items: Array<{ id: number; sort_order: number }>): Promise<ApiResponse<GameGroup[]>> {
  clearCache('/games')
  return request<GameGroup[]>('/games/groups/reorder', { method: 'POST', body: JSON.stringify({ items }) })
}

export function getGroupGames(groupId: number, params: Record<string, string | number | undefined> = {}): Promise<ApiResponse<GamesResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  clearCache('/games')
  return request<GamesResponse>('/games/groups/' + groupId + '/games?' + query)
}

export function addGamesToGroup(groupId: number, gameIds: number[]): Promise<ApiResponse<{ addedCount: number; addedIds: number[] }>> {
  clearCache('/games')
  return request<{ addedCount: number; addedIds: number[] }>('/games/groups/' + groupId + '/games', {
    method: 'POST',
    body: JSON.stringify({ game_ids: gameIds })
  })
}

export function removeGameFromGroup(groupId: number, gameId: number): Promise<ApiResponse<void>> {
  clearCache('/games')
  return request<void>('/games/groups/' + groupId + '/games/remove/' + gameId, { method: 'POST' })
}

export function reorderGroupGames(groupId: number, items: Array<{ game_id: number; sort_order: number }>): Promise<ApiResponse<Game[]>> {
  clearCache('/games')
  return request<Game[]>('/games/groups/' + groupId + '/games/reorder', { method: 'POST', body: JSON.stringify({ items }) })
}

export function getGamesNotInGroup(groupId: number): Promise<ApiResponse<Game[]>> {
  return request<Game[]>('/games/groups/' + groupId + '/games/candidates')
}

// === Backup API ===

export interface BackupInfo {
  filename: string;
  createdAt: string;
  fileSize: number;
}

export function listBackups(): Promise<ApiResponse<BackupInfo[]>> {
  return request<BackupInfo[]>('/games/backup/list')
}

export function createBackup(name?: string): Promise<ApiResponse<{ filename: string }>> {
  return request<{ filename: string }>('/games/backup/create', {
    method: 'POST',
    body: JSON.stringify({ name })
  })
}

export function restoreBackup(filename: string, mode: 'merge' | 'overwrite' = 'merge'): Promise<ApiResponse<{ filename: string; mode: string }>> {
  return request<{ filename: string; mode: string }>('/games/backup/' + filename + '/restore', {
    method: 'POST',
    body: JSON.stringify({ mode })
  })
}

export function deleteBackup(filename: string): Promise<ApiResponse<void>> {
  return request<void>('/games/backup/' + filename, { method: 'DELETE' })
}

// === Steam DB API ===

export interface SteamDbListResponse {
  entries: SteamDbEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getSteamDbEntries(params: { search?: string; orderBy?: string; orderDir?: string; page?: number; pageSize?: number } = {}): Promise<ApiResponse<SteamDbListResponse>> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString()
  return request<SteamDbListResponse>('/games/steam-db/list?' + query)
}

export function getSteamDbEntry(id: number): Promise<ApiResponse<SteamDbEntry>> {
  return request<SteamDbEntry>('/games/steam-db/get/' + id)
}

export function createSteamDbEntry(data: Partial<SteamDbEntry>): Promise<ApiResponse<SteamDbEntry>> {
  clearCache('/games/steam-db')
  return request<SteamDbEntry>('/games/steam-db/create', { method: 'POST', body: JSON.stringify(data) })
}

export function updateSteamDbEntry(id: number, data: Partial<SteamDbEntry>): Promise<ApiResponse<SteamDbEntry>> {
  clearCache('/games/steam-db')
  return request<SteamDbEntry>('/games/steam-db/update/' + id, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteSteamDbEntry(id: number): Promise<ApiResponse<void>> {
  clearCache('/games/steam-db')
  return request<void>('/games/steam-db/delete/' + id, { method: 'POST' })
}

export function exportSteamDb(): Promise<ApiResponse<SteamDbEntry[]>> {
  return request<SteamDbEntry[]>('/games/steam-db/export')
}

export function importSteamDb(entries: SteamDbEntry[], mode: 'merge' | 'overwrite' = 'merge'): Promise<ApiResponse<SteamDbImportResult>> {
  clearCache('/games/steam-db')
  return request<SteamDbImportResult>('/games/steam-db/import', { method: 'POST', body: JSON.stringify({ entries, mode }) })
}

export function lookupSteamDbByName(name: string): Promise<ApiResponse<{ steam_appid: string; name: string } | null>> {
  return request<{ steam_appid: string; name: string } | null>('/games/steam-db/lookup?name=' + encodeURIComponent(name))
}
