# 更新日志

## [v1.5.8] - 2026-06-19

### Bug 修复
- **Docker 部署兼容性修复** - 解决 Docker 构建和运行问题
  - Dockerfile 升级 Node 20 → Node 22（undici@8.x 需要 Node ≥ 22）
  - frontend 添加缺失的 sortablejs 和 @types/sortablejs 依赖
  - package-lock.json 替换阿里内部 registry 为公共 npm 镜像
  - README 添加 Docker Node 版本要求说明

### 配置
- **游戏配置独立** - 游戏模块配置分离管理
  - 新增 `games-config.default.json` 独立默认配置文件
  - `config.default.json` 移除游戏相关配置字段（已迁移至独立文件）
  - 更新游戏识别规则：新增 DODI、3DMGAME、Gamersky 规则
  - 移除已废弃的 `heuristicRules` 详细配置

### 移除
- **冗余备份功能** - 移除 `games/backups` 目录备份功能
  - profiles 备份已覆盖完整游戏库数据，功能重复
  - 移除 `src/games/backup-service.ts` 备份服务
  - 移除 `src/routes/backup.ts` 路由文件
  - 移除 `src/games/storage.ts` 中的 `BACKUPS_DIR` 常量和 `getBackupDir` 函数
  - 移除前端 API 中的 `listBackups`, `createBackup`, `restoreBackup`, `deleteBackup` 函数
  - 移除相关测试文件

### 新增功能
- **路径名称提取** - 从游戏路径自动提取中英文名称
  - 中文目录名作为游戏标题（title）
  - 英文子目录/安装包文件名作为英文标题（title_en）
  - 新增批量名称提取 API `/api/games/extract-names/batch`
  - 新增单个游戏名称提取 API `/api/games/:id/extract-names`
  - 游戏识别时自动提取中英文名称
- **新游戏标记** - 快速识别刚入库的游戏
  - 海报卡片右上角显示 "New" 角标（24小时内入库的游戏）
  - 排序选项新增"按扫描时间（新→旧）"

### 技术改进
- **游戏卡片图标优化** - 区分"打开目录"和"加入分组"按钮图标
  - "加入分组"图标从 📁（文件夹）改为 🏷️（标签），语义更清晰
- **游戏扫描跳过逻辑优化** - 防止规则改变后重复识别游戏
  - 移除 `is_root_manually_marked === 1` 的限制，只要目录是游戏就跳过
  - 父目录已是游戏 → 跳过子目录扫描
  - 子目录已是游戏 → 跳过父目录扫描（避免重复识别）
- **移除废弃功能** - 清理 `promoteGame` 提升目录功能
  - 移除 `/:id/promote` 路由接口
  - 移除 `promoteGame` 数据库方法
  - 移除相关测试用例
- **name-resolver 模块扩展** - 新增路径解析函数
  - extractNamesFromPath：从路径提取中英文名称
  - findEnglishNameInChildren：从子目录/文件提取英文候选名
  - 智能跳过无关文件（setup.exe、readme 等）
  - 选择最长候选名作为英文名
- **Steam DB 导出字段扩展** - 导出更完整的游戏信息
  - 新增导出字段：release_date（发行日期）、genres（类型）、rating（评分）、languages（语言）、tags（标签）、scraped_at（刮削时间）
  - 新增导出字段：developer（开发商）、publisher（发行商）、short_description（游戏简介）
  - 数据库 steam_db 表新增 developer、publisher、short_description 列
  - 刮削时自动写入完整元数据到 steam_db 表
  - 导入功能同步支持完整字段导入/覆盖
  - 前端导入提示更新为新格式示例

## [v1.5.8] - 2026-06-18

### 新增功能
- **游戏分组快捷操作** - 简化分组操作路径，提升用户体验
  - 游戏卡片新增"加入分组"按钮（📁），一键打开分组选择器
  - 游戏详情模态框新增"所属分组"管理区域，可查看、加入、移出分组
  - 游戏海报墙新增"批量管理"模式，支持多选游戏批量加入分组、批量收藏、批量删除
  - 分组选择器支持多选分组，一次性添加到多个分组

### 技术改进
- **Steam DB 导出字段扩展** - 导出更完整的游戏信息
  - 新增导出字段：release_date（发行日期）、genres（类型）、rating（评分）、languages（语言）、tags（标签）、scraped_at（刮削时间）
  - 导入功能同步支持完整字段导入/覆盖
  - 前端导入提示更新为新格式示例

## [v1.5.8] - 2026-06-17

### 新增功能
- **游戏「无 Steam」标记** - 标记无法通过 Steam 刮削的游戏
  - 数据库新增 is_no_steam 字段
  - 游戏墙筛选栏新增「无 Steam」筛选项
  - 编辑弹窗新增「标记为无 Steam 游戏」勾选框
  - 游戏卡片显示 Steam logo（正常/禁用状态）
  - 统计面板显示无 Steam 游戏数量

