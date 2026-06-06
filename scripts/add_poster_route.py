with open('src/server.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with gamesRouter import
for i, line in enumerate(lines):
    if 'import gamesRouter from ./routes/games;' in line:
        lines.insert(i + 1, 'import posterRouter from ./routes/poster;\n')
        break

# Find the line with gamesRouter mount
for i, line in enumerate(lines):
    if 'app.use(/api/games, gamesRouter);' in line:
        lines.insert(i + 1, 'app.use(/api/games/poster, posterRouter);\n')
        break

with open('src/server.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Poster routes added')