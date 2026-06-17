# NAS Indexer Roadmap

> 最后更新：2026-06-17
> 当前版本：v1.5.6

---

## 项目定位

NAS 文件索引与管理 Web 应用，基于 **Node.js + Express + SQLite + Vue 3** 技术栈，提供文件扫描、分类、搜索、预览、标签管理和智能推荐功能。

---

## 阶段一：质量与稳定性（v1.1.x）✅ 已完成

**目标**：提升代码质量，为后续开发奠定基础

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | 版本号统一 | ✅ | 修复 package.json 和 server.js 中的版本号不一致 |
| **P0** | 代码规范工具 | ✅ | 配置 ESLint + Prettier，统一代码风格 |
| **P1** | 基础单元测试 | ✅ | 为 database.js、scanner.js 核心函数编写 Jest 测试 |
| **P1** | 后端路由拆分 | ✅ | 将 server.js 拆分为 routes/ 模块（files、tags、scan、stats 等） |

---

## 阶段二：用户体验增强（v1.2.x）✅ 已完成

**目标**：提升用户界面体验，增加实用功能

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | 暗色主题 | ✅ | CSS 变量主题系统，支持浅色/深色切换 |
| **P1** | 可视化图表 | ✅ | 饼图展示分类分布、存储占比（chart.js） |
| **P1** | 高级搜索增强 | ✅ | 文件大小范围、修改时间范围筛选 |
| **P2** | NAS 状态检测 | ✅ | 扫描前检测 NAS 是否在线，显示连接状态 |

---

## 阶段三：智能功能扩展（v1.3.x）✅ 已完成

**目标**：增加实用智能功能

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | 智能文件预览增强 | ✅ | 列表页缩略图、视频时长/分辨率显示、悬停大图预览 |
| **P1** | 导出功能 | ✅ | 导出文件列表为 Excel |
| **P2** | 浏览器通知 | ✅ | 扫描完成时浏览器桌面通知 |

---

## 阶段四：TypeScript 升级（v1.3.2）✅ 已完成

