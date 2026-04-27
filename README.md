# NAS 文件索引工具

一个完整的 NAS 文件管理系统，支持文件索引、查询、预览和基础文件操作。基于 Vue 3 + SQLite 构建现代化 Web 界面。

## 功能特点

### 核心功能
- 📁 **目录扫描** - 扫描指定路径，生成文件索引
- 🗄️ **SQLite 存储** - 高效的数据存储和查询
- 🔍 **高级搜索** - 多条件筛选、分类过滤、排序、搜索历史
- 📊 **统计分析** - 分类分布、文件数量、存储占比

### 文件管理
- 📍 **文件定位** - 一键打开文件所在目录（跨平台支持）
- ✏️ **重命名** - 在线重命名文件
- 📋 **复制/移动** - 文件复制和移动操作
- 🗑️ **删除文件** - 支持安全删除（移至回收站）
- ⭐ **收藏功能** - 标记常用文件，快速访问
- 🏷️ **自定义标签** - 多标签、分组、颜色、批量打标

### 标签系统
- 📂 **标签分组** - 按类型/年份/状态等分组管理标签
- 🎨 **标签颜色** - 自定义标签颜色，视觉区分更清晰
- ✅ **批量打标** - 选中多个文件一次性添加标签
- 🔍 **标签筛选** - 按标签组合筛选文件

### 文件分类
- 📂 **后缀分类** - 根据文件扩展名自动分类（视频、音频、图片、文档、字幕）
- 📁 **目录分类** - 根据目录路径前缀分类，优先级高于后缀规则
- ⚙️ **自定义规则** - 在设置页面自定义分类规则和目录映射

### 文件预览
- 🎬 **视频播放** - 流式播放，支持拖动进度
- 🖼️ **图片预览** - 直接显示图片内容
- 🎵 **音频播放** - 在线播放音频文件
- 📄 **PDF 查看** - 内嵌 PDF 预览器
- 📝 **文本预览** - 支持 .txt 纯文本文件预览
- 📖 **Markdown 渲染** - 支持 .md 文件实时渲染预览

### 其他
- ⏰ **定时扫描** - 支持 Cron 表达式配置自动扫描
- 📝 **Markdown 输出** - 兼容旧版格式导出
- 🧠 **行为追踪与推荐** - 记录用户行为，生成个性化推荐
- 🌙 **暗色主题** - 现代化 UI 设计（待实现）

## 安装

```bash
npm install
```

## 使用

### 1. 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`

### 2. 配置扫描路径

访问 Web 页面 → 设置 → 配置扫描路径

添加你的 NAS 挂载路径：
- Windows: `D:\NAS` 或 `\\NAS\Share`
- macOS/Linux: `/mnt/nas` 或 `/Volumes/NAS`

> **📝 关于 NAS 账密**：本应用暂不提供配置 NAS 账户密码的功能。
> 请在 Windows 系统中先保存 NAS 的凭据（访问网络路径时勾选"记住我的凭据"），
> 或在 Windows 凭据管理器中添加 NAS 凭据，之后直接输入路径即可访问。

### 3. 执行扫描

点击"立即扫描"按钮，扫描完成后即可在"文件列表"中查看所有文件。

## Web 界面

启动服务后访问 `http://localhost:3000`：

| 页面 | 功能 |
|------|------|
| 首页 | 统计概览、快速操作 |
| 文件列表 | 分页浏览、筛选、打标、操作 |
| 搜索 | 关键词搜索、历史记录 |
| 统计 | 分类分布图表 |
| 标签管理 | 创建/编辑标签分组和标签 |
| 设置 | 扫描配置、定时任务 |

## 文件操作

在文件列表页面，每个文件支持以下操作：

- **定位** - 在资源管理器中打开文件所在目录
- **重命名** - 修改文件名
- **收藏** - 添加到收藏列表
- **删除** - 移动到回收站或永久删除

## 数据存储

```
profiles/
├── config.json        # 用户配置
└── nas_index.db       # SQLite 数据库（sql.js）
```

