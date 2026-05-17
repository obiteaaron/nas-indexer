/**
 * 标签相关类型定义
 */

export interface TagGroup {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  tags?: Tag[];
}

export interface Tag {
  id: number;
  group_id: number | null;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface TagWithGroup extends Tag {
  group_name?: string;
  group_color?: string;
}

export interface TagStats extends TagWithGroup {
  file_count: number;
}

export interface CreateTagGroupRequest {
  name: string;
  color?: string;
  sortOrder?: number;
}

export interface CreateTagRequest {
  name: string;
  groupId?: number | null;
  color?: string;
  sortOrder?: number;
}

export interface UpdateTagGroupRequest {
  name?: string;
  color?: string;
  sort_order?: number;
}

export interface UpdateTagRequest {
  name?: string;
  group_id?: number | null;
  color?: string;
  sort_order?: number;
}