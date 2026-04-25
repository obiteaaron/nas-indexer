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