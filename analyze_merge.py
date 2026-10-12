#!/usr/bin/env python3
"""Analyze Helium bookmarks against master collection to predict merge outcome."""

from html.parser import HTMLParser
import json
import sqlite3
from urllib.parse import unquote

class BookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.folders = []
        self.bookmarks = []
        self.folder_stack = []
        self.in_h3 = False
        self.in_a = False
        self.current_folder_title = None
        self.current_href = None
        self.current_title = None
        self.folder_id_counter = 1
        
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
            # New folder level
            if self.folder_stack:
                self.folder_stack.append(self.folder_stack[-1] + "/" + self.current_folder_title if self.current_folder_title else self.folder_stack[-1])
            else:
                self.folder_stack.append(self.current_folder_title or "Bookmarks bar")
        elif tag == 'dt':
            pass
            
    def handle_endtag(self, tag):
        if tag == 'h3':
            self.in_h3 = False
            if self.current_folder_title:
                folder_id = f"folder_{self.folder_id_counter}"
                self.folder_id_counter += 1
                path = "/".join(self.folder_stack) + "/" + self.current_folder_title if self.folder_stack else self.current_folder_title
                self.folders.append({
                    'id': folder_id,
                    'title': self.current_folder_title,
                    'path': path
                })
        elif tag == 'a':
            self.in_a = False
            if self.current_href and self.current_title:
                # Normalize URL for comparison
                url = unquote(self.current_href).lower().strip()
                # Remove trailing slashes and common tracking params
                url = url.rstrip('/')
                
                folder_path = "/".join(self.folder_stack) if self.folder_stack else "Bookmarks bar"
                self.bookmarks.append({
                    'url': url,
                    'title': self.current_title,
                    'folder_path': folder_path,
                    'dedupe_key': f"{folder_path.lower()}|{url}"
                })
        elif tag == 'dl':
            if self.folder_stack:
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
for folder in parser.folders[:30]:  # Show first 30
    print(f"  {folder['path']}")
if len(parser.folders) > 30:
    print(f"  ... and {len(parser.folders) - 30} more")

# Show sample bookmarks
print("\n=== SAMPLE BOOKMARKS ===")
for bm in parser.bookmarks[:15]:
    print(f"  {bm['folder_path']} | {bm['url'][:80]}...")

# Save parsed data
with open('helium_parsed.json', 'w') as f:
    json.dump({
        'folders': parser.folders,
        'bookmarks': parser.bookmarks
    }, f, indent=2)

print(f"\nSaved parsed data to helium_parsed.json")
print(f"\nUnique URLs in Helium: {len(set(bm['url'] for bm in parser.bookmarks))}")
