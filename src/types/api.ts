/**
 * API 响应相关类型定义
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedFilesData {
  files: import('./file').File[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedFilesResponse {
  success: boolean;
  data?: PaginatedFilesData;
  error?: string;
}

export interface ScanResult {
  success: boolean;
  timestamp: string;
  results: import('./file').ScanPathResult[];
  totalFiles: number;
  totalSize: number;
}

export interface StatisticsItem {
  category: string;
  count: number;
  totalSize: number;
}

export interface TotalStats {
  totalFiles: number;
  totalSize: number;
}