### SQLite 数据库结构

```sql
-- 文件表
CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    ext TEXT,
    size INTEGER,
    category TEXT,
    modified_at DATETIME,
    scanned_at DATETIME,
    is_favorite INTEGER DEFAULT 0
);

-- 扫描路径表
CREATE TABLE scan_paths (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_scan DATETIME
);

-- 标签分组表
CREATE TABLE tag_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0
);

-- 标签表
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    group_id INTEGER,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0
);

-- 文件-标签关联表
CREATE TABLE file_tags (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    UNIQUE(file_id, tag_id)
);

-- 文件访问记录表
CREATE TABLE file_views (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL,
    view_count INTEGER DEFAULT 0,
    last_viewed_at DATETIME,
    preview_count INTEGER DEFAULT 0,
    play_duration INTEGER DEFAULT 0
);

-- 用户操作日志表
CREATE TABLE user_actions (
    id INTEGER PRIMARY KEY,
    action_type TEXT NOT NULL,
    file_id INTEGER,
    tag_id INTEGER,
    search_query TEXT,
    action_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户偏好画像表
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY,
    preference_type TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value REAL,
    data_source TEXT,
    last_updated DATETIME
);

-- 推荐结果缓存表
CREATE TABLE recommendations (
    id INTEGER PRIMARY KEY,
    rec_type TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    score REAL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET/POST | 配置管理 |
| `/api/status` | GET | 系统状态 |
| `/api/scan` | POST | 手动扫描 |
| `/api/files` | GET | 分页获取文件列表 |
| `/api/files/:id` | GET | 获取文件详情 |
| `/api/files/:id/open` | POST | 打开文件所在目录 |
| `/api/files/:id/rename` | POST | 重命名文件 |
| `/api/files/:id` | DELETE | 删除文件 |
| `/api/favorites` | GET | 获取收藏列表 |
| `/api/preview/:id` | GET | 获取预览信息 |
| `/api/stream/:id` | GET | 流式播放文件 |
| `/api/statistics` | GET | 统计数据 |
| `/api/categories` | GET | 分类列表 |
| `/api/search` | GET | 搜索文件 |
| `/api/tag-groups` | GET/POST/PUT/DELETE | 标签分组管理 |
| `/api/tags` | GET/POST/PUT/DELETE | 标签管理 |
| `/api/tags/stats` | GET | 标签统计 |
| `/api/files/:id/tags` | GET/POST/DELETE | 文件标签操作 |
| `/api/files/batch/tags` | POST | 批量打标 |
| `/api/files/by-tags` | GET | 按标签筛选文件 |
| `/api/files/:id/view` | POST | 记录文件查看 |
| `/api/files/:id/preview` | POST | 记录文件预览 |
| `/api/files/:id/action` | POST | 记录用户操作 |
| `/api/files/views` | GET | 获取最近访问记录 |
| `/api/preferences` | GET | 获取用户偏好画像 |
| `/api/preferences/clear` | DELETE | 清除偏好数据 |
| `/api/recommendations` | GET | 获取推荐结果 |
| `/api/recommendations/generate` | POST | 生成推荐 |

## Cron 表达式示例

- `0 2 * * *` - 每天凌晨 2 点
- `0 */4 * * *` - 每 4 小时
- `0 9 * * 1-5` - 工作日每天 9 点
- `*/30 * * * *` - 每 30 分钟

## 开发

### 前端开发

```bash
cd frontend
npm install
npm run dev    # 开发模式
npm run build  # 构建生产版本
```

### 技术栈

**后端**:
- Node.js + Express
- sql.js (SQLite)
- node-cron

**前端**:
- Vue 3
- Vue Router
- Vite

## 注意事项

- NAS 关机时扫描会跳过，不会报错
- NAS 凭据需在 Windows 系统中预先配置，本应用不管理 NAS 登录认证
- 文件操作需要确保目标路径可访问
- 大文件扫描可能耗时，建议使用定时扫描