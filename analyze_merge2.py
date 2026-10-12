#!/usr/bin/env python3
"""Analyze Helium bookmarks against master collection to predict merge outcome."""

from html.parser import HTMLParser
import json
import sqlite3
from urllib.parse import unquote, urlparse
import re

class BookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.folders = []
        self.bookmarks = []
        self.folder_stack = []
        self.current_dl_depth = 0
        self.in_h3 = False
        self.in_a = False
        self.current_folder_title = None
        self.current_href = None
        self.current_title = None
        self.folder_id_counter = 1
        self.pending_folder = None
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == 'h3':
            self.in_h3 = True
            self.current_folder_title = ""
        elif tag == 'a':
            self.in_a = True
            self.current_href = attrs_dict.get('href', '')
            self.current_title = ""
        elif tag == 'dl':
            self.current_dl_depth += 1
            # If we have a pending folder, push it to stack when we enter its DL
            if self.pending_folder:
                self.folder_stack.append(self.pending_folder)
                self.pending_folder = None
        elif tag == 'dt':
            pass
            
    def handle_endtag(self, tag):
        if tag == 'h3':
            self.in_h3 = False
            if self.current_folder_title:
                folder_id = f"folder_{self.folder_id_counter}"
                self.folder_id_counter += 1
                
                # Build path from stack + current
                path_parts = self.folder_stack + [self.current_folder_title]
                path = "/".join(path_parts)
                
                parent = self.folder_stack[-1] if self.folder_stack else "Bookmarks bar"
                
                folder_info = {
                    'id': folder_id,
                    'title': self.current_folder_title,
                    'parent': parent,
                    'path': path
                }
                self.folders.append(folder_info)
                
                # Set as pending - will be pushed when we encounter its DL
                self.pending_folder = self.current_folder_title
                
        elif tag == 'a':
            self.in_a = False
            if self.current_href and self.current_title:
                # Normalize URL
                url = unquote(self.current_href).lower().strip()
                url = url.rstrip('/')
                # Remove fragment for dedupe (optional - some sites use fragments for routing)
                # url = url.split('#')[0]
                
                folder_path = "/".join(self.folder_stack) if self.folder_stack else "Bookmarks bar"
                
                self.bookmarks.append({
                    'url': url,
                    'original_url': self.current_href,
                    'title': self.current_title,
                    'folder_path': folder_path,
                    'dedupe_key': f"{folder_path.lower()}|{url}"
                })
                
        elif tag == 'dl':
            self.current_dl_depth -= 1
            # Pop folder from stack when exiting DL
            if self.folder_stack and self.current_dl_depth < len(self.folder_stack):
                self.folder_stack.pop()
                
    def handle_data(self, data):
        if self.in_h3:
            self.current_folder_title += data.strip()
        elif self.in_a:
            self.current_title += data.strip()

# Parse Helium HTML
print("Parsing helium.html...")
with open('helium.html', 'r', encoding='utf-8') as f:
    html = f.read()

parser = BookmarkParser()
parser.feed(html)

print(f"\n=== HELIUM STRUCTURE ===")
print(f"Total Folders: {len(parser.folders)}")
print(f"Total Bookmarks: {len(parser.bookmarks)}")

# Show folder tree
print("\n=== FOLDER TREE ===")
for folder in parser.folders[:50]:
    print(f"  {folder['path']}")
if len(parser.folders) > 50:
    print(f"  ... and {len(parser.folders) - 50} more")

# Show sample bookmarks
print("\n=== FIRST 20 BOOKMARKS ===")
for bm in parser.bookmarks[:20]:
    print(f"  [{bm['folder_path']}] {bm['title'][:40]:<40} | {bm['url'][:60]}...")

# Save parsed data
with open('helium_parsed.json', 'w') as f:
    json.dump({
        'folders': parser.folders,
        'bookmarks': parser.bookmarks
    }, f, indent=2)

print(f"\n\nSaved parsed data to helium_parsed.json")
print(f"Unique URLs in Helium: {len(set(bm['url'] for bm in parser.bookmarks))}")

# Now query the database
print("\n\n=== QUERYING DATABASE ===")
conn = sqlite3.connect('src/website/data/bookmarx.db')
cursor = conn.cursor()

# Get user's collection ID (assuming gas@gasdigital.co.uk)
cursor.execute("""
    SELECT c.id, u.id as user_id 
    FROM collections c 
    JOIN users u ON c.userId = u.id 
    WHERE u.email = 'gas@gasdigital.co.uk'
""")
result = cursor.fetchone()
if result:
    collection_id, user_id = result
    print(f"Found collection: {collection_id} for user {user_id}")