### 技术改进
- **游戏状态体系优化** - 更细致的状态判断
  - 「已刮削」- Steam API 刮削成功（绿色）
  - 「已完善」- 信息完整（有海报+评分+类型+开发商，紫色）
  - 「已配置」- 手动填写了基础信息（蓝色）
  - 「待刮削」- 仅识别出目录，无元数据（灰色）
  - 统计面板新增「已配置」显示

## [v1.5.7] - 2026-06-17

### 技术改进
- **移除无用 scan_paths 表** - 该表定义存在但从未使用，扫描路径管理通过配置项实现

### 新增功能
- **视频元数据持久化** - 视频时长、分辨率写入数据库，避免重复获取
  - 前端获取视频元数据后上报 API 持久化到数据库
  - 两级缓存策略：内存缓存（当前 session）+ 数据库缓存（跨 session）
  - 刷新页面后直接使用数据库数据，减少磁盘读取压力
- **预览开关控制** - 设置页面新增图片/视频预览开关
  - 图片缩略图预览开关（thumbnailPreviewEnabled）
  - 图片大小限制输入框（仅在启用时显示）
  - 视频元数据显示开关（videoPreviewEnabled）

## [v1.5.6] - 2026-06-17

### 新增功能
- **Profiles 一键备份** - 游戏模块新增备份管理页面
  - 新增"备份管理"二级 TAB（与游戏墙、Steam 管理、游戏设置同级）
  - 一键备份 profiles 目录为 zip 压缩包
  - 备份文件列表显示文件名、大小、创建时间
  - 支持下载、删除备份文件
  - 文件命名格式：profiles_backup_YYYYMMDD_HHMMSS.zip
  - 存储位置：项目根目录 .backup/ 目录

### Bug 修复
- **Steam 管理表格列宽优化** - 修复中文名过宽、英文名过窄、别名悬浮提示缺失
  - AppID（100px）和状态（80px）固定宽度，按钮列（260px）右对齐
  - 中文名、英文名、别名三列 flex:1 等分剩余宽度
  - 名称过长时显示省略号，悬浮显示完整内容
  - 别名超过 3 个时，悬浮显示剩余别名列表（换行分隔）

### 性能优化
- **前端打包体积优化** - 路由懒加载 + vendor 分包，首屏体积减少 85%
  - 首屏 JS 从 783 kB 降至 ~122 kB（Gzip 从 268 kB 降至 ~47 kB）
  - 路由组件改为动态 import，按访问页面加载
  - 第三方库拆分：vue-vendor、chart-vendor、utils-vendor 独立包
  - 消除构建警告（单文件超过 500 kB）

## [v1.5.6] - 2026-06-16

### Bug 修复
- **正则规则列表 UI 改进** - GameSettingsView 正则规则表格优化
  - 添加表头（排序、正则表达式、启用、层偏移、说明、操作）
  - 启用勾选框移至规则名称后面
- **Steam 搜索栏换行修复** - "共 X 条记录"添加 nowrap 样式防止换行
- **海报同步机制** - 刮削时将 Steam 缓存图片复制到游戏海报目录
  - header.jpg -> horizontal.jpg（横版海报）
  - capsule.jpg -> vertical.jpg（竖版海报）
  - background.jpg -> background.jpg（背景图）
  - 不会覆盖已存在的海报，保持用户手动上传的海报
- **Steam DB 数据写入修复** - insertSteamDbEntry 现正确写入 release_date、rating 等元数据字段
- **Steam 列表即时搜索** - 输入时自动触发搜索（300ms 防抖）

### 技术改进
- **SettingsView 精简** - 移除已迁移的 Steam DB 和游戏详细配置
  - 游戏模块仅保留 gamesEnabled 总开关
  - Steam 数据库管理迁移至 GameSteamView
  - 游戏详细配置迁移至 GameSettingsView

## [v1.5.6] - 2026-06-15

### 新增功能
- **Steam 缓存管理 API** - 新增 /api/steam-cache 路由，提供缓存管理接口
  - GET /stats - 获取缓存统计（条目数、图片数、总大小）
  - GET /list - 分页获取缓存列表（含图片状态）
  - GET /:appid - 获取单个缓存详情
  - POST /:appid/refresh - 强制刷新单个缓存
  - DELETE /:appid - 删除单个缓存
  - POST /refresh-all - 批量刷新所有缓存（SSE 流式响应）
  - GET /images/:appid - 获取缓存图片列表
- **游戏配置 API** - 新增 /api/games-config 路由，管理独立游戏配置
  - GET / - 获取游戏配置（games-config.json）
  - PUT / - 保存游戏配置
