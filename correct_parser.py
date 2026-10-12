#!/usr/bin/env python3
"""
CORRECT HTML Bookmark Parser
Parses Netscape Bookmark format accurately using stack-based approach.
"""

import re
import json
import sqlite3
from html.parser import HTMLParser
from urllib.parse import unquote

class CorrectBookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.folders = []
        self.bookmarks = []
        self.folder_stack = []  # Stack of (id, title) tuples
        self.current_tag = None
        self.current_attrs = {}
        self.current_data = ""
        self.folder_counter = 1
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self.current_tag = tag
        self.current_attrs = attrs_dict
        self.current_data = ""
        
    def handle_endtag(self, tag):
        if tag == 'h3':
            # Folder title collected - create folder but don't push yet
            title = self.current_data.strip()
            if title:
                folder_id = f"fld_{self.folder_counter}"
                self.folder_counter += 1
                
                # Build path from current stack
                path_parts = [f[1] for f in self.folder_stack] + [title]
                full_path = "/".join(path_parts)
                
                parent = self.folder_stack[-1][1] if self.folder_stack else "Bookmarks bar"
                
                self.folders.append({
                    'id': folder_id,
                    'title': title,
                    'parent': parent,
                    'path': full_path,
                    'level': len(self.folder_stack)
                })
                
                # Push to stack (the DL after this H3 will contain children)
                self.folder_stack.append((folder_id, title))
                
        elif tag == 'a':
            # Bookmark
            href = self.current_attrs.get('href', '')
            title = self.current_data.strip()
            
            if href and title:
                # Normalize URL
                url = unquote(href).lower().strip().rstrip('/')
                
                # Build folder path
                path_parts = [f[1] for f in self.folder_stack]
                folder_path = "/".join(path_parts) if path_parts else "Bookmarks bar"
                
                self.bookmarks.append({
                    'url': url,
                    'original_url': href,
                    'title': title,
                    'folder_path': folder_path,
                    'dedupe_key': f"{folder_path.lower()}|{url}"
                })
                
        elif tag == 'dl':
            # Exiting a definition list = pop folder from stack
            if self.folder_stack:
                self.folder_stack.pop()
                
    def handle_data(self, data):
        self.current_data += data

def parse_html_file(filepath):
    """Parse bookmark HTML file and return structured data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract just the DT elements and their structure
    # Netscape format: <DL><p><DT>...</DT><DL><p>...</DL></DL>
    
    parser = CorrectBookmarkParser()
    
    # Pre-process: the file uses <DL><p> which confuses some parsers
    # Replace <DL><p> with <DL> and </DL></p> with </DL>
    content = re.sub(r'<DL>\s*<p>', '<DL>', content, flags=re.IGNORECASE)
    content = re.sub(r'</p>\s*</DL>', '</DL>', content, flags=re.IGNORECASE)
    
    parser.feed(content)
    
    return {
        'folders': parser.folders,
        'bookmarks': parser.bookmarks
    }

def get_master_data(db_path, email='gas@gasdigital.co.uk'):
    """Get bookmark data from master collection."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get user
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    if not user_row:
        raise ValueError(f"User {email} not found")
    user_id = user_row[0]
    
    # Get default collection
    cursor.execute("SELECT id FROM collections WHERE userId = ? AND isDefault = 1", (user_id,))
    coll_row = cursor.fetchone()
    if not coll_row:
        raise ValueError("No default collection found")
    collection_id = coll_row[0]
    
    # Get folders
    cursor.execute("""
        SELECT masterId, title, masterParentId
        FROM folders
        WHERE userId = ? AND collectionId = ? AND status = 'active'
    """, (user_id, collection_id))
    
    folder_rows = cursor.fetchall()
    folder_map = {row[0]: {'title': row[1], 'parent': row[2]} for row in folder_rows}
    
    # Build full paths
    def build_path(master_id, visited=None):
        if visited is None:
            visited = set()
        if master_id in visited or not master_id or master_id not in folder_map:
            return ""
        visited.add(master_id)
        
        title = folder_map[master_id]['title']
        parent_id = folder_map[master_id]['parent']
        
        if parent_id and parent_id in folder_map:
            parent_path = build_path(parent_id, visited)
            if parent_path:
                return f"{parent_path}/{title}"
        return title
    
    folders = []
    for row in folder_rows:
        path = build_path(row[0])
        if path:
            folders.append({
                'master_id': row[0],
                'title': row[1],
                'path': path
            })
    
    # Get bookmarks with their folder paths
    cursor.execute("""
        SELECT b.url, b.title, b.masterParentId
        FROM bookmarks b
        WHERE b.userId = ? AND b.collectionId = ? AND b.status = 'active'
    """, (user_id, collection_id))
    
    bookmarks = []
    for row in cursor.fetchall():
        url = row[0].lower().strip().rstrip('/') if row[0] else ''
        folder_path = build_path(row[2]) if row[2] else "Bookmarks bar"
        
        bookmarks.append({
            'url': url,
            'original_url': row[0],
            'title': row[1],
            'folder_path': folder_path,
            'dedupe_key': f"{folder_path.lower()}|{url}"
        })
    
    conn.close()
    
    return {
        'folders': folders,
        'bookmarks': bookmarks
    }

