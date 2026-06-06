import re

with open('src/games/database.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

output_lines = []
skip_next = 0

for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    
    # Skip poster path fields in UPDATE SQL
    if 'poster_horizontal_path = ?' in line:
        output_lines.append('            poster_url = ?, cover_url = ?, has_local_poster = ?,\n')
        skip_next = 1
        continue
    
    if 'poster_banner_path = ?' in line:
        skip_next = 1
        continue
    
    if 'metadata_path = ?' in line:
        continue
    
    # Skip poster path fields in allowedFields
    if "'poster_horizontal_path'" in line:
        output_lines.append("      'poster_url', 'cover_url', 'has_local_poster',\n")
        skip_next = 1
        continue
    
    if "'poster_banner_path'" in line:
        skip_next = 1
        continue
    
    if "'metadata_path'" in line:
        continue
    
    # Skip promoteGame poster path updates
    if 'poster_horizontal_path: newPosterPaths' in line:
        skip_next = 3
        continue
    
    if 'metadata_path: path.join' in line:
        continue
    
    # Skip createManualGame poster path columns
    if 'poster_horizontal_path, poster_vertical_path' in line:
        continue
    
    if 'poster_banner_path,' in line:
        continue
    
    if 'background_path, has_local_poster' in line:
        output_lines.append('            has_local_poster,\n')
        continue
    
    if 'metadata_source, metadata_path' in line:
        output_lines.append('            metadata_source\n')
        continue
    
    # Skip rowToGame poster path calculation
    if 'poster_horizontal_path' in line and 'if (game.poster_horizontal_path)' in line:
        output_lines.append('    // Poster paths are now derived from storage functions\n')
        output_lines.append('    // posterLocal is calculated dynamically when needed\n')
        skip_next = 5
        continue
    
    output_lines.append(line)

with open('src/games/database.ts', 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

print('Database cleaned')