- **前端 API 扩展** - frontend/src/api/index.ts 新增 Steam 缓存和游戏配置 API 函数
  - getSteamCacheStats、getSteamCacheList、getSteamCacheDetail、refreshSteamCache
  - deleteSteamCache、refreshAllSteamCache
  - getGamesConfig、saveGamesConfig
- **Steam 缓存图片管理服务** - 新增 steam-cache-service.ts，支持按 AppID 存储图片缓存
  - 支持下载 header/capsule/background/poster 等多种类型图片
  - 支持截图批量下载和增量补齐
  - 支持缓存完整性检查和统计
  - 支持缓存删除和清理
- **刮削流程重构** - 本地优先逻辑，减少网络请求
  - 刮削前先检查本地缓存（steam_db 表 raw_data 字段）
  - 缓存完整时直接提取元数据，缺失图片自动补齐
  - 新增强制刷新方法（手动触发重新刮削）
  - Steam API 完整返回存入 raw_data 字段
- **Steam 管理页面** - 新增 GameSteamView.vue，提供 Steam 缓存管理界面
  - 缓存统计卡片显示（游戏数、图片数、缓存大小）
  - 缓存列表展示（含状态标识：完整/缺失图片/仅元数据）
  - 支持单个缓存刷新、删除、详情查看
  - 支持批量刷新所有缓存
  - 支持导出 Steam DB
- **游戏设置页面** - 新增 GameSettingsView.vue，提供游戏配置管理界面
  - 扫描路径配置（启用独立路径、添加/删除路径）
  - 刮削配置（自动刮削、下载海报、代理设置）
- **前端模块化重构** - 拆分 Game 模块为 composables 和独立组件
  - useGameToast - Toast 通知逻辑
  - useGameFilters - 筛选逻辑（搜索、类型、年份、状态、排序）
  - GameFilterBar - 筛选栏组件
  - GameStatsBar - 统计栏组件
  - GameSteamCacheDetailModal - 缓存详情弹窗
- **路由结构更新** - 新增嵌套路由 /game 子路径
  - /game/wall - 游戏墙（原 /games 重定向至此）
  - /game/steam - Steam 管理
  - /game/settings - 游戏设置
- **游戏子导航** - App.vue 新增游戏模块子导航栏（游戏墙、Steam 管理、游戏设置）

### 技术改进
- **前端目录重构** - 游戏模块文件移至 game/ 子目录
  - views/game/GameWallView.vue
  - components/game/GameCard.vue, GameGroupSidebar.vue, GameGroupManager.vue
  - composables/game/ 目录创建
  - router/index.ts 和 GameWallView.vue 导入路径更新
- **游戏配置独立模块** - 游戏配置拆分为 games-config.json，支持从旧 config.json 迁移
- **配置类型精简** - Config 类型仅保留 gamesEnabled 开关，详细配置移至 GamesConfig 类型
- **utils.ts 导出清理** - 移除游戏配置相关导出，改用 games-config.ts 的 getGameScanPathsFromConfig
- **server.ts 路由集成** - 注册 steam-cache 和 games-config 路由，新增 Steam 缓存静态文件服务
  - 新增 /static/games 路径映射到 storage/games 目录
  - 支持访问 /static/games/steam-cache/{appid}/xxx.jpg 图片

## [v1.5.6] - 2026-06-14

### 功能改进
- **编辑游戏路径** - 编辑游戏时可以修改游戏路径，方便快速修正错误路径
- **排除功能重构** - 点击排除按钮将路径加入黑名单并删除游戏记录，重新扫描时不再识别
- **移除提升目录功能** - 因已有编辑路径功能，移除"提升一级目录"按钮

### Bug 修复
- **黑名单路径匹配** - 修复 Windows `\` 分隔符与标准化路径 `/` 无法匹配的问题

### 移除功能
- **已排除状态** - 移除 `is_excluded` 字段、筛选选项和统计显示，简化数据结构

## [v1.5.5] - 2026-06-13

### 新增功能
- **SteamDB 同步** - 编辑 SteamDB 名称后自动更新关联游戏的 title/title_en
- **PKG 打包** - 支持 `npm run build:exe` 生成 Windows 可执行文件

### 技术改进
- **日志时区** - 日志时间改为本地时区格式，更易阅读
- **扫描日志优化** - 扫描时跳过已存在游戏的日志输出，减少冗余
- **识别规则简化** - 删除 P3 启发式规则，优先级简化为三级（P0/P1/P2）

## [v1.5.4] - 2026-06-10

### 新增功能
- **Steam 数据库** - 管理 Steam AppID 与游戏名称映射，提升刮削成功率
  - 新增 `steam_db` 表替代原有的 `game_aliases` 表
  - 一个 AppID 可对应中文名、英文名和多个别名
  - 设置页新增 Steam 数据库 Tab（随游戏模块开关显隐）
  - 支持 CRUD 操作、JSON 导入导出
  - 支持从旧别名表迁移数据
  - 游戏识别时自动匹配中文名、英文名或别名
  - 表格形式横向显示，AppID/名称可点击跳转 Steam 商店
- **HTTP 代理支持** - Steam API 刮削支持通过 HTTP 代理访问
  - 配置项 `proxyUrl` 设置代理地址（如 `http://127.0.0.1:7890`）
  - 配置更新后自动重新初始化代理
  - 使用 undici 的 ProxyAgent 实现代理请求