**目标**：全栈 TypeScript 迁移，关闭 allowJs

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | 项目配置 | ✅ | tsconfig.json、tsconfig.test.json 配置 |
| **P0** | 类型定义 | ✅ | src/types/*.ts 核心类型声明 |
| **P1** | 后端核心迁移 | ✅ | database.js、scanner.js、utils.js → .ts |
| **P1** | 后端路由迁移 | ✅ | routes/*.js → routes/*.ts（8个模块） |
| **P2** | 前端配置 | ✅ | frontend/tsconfig.json、vite.config.ts |
| **P2** | 前端类型 | ✅ | frontend/src/types/*.ts |
| **P2** | Vue 组件迁移 | ✅ | 13 个组件 `<script setup lang="ts">` |
| **P2** | 前端 API 迁移 | ✅ | api/index.ts 约 50 个函数类型化 |
| **P2** | 测试迁移 | ✅ | tests/*.test.js → tests/*.test.ts |
| **P3** | allowJs 移除 | ✅ | 后端/前端 tsconfig 均禁用 allowJs |

**验证结果**：`npm run build` ✅、`npm test` ✅（15/15）、前端 `type-check` ✅

---

## 阶段五：游戏模块（v1.4.0）✅ 已完成

**目标**：为 nas-indexer 添加游戏海报墙功能，以 files 为底座、games 为扩展

**设计文档**：[docs/games-module-design.md](docs/games-module-design.md)

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | 全局开关配置 | ✅ | gamesEnabled（默认关闭）、gamesRules、gamesScrape |
| **P0** | games 数据库表 | ✅ | 新增 games 表，存储游戏目录信息 |
| **P0** | 游戏识别引擎 | ✅ | 正则规则 + 层级偏移，支持匹配任意全路径文件和目录 |
| **P1** | Steam 刮削 | ✅ | Steam Store API 刮削元数据和海报 |
| **P1** | 本地元数据存储 | ✅ | game.json + poster 文件存于游戏目录 |
| **P1** | 游戏后端 API | ✅ | routes/games.ts、11 个 API 接口 |
| **P2** | 前端海报墙 | ✅ | GameWallView、GameCard 组件 |
| **P2** | 扫描进度同步 | ✅ | SSE 推送游戏识别/刮削进度 |

**后续优化方向**：

| 版本 | 功能 |
|------|------|
| v1.4.1 | Steam 刮削优化（主要是按名称刮削，可以先获取到ID再刮削，或者整理热门游戏的id库，有id了才好刮削） + 批量刮削 |
| v1.4.2 | 多刮削源支持（SteamGridDB、IGDB） |

---

## 阶段六：架构升级（v1.5.x，待规划）

**目标**：现代化架构，支持更大规模使用

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | TypeScript 迁移 | ✅ | v1.3.2 已完成 |
| **P1** | Docker 部署 | ✅ | 提供 Dockerfile 和 docker-compose.yml |
| **P1** | 用户认证 | 待开始 | JWT 认证、多用户支持（如需要） |

---

## 阶段七：生态集成（v1.6.x，持续迭代）

**目标**：扩展生态系统，满足更多用户需求

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P1** | 媒体服务器对接 | 待开始 | Plex/Emby/Jellyfin 集成 |
| **P2** | 云存储集成 | 待开始 | OneDrive/Google Drive/百度网盘 |
| **P3** | CLI 命令行支持 | 待开始 | nas-indexer scan/classify/config 命令 |

---

## 阶段八：AI 功能（v1.7.x，远期规划）

**目标**：集成 AI 能力，提供智能化体验

| 优先级 | 任务 | 状态 | 说明 |
|--------|------|------|------|
| **P0** | AI LLM 集成 | 待开始 | 实现 docs/ai-llm-integration-plan.md 中的设计方案 |
| **P1** | AI 智能重命名建议 | 待开始 | 基于文件内容/上下文的重命名建议 |
| **P1** | 图片自动标签识别 | 待开始 | AI 识别图片内容并自动打标 |
| **P2** | 相似文件分组 | 待开始 | AI 识别相似内容的文件 |
| **P2** | 多 AI 模型支持 | 待开始 | 支持 OpenAI API、本地 LLM (Ollama) |

---

## 已完成的技术债务

| 任务 | 完成版本 | 说明 |
|------|----------|------|
| 版本号统一 | v1.1.0 | 全部文件版本号一致 |
| ESLint + Prettier | v1.1.0 | 代码规范工具配置完成 |
| Jest 单元测试 | v1.1.0 | 15 个测试用例，覆盖核心模块 |
| TypeScript 迁移 | v1.3.2 | 全栈 TS 迁移完成，allowJs 已禁用 |

## 待处理的技术债务

暂无

---

## 关键文件参考

| 模块 | 文件 | 说明 |
|------|------|------|
| 后端入口 | `src/server.ts` | Express 服务入口 |
| 共享工具 | `src/utils.ts` | 配置加载、数据库初始化等 |
| 数据库层 | `src/database.ts` | SQLite 核心业务逻辑 |
| 扫描引擎 | `src/scanner.ts` | 异步文件扫描 |
| 类型定义 | `src/types/*.ts` | 核心类型声明 |
| API 路由 | `src/routes/*.ts` | 9 个路由模块（含 games） |
| 测试文件 | `tests/*.test.ts` | Jest 单元测试 |
| 游戏模块 | `src/games/*.ts` | 游戏识别、刮削、数据库等 |
| 游戏路由 | `src/routes/games.ts` | 游戏 API 接口 |
| 游戏类型 | `src/types/game.ts` | 游戏相关类型定义 |
| 前端入口 | `frontend/src/main.ts` | Vue 3 应用入口 |
| 前端 API | `frontend/src/api/index.ts` | 60+ API 函数 |
| 前端类型 | `frontend/src/types/*.ts` | 前端类型定义 |
| 游戏海报墙 | `frontend/src/views/GameWallView.vue` | 游戏展示视图 |
| 游戏卡片 | `frontend/src/components/GameCard.vue` | 游戏卡片组件 |
| 备份管理 | `frontend/src/views/game/ProfileBackupView.vue` | Profiles 备份页面 |
| 备份路由 | `src/routes/profile-backup.ts` | Profiles 备份 API |
| AI 设计文档 | `docs/ai-llm-integration-plan.md` | AI 集成方案参考 |
| 游戏模块设计 | `docs/games-module-design.md` | 游戏模块技术方案 |