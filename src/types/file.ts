/**
 * 文件相关类型定义
 */

export interface File {
  id: number;
  path: string;
  name: string;
  ext: string | null;
  size: number;
  category: string;
  modified_at: string | null;
  scanned_at: string | null;
  is_favorite: number;
  scan_path: string | null;
  // 视频元数据（数据库已有字段）
  thumbnail_path?: string | null;
  duration?: number | null;      // 视频时长（秒）
  width?: number | null;         // 视频宽度
  height?: number | null;        // 视频高度
  codec?: string | null;
  bitrate?: number | null;
  fps?: number | null;
}

export interface FileQueryOptions {
  category?: string;
  search?: string;
  orderBy?: 'name' | 'size' | 'modified_at' | 'scanned_at' | 'id';
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  minSize?: number | string;
  maxSize?: number | string;
  modifiedAfter?: string;
  modifiedBefore?: string;
}

export interface FileWithTags extends File {
  tags?: TagWithGroup[];
  sizeFormatted?: string;
}

export interface FileInfo {
  path: string;
  name: string;
  ext: string;
  size: number;
  sizeFormatted: string;
  category: string;
  created: Date;
  modified: Date;
  accessed: Date;
  parentDir: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileWithStat {
  path: string;
  stat: null;
}

export interface ScanPathResult {
  path: string;
  files: string[];
  fileCount: number;
}

export interface ScanProgressEvent {
  phase: 'counting' | 'scanning' | 'writing' | 'games' | 'scraping';
  pathIndex: number;
  totalPaths: number;
  processed?: number;
  total?: number;
  progress?: number;
  path: string;
  message: string;
}

// 导入 TagWithGroup 类型
import { TagWithGroup } from './tag';