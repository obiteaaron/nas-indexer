<template>
  <div class="settings">
    <!-- Toast Notification -->
    <Transition name="toast">
      <div v-if="showToast" class="toast-notification">
        {{ toastMessage }}
      </div>
    </Transition>

    <div class="settings-layout">
      <nav class="settings-sidebar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="settings-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <div class="settings-content">
        <!-- 扫描配置 -->
        <div v-show="activeTab === 'scan'" class="tab-panel">
          <div class="card">
            <h2 class="section-title">扫描配置</h2>

            <div class="form-group">
              <label>扫描路径</label>
              <p class="path-tip">
                添加扫描路径后，点击"扫描"按钮可单独扫描该路径；首页"立即扫描全部"会扫描所有配置路径
              </p>
              <div class="path-list">
                <div class="path-item" v-for="(p, i) in config.scanPaths" :key="i">
                  <span class="path-status-dot" :class="getPathStatusClass(p)" :title="getPathStatusTitle(p)"></span>
                  <input class="input" v-model="config.scanPaths[i]">
                  <button class="btn btn-primary btn-small" @click="scanPath(i)" :disabled="!config.scanPaths[i]">
                    扫描
                  </button>
                  <button class="btn btn-danger btn-small" @click="removePath(i)">删除</button>
                </div>
                <button class="btn btn-secondary btn-small" @click="addPath">添加路径</button>
                <button class="btn btn-warning btn-small" @click="handleCleanupStaleFiles" style="margin-left: 8px;">清理失效记录</button>
              </div>
            </div>

            <div class="form-group">
              <label>定时扫描 (Cron 表达式)</label>
              <input class="input" v-model="config.scanTime" placeholder="0 2 * * *">
              <span class="hint">默认每天凌晨 2 点扫描</span>
            </div>

            <div class="form-group">
              <label>排除模式</label>
              <input class="input" v-model="excludePatternsStr" placeholder="node_modules, .git, .cache">
              <span class="hint">逗号分隔</span>
            </div>

            <div class="form-group">
              <label>白名单扩展名</label>
              <input class="input" v-model="whitelistStr" placeholder=".mp4, .mkv, .jpg">
              <span class="hint">留空则使用黑名单过滤</span>
            </div>

            <div class="form-group">
              <label>黑名单扩展名</label>
              <input class="input" v-model="blacklistStr" placeholder=".js, .ts, .log">
              <span class="hint">排除这些扩展名的文件</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="save" :disabled="saving">{{ saving ? '保存中...' : '保存配置' }}</button>
              <button class="btn btn-secondary" @click="reset">重置</button>
            </div>
          </div>
        </div>

        <!-- 分类规则 -->
        <div v-show="activeTab === 'category'" class="tab-panel">
          <div class="card">
            <h3 class="section-title">分类规则（按后缀）</h3>
            <p class="hint">根据文件后缀自动分类，每个分类对应一组扩展名</p>

            <div class="category-rules">
              <div class="category-item" v-for="(extensions, category) in localCategoryRules" :key="category">
                <div class="category-header">
                  <input class="input category-name" :value="category" @change="updateCategoryName(category, $event)" placeholder="分类名称">
                  <button class="btn btn-danger btn-small" @click="removeCategory(category)">删除分类</button>
                </div>
                <div class="extensions-list">
                  <span class="extension-tag" v-for="(ext, i) in extensions" :key="i">
                    {{ ext }}
                    <button class="remove-ext" @click="removeExtension(category, i)">×</button>
                  </span>
                  <input
                    class="input extension-input"
                    v-model="newExtensions[category]"
                    placeholder="添加扩展名，如 .mp4"
                    @keyup.enter="addExtension(category)"
                  >
                  <button class="btn btn-secondary btn-small" @click="addExtension(category)">添加</button>
                </div>
              </div>
              <div class="add-category">
                <input class="input" v-model="newCategoryName" placeholder="新分类名称">
                <button class="btn btn-secondary btn-small" @click="addCategory">添加分类</button>
              </div>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="applyCategoryRules">应用分类规则</button>
            </div>
          </div>

          <div class="card">
            <h3 class="section-title">目录分类规则（优先级更高）</h3>
            <p class="hint">根据文件所在目录路径前缀分类，优先级高于后缀规则</p>

            <div class="path-rules">
              <div class="path-rule-item" v-for="(rule, i) in localCategoryPathRules" :key="i">
                <input class="input path-prefix" v-model="rule.pathPrefix" placeholder="目录路径前缀，如 D:/NAS/Games">
                <select class="select category-select" v-model="rule.category">
                  <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                  <option value="其他">其他</option>
                </select>
                <button class="btn btn-danger btn-small" @click="removePathRule(i)">删除</button>
              </div>
              <button class="btn btn-secondary btn-small" @click="addPathRule">添加目录规则</button>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="applyPathRules">应用目录规则</button>
            </div>
          </div>
        </div>

        <!-- 偏好与显示 -->
        <div v-show="activeTab === 'display'" class="tab-panel">
          <div class="card">
            <h3 class="section-title">偏好分析</h3>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.trackingConfig!.trackingEnabled">
                启用行为追踪
              </label>
              <span class="hint">开启后将记录文件查看、预览、搜索等行为，用于生成个性化推荐</span>
            </div>

            <div class="form-group" v-if="config.trackingConfig?.trackingEnabled">
              <label>追踪级别</label>
              <select class="select" v-model="config.trackingConfig!.trackingLevel">
                <option value="minimal">基础（仅搜索记录）</option>
                <option value="full">完整（查看、预览、搜索、打标）</option>
              </select>
              <span class="hint">完整模式将记录更多行为数据，推荐结果更精准</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-danger btn-small" @click="clearPreferences">清除偏好数据</button>
              <span class="clear-tip">清除所有行为记录和推荐结果，不影响文件和标签</span>
            </div>
          </div>

          <div class="card">
            <h3 class="section-title">显示设置</h3>
            <div class="form-group">
              <label>缩略图加载大小限制</label>
              <div class="size-limit-input">
                <input class="input" type="number" v-model.number="config.thumbnailSizeLimit" min="0" step="1">
                <span class="size-unit">MB</span>
              </div>
              <span class="hint">文件大小超过此限制时不自动加载缩略图，设为 0 表示不限制。默认 5MB</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="save">保存显示设置</button>
            </div>
          </div>
        </div>

        <!-- 游戏模块 -->
        <div v-show="activeTab === 'games'" class="tab-panel">
          <div class="card">
            <h3 class="section-title">游戏模块</h3>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.gamesEnabled">
                启用游戏模块
              </label>
              <span class="hint">开启后将在扫描时识别游戏目录，并显示"游戏"导航入口</span>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label>扫描限制</label>
              <div class="rule-item">
                <label>最大递归深度</label>
                <input class="input small" type="number" v-model.number="config.gamesRules!.maxScanDepth" min="1" max="10">
                <span class="hint">未匹配规则时递归扫描的最大深度</span>
              </div>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label class="checkbox-label">
                <input type="checkbox" v-model="config.gameScanPathsEnabled">
                仅扫描指定路径
              </label>
              <span class="hint">开启后游戏模块只扫描下方配置的路径，关闭则沿用文件扫描路径。开启时文件扫描不再触发游戏识别，游戏识别仅在游戏页面手动触发</span>
              <div class="path-list" v-if="config.gameScanPathsEnabled" style="margin-top: 8px;">
                <div class="path-item" v-for="(p, i) in config.gameScanPaths" :key="i">
                  <input class="input" v-model="config.gameScanPaths![i]">
                  <button class="btn btn-danger btn-small" @click="removeGameScanPath(i)">删除</button>
                </div>
                <button class="btn btn-secondary btn-small" @click="addGameScanPath">添加路径</button>
              </div>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label>识别规则</label>
              <div class="game-rules-section">
                <div class="priority-group">
                  <span class="priority-label">识别优先级 1: 手动标记（P0）</span>
                  <span class="hint">手动添加或提升目录的游戏，自动标记为用户确认，跳过自动识别（最高优先级）</span>
                </div>

                <div class="priority-group">
                  <span class="priority-label">识别优先级 2: Steam锚点（P1）</span>
                  <span class="hint">自动向上查找 steam_appid.txt 文件定位游戏根目录</span>
                </div>

                <div class="priority-group">
                  <span class="priority-label">识别优先级 3: 启发式规则（P2）</span>
                  <span class="hint">基于exe目录名、标准子目录、目录大小等特征智能判断</span>
                </div>

                <div class="priority-group">
                  <span class="priority-label">识别优先级 4: 正则规则匹配（P3）</span>
                </div>

                <div class="rule-item">
                  <label>黑名单路径</label>
                  <input class="input" v-model="gameBlacklistPatternsStr"
                         placeholder="$Recycle.Bin, System Volume Information, .git">
                  <span class="hint">包含这些关键词的路径跳过识别，逗号分隔</span>
                </div>

                <div class="rules-list">
                  <div class="rule-row" v-for="(rule, i) in config.gamesRules?.recognitionRules" :key="i">
                    <div class="rule-order">
                      <button class="btn btn-small order-btn" @click="moveRuleUp(i)" :disabled="i === 0" title="上移">↑</button>
                      <button class="btn btn-small order-btn" @click="moveRuleDown(i)" :disabled="i === (config.gamesRules?.recognitionRules?.length || 0) - 1" title="下移">↓</button>
                    </div>
                    <input class="input pattern-input" v-model="rule.pattern" placeholder="正则表达式">
                    <input class="input small offset-input" type="number" v-model.number="rule.levelOffset" min="0" max="5">
                    <span class="offset-label">层偏移</span>
                    <input type="checkbox" v-model="rule.enabled" class="rule-checkbox">
                    <input class="input small desc-input" v-model="rule.description" placeholder="说明">
                    <button class="btn btn-danger btn-small" @click="removeRecognitionRule(i)">删除</button>
                  </div>
                  <button class="btn btn-secondary btn-small" @click="addRecognitionRule">添加规则</button>
                </div>

                <span class="hint">
                  正则匹配完整路径（如 E:/Games/xxx）。想限制目录名可用 $ 结尾（如 [GOG]$）。
                  规则从上到下依次执行，首个匹配生效。层偏移：0=匹配目录本身，1=父目录
                </span>
              </div>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label>刮削设置</label>
              <label class="checkbox-label sub-checkbox">
                <input type="checkbox" v-model="config.gamesScrape!.autoScrape">
                扫描后自动刮削元数据
              </label>
              <label class="checkbox-label sub-checkbox">
                <input type="checkbox" v-model="config.gamesScrape!.downloadPosters">
                下载海报到本地
              </label>
              <span class="hint">刮削将从 Steam Store 获取游戏元数据和海报</span>
            </div>

            <div class="form-group" v-if="config.gamesEnabled">
              <label>HTTP 代理</label>
              <input class="input" v-model="config.proxyUrl" placeholder="http://127.0.0.1:7890">
              <span class="hint">用于 Steam API 列削的代理地址，留空则直连</span>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="save">保存游戏设置</button>
            </div>

            <div class="game-doc-section" v-if="config.gamesEnabled">
              <h4 class="doc-title" @click="showGameDoc = !showGameDoc">
                📖 游戏识别优先级说明
                <span class="doc-toggle">{{ showGameDoc ? '收起' : '展开' }}</span>
              </h4>
              <div v-if="showGameDoc" class="doc-content">
                <p class="doc-desc">系统采用四级优先级识别游戏根目录，手动操作优先级最高：</p>

                <h5>优先级说明</h5>
                <table class="doc-table">
                  <thead>
                    <tr><th>优先级</th><th>方法</th><th>说明</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>P0</strong></td>
                      <td>手动标记</td>
                      <td>手动添加或提升目录时自动标记，跳过自动识别（最高优先级）</td>
                    </tr>
                    <tr>
                      <td><strong>P1</strong></td>
                      <td>Steam锚点</td>
                      <td>自动向上查找 <code>steam_appid.txt</code> 文件定位根目录</td>
                    </tr>
                    <tr>
                      <td><strong>P2</strong></td>
                      <td>启发式规则</td>
                      <td>基于exe目录名匹配、标准子目录结构、目录大小等智能判断</td>
                    </tr>
                    <tr>
                      <td><strong>P3</strong></td>
                      <td>正则规则</td>
                      <td>匹配自定义正则规则，配合 levelOffset 向上提升（兜底方案）</td>
                    </tr>
                  </tbody>
                </table>

                <h5>启发式规则详情（P2）</h5>
                <table class="doc-table">
                  <thead>
                    <tr><th>规则</th><th>触发条件</th><th>处理方式</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>exe目录名匹配</td>
                      <td>exe文件名与所在目录名相同（如 <code>Game/Game.exe</code>）</td>
                      <td>向上提升到父目录</td>
                    </tr>
                    <tr>
                      <td>标准子目录</td>
                      <td>exe位于标准子目录（如 <code>Binaries</code>、<code>Win32</code>）</td>
                      <td>向上提升指定的层级偏移</td>
                    </tr>
                    <tr>
                      <td>目录大小启发</td>
                      <td>exe所在目录过小（&lt;100MB），父目录明显更大（&gt;5倍）</td>
                      <td>使用父目录作为根目录</td>
                    </tr>
                  </tbody>
                </table>

                <h5>海报存储位置</h5>
                <p class="doc-desc">游戏海报集中存储在 <code>profiles/games/posters/{game_id}/</code> 目录：</p>
                <ul class="doc-list">
                  <li><code>horizontal.jpg</code> — 横版海报（主要展示用）</li>
                  <li><code>vertical.jpg</code> — 竖版海报</li>
                  <li><code>banner.jpg</code> — 横幅海报</li>
                  <li><code>background.jpg</code> — 背景图</li>
                </ul>
                <p class="doc-desc hint">海报可通过刮削自动获取，也可在游戏详情页手动上传</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Steam 数据库 -->
        <div v-show="activeTab === 'steam-db'" class="tab-panel">
          <div class="card">
            <h3 class="section-title">Steam 数据库</h3>
            <p class="hint">管理 Steam AppID 与游戏名称映射，提升刮削成功率。游戏识别时会自动匹配中文名、英文名或别名。</p>

            <div class="steam-db-toolbar">
              <button class="btn btn-primary btn-small" @click="openAddSteamDbModal" :disabled="!config.gamesEnabled">
                添加记录
              </button>
              <button class="btn btn-secondary btn-small" @click="showImportModal = true">
                导入 JSON
              </button>
              <button class="btn btn-secondary btn-small" @click="handleExportSteamDb" :disabled="steamDbTotal === 0">
                导出 JSON
              </button>
            </div>

            <div class="steam-db-filter">
              <input class="input" v-model="steamDbSearch" placeholder="搜索 AppID 或名称" @keyup.enter="handleSteamDbSearch">
              <button class="btn btn-secondary btn-small" @click="handleSteamDbSearch">搜索</button>
              <span class="steam-db-count">共 {{ steamDbTotal }} 条记录</span>
            </div>

            <div class="steam-db-table" v-if="steamDbEntries.length">
              <div class="steam-db-row steam-db-header-row">
                <span class="steam-db-col-appid">AppID</span>
                <span class="steam-db-col-name">中文名</span>
                <span class="steam-db-col-name-en">英文名</span>
                <span class="steam-db-col-aliases">别名</span>
                <span class="steam-db-col-actions">操作</span>
              </div>
              <div class="steam-db-row" v-for="entry in steamDbEntries" :key="entry.id">
                <span class="steam-db-col-appid">
                  <a :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
                    {{ entry.steam_appid }}
                  </a>
                </span>
                <span class="steam-db-col-name">
                  <a :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
                    {{ entry.name }}
                  </a>
                </span>
                <span class="steam-db-col-name-en">
                  <a v-if="entry.name_en" :href="`https://store.steampowered.com/app/${entry.steam_appid}`" target="_blank" class="steam-link">
                    {{ entry.name_en }}
                  </a>
                </span>
                <span class="steam-db-col-aliases">
                  <span class="alias-tag" v-for="(alias, i) in (entry.aliases || []).slice(0, 3)" :key="i">{{ alias }}</span>
                  <span class="alias-more" v-if="(entry.aliases || []).length > 3">+{{ entry.aliases.length - 3 }}</span>
                </span>
                <span class="steam-db-col-actions">
                  <button class="btn btn-secondary btn-small" @click="editSteamDbEntry(entry)">编辑</button>
                  <button class="btn btn-danger btn-small" @click="deleteSteamDbEntryConfirm(entry)">删除</button>
                </span>
              </div>
            </div>
            <div class="steam-db-empty" v-else>
              <p>暂无数据，请添加记录或导入 JSON</p>
            </div>

            <div class="steam-db-pagination" v-if="steamDbTotalPages > 1">
              <button class="btn btn-secondary btn-small" @click="steamDbPage--" :disabled="steamDbPage === 1">上一页</button>
              <span class="pagination-info">第 {{ steamDbPage }} / {{ steamDbTotalPages }} 页</span>
              <button class="btn btn-secondary btn-small" @click="steamDbPage++" :disabled="steamDbPage >= steamDbTotalPages">下一页</button>
            </div>
          </div>
        </div>

        <!-- 系统状态 -->
        <div v-show="activeTab === 'status'" class="tab-panel">
          <div class="card">
            <h3 class="section-title">状态信息</h3>
            <div class="status-info" v-if="status">
              <p><strong>存储目录：</strong>{{ status.storagePath }}</p>
              <p><strong>定时扫描：</strong>{{ status.scheduled ? '已启用' : '未启用' }}</p>
              <p><strong>总文件数：</strong>{{ status.totalFiles }}</p>
              <p><strong>总大小：</strong>{{ status.totalSize }}</p>
            </div>
          </div>

          <div class="card">
            <h3 class="section-title">NAS 连接状态</h3>
            <div class="path-status-actions">
              <button class="btn btn-primary" @click="checkPathsStatus" :disabled="checkingPaths">
                {{ checkingPaths ? '检测中...' : '检测所有路径' }}
              </button>
            </div>
            <div class="path-status-list" v-if="pathStatuses.length">
              <div class="path-status-item" v-for="(ps, i) in pathStatuses" :key="i" :class="{ 'path-error': !ps.isAccessible }">
                <div class="path-status-header">
                  <span class="path-status-icon">{{ ps.isAccessible ? '✅' : '❌' }}</span>
                  <span class="path-status-path" :title="ps.path">{{ ps.path }}</span>
                </div>
                <div class="path-status-details">
                  <span v-if="ps.isAccessible">文件数: {{ ps.fileCount }} | 延迟: {{ ps.latency }}ms</span>
                  <span v-else class="path-error-msg">{{ ps.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Steam DB 添加/编辑模态框 -->
    <div class="modal-overlay" v-if="showSteamDbModal" @click.self="closeSteamDbModal">
      <div class="modal-content steam-db-modal">
        <div class="modal-header">
          <h3>{{ editingSteamDb ? '编辑 Steam DB 记录' : '添加 Steam DB 记录' }}</h3>
          <button class="modal-close" @click="closeSteamDbModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">Steam AppID <span class="required">*</span></label>
            <input class="input" v-model="steamDbForm.steam_appid" placeholder="如 1234560" />
          </div>
          <div class="form-row">
            <label class="form-label">中文名 <span class="required">*</span></label>
            <input class="input" v-model="steamDbForm.name" placeholder="如 艾尔登法环" />
          </div>
          <div class="form-row">
            <label class="form-label">英文名</label>
            <input class="input" v-model="steamDbForm.name_en" placeholder="如 Elden Ring" />
          </div>
          <div class="form-row">
            <label class="form-label">别名</label>
            <input class="input" v-model="steamDbForm.aliasesStr" placeholder="逗号分隔，如 ER,eldenring" />
            <span class="hint">多个别名用逗号分隔</span>
          </div>
          <div class="form-row">
            <label class="form-label">备注</label>
            <input class="input" v-model="steamDbForm.notes" placeholder="可选备注" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeSteamDbModal">取消</button>
          <button class="btn btn-primary" @click="saveSteamDbEntry" :disabled="savingSteamDb">
            {{ savingSteamDb ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Steam DB 导入模态框 -->
    <div class="modal-overlay" v-if="showImportModal" @click.self="showImportModal = false">
      <div class="modal-content import-modal">
        <div class="modal-header">
          <h3>导入 Steam DB</h3>
          <button class="modal-close" @click="showImportModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">JSON 内容</label>
            <textarea class="textarea" v-model="importJsonStr" placeholder="粘贴 JSON 数组，格式：[{steam_appid, name, name_en, aliases}]"></textarea>
          </div>
          <div class="form-row">
            <label class="form-label">导入模式</label>
            <select class="select" v-model="importMode">
              <option value="merge">合并（跳过已存在的 AppID）</option>
              <option value="overwrite">覆盖（更新已存在的 AppID）</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showImportModal = false">取消</button>
          <button class="btn btn-primary" @click="handleImportSteamDb" :disabled="importing">
            {{ importing ? '导入中...' : '导入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { getConfig, saveConfig, getStatus, scanSinglePath, clearPreferencesData, checkAllPaths, cleanupStaleFiles,
  getSteamDbEntries, createSteamDbEntry, updateSteamDbEntry, deleteSteamDbEntry, exportSteamDb, importSteamDb } from '../api'
import type { Config, StatusResponse, PathStatus, CategoryRule, CategoryPathRule, GameRules, GameScrapeConfig, GameRecognitionRule, HeuristicRulesConfig, SteamDbEntry, SteamDbListResponse } from '../types'

const DEFAULT_RECOGNITION_RULES: GameRecognitionRule[] = [
  { pattern: '\\[GOG\\]$',           levelOffset: 0, enabled: true, description: 'GOG 版游戏（目录名结尾）' },
  { pattern: '\\[Steam\\]$',         levelOffset: 0, enabled: true, description: 'Steam 版游戏（目录名结尾）' },
  { pattern: '\\[CRACK\\]$',         levelOffset: 0, enabled: true, description: '破解版游戏（目录名结尾）' },
  { pattern: 'FitGirl.*Repack$',     levelOffset: 1, enabled: true, description: 'FitGirl 压缩包 → 父目录' },
  { pattern: '/steamapps/',          levelOffset: 0, enabled: true, description: 'Steam 游戏库目录' },
  { pattern: '/games/',              levelOffset: 0, enabled: true, description: '通用游戏目录名' },
]

const DEFAULT_HEURISTIC_RULES: HeuristicRulesConfig = {
  exeNameMatchEnabled: true,
  exeNameMatchOffset: 1,
  subdirRulesEnabled: true,
  subdirPatterns: [
    { patterns: ['Binaries', 'Binary', 'Bin', 'Win32', 'Win64'], offset: 1, description: '可执行文件标准子目录' },
    { patterns: ['Redist', 'Support', 'Common'], offset: 1, description: 'redistributable/support目录' },
    { patterns: ['Data', 'Assets', 'Resources'], offset: 0, description: '数据/资源目录（通常就是根目录）' }
  ],
  sizeHeuristicEnabled: true,
  sizeThresholdMB: 100,
  sizeRatioThreshold: 5
}

const DEFAULT_GAME_RULES: GameRules = {
  recognitionRules: DEFAULT_RECOGNITION_RULES,
  heuristicRules: DEFAULT_HEURISTIC_RULES,
  blacklistPatterns: ['$Recycle.Bin', 'System Volume Information', '.git', 'node_modules', '__pycache__'],
  maxScanDepth: 3
}

const DEFAULT_GAME_SCRAPE: GameScrapeConfig = {
  autoScrape: true,
  downloadPosters: true,
  scrapeOnIdentify: true
}

const config = ref<Config>({
  storagePath: '',
  scanPaths: [],
  scanTime: '0 2 * * *',
  excludePatterns: [],
  fileExtensionFilter: { whitelist: [], blacklist: [] },
  categoryRules: {},
  categoryPathRules: [],
  trackingConfig: { trackingEnabled: true, trackingLevel: 'full' },
  thumbnailSizeLimit: 5,
  gamesEnabled: false,
  gameScanPathsEnabled: false,
  gameScanPaths: [],
  gamesRules: DEFAULT_GAME_RULES,
  gamesScrape: DEFAULT_GAME_SCRAPE
})
const status = ref<StatusResponse | null>(null)
const saving = ref(false)
const checkingPaths = ref(false)
const pathStatuses = ref<PathStatus[]>([])
const showGameDoc = ref(false)

// Toast 提示
const showToast = ref(false)
const toastMessage = ref('')
let toastTimeout: ReturnType<typeof setTimeout> | null = null

function showNotification(message: string): void {
  toastMessage.value = message
  showToast.value = true
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    showToast.value = false
  }, 2000)
}

// Steam DB 相关
const steamDbEntries = ref<SteamDbEntry[]>([])
const steamDbSearch = ref('')
const steamDbTotal = ref(0)
const steamDbPage = ref(1)
const steamDbPageSize = ref(20)
const steamDbTotalPages = ref(0)
const showSteamDbModal = ref(false)
const showImportModal = ref(false)
const editingSteamDb = ref<SteamDbEntry | null>(null)
const savingSteamDb = ref(false)
const importing = ref(false)
const importJsonStr = ref('')
const importMode = ref<'merge' | 'overwrite'>('merge')
const steamDbForm = ref({
  steam_appid: '',
  name: '',
  name_en: '',
  aliasesStr: '',
  notes: ''
})

const activeTab = ref('scan')
const tabs = [
  { key: 'scan', label: '扫描配置' },
  { key: 'category', label: '分类规则' },
  { key: 'display', label: '偏好与显示' },
  { key: 'games', label: '游戏模块' },
  { key: 'steam-db', label: 'Steam 数据库' },
  { key: 'status', label: '系统状态' },
]

const localCategoryRules = reactive<CategoryRule>({})
const localCategoryPathRules = ref<CategoryPathRule[]>([])
const newExtensions = reactive<Record<string, string>>({})
const newCategoryName = ref('')

const categories = computed(() => Object.keys(localCategoryRules))

const excludePatternsStr = computed({
  get: () => config.value.excludePatterns.join(', '),
  set: (v: string) => config.value.excludePatterns = v.split(',').map(s => s.trim()).filter(s => s)
})

const whitelistStr = computed({
  get: () => (config.value.fileExtensionFilter?.whitelist || []).join(', '),
  set: (v: string) => {
    if (!config.value.fileExtensionFilter) config.value.fileExtensionFilter = { whitelist: [], blacklist: [] }
    config.value.fileExtensionFilter.whitelist = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const blacklistStr = computed({
  get: () => (config.value.fileExtensionFilter?.blacklist || []).join(', '),
  set: (v: string) => {
    if (!config.value.fileExtensionFilter) config.value.fileExtensionFilter = { whitelist: [], blacklist: [] }
    config.value.fileExtensionFilter.blacklist = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

const gameBlacklistPatternsStr = computed({
  get: () => (config.value.gamesRules?.blacklistPatterns || []).join(', '),
  set: (v: string) => {
    if (!config.value.gamesRules) config.value.gamesRules = DEFAULT_GAME_RULES
    config.value.gamesRules.blacklistPatterns = v.split(',').map(s => s.trim()).filter(s => s)
  }
})

function addRecognitionRule(): void {
  if (!config.value.gamesRules) {
    config.value.gamesRules = {
      recognitionRules: [...DEFAULT_RECOGNITION_RULES],
      heuristicRules: DEFAULT_HEURISTIC_RULES,
      blacklistPatterns: [...DEFAULT_GAME_RULES.blacklistPatterns],
      maxScanDepth: DEFAULT_GAME_RULES.maxScanDepth
    }
  }
  config.value.gamesRules.recognitionRules.push({
    pattern: '',
    levelOffset: 0,
    enabled: true,
    description: ''
  })
}

function removeRecognitionRule(index: number): void {
  config.value.gamesRules?.recognitionRules.splice(index, 1)
}

function moveRuleUp(index: number): void {
  if (index <= 0 || !config.value.gamesRules?.recognitionRules) return
  const rules = config.value.gamesRules.recognitionRules
  const temp = rules[index]
  rules[index] = rules[index - 1]
  rules[index - 1] = temp
}

function moveRuleDown(index: number): void {
  const rules = config.value.gamesRules?.recognitionRules
  if (!rules || index >= rules.length - 1) return
  const temp = rules[index]
  rules[index] = rules[index + 1]
  rules[index + 1] = temp
}

onMounted(async () => {
  await loadConfig()
  await loadStatus()
  await checkPathsStatus()
  await loadSteamDbEntries()
})

async function loadConfig(): Promise<void> {
  try {
    const res = await getConfig()
    if (res.success && res.data) {
      config.value = {
        ...res.data,
        fileExtensionFilter: res.data.fileExtensionFilter || { whitelist: [], blacklist: [] },
        categoryRules: res.data.categoryRules || {},
        categoryPathRules: res.data.categoryPathRules || [],
        trackingConfig: res.data.trackingConfig || { trackingEnabled: true, trackingLevel: 'full' },
        thumbnailSizeLimit: res.data.thumbnailSizeLimit ?? 5,
        gamesEnabled: res.data.gamesEnabled ?? false,
        gameScanPathsEnabled: res.data.gameScanPathsEnabled ?? false,
        gameScanPaths: res.data.gameScanPaths || [],
        gamesRules: {
          recognitionRules: res.data.gamesRules?.recognitionRules || DEFAULT_RECOGNITION_RULES,
          heuristicRules: {
            ...DEFAULT_HEURISTIC_RULES,
            ...(res.data.gamesRules?.heuristicRules || {})
          },
          blacklistPatterns: res.data.gamesRules?.blacklistPatterns || DEFAULT_GAME_RULES.blacklistPatterns,
          maxScanDepth: res.data.gamesRules?.maxScanDepth ?? DEFAULT_GAME_RULES.maxScanDepth
        },
        gamesScrape: res.data.gamesScrape || DEFAULT_GAME_SCRAPE
      }

      Object.keys(localCategoryRules).forEach(key => delete localCategoryRules[key])
      Object.assign(localCategoryRules, config.value.categoryRules || {})
      localCategoryPathRules.value = [...(config.value.categoryPathRules || [])]
    }
  } catch (err) {
    console.error('获取配置失败:', err)
  }
}

async function loadStatus(): Promise<void> {
  try {
    const res = await getStatus()
    if (res.success && res.data) {
      status.value = res.data
    }
  } catch (err) {
    console.error('获取状态失败:', err)
  }
}

function addPath(): void {
  config.value.scanPaths.push('')
}

function removePath(index: number): void {
  config.value.scanPaths.splice(index, 1)
}

function addGameScanPath(): void {
  if (!config.value.gameScanPaths) config.value.gameScanPaths = []
  config.value.gameScanPaths.push('')
}

function removeGameScanPath(index: number): void {
  config.value.gameScanPaths?.splice(index, 1)
}

async function handleCleanupStaleFiles(): Promise<void> {
  try {
    const res = await cleanupStaleFiles()
    if (res.success) {
      showNotification(`清理完成，已删除 ${res.data?.deletedCount ?? 0} 条失效记录`)
    } else {
      showNotification('清理失败：' + res.error)
    }
  } catch (err) {
    showNotification('清理失败：' + (err as Error).message)
  }
}

async function scanPath(index: number): Promise<void> {
  const path = config.value.scanPaths[index]
  if (!path) return

  try {
    const res = await scanSinglePath(path)
    if (!res.success) {
      showNotification('启动扫描失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('启动扫描失败：' + error.message)
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const res = await saveConfig(config.value)
    if (res.success) {
      showNotification('配置已保存')
      window.dispatchEvent(new Event('config-saved'))
      loadStatus()
    } else {
      showNotification('保存失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('保存失败：' + error.message)
  }
  saving.value = false
}

function reset(): void {
  loadConfig()
}

function addCategory(): void {
  if (!newCategoryName.value.trim()) return
  const name = newCategoryName.value.trim()
  if (localCategoryRules[name]) {
    showNotification('分类已存在')
    return
  }
  localCategoryRules[name] = []
  newExtensions[name] = ''
  newCategoryName.value = ''
}

function removeCategory(category: string): void {
  delete localCategoryRules[category]
  delete newExtensions[category]
}

function updateCategoryName(oldName: string, event: Event): void {
  const target = event.target as HTMLInputElement
  const newName = target.value.trim()
  if (!newName || newName === oldName) return
  if (localCategoryRules[newName]) {
    showNotification('分类名称已存在')
    target.value = oldName
    return
  }
  const extensions = localCategoryRules[oldName]
  delete localCategoryRules[oldName]
  localCategoryRules[newName] = extensions
  newExtensions[newName] = newExtensions[oldName] || ''
  delete newExtensions[oldName]
}

function addExtension(category: string): void {
  const ext = newExtensions[category]?.trim()
  if (!ext) return
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase()
  if (localCategoryRules[category].includes(normalizedExt)) {
    showNotification('扩展名已存在')
    return
  }
  localCategoryRules[category].push(normalizedExt)
  newExtensions[category] = ''
}

function removeExtension(category: string, index: number): void {
  localCategoryRules[category].splice(index, 1)
}

function addPathRule(): void {
  localCategoryPathRules.value.push({ pathPrefix: '', category: '其他' })
}

function removePathRule(index: number): void {
  localCategoryPathRules.value.splice(index, 1)
}

async function applyCategoryRules(): Promise<void> {
  config.value.categoryRules = { ...localCategoryRules }
  await save()
}

async function applyPathRules(): Promise<void> {
  config.value.categoryPathRules = [...localCategoryPathRules.value]
  await save()
}

async function clearPreferences(): Promise<void> {
  if (!confirm('确定要清除所有偏好数据吗？此操作不可恢复。')) return
  try {
    const res = await clearPreferencesData()
    if (res.success) {
      showNotification('偏好数据已清除')
    } else {
      showNotification('清除失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('清除失败：' + error.message)
  }
}

async function checkPathsStatus(): Promise<void> {
  checkingPaths.value = true
  try {
    const res = await checkAllPaths()
    if (res.success && res.data) {
      pathStatuses.value = res.data
    } else {
      showNotification('检测失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('检测失败：' + error.message)
  }
  checkingPaths.value = false
}

function getPathStatusClass(path: string): string {
  if (!path) return 'status-unknown'
  const ps = pathStatuses.value.find(p => p.path === path)
  if (!ps) return 'status-unknown'
  return ps.isAccessible ? 'status-ok' : 'status-error'
}

function getPathStatusTitle(path: string): string {
  if (!path) return '未配置'
  const ps = pathStatuses.value.find(p => p.path === path)
  if (!ps) return '未检测'
  if (ps.isAccessible) return `可达 - 文件数: ${ps.fileCount}, 延迟: ${ps.latency}ms`
  return `不可达 - ${ps.error}`
}

// === Steam DB 方法 ===

function handleSteamDbSearch(): void {
  steamDbPage.value = 1
  loadSteamDbEntries()
}

async function loadSteamDbEntries(): Promise<void> {
  try {
    const res = await getSteamDbEntries({
      search: steamDbSearch.value,
      page: steamDbPage.value,
      pageSize: steamDbPageSize.value
    })
    if (res.success && res.data) {
      steamDbEntries.value = res.data.entries
      steamDbTotal.value = res.data.total
      steamDbTotalPages.value = res.data.totalPages
    }
  } catch (err) {
    console.error('加载 Steam DB 失败:', err)
  }
}

// 监听页码变化
watch(steamDbPage, () => {
  loadSteamDbEntries()
})

function openAddSteamDbModal(): void {
  editingSteamDb.value = null
  steamDbForm.value = { steam_appid: '', name: '', name_en: '', aliasesStr: '', notes: '' }
  showSteamDbModal.value = true
}

function editSteamDbEntry(entry: SteamDbEntry): void {
  editingSteamDb.value = entry
  steamDbForm.value = {
    steam_appid: entry.steam_appid,
    name: entry.name,
    name_en: entry.name_en || '',
    aliasesStr: entry.aliases?.join(', ') || '',
    notes: entry.notes || ''
  }
  showSteamDbModal.value = true
}

function closeSteamDbModal(): void {
  showSteamDbModal.value = false
  editingSteamDb.value = null
  steamDbForm.value = { steam_appid: '', name: '', name_en: '', aliasesStr: '', notes: '' }
}

async function saveSteamDbEntry(): Promise<void> {
  if (!steamDbForm.value.steam_appid.trim() || !steamDbForm.value.name.trim()) {
    showNotification('AppID 和中文名为必填项')
    return
  }

  savingSteamDb.value = true
  try {
    const data = {
      steam_appid: steamDbForm.value.steam_appid.trim(),
      name: steamDbForm.value.name.trim(),
      name_en: steamDbForm.value.name_en.trim() || undefined,
      aliases: steamDbForm.value.aliasesStr.split(',').map(s => s.trim()).filter(s => s),
      notes: steamDbForm.value.notes.trim() || undefined
    }

    let res
    if (editingSteamDb.value && editingSteamDb.value.id) {
      res = await updateSteamDbEntry(editingSteamDb.value.id, data)
    } else {
      res = await createSteamDbEntry(data)
    }

    if (res.success) {
      closeSteamDbModal()
      await loadSteamDbEntries()
      showNotification(editingSteamDb.value ? '记录已更新' : '记录已添加')
    } else {
      showNotification('保存失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('保存失败：' + error.message)
  }
  savingSteamDb.value = false
}

async function deleteSteamDbEntryConfirm(entry: SteamDbEntry): Promise<void> {
  if (!confirm(`确定删除 AppID ${entry.steam_appid} (${entry.name})？`)) return
  if (!entry.id) return

  try {
    const res = await deleteSteamDbEntry(entry.id)
    if (res.success) {
      await loadSteamDbEntries()
      showNotification('记录已删除')
    } else {
      showNotification('删除失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('删除失败：' + error.message)
  }
}

async function handleExportSteamDb(): Promise<void> {
  try {
    const res = await exportSteamDb()
    if (res.success && res.data) {
      const json = JSON.stringify(res.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'steam-db-export.json'
      a.click()
      URL.revokeObjectURL(url)
      showNotification('导出成功')
    } else {
      showNotification('导出失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('导出失败：' + error.message)
  }
}

async function handleImportSteamDb(): Promise<void> {
  if (!importJsonStr.value.trim()) {
    showNotification('请输入 JSON 内容')
    return
  }

  importing.value = true
  try {
    const entries = JSON.parse(importJsonStr.value) as SteamDbEntry[]
    if (!Array.isArray(entries)) {
      showNotification('JSON 格式错误，应为数组')
      importing.value = false
      return
    }

    const res = await importSteamDb(entries, importMode.value)
    if (res.success && res.data) {
      showImportModal.value = false
      importJsonStr.value = ''
      await loadSteamDbEntries()
      showNotification(`导入完成：新增 ${res.data.added}，更新 ${res.data.updated}，跳过 ${res.data.skipped}`)
    } else {
      showNotification('导入失败：' + res.error)
    }
  } catch (err) {
    const error = err as Error
    showNotification('导入失败：' + error.message)
  }
  importing.value = false
}
</script>

<style scoped>
.settings-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
  flex-shrink: 0;
  position: sticky;
  top: 84px;
}

.settings-tab {
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  text-align: left;
  transition: all 0.2s;
}

.settings-tab:hover {
  color: var(--text);
  background: var(--bg-secondary);
}

.settings-tab.active {
  color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
  font-weight: 500;
}

.settings-content {
  flex: 1;
  min-width: 0;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-group .hint {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 13px;
}

.path-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 13px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-item input {
  flex: 1;
}

.path-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.path-status-dot.status-unknown {
  background: #9ca3af;
}

.path-status-dot.status-ok {
  background: #22c55e;
}

.path-status-dot.status-error {
  background: #ef4444;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.status-info p {
  margin-bottom: 8px;
  color: var(--text);
}

.status-info strong {
  color: var(--text-muted);
}

.category-rules {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.category-header {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.category-name {
  width: 150px;
}

.extensions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.extension-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 13px;
}

.remove-ext {
  margin-left: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.remove-ext:hover {
  color: var(--danger);
}

.extension-input {
  width: 120px;
}

.add-category {
  display: flex;
  gap: 8px;
}

.add-category .input {
  width: 150px;
}

.path-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-rule-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-prefix {
  flex: 1;
}

.category-select {
  width: 120px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.sub-checkbox {
  margin-top: 8px;
  font-size: 14px;
}

.clear-tip {
  margin-left: 8px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 32px;
}

.path-status-actions {
  margin-bottom: 16px;
}

.path-status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-status-item {
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.path-status-item.path-error {
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.05);
}

.path-status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.path-status-icon {
  font-size: 16px;
}

.path-status-path {
  font-weight: 500;
  word-break: break-all;
}

.path-status-details {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: 24px;
}

.path-error-msg {
  color: var(--danger);
}

.size-limit-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-limit-input .input {
  width: 120px;
}

.size-unit {
  color: var(--text-muted);
  font-size: 14px;
}

.game-rules-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.rule-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 0;
}

.rule-item .hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 0;
}

.priority-group {
  padding: 8px 0 4px;
  border-top: 1px solid var(--border);
}

.priority-group:first-child {
  border-top: none;
  padding-top: 0;
}

.priority-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 2px;
}

.game-doc-section {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.doc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}

.doc-title:hover {
  color: var(--accent);
}

.doc-toggle {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.doc-content {
  margin-top: 12px;
}

.doc-content h5 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 16px 0 8px;
}

.doc-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 8px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin: 8px 0;
}

.doc-table th,
.doc-table td {
  padding: 6px 10px;
  text-align: left;
  border: 1px solid var(--border);
}

.doc-table th {
  background: var(--bg);
  font-weight: 600;
  color: var(--text);
}

.doc-table td {
  color: var(--text-secondary);
}

.doc-table code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--accent);
}

.doc-code {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  color: var(--text);
  margin: 8px 0;
}

.doc-list {
  font-size: 13px;
  color: var(--text-secondary);
  padding-left: 20px;
  line-height: 1.8;
}

.doc-list code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--accent);
}

.doc-content code {
  background: var(--bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--accent);
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.rule-row .pattern-input {
  flex: 1;
}

.rule-row .offset-input {
  width: 50px;
}

.rule-row .offset-label {
  font-size: 12px;
  color: var(--text-muted);
}

.rule-row .rule-checkbox {
  width: 16px;
  height: 16px;
}

.rule-row .desc-input {
  width: 100px;
}

.rule-order {
  display: flex;
  gap: 2px;
}

.order-btn {
  padding: 2px 6px;
  font-size: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.order-btn:hover:not(:disabled) {
  background: var(--bg);
  color: var(--text);
}

.order-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 0;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.modal-close {
  cursor: pointer;
  font-size: 18px;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: 4px;
}

.modal-close:hover {
  color: var(--text);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

/* Steam DB 样式 */
.steam-db-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.steam-db-filter {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.steam-db-filter .input {
  flex: 1;
  max-width: 300px;
}

.steam-db-count {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: 8px;
}

.steam-db-table {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.steam-db-row {
  display: flex;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  align-items: center;
  gap: 12px;
}

.steam-db-row:last-child {
  border-bottom: none;
}

.steam-db-header-row {
  background: var(--bg-secondary);
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
}

.steam-db-col-appid {
  min-width: 80px;
  font-size: 13px;
}

.steam-db-col-name {
  min-width: 120px;
  font-size: 13px;
}

.steam-db-col-name-en {
  min-width: 120px;
  font-size: 13px;
  color: var(--text-muted);
}

.steam-db-col-aliases {
  flex: 1;
  min-width: 150px;
  display: flex;
  gap: 4px;
  align-items: center;
}

.steam-db-col-actions {
  min-width: 120px;
  display: flex;
  gap: 8px;
}

.steam-link {
  color: var(--primary);
  text-decoration: none;
}

.steam-link:hover {
  text-decoration: underline;
}

.alias-tag {
  padding: 2px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.alias-more {
  font-size: 12px;
  color: var(--text-muted);
}

.steam-db-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
}

.steam-db-pagination {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 16px;
}

.pagination-info {
  font-size: 13px;
  color: var(--text-muted);
}

.steam-db-modal,
.import-modal {
  max-width: 500px;
}

.form-row {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.form-label .required {
  color: var(--danger);
}

.form-row .hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.textarea {
  width: 100%;
  min-height: 150px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

@media (max-width: 768px) {
  .settings-layout {
    flex-direction: column;
  }

  .settings-sidebar {
    flex-direction: row;
    min-width: 0;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    position: static;
    gap: 8px;
    padding-bottom: 4px;
  }

  .settings-tab {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 8px 14px;
    font-size: 13px;
  }
}

/* Toast Styles */
.toast-notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  color: var(--text);
  padding: 12px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  font-size: 14px;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>