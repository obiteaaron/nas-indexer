const API_BASE = '/api'

const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

function clearCache(pattern) {
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

async function request(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  return res.json()
}

async function cachedGet(url) {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data
  }
  const data = await request(url)
  cache.set(url, { data, time: Date.now() })
  return data
}

export function getConfig() {
  return cachedGet('/config')
}

export function saveConfig(data) {
  clearCache('/config')
  return request('/config', { method: 'POST', body: JSON.stringify(data) })
}

export function getStatus() {
  return request('/status')
}

export function scanFiles() {
  return request('/scan', { method: 'POST' })
}

export function scanSinglePath(path) {
  return request('/scan/path', { 
    method: 'POST', 
    body: JSON.stringify({ path }) 
  })
}

export function checkPath(path) {
  return request('/scan/check-path', { 
    method: 'POST', 
    body: JSON.stringify({ path }) 
  })
}

export function checkAllPaths() {
  return request('/scan/check-all-paths', { method: 'POST' })
}

export function getFiles(params = {}) {
  const query = new URLSearchParams(params).toString()
  return request('/files?' + query)
}

export function getFile(id) {
  return request('/files/' + id)
}

export function openFile(id) {
  return request('/files/' + id + '/open', { method: 'POST' })
}

export function renameFile(id, newName) {
  return request('/files/' + id + '/rename', { 
    method: 'POST', 
    body: JSON.stringify({ newName }) 
  })
}

export function copyFile(id, targetDir) {
  return request('/files/' + id + '/copy', { 
    method: 'POST', 
    body: JSON.stringify({ targetDir }) 
  })
}

export function moveFile(id, targetDir) {
  return request('/files/' + id + '/move', { 
    method: 'POST', 
    body: JSON.stringify({ targetDir }) 
  })
}

export function deleteFile(id, permanent = false) {
  return request('/files/' + id + '?permanent=' + permanent, { method: 'DELETE' })
}

export function createFolder(parentPath, folderName) {
  return request('/folder', { 
    method: 'POST', 
    body: JSON.stringify({ parentPath, folderName }) 
  })
}

export function getDirectory(path) {
  return request('/directory?path=' + encodeURIComponent(path))
}

export function getFavorites() {
  return request('/favorites')
}

export function addFavorite(id) {
  return request('/favorites/' + id, { method: 'POST' })
}

export function removeFavorite(id) {
  return request('/favorites/' + id, { method: 'DELETE' })
}

export function getPreview(id) {
  return request('/preview/' + id)
}

export function getStreamUrl(id) {
  return API_BASE + '/stream/' + id
}

export function getStatistics() {
  return cachedGet('/statistics')
}

export function getCategories() {
  return cachedGet('/categories')
}

export function getSearchHistory() {
  return request('/tracking/search-history')
}

export function clearSearchHistory() {
  return request('/tracking/search-history', { method: 'DELETE' })
}

export function getTagGroups() {
  return cachedGet('/tag-groups')
}

export function createTagGroup(data) {
  clearCache('/tag-groups')
  clearCache('/tags')
  return request('/tag-groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTagGroup(id, data) {
  clearCache('/tag-groups')
  clearCache('/tags')
  return request('/tag-groups/' + id, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTagGroup(id) {
  clearCache('/tag-groups')
  clearCache('/tags')
  return request('/tag-groups/' + id, { method: 'DELETE' })
}

export function getTags(groupId = null) {
  const query = groupId ? '?groupId=' + groupId : ''
  return cachedGet('/tags' + query)
}

export function createTag(data) {
  clearCache('/tags')
  return request('/tags', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTag(id, data) {
  clearCache('/tags')
  return request('/tags/' + id, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTag(id) {
  clearCache('/tags')
  return request('/tags/' + id, { method: 'DELETE' })
}

export function getTagStats() {
  return request('/tags/stats')
}

export function getFileTags(fileId) {
  return request('/files/' + fileId + '/tags')
}

export function getFileTagsBatch(fileIds) {
  return request('/files/batch/tags?fileIds=' + fileIds.join(','))
}

export function addFileTag(fileId, tagId) {
  return request('/files/' + fileId + '/tags', { method: 'POST', body: JSON.stringify({ tagId }) })
}

export function removeFileTag(fileId, tagId) {
  return request('/files/' + fileId + '/tags/' + tagId, { method: 'DELETE' })
}

export function batchFileTags(fileIds, tagIds, action) {
  return request('/files/batch/tags', { method: 'POST', body: JSON.stringify({ fileIds, tagIds, action }) })
}

export function getFilesByTags(params) {
  const query = new URLSearchParams(params).toString()
  return request('/files/by-tags?' + query)
}

export function recordFileView(fileId, data = {}) {
  return request('/tracking/view', { method: 'POST', body: JSON.stringify({ fileId, ...data }) })
}

export function recordFilePreview(fileId, data = {}) {
  return request('/tracking/preview', { method: 'POST', body: JSON.stringify({ fileId, ...data }) })
}

export function recordUserAction(fileId, actionType, data = {}) {
  return request('/tracking/action', { method: 'POST', body: JSON.stringify({ fileId, actionType, ...data }) })
}

export function getFileViews(params = {}) {
  const query = new URLSearchParams(params).toString()
  return request('/tracking/views?' + query)
}

export function getPreferences() {
  return request('/preferences')
}

export function clearPreferencesData() {
  return request('/preferences/clear', { method: 'DELETE' })
}

export function getRecommendations(params = {}) {
  const query = new URLSearchParams(params).toString()
  return request('/recommendations?' + query)
}

export function generateRecommendations() {
  return request('/recommendations/generate', { method: 'POST' })
}

export function getTasks() {
  return request('/scan/tasks')
}

export function getTaskStreamUrl() {
  return API_BASE + '/scan/tasks/stream'
}