#!/usr/bin/env python3
"""Debug the comparison to find why duplicates aren't being detected."""

import json
import sqlite3

# Load Helium data
with open('helium_parsed.json', 'r') as f:
    helium = json.load(f)

# Find TV Go in Helium
print('=== TV Go in HELIUM ===')
for bm in helium['bookmarks']:
    if 'tv' in bm['title'].lower() and 'go' in bm['title'].lower():
        print(f"  URL: {bm['url']}")
        print(f"  Title: {bm['title']}")
        print(f"  Folder: {bm['folder_path']}")
        print(f"  Dedupe key: {bm['dedupe_key']}")

# Find GasDigital in Helium
print('\n=== GasDigital folder in HELIUM ===')
for folder in helium['folders']:
    if 'gas' in folder['title'].lower():
        print(f"  Path: {folder['path']}")

# Query MASTER database
conn = sqlite3.connect('src/website/data/bookmarx.db')
cursor = conn.cursor()

# Get user ID
cursor.execute("SELECT id FROM users WHERE email = 'gas@gasdigital.co.uk'")
user_id = cursor.fetchone()[0]

# Get collection
cursor.execute("SELECT id FROM collections WHERE userId = ? AND isDefault = 1", (user_id,))
collection_id = cursor.fetchone()[0]

# Find TV Go in master
print('\n=== TV Go in MASTER (exact) ===')
cursor.execute('''
    SELECT b.url, b.title, f.title as folder 
    FROM bookmarks b 
    LEFT JOIN folders f ON b.masterParentId = f.masterId 
    WHERE b.userId = ? AND b.collectionId = ?
    AND (b.title LIKE '%TV Go%' OR b.url LIKE '%virgintvgo%')
''', (user_id, collection_id))
for row in cursor.fetchall():
    print(f"  URL: {row[0]}")
    print(f"  Title: {row[1]}")
    print(f"  Folder: {row[2]}")
    # Create dedupe key like we do in the comparison
    url = row[0].lower().strip().rstrip('/') if row[0] else ''
    folder = row[2] or 'Bookmarks bar'
    dedupe = f"{folder.lower()}|{url}"
    print(f"  Master dedupe key: {dedupe}")

# Check folder structure for GasDigital
print('\n=== GasDigital folder path in MASTER ===')
cursor.execute('''
    SELECT f.masterId, f.title, f.masterParentId, pf.title as parent_title
    FROM folders f
    LEFT JOIN folders pf ON f.masterParentId = pf.masterId
    WHERE f.userId = ? AND f.collectionId = ?
    AND f.title = 'GasDigital'
''', (user_id, collection_id))
for row in cursor.fetchall():
    print(f"  Folder: {row[1]}")
    print(f"  Parent: {row[3]} ({row[2]})")

# Get full folder paths in master
print('\n=== MASTER folder paths (sample) ===')
cursor.execute('''
    SELECT f.masterId, f.title, f.masterParentId
    FROM folders f
    WHERE f.userId = ? AND f.collectionId = ? AND f.status = 'active'
''', (user_id, collection_id))
folders = cursor.fetchall()
folder_map = {f[0]: {'title': f[1], 'parent': f[2]} for f in folders}

def build_path(master_id, folder_map, visited=None):
    if visited is None:
        visited = set()
    if master_id in visited:
        return ""
    visited.add(master_id)
    
    if master_id not in folder_map:
        return ""
    
    title = folder_map[master_id]['title']
    parent = folder_map[master_id]['parent']
    
    if parent and parent in folder_map:
        parent_path = build_path(parent, folder_map, visited)
        if parent_path:
            return f"{parent_path}/{title}"
    return title

for f in folders[:20]:
    path = build_path(f[0], folder_map)
    if 'gas' in path.lower() or 'bookmark' in path.lower():
        print(f"  {path}")

conn.close()

# Compare dedupe keys
print('\n=== COMPARING DEDUPE KEYS ===')
helium_tvgo = None
master_tvgo = None

for bm in helium['bookmarks']:
    if 'tv' in bm['title'].lower() and 'go' in bm['title'].lower():
        helium_tvgo = bm['dedupe_key']
        print(f"Helium TV Go key: {helium_tvgo}")
        break

# Reconstruct master key
master_url = 'https://virgintvgo.virginmedia.com/en.html'.lower().rstrip('/')
master_folder = 'Bookmarks Bar'.lower()
master_key = f"{master_folder}|{master_url}"
print(f"Master TV Go key:  {master_key}")

if helium_tvgo == master_key:
    print("MATCH! They are the same.")
else:
    print("NO MATCH - Keys are different!")
    print(f"  Helium folder: '{helium_tvgo.split('|')[0]}'")
    print(f"  Master folder: '{master_key.split('|')[0]}'")