- **海报备份系统** - 上传海报时自动备份原海报，最多保留 5 个历史版本
  - 详情页显示历史备份缩略图，点击即可一键切换使用
  - 支持删除单个备份
  - 配置项 `maxPosterBackups` 控制最大备份数量
- **Toast 提示系统** - 所有操作完成后屏幕中上方显示提示，2 秒后自动消失
  - 手动添加、重新识别、批量刮削、单独刮削等操作均有提示
  - 上传海报、重新下载海报、编辑游戏、绑定 Steam 等均有提示
  - 排除/收藏/删除/提升目录等操作均有提示

### 技术改进
- **Steam DB 智能更新** - 刮削后根据 Steam 名称和目录名的中英文特征智能分配 name/name_en/aliases
  - Steam 名中文 → 覆盖 name，目录名作为别名
  - Steam 名英文 → 覆盖 name_en，目录名中文则覆盖 name
  - 已存在条目时更新对应字段并合并别名
- **统一游戏名处理模块** - 抽取 `name-resolver.ts` 统一处理中英文名称分配逻辑
- **游戏页面按钮优化** - 低频操作（移除不存在目录、清理记录）折叠到"更多..."下拉菜单
- **按钮文案优化** - "重新识别"改名为"重新扫描"，更准确表达功能
- **设置页 UI 调整** - 将"最大递归深度"从识别规则部分移到游戏路径扫描上方，作为独立的"扫描限制"设置项
- **Steam AppID 复制优化** - 使用图标按钮替代文字，复制成功显示 Toast 提示
- **重新识别数据保护** - 游戏已存在时只更新基本信息，不覆盖已有的刮削元数据
  - 使用 COALESCE 确保只更新非 null 值
  - 保留 developer、publisher、genres、rating 等刮削数据
- **批量刮削 SSE 模式** - 复用扫描任务的 taskManager，实时显示进度
  - 添加 `game-scrape` 任务类型
  - TaskBar 实时显示刮削进度和完成通知

### Bug 修复
- **游戏识别双重偏移** - 修复 matchRecognitionRule 和 smartLevelOffset 都应用 levelOffset 导致偏移两次的问题
  - matchRecognitionRule 现在只计算基准目录，不应用偏移
  - 所有偏移逻辑（P1/P2/P3）统一在 smartLevelOffset 中处理
- **游戏墙分页数量** - 每页从50改为100，确保每行4个卡片显示完整的25行
- **海报备份缩略图定位** - 修复备份图片显示在页面最上面的问题
- **海报备份 API 路由顺序** - 修复路由匹配顺序导致 404 的问题
- **游戏分组关系残留** - 修复游戏删除后分组统计数据不准确的问题
  - deleteGame 方法同步删除 game_group_items 关联记录
  - getGroups 方法查询前自动清理孤儿数据
  - 统计查询改为只计算实际存在的游戏

## [v1.5.3] - 2026-06-08

### Bug 修复
- **前端 TypeScript 编译错误** - 修复 GameWallView.vue 缺失的 poster upload/redownload 功能
  - 添加 showPosterUploadModal、posterRedownloading、posterUploading 响应式变量
  - 实现 redownloadPoster 和 submitPosterUpload 方法
  - 新增海报上传弹窗组件
  - 导入 uploadGamePoster 和 redownloadGamePoster API

## [v1.5.3] - 2026-06-08（上午提交）

### 技术改进
- **P0手动优先级标记** - 替代game.json本地元数据机制，实现游戏根目录人工界定功能
  - 新增数据库字段 `is_root_manually_marked`
  - 手动添加/提升目录时自动标记为1（用户已确认）
  - 扫描逻辑三维度检查：目录本身、父目录、子目录是否已确认
  - 已确认目录跳过P1/P2/P3自动识别
- **移除game.json遗留代码** - 清理routes/games.ts和scraper.ts中的game.json写入逻辑
- **修复数据库插入错误** - 修正insertGame方法UPDATE语句参数数量不匹配问题
- **新增P0数据库测试** - 添加tests/games/p0-database.test.ts验证标记逻辑

## [v1.5.3] - 2026-06-08（上午提交）

