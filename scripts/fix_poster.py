with open('src/routes/poster.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unused import
content = content.replace(
    'import { hasPoster, getPosterPath } from ../games/storage;',
    'import { hasPoster } from ../games/storage;'
)

# Fix type casting for req.params.type
content = content.replace(
    'const type = req.params.type as PosterType;',
    'const type = req.params.type as string as PosterType;'
)

with open('src/routes/poster.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed TypeScript errors')