def compare_collections(helium_data, master_data):
    """Compare two collections and return detailed diff."""
    
    # Build lookup maps
    helium_keys = {bm['dedupe_key']: bm for bm in helium_data['bookmarks']}
    master_keys = {bm['dedupe_key']: bm for bm in master_data['bookmarks']}
    
    helium_folder_paths = {f['path'].lower(): f for f in helium_data['folders']}
    master_folder_paths = {f['path'].lower(): f for f in master_data['folders']}
    
    # Find duplicates (same URL in same folder path)
    duplicates = []
    for key, bm in helium_keys.items():
        if key in master_keys:
            duplicates.append({
                'helium': bm,
                'master': master_keys[key]
            })
    
    # Find new bookmarks (in Helium but not in Master)
    new_bookmarks = [bm for key, bm in helium_keys.items() if key not in master_keys]
    
    # Find new folders (in Helium but not in Master)
    new_folders = [f for f in helium_data['folders'] 
                   if f['path'].lower() not in master_folder_paths]
    
    return {
        'duplicates': duplicates,
        'new_bookmarks': new_bookmarks,
        'new_folders': new_folders,
        'helium_folder_paths': list(helium_folder_paths.keys()),
        'master_folder_paths': list(master_folder_paths.keys())
    }

if __name__ == '__main__':
    # Parse Helium
    print("=== PARSING HELIUM.HTML ===")
    helium = parse_html_file('helium.html')
    print(f"Folders: {len(helium['folders'])}")
    print(f"Bookmarks: {len(helium['bookmarks'])}")
    
    # Show folder structure
    print("\n=== HELIUM FOLDER STRUCTURE ===")
    for f in helium['folders']:
        indent = "  " * f['level']
        print(f"{indent}{f['title']} (path: {f['path']})")
    
    # Get Master
    print("\n=== GETTING MASTER COLLECTION ===")
    master = get_master_data('src/website/data/bookmarx.db')
    print(f"Folders: {len(master['folders'])}")
    print(f"Bookmarks: {len(master['bookmarks'])}")
    
    # Show Master folder structure
    print("\n=== MASTER FOLDER STRUCTURE ===")
    for f in sorted(master['folders'], key=lambda x: x['path'])[:20]:
        print(f"  {f['path']}")
    if len(master['folders']) > 20:
        print(f"  ... and {len(master['folders']) - 20} more")
    
    # Compare
    print("\n=== COMPARISON ===")
    result = compare_collections(helium, master)
    
    print(f"\nDUPLICATE BOOKMARKS: {len(result['duplicates'])}")
    for dup in result['duplicates'][:15]:
        h = dup['helium']
        m = dup['master']
        print(f"  [{h['folder_path']}] {h['title']}")
    
    print(f"\nNEW BOOKMARKS TO ADD: {len(result['new_bookmarks'])}")
    for bm in result['new_bookmarks'][:15]:
        print(f"  [{bm['folder_path']}] {bm['title']}")
    
    print(f"\nNEW FOLDERS TO CREATE: {len(result['new_folders'])}")
    for f in result['new_folders']:
        print(f"  {f['path']}")
    
    print(f"\n=== FINAL MERGE PREDICTION ===")
    print(f"Current Master: {len(master['bookmarks'])} bookmarks, {len(master['folders'])} folders")
    print(f"After Merge: {len(master['bookmarks']) + len(result['new_bookmarks'])} bookmarks, {len(master['folders']) + len(result['new_folders'])} folders")
    print(f"New items: +{len(result['new_bookmarks'])} bookmarks, +{len(result['new_folders'])} folders")
    print(f"Skipped duplicates: {len(result['duplicates'])}")