### 技术改进
- **游戏元数据集中存储** - 完成游戏海报集中存储到 profiles/games/posters/{game_id}/
- **移除冗余字段** - 移除数据库中的 has_local_poster 字段，通过文件系统动态检查海报存在性
- **Backup API** - 添加游戏数据备份/恢复功能（create/list/restore/delete）
- **Poster API规范化** - 修正海报上传/删除/redownload API路径，符合设计方案规范
- **游戏根目录智能识别** - 新增三级优先级识别逻辑：
  - P1: steam_appid.txt向上查找（Steam游戏锚点）
  - P2: 启发式规则 + 层级偏移自适应（exe目录名、标准子目录、目录大小）
  - P3: 配置levelOffset（兜底方案）
- **启发式规则配置化** - 可配置exe目录名匹配、标准子目录模式、目录大小阈值
- **配置说明文档** - docs/game-identification-rules.md
- **清理冗余代码** - 移除未使用的 poster.ts 和 migration.ts 文件

### Bug 修复
- **Backup路由挂载** - 修复backup路由未正确挂载到games路由的问题
- **海报上传路径** - 修正海报上传API路径从 /:id/poster/:type 改为 /:id/poster/upload

## [v1.5.3] - 2026-05-27

### 技术改进
- **HTTP API路由前缀重构** - 统一所有路由模块使用独立完整前缀，避免共享 `/api` 前缀导致的路由覆盖风险
  - `tags.ts` 挂载前缀改为 `/api/tags`
  - `preview.ts` 挂载前缀改为 `/api/preview`
  - `recommendations.ts` 挂载前缀改为 `/api/recommendations`
  - `stats.ts` 挂载前缀改为 `/api/stats`
- **文件标签路由整合** - `/files/:id/tags` 相关路由从 `tags.ts` 移至 `files.ts`，路由结构更清晰
- **路由路径命名优化** - 修复路径段重复问题，采用语义化后缀命名
  - 标签列表：`/api/tags/tags` → `/api/tags/list`
  - 创建标签：`/api/tags/tags` → `/api/tags/create`
  - 推荐列表：`/api/recommendations/recommendations` → `/api/recommendations/list`
- **HTTP方法统一** - 弃用 RESTful PUT/DELETE，全部采用 POST + 动词化 URL
  - 删除文件：`DELETE /:id` → `POST /delete/:id`
  - 移除收藏：`DELETE /favorites/:id` → `POST /favorites/remove/:id`
  - 更新标签：`PUT /:id` → `POST /update/:id`
  - 删除标签：`DELETE /:id` → `POST /delete/:id`
  - 更新游戏：`PUT /:id` → `POST /update/:id`
  - 删除游戏：`DELETE /:id` → `POST /delete/:id`
  - 更新分组：`PUT /groups/:id` → `POST /groups/update/:id`
  - 删除分组：`DELETE /groups/:id` → `POST /groups/delete/:id`

### UI改进
- **游戏收藏快捷入口** - 收藏筛选从状态下拉框移至分组侧边栏顶部快捷区，概念更清晰

## [v1.5.2] - 2026-05-24

### 新增功能
- **收藏游戏** - 游戏海报卡片新增 ⭐/☆ 收藏按钮，收藏卡片显示金色左边框；状态筛选新增「收藏」选项，可单独查看已收藏游戏；统计摘要显示收藏数量
- **手动添加游戏** - 游戏页面新增"手动添加"按钮和表单弹窗，支持输入路径、名称、Steam AppID、开发商等字段，填入 AppID 后自动刮削；自动在目录创建 game.json
- **提升一级目录** - 游戏海报卡片新增 ⬆️ 按钮，可将游戏目录提升至父目录；自动处理 game.json（存在则移动，不存在则创建）；自动处理海报文件迁移；父目录已有游戏时阻止并提示

## [v1.5.1] - 2026-05-24

### 技术改进
- **游戏识别重构为正则规则体系** - 新增 `GameRecognitionRule`（正则 + 层级偏移），替换旧多优先级规则；支持匹配任意全路径的文件和目录
- **游戏独立扫描路径识别支持** - 正则规则自动应用于 `gameScanPaths` 配置的路径
- **状态筛选修复** - 游戏列表「已刮削」状态现在正确识别 `scraped_at IS NOT NULL` 和 `metadata_source = 'local'` 的游戏
- **统计接口修复** - `getStatistics()` 统一使用 `scraped_at` 字段判断已刮削状态

### 文档
- **游戏识别规则说明** - `docs/game-recognition-rules.md` 详细文档

## [v1.5.0] - 2026-05-23

### 新增功能
- **Docker 部署支持** - 提供多阶段构建 Dockerfile、docker-compose.yml，支持一键容器化部署
- **健康检查** - Docker 容器内置健康检查，自动监控服务状态

### 技术改进
- **生产级镜像** - 使用 node:20-alpine 瘦身镜像，仅包含运行时必需文件
- **数据持久化** - profiles 目录通过 Docker volume 持久化，配置和数据库不丢失

## [v1.4.5] - 2026-05-23

