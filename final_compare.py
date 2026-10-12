#!/usr/bin/env python3
"""Final corrected comparison."""

import json
import sqlite3
from urllib.parse import unquote

# Load Helium data
with open('helium_parsed.json', 'r') as f:
    helium = json.load(f)

# Rebuild Helium dedupe keys correctly
helium_keys = {}
for bm in helium['bookmarks']:
    url = bm['url'].lower().strip().rstrip('/')
    folder = bm['folder_path'].lower()
    key = f"{folder}|{url}"
    helium_keys[key] = bm

print(f"Total Helium bookmarks: {len(helium['bookmarks'])}")
print(f"Unique Helium dedupe keys: {len(helium_keys)}")

# Query MASTER database
conn = sqlite3.connect('src/website/data/bookmarx.db')
cursor = conn.cursor()

cursor.execute("SELECT id FROM users WHERE email = 'gas@gasdigital.co.uk'")
user_id = cursor.fetchone()[0]

cursor.execute("SELECT id FROM collections WHERE userId = ? AND isDefault = 1", (user_id,))
collection_id = cursor.fetchone()[0]

# Build master folder path map
cursor.execute('''
    SELECT masterId, title, masterParentId
    FROM folders
    WHERE userId = ? AND collectionId = ? AND status = 'active'
''', (user_id, collection_id))
folders = cursor.fetchall()
folder_map = {f[0]: {'title': f[1], 'parent': f[2]} for f in folders}

def build_path(master_id, folder_map, visited=None):
    if visited is None:
        visited = set()
    if master_id in visited or not master_id:
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

# Build master dedupe keys
cursor.execute('''
    SELECT b.url, b.title, b.masterParentId
    FROM bookmarks b
    WHERE b.userId = ? AND b.collectionId = ? AND b.status = 'active'
''', (user_id, collection_id))
master_bookmarks = cursor.fetchall()

master_keys = {}
for bm in master_bookmarks:
    url = bm[0].lower().strip().rstrip('/') if bm[0] else ''
    folder_path = build_path(bm[2], folder_map) if bm[2] else 'Bookmarks bar'
    key = f"{folder_path.lower()}|{url}"
    master_keys[key] = {'title': bm[1], 'url': bm[0], 'folder': folder_path}

conn.close()

print(f"Total Master bookmarks: {len(master_bookmarks)}")
print(f"Unique Master dedupe keys: {len(master_keys)}")

# Find duplicates
duplicates = []
new_bookmarks = []
for key, bm in helium_keys.items():
    if key in master_keys:
        duplicates.append({
            'helium': bm,
            'master': master_keys[key],
            'key': key
        })
    else:
        new_bookmarks.append(bm)

print(f"\n=== FINAL RESULTS ===")
print(f"EXACT DUPLICATES: {len(duplicates)}")
print(f"NEW BOOKMARKS: {len(new_bookmarks)}")

print(f"\n=== {len(duplicates)} DUPLICATE BOOKMARKS ===")
for dup in duplicates[:20]:
    print(f"  [{dup['helium']['folder_path']}] {dup['helium']['title']}")

print(f"\n=== {len(new_bookmarks)} NEW BOOKMARKS (sample) ===")
for bm in new_bookmarks[:15]:
    print(f"  [{bm['folder_path']}] {bm['title']}")