else:
    print("User not found, trying default collection...")
    cursor.execute("SELECT id, userId FROM collections WHERE isDefault = 1 LIMIT 1")
    result = cursor.fetchone()
    if result:
        collection_id, user_id = result
        print(f"Using default collection: {collection_id}")
    else:
        print("ERROR: No collection found!")
        exit(1)

# Get current folders
cursor.execute("""
    SELECT masterId, title, masterParentId 
    FROM folders 
    WHERE userId = ? AND collectionId = ? AND status = 'active'
""", (user_id, collection_id))
existing_folders = cursor.fetchall()
print(f"\nExisting folders in master: {len(existing_folders)}")

# Build folder path map
folder_map = {f[0]: {'title': f[1], 'parent': f[2]} for f in existing_folders}

def build_folder_path(master_id, folder_map):
    parts = []
    current = master_id
    visited = set()
    while current and current not in visited:
        visited.add(current)
        if current in folder_map:
            parts.insert(0, folder_map[current]['title'])
            current = folder_map[current]['parent']
        else:
            break
    return "/".join(parts)

existing_folder_paths = {}
for f in existing_folders:
    path = build_folder_path(f[0], folder_map)
    existing_folder_paths[path.lower()] = f[0]

print(f"\n=== EXISTING MASTER FOLDER PATHS (first 20) ===")
for path in list(existing_folder_paths.keys())[:20]:
    print(f"  {path}")

# Get existing bookmarks
cursor.execute("""
    SELECT b.url, b.title, f.title as folder_title, b.masterParentId
    FROM bookmarks b
    LEFT JOIN folders f ON b.masterParentId = f.masterId
    WHERE b.userId = ? AND b.collectionId = ? AND b.status = 'active'
""", (user_id, collection_id))
existing_bookmarks = cursor.fetchall()
print(f"\nExisting bookmarks in master: {len(existing_bookmarks)}")

# Build dedupe keys for existing bookmarks
existing_dedupe_keys = set()
for bm in existing_bookmarks:
    url = bm[0].lower().strip().rstrip('/') if bm[0] else ''
    folder = bm[1] or 'Bookmarks bar'
    key = f"{folder.lower()}|{url}"
    existing_dedupe_keys.add(key)

print(f"\n=== COMPARISON ===")
print(f"Helium folders: {len(parser.folders)}")
print(f"Helium bookmarks: {len(parser.bookmarks)}")
print(f"Master folders: {len(existing_folders)}")
print(f"Master bookmarks: {len(existing_bookmarks)}")

# Find new folders (by path)
new_folders = []
for f in parser.folders:
    if f['path'].lower() not in existing_folder_paths:
        new_folders.append(f)

print(f"\nNew folders to create: {len(new_folders)}")
print("\n=== NEW FOLDERS ===")
for f in new_folders[:30]:
    print(f"  {f['path']}")
if len(new_folders) > 30:
    print(f"  ... and {len(new_folders) - 30} more")

# Find duplicate vs new bookmarks
duplicates = []
new_bookmarks = []
for bm in parser.bookmarks:
    if bm['dedupe_key'] in existing_dedupe_keys:
        duplicates.append(bm)
    else:
        new_bookmarks.append(bm)

print(f"\n=== BOOKMARK ANALYSIS ===")
print(f"Exact duplicates (will be skipped): {len(duplicates)}")
print(f"New bookmarks (will be added): {len(new_bookmarks)}")

print(f"\n=== SAMPLE DUPLICATES ===")
for bm in duplicates[:10]:
    print(f"  [{bm['folder_path']}] {bm['title'][:40]}")

print(f"\n=== SAMPLE NEW BOOKMARKS ===")
for bm in new_bookmarks[:15]:
    print(f"  [{bm['folder_path']}] {bm['title'][:40]} | {bm['url'][:50]}...")

conn.close()

print("\n\n=== FINAL MERGE PREDICTION ===")
print(f"Current Master: {len(existing_bookmarks)} bookmarks, {len(existing_folders)} folders")
print(f"After Merge: {len(existing_bookmarks) + len(new_bookmarks)} bookmarks, {len(existing_folders) + len(new_folders)} folders")
print(f"New items: +{len(new_bookmarks)} bookmarks, +{len(new_folders)} folders")
print(f"Skipped duplicates: {len(duplicates)}")