### 新增功能
- **失效记录清理** - 文件扫描和游戏扫描自动清理已移除路径的残留记录；设置页和游戏页新增手动清理按钮
- **独立目录模式跳过游戏识别** - 开启游戏独立扫描路径后，文件扫描不再附带游戏识别，游戏识别仅在游戏页面手动触发

### Bug 修复
- **扫描通知重复** - 修复页面刷新后扫描完成通知重复弹出的问题

### 技术改进
- **路径解析工具函数** - 抽取 `getFileScanPaths()` 和 `getGameScanPaths()` 统一路径解析逻辑
- **Database 新增失效清理方法** - `deleteStaleByScanPaths()` 和 `deleteStaleByScanRoots()` 分别清理文件和游戏的失效记录

## [v1.4.4] - 2026-05-22

### 新增功能
- **游戏独立扫描路径** - 新增 `gameScanPathsEnabled` 开关和 `gameScanPaths` 配置，游戏模块可配置独立于文件扫描的扫描路径
- **scanRoots 深度排序** - 游戏识别前按路径深度降序排列，子目录优先扫描，父目录自动跳过已扫描的子路径
- **设置页识别规则重排** - 游戏识别规则按代码实际优先级分 3 组展示（本地元数据 > 目录特征匹配 > 游戏库路径）

### 技术改进
- **Config 类型扩展** - Config 接口新增 `gameScanPathsEnabled` 和 `gameScanPaths` 字段（后端 + 前端同步）
- **优先级分组 UI** - 设置页游戏规则区域新增 `.priority-group` 分组标题样式

---

## [v1.4.3] - 2026-05-20

### 新增功能
- **游戏卡片排除按钮** - 海报卡片新增 🚫 排除按钮，可标记非游戏目录，已排除卡片半透明显示，支持取消排除
- **游戏卡片删除按钮** - 海报卡片新增 🗑️ 删除按钮，删除目录已移动的游戏，带确认提示
- **移除不存在目录** - 批量操作新增「移除不存在目录」按钮，自动清理目录已不存在的游戏记录
- **已排除状态筛选** - 状态筛选下拉新增「已排除」选项，可单独查看已排除的游戏
- **批量刮削确认框** - 批量刮削按钮增加二次确认弹窗，防止误操作

### 技术改进
- **is_excluded 字段** - 游戏表新增 `is_excluded` 列，默认查询隐藏已排除游戏
- **精简日志** - 游戏数据库建表日志仅首次创建时打印，配置加载日志降级为 debug

---

## [v1.4.2] - 2026-05-19

### 新增功能
- **手动搜索 Steam 游戏** - 游戏详情弹窗新增「搜索 Steam」按钮，可手动搜索并选择正确的游戏
- **Steam 搜索弹窗** - 输入关键词搜索 Steam，展示候选列表（缩略图、名称、评分、AppID），选中后绑定并自动刮削
- **绑定 Steam API** - 新增 `GET /games/steam/search` 和 `POST /games/:id/bind-steam` 接口

### Bug 修复
- **Steam 搜索无结果** - 修复 `storesearch` API 响应无 `success` 字段导致搜索始终返回空的问题
- **弹窗背景透明** - 修复游戏详情弹窗和 Steam 搜索弹窗背景色 CSS 变量名错误（`--card-bg` → `--bg-card`）

---

## [v1.4.1] - 2026-05-19

### UI 改进
- **设置页左侧 Tab 导航** - 将 8 个 card 纵向堆叠改为左侧 Tab + 右侧内容布局，分 5 个标签页：扫描配置、分类规则、偏好与显示、游戏模块、系统状态
- **响应式适配** - 移动端（<768px）sidebar 变为横向滚动 tabs

### Bug 修复
- **游戏导航条件显示** - 游戏模块关闭时隐藏顶部导航的"游戏"Tab，保存配置后实时生效

---

## [v1.4.0] - 2026-05-19

### 游戏模块
- **游戏识别系统** - 5级规则识别：排除规则、路径前缀、路径关键词、目录名特征、文件特征
- **游戏数据库** - 新增 games 表，存储游戏元数据、海报路径等
- **Steam API 刮削** - 自动从 Steam Store 获取游戏元数据和海报
- **本地元数据支持** - game.json 文件存储游戏信息，便于携带和分享
- **游戏海报墙** - GameWallView 视图展示游戏海报，支持筛选和排序
- **游戏详情弹窗** - 查看游戏元数据、文件列表、打开目录
- **海报管理** - 支持上传、删除海报（横版、竖版、Banner、背景）
- **游戏 API** - 11+ 个接口支持 CRUD、刮削、海报管理
- **设置页面配置** - 可配置识别规则、自动刮削、海报下载等选项

### Bug 修复
- **扫描路由游戏识别** - 单路径扫描和扫描全部都支持游戏识别
- **数据库插入兼容** - 将 undefined 参数转换为 null 以兼容 sql.js
- **浏览器通知优化** - 改进通知逻辑，对比新旧状态防止重复通知

