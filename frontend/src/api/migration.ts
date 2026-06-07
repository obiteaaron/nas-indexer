import type { ApiResponse } from '../types'

const API_BASE = '/api'

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  return res.json() as Promise<ApiResponse<T>>
}

// === 迁移 API ===

export function getMigrationPreview(): Promise<ApiResponse<{
  totalGames: number;
  gamesWithPosters: string[];
  gamesWithMetadata: string[];
}>> {
  return request<{
    totalGames: number;
    gamesWithPosters: string[];
    gamesWithMetadata: string[];
  }>('/migration/preview')
}

export function executeMigration(): Promise<ApiResponse<{
  totalGames: number;
  migratedMetadata: number;
  migratedPosters: number;
  errors: string[];
  details: {
    metadataMigrated: string[];
    postersMigrated: string[];
  };
}>> {
  return request<{
    totalGames: number;
    migratedMetadata: number;
    migratedPosters: number;
    errors: string[];
    details: {
      metadataMigrated: string[];
      postersMigrated: string[];
    };
  }>('/migration/execute', { method: 'POST' })
}
