# NAS Indexer

离线文件索引服务，快速查找和管理你的 NAS 文件库。

**版本: v1.5.4**

## 功能

### 文件索引
- 目录扫描生成索引
- SQLite 本地存储
- 分类统计（视频、音频、图片、文档等）

### 文件查找
- 关键词搜索
- 多条件筛选（分类、大小、时间、标签）
- 搜索历史

### 文件管理
- 重命名、复制、移动、删除
- 收藏标记
- 自定义标签（分组、颜色）
- 一键打开文件目录

### 文件预览
- 视频/音频在线播放
- 图片/缩略图预览
- PDF、文本、Markdown 预览
- 视频时长、分辨率显示

### 游戏模块 (v1.4.0)
- 游戏目录自动识别（正则规则 + 层级偏移，支持匹配任意全路径的文件和目录）
- 独立游戏扫描路径配置（gameScanPaths），可与文件扫描路径分离
- Steam API 元数据刮削（自动获取游戏信息和海报）
- HTTP 代理支持（配置 proxyUrl 用于 Steam API 访问）
- 游戏海报墙展示
- 手动添加游戏和提升目录（P0优先级标记）
- 海报上传/管理

### 其他
- 暗色主题
- 导出 Excel
- 定时扫描
- NAS 状态检测

## 快速开始

```bash
npm install
npm start
```

访问 http://localhost:3000

## Docker 部署

```bash
# 构建镜像
docker build -t nas-indexer .

# 运行容器
docker run -d -p 3000:3000 -v nas-indexer-data:/app/profiles nas-indexer

# 或使用 docker-compose
docker compose up -d
```

挂载 NAS 目录（只读）：

```yaml
volumes:
  - nas-indexer-data:/app/profiles
  - /mnt/nas:/nas:ro  # 替换为你的 NAS 路径
```

## 配置

编辑 `config.default.json` 设置扫描路径。

## 技术栈

Node.js + Express + SQLite + Vue 3

详见 [CHANGELOG.md](./CHANGELOG.md)