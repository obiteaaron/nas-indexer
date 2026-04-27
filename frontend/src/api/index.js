const API_BASE = '/api'

async function request(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  return res.json()
}

export function getConfig() {
  return request('/config')
}

export function saveConfig(data) {
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
  return request('/statistics')
}

export function getCategories() {
  return request('/categories')
}

export function getSearchHistory() {
  return request('/search/history')
}

export function clearSearchHistory() {
  return request('/search/history', { method: 'DELETE' })
}

export function getTagGroups() {
  return request('/tag-groups')
}

export function createTagGroup(data) {
  return request('/tag-groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTagGroup(id, data) {
  return request('/tag-groups/' + id, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTagGroup(id) {
  return request('/tag-groups/' + id, { method: 'DELETE' })
}

export function getTags(groupId = null) {
  const query = groupId ? '?groupId=' + groupId : ''
  return request('/tags' + query)
}

export function createTag(data) {
  return request('/tags', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTag(id, data) {
  return request('/tags/' + id, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTag(id) {
  return request('/tags/' + id, { method: 'DELETE' })
}

export function getTagStats() {
  return request('/tags/stats')
}

export function getFileTags(fileId) {
  return request('/files/' + fileId + '/tags')
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

export function recordFileView(id, data = {}) {
  return request('/files/' + id + '/view', { method: 'POST', body: JSON.stringify(data) })
}

export function recordFilePreview(id, data = {}) {
  return request('/files/' + id + '/preview', { method: 'POST', body: JSON.stringify(data) })
}

export function recordUserAction(id, actionType, data = {}) {
  return request('/files/' + id + '/action', { method: 'POST', body: JSON.stringify({ actionType, ...data }) })
}

export function getFileViews(params = {}) {
  const query = new URLSearchParams(params).toString()
  return request('/files/views?' + query)
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