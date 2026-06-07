import re

with open('src/routes/games.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace import
old_import = "import { savePoster, deletePoster } from '../games/metadata-manager';"
new_import = "import { PosterService } from '../games/poster-service';"
content = content.replace(old_import, new_import)

# 2. Add getStoragePath to utils import
old_utils = "import { initDatabase, loadConfig, DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE, getGameScanPaths } from '../utils';"
new_utils = "import { initDatabase, loadConfig, getStoragePath, DEFAULT_GAME_RULES, DEFAULT_GAME_SCRAPE, getGameScanPaths } from '../utils';"
content = content.replace(old_utils, new_utils)

# 3. Replace savePoster call
old_save = "const posterPath: string = savePoster(game.source_path, type, req.file.buffer);"
new_save = "const config = loadConfig();\n    const storagePath = getStoragePath(config);\n    PosterService.saveFromFile(storagePath, game.id, type, req.file.buffer);"
content = content.replace(old_save, new_save)

# 4. Replace updatePosterPath
old_update = "gameDatabase.updatePosterPath(game.id, type, posterPath);"
new_update = "gameDatabase.updateGame(game.id, { has_local_poster: 1 });"
content = content.replace(old_update, new_update)

# 5. Replace response
old_response = "res.json({ success: true, data: { posterPath } });"
new_response = "res.json({ success: true });"
content = content.replace(old_response, new_response)

# 6. Replace deletePoster call
old_delete = "deletePoster(game.source_path, type);"
new_delete = "const config = loadConfig();\n    const storagePath = getStoragePath(config);\n    PosterService.deletePoster(storagePath, game.id, type);"
content = content.replace(old_delete, new_delete)

# 7. Replace updateGame after delete - use regex to handle template literal
content = re.sub(
    r'gameDatabase\.updateGame\(game\.id, \{ \[poster_\$\{type\}_path\]: undefined, has_local_poster: 0 \}\);',
    'gameDatabase.updateGame(game.id, { has_local_poster: 0 });',
    content
)

# 8. Remove writeLocalMetadata block - use regex
content = re.sub(
    r'// 如果有本地元数据.*?writeLocalMetadata\(game\.source_path, updatedGame\);\s*\}\s*\}\s*\}',
    '',
    content,
    flags=re.DOTALL
)

with open('src/routes/games.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('routes/games.ts modified successfully')