---

## [v1.3.2] - 2026-05-18

### TypeScript 迁移完成
- **后端全量迁移** - 所有 .js 文件迁移为 .ts（database、scanner、utils、logger、8 个路由模块）
- **前端全量迁移** - 13 个 Vue 组件改用 `<script setup lang="ts">`，API 层约 50 个函数类型化
- **类型定义** - src/types/*.ts 后端类型、frontend/src/types/*.ts 前端类型
- **测试迁移** - tests/*.test.js → tests/*.test.ts
- **allowJs 禁用** - 后端/前端 tsconfig.json 均移除 allowJs，纯 TypeScript 项目

### 技术改进
- **API 响应格式统一** - 所有 API 响应统一使用 `{ success, data }` 格式
- **Jest 配置更新** - 使用新版 ts-jest transform 配置格式
- **构建验证** - 后端/前端构建、类型检查、测试全部通过

---

## [v1.3.1] - 2026-05-14

### 性能优化
- **批量标签查询** - 文件列表页标签请求从 50 个减少为 1 个
- **数据库批量写入** - 扫描时 1000 次写盘减少为 1 次
- **API 响应缓存** - 分类/标签/配置等数据 5 分钟缓存
- **虚拟滚动** - 文件列表使用 RecycleScroller，大幅减少 DOM 节点
- **滚动条适配** - 深色模式滚动条样式

---

## [v1.3.0] - 2026-05-13

### 新增功能
- **智能文件预览增强** - 列表页图片缩略图、视频时长/分辨率显示、悬停大图预览
- **导出功能** - 支持导出文件列表为 Excel
- **浏览器通知** - 扫描完成时浏览器桌面通知
- **缩略图配置** - 可配置缩略图大小限制，超过限制不自动加载

### Bug 修复
- 修复深色模式下预览框背景色问题

---

## [v1.2.0] - 2026-05-11

### 新增功能
- **暗色主题** - CSS 变量主题系统，支持浅色/深色切换，自动保存偏好
- **可视化图表** - 饼图展示分类分布和存储占比（Chart.js）
- **高级搜索增强** - 文件大小范围、修改时间范围筛选
- **NAS 状态检测** - 扫描前检测路径是否可达，显示连接状态标识

---

## [v1.1.0] - 2026-05-10

### 代码质量
- **版本号统一** - package.json 和源码版本号一致
- **代码规范工具** - ESLint + Prettier，统一代码风格
- **模块拆分** - server.js 拆分为 7 个路由模块（files、tags、scan、config、preview、stats、recommendations）+ utils.js
- **单元测试** - Jest 测试框架，15 个测试用例覆盖核心模块

---

## [v1.0.6] - 2026-04-28

### 新增功能

#### 用户行为追踪与智能推荐系统
- **行为数据表** - 新增 ai_file_views、ai_user_actions、ai_user_preferences、ai_recommendations、ai_search_history 表
- **行为记录 API** - 文件查看/预览行为记录
- **偏好分析引擎** - 类别/标签/关键词偏好计算
- **推荐引擎** - 基于偏好的类别推荐 + 标签推荐
- **首页增强** - 「你的偏好」摘要卡片和「为你推荐」推荐列表
- **设置页增强** - 偏好分析配置区块（追踪开关、级别、数据清除）
- **搜索页增强** - 文件预览并记录搜索行为，搜索历史自动去重

### 代码清理

#### 移除废弃代码
- **删除 storage.js** - 移除旧的 Markdown 存储模块
- **删除 performScan()** - 移除基于 storage.js 的旧扫描函数
- **删除 generateMarkdownTree()** - 移除 Markdown 目录树生成函数
- **清理 scanner.js** - 移除对 storage.js 的引用和导出

---

## [v1.0.5] - 2026-04-27

### 新增功能

#### 日志系统
- **pino 日志集成** - 高性能 JSON 格式日志，支持 pino-pretty 美化输出

#### 分类规则增强
- **自定义分类规则** - 支持后缀分类规则自定义
- **目录前缀分类** - 根据目录路径前缀自动分类，优先级高于后缀规则
- **设置页面** - 分类规则可视化配置界面

### Bug 修复
- **文件列表 UI** - 修复长文件名挤压操作按钮的问题

### 文档
- **AI 集成方案** - 新增 AI LLM 成方案与用户偏好分析系统设计文档

---

## [v1.0.4] - 2026-04-26

### 新增功能

#### 自定义标签系统
- **标签分组** - 支持创建标签分组（如类型、年份、状态等）
- **标签颜色** - 自定义标签颜色，视觉区分更清晰
- **多标签** - 每个文件可添加多个标签
- **批量打标** - 选中多个文件一次性添加标签
- **标签过滤** - 按标签组合筛选文件

#### 标签管理页面
- **分组管理** - 创建/编辑/删除标签分组
- **标签管理** - 创建/编辑/删除标签
- **统计显示** - 每个标签关联的文件数量

#### 文件列表增强
- **标签列** - 文件列表显示标签，支持快捷添加/移除
- **标签选择器** - 弹窗式标签选择，按分组展示
- **批量操作** - 多选文件后批量打标

#### 数据库扩展
- `tag_groups` 表 - 标签分组
- `tags` 表 - 标签定义
- `file_tags` 表 - 文件-标签关联

#### API 扩展
- `/api/tag-groups` - 标签分组 CRUD
- `/api/tags` - 标签 CRUD
- `/api/tags/stats` - 标签统计
- `/api/files/:id/tags` - 文件标签操作
- `/api/files/batch/tags` - 批量打标
- `/api/files/by-tags` - 按标签筛选文件

---

## [v1.0.3] - 2026-04-25

### 新增功能

#### 文本预览
- **纯文本预览** - 支持 .txt 文件在线预览，使用等宽字体显示
- **Markdown 渲染** - 支持 .md 文件实时渲染预览，包含标题、代码块等格式

### 技术改进
- **前端依赖** - 新增 marked 库用于 Markdown 解析
- **后端扩展** - stream.js 新增文本类型识别和 MIME 类型支持

---

## [v1.0.2] - 2026-04-25

### 新增功能

#### 文件管理系统
- **SQLite 数据库存储** - 使用 sql.js 实现，支持高效查询和统计
- **Vue 3 前端** - 完全重构的现代化 Web 界面
- **文件列表页面** - 分页浏览、筛选、排序功能
- **高级搜索** - 多条件筛选、搜索历史

#### 文件操作
- **文件定位** - 一键打开文件所在目录（Windows/macOS/Linux）
- **文件重命名** - 在线修改文件名，自动同步数据库
- **文件删除** - 安全删除，移至回收站或永久删除
- **文件复制/移动** - 路径选择，批量操作支持

#### 文件预览
- **视频播放** - 流式传输，支持 Range 请求和进度拖动
- **图片预览** - 直接显示图片内容
- **音频播放** - HTML5 Audio 播放器
- **PDF 查看** - iframe 内嵌预览

#### 收藏功能
- **收藏管理** - 标记常用文件，快速访问
- **收藏列表** - 专门的收藏页面

#### API 扩展
- `/api/files` - 分页文件列表 API
- `/api/files/:id` - 文件详情 API
- `/api/files/:id/open` - 打开文件位置 API
- `/api/files/:id/rename` - 重命名 API
- `/api/files/:id/copy` - 复制 API
- `/api/files/:id/move` - 移动 API
- `/api/files/:id` - 删除 API
- `/api/folder` - 创建文件夹 API
- `/api/directory` - 目录内容浏览 API
- `/api/favorites` - 收藏管理 API
- `/api/preview/:id` - 预览信息 API
- `/api/stream/:id` - 流式传输 API
- `/api/search/history` - 搜索历史 API
- `/api/categories` - 分类列表 API

### 技术改进
- **前端架构** - Vue 3 + Vite + Vue Router
- **数据层** - SQLite 数据库替代纯 Markdown 存储（完全移除 MD 依赖）
- **模块化** - 新增 database.js、file-ops.js、stream.js 模块
- **类型支持** - 文件类型识别和 MIME 类型映射

### 移除
- **Markdown 存储** - 不再生成 nas_scan.md 文件
- **storage.js 依赖** - server.js 不再依赖 storage 模块
- **/api/content/scan API** - 移除 Markdown 内容读取 API
- **outputFile 配置项** - 配置中不再需要指定输出文件

### 界面改进
- **现代化 UI** - 全新的视觉设计
- **响应式布局** - 支持移动端访问
- **状态栏** - 顶部显示文件总数和大小

---

## [v1.0.1] - 2026-04-10

### 新增功能
- **统一存储模块** - storage.js 模块管理所有数据
- **本地分类** - 基于文件扩展名自动分类
- **统计饼图** - Chart.js 展示文件类型分布
- **统计 API** - `/api/statistics` 提供统计数据
- **表格格式** - Markdown 输出改为表格结构

### 改进
- 合并本地分类和 LLM 分类到同一存储
- 配置迁移到 profiles 目录
- 优化扫描性能

---

## [v1.0.0] - 2026-04-01

### 核心功能
- **目录扫描** - 递归扫描指定路径
- **Markdown 输出** - 结构化文件列表
- **AI 分类** - 阿里云 qwen 模型智能分类
- **Web 搜索界面** - 浏览器访问，关键词搜索
- **定时扫描** - Cron 表达式配置
- **文件过滤** - 白名单/黑名单扩展名过滤
- **断点续传** - 分类过程支持中断恢复
- **增量分类** - 只处理变化部分