/**
 * 用户追踪相关类型定义
 */

export interface FileView {
  id: number;
  file_id: number;
  view_count: number;
  last_viewed_at: string;
  preview_count: number;
  play_duration: number;
  name?: string;
  path?: string;
  ext?: string;
  category?: string;
  size?: number;
}

export interface UserAction {
  id: number;
  action_type: string;
  file_id: number | null;
  tag_id: number | null;
  search_query: string | null;
  action_data: string | null;
  created_at: string;
}

export interface UserPreference {
  id: number;
  preference_type: 'category' | 'tag' | 'keyword';
  preference_key: string;
  preference_value: number;
  data_source: string;
  last_updated: string;
}

export interface Preferences {
  categories: UserPreference[];
  tags: UserPreference[];
  keywords: UserPreference[];
}

export interface Recommendation {
  id: number;
  rec_type: string;
  file_id: number;
  score: number;
  reason: string;
  created_at: string;
  expires_at: string | null;
  name?: string;
  path?: string;
  ext?: string;
  category?: string;
  size?: number;
}

export type PreferencesData = Preferences;