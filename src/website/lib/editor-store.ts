import { create } from 'zustand'
import { Folder, Bookmark, EditorChange, CopyItem } from './api'

export interface TreeItem {
  type: 'folder' | 'bookmark'
  id: string
  masterId: string
  title: string
  url?: string
  favicon?: string | null
  masterParentId: string | null
  position: number
  children?: TreeItem[]
}

export interface ImportSourceItem {
  masterId: string
  type: 'folder' | 'bookmark'
  title: string
  url?: string
  favicon?: string | null
  children?: ImportSourceItem[]
}

interface EditorState {
  // Data
  collectionId: string | null
  originalItems: { folders: Folder[]; bookmarks: Bookmark[] }
  tree: TreeItem[]

  // UI State
  expandedFolders: Set<string>
  selectedItems: Set<string>
  searchQuery: string

  // Change tracking
  pendingChanges: EditorChange[]
  hasUnsavedChanges: boolean

  // Actions
  setCollectionId: (id: string) => void
  loadData: (folders: Folder[], bookmarks: Bookmark[]) => void
  toggleFolder: (masterId: string) => void
  toggleSelect: (masterId: string) => void
  clearSelection: () => void
  setSearchQuery: (query: string) => void

  // Edit actions
  moveItem: (itemId: string, itemType: 'folder' | 'bookmark', newParentId: string | null, newIndex: number) => void
  renameItem: (masterId: string, itemType: 'folder' | 'bookmark', newTitle: string) => void
  updateBookmarkUrl: (masterId: string, newUrl: string) => void
  deleteItem: (masterId: string, itemType: 'folder' | 'bookmark') => void
  addFolder: (parentId: string | null, title: string) => void
  addBookmark: (parentId: string | null, title: string, url: string) => void
  importSourceItems: (sourceItems: ImportSourceItem[], targetParentId: string | null, sourceCollectionId: string) => void

  // Persistence
  getChanges: () => EditorChange[]
  clearChanges: () => void
  revertChanges: () => void
}

function buildTree(folders: Folder[], bookmarks: Bookmark[]): TreeItem[] {
  const folderMap = new Map<string, TreeItem>()

  // Convert folders to tree items
  folders.forEach(folder => {
    folderMap.set(folder.masterId, {
      type: 'folder',
      id: folder.id,
      masterId: folder.masterId,
      title: folder.title,
      masterParentId: folder.masterParentId,
      position: folder.position,
      children: []
    })
  })

  // Add bookmarks to their parent folders or root
  const rootBookmarks: TreeItem[] = []
  bookmarks.forEach(bookmark => {
    const item: TreeItem = {
      type: 'bookmark',
      id: bookmark.id,
      masterId: bookmark.masterId,
      title: bookmark.title,
      url: bookmark.url,
      favicon: bookmark.favicon,
      masterParentId: bookmark.masterParentId,
      position: bookmark.position
    }

    if (bookmark.masterParentId && folderMap.has(bookmark.masterParentId)) {
      folderMap.get(bookmark.masterParentId)!.children!.push(item)
    } else {
      rootBookmarks.push(item)
    }
  })

  // Build folder hierarchy
  const rootItems: TreeItem[] = []
  folders.forEach(folder => {
    const treeItem = folderMap.get(folder.masterId)!

    if (folder.masterParentId && folderMap.has(folder.masterParentId)) {
      folderMap.get(folder.masterParentId)!.children!.push(treeItem)
    } else {
      rootItems.push(treeItem)
    }
  })

  // Add root bookmarks
  rootItems.push(...rootBookmarks)

  // Sort children by position (preserving original browser order)
  const sortChildren = (items: TreeItem[]) => {
    items.sort((a, b) => {
      // Sort primarily by position to match browser extension order
      if (a.position !== b.position) return a.position - b.position
      // Fall back to title if positions are equal
      return a.title.localeCompare(b.title)
    })
    items.forEach(item => {
      if (item.children) sortChildren(item.children)
    })
  }
  sortChildren(rootItems)

  return rootItems
}

export const useEditorStore = create<EditorState>((set, get) => ({
  collectionId: null,
  originalItems: { folders: [], bookmarks: [] },
  tree: [],
  expandedFolders: new Set(),
  selectedItems: new Set(),
  searchQuery: '',
  pendingChanges: [],
  hasUnsavedChanges: false,

  setCollectionId: (id) => set({ collectionId: id }),

  loadData: (folders, bookmarks) => {
    const tree = buildTree(folders, bookmarks)
    // Expand top-level folders
    const topLevelIds = tree
      .filter(item => item.type === 'folder')
      .map(item => item.masterId)

    set({
      originalItems: { folders, bookmarks },
      tree,
      expandedFolders: new Set(topLevelIds),
      pendingChanges: [],
      hasUnsavedChanges: false
    })
  },

  toggleFolder: (masterId) => set(state => {
    const next = new Set(state.expandedFolders)
    if (next.has(masterId)) {
      next.delete(masterId)
    } else {
      next.add(masterId)
    }
    return { expandedFolders: next }
  }),

  toggleSelect: (masterId) => set(state => {
    const next = new Set(state.selectedItems)
    if (next.has(masterId)) {
      next.delete(masterId)
    } else {
      next.add(masterId)
    }
    return { selectedItems: next }
  }),

  clearSelection: () => set({ selectedItems: new Set() }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  moveItem: (itemId, itemType, newParentId, newIndex) => {
    const change: EditorChange = {
      type: 'MOVE',
      itemType,
      itemId,
      parentId: newParentId || undefined,
      position: newIndex
    }

    set(state => {
      // Update tree structure
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]

      // Find and remove item from current location
      let movedItem: TreeItem | null = null
      const removeFromTree = (items: TreeItem[]): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].masterId === itemId) {
            movedItem = items.splice(i, 1)[0]
            return true
          }
          if (items[i].children && removeFromTree(items[i].children!)) {
            return true
          }
        }
        return false
      }
      removeFromTree(newTree)

      if (!movedItem) return state

      // Insert at new location
      if (newParentId) {
        const findAndInsert = (items: TreeItem[]): boolean => {
          for (const item of items) {
            if (item.masterId === newParentId && item.children) {
              item.children.splice(newIndex, 0, movedItem!)
              return true
            }
            if (item.children && findAndInsert(item.children)) {
              return true
            }
          }
          return false
        }
        findAndInsert(newTree)
      } else {
        newTree.splice(newIndex, 0, movedItem)
      }

      return {
        tree: newTree,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  renameItem: (masterId, itemType, newTitle) => {
    const change: EditorChange = {
      type: 'RENAME',
      itemType,
      itemId: masterId,
      title: newTitle
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]

      const updateTitle = (items: TreeItem[]): boolean => {
        for (const item of items) {
          if (item.masterId === masterId) {
            item.title = newTitle
            return true
          }
          if (item.children && updateTitle(item.children)) {
            return true
          }
        }
        return false
      }
      updateTitle(newTree)

      return {
        tree: newTree,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  updateBookmarkUrl: (masterId, newUrl) => {
    const change: EditorChange = {
      type: 'UPDATE_URL',
      itemType: 'bookmark',
      itemId: masterId,
      url: newUrl
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]

      const updateUrl = (items: TreeItem[]): boolean => {
        for (const item of items) {
          if (item.masterId === masterId) {
            item.url = newUrl
            return true
          }
          if (item.children && updateUrl(item.children)) {
            return true
          }
        }
        return false
      }
      updateUrl(newTree)

      return {
        tree: newTree,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  deleteItem: (masterId, itemType) => {
    const change: EditorChange = {
      type: 'DELETE',
      itemType,
      itemId: masterId
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]

      const removeItem = (items: TreeItem[]): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].masterId === masterId) {
            items.splice(i, 1)
            return true
          }
          if (items[i].children && removeItem(items[i].children!)) {
            return true
          }
        }
        return false
      }
      removeItem(newTree)

      // Remove from selection if selected
      const newSelected = new Set(state.selectedItems)
      newSelected.delete(masterId)

      return {
        tree: newTree,
        selectedItems: newSelected,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  addFolder: (parentId, title) => {
    const tempId = `temp-${Date.now()}`
    const change: EditorChange = {
      type: 'CREATE_FOLDER',
      itemType: 'folder',
      parentId: parentId || undefined,
      title
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]
      const newFolder: TreeItem = {
        type: 'folder',
        id: tempId,
        masterId: tempId,
        title,
        masterParentId: parentId,
        position: 0,
        children: []
      }

      if (parentId) {
        const findAndAdd = (items: TreeItem[]): boolean => {
          for (const item of items) {
            if (item.masterId === parentId && item.children) {
              item.children.unshift(newFolder)
              return true
            }
            if (item.children && findAndAdd(item.children)) {
              return true
            }
          }
          return false
        }
        findAndAdd(newTree)
      } else {
        newTree.unshift(newFolder)
      }

      return {
        tree: newTree,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  addBookmark: (parentId, title, url) => {
    const tempId = `temp-${Date.now()}`
    const change: EditorChange = {
      type: 'CREATE_BOOKMARK',
      itemType: 'bookmark',
      parentId: parentId || undefined,
      title,
      url
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]
      const newBookmark: TreeItem = {
        type: 'bookmark',
        id: tempId,
        masterId: tempId,
        title,
        url,
        masterParentId: parentId,
        position: 0
      }

      if (parentId) {
        const findAndAdd = (items: TreeItem[]): boolean => {
          for (const item of items) {
            if (item.masterId === parentId && item.children) {
              item.children.push(newBookmark)
              return true
            }
            if (item.children && findAndAdd(item.children)) {
              return true
            }
          }
          return false
        }
        findAndAdd(newTree)
      } else {
        newTree.push(newBookmark)
      }

      return {
        tree: newTree,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  importSourceItems: (sourceItems, targetParentId, sourceCollectionId) => {
    const change: EditorChange = {
      type: 'COPY_FROM',
      itemType: 'folder',
      sourceCollectionId,
      copyItems: sourceItems.map(item => ({
        masterId: item.masterId,
        type: item.type,
        targetParentId,
      })),
    }

    const buildLocalItems = (items: ImportSourceItem[], parentId: string | null): TreeItem[] => {
      return items.map(item => {
        const tempId = `import-${item.masterId}-${Date.now()}`
        const treeItem: TreeItem = {
          type: item.type,
          id: tempId,
          masterId: tempId,
          title: item.title,
          url: item.url,
          favicon: item.favicon,
          masterParentId: parentId,
          position: 0,
          ...(item.type === 'folder' ? {
            children: item.children ? buildLocalItems(item.children, tempId) : []
          } : {})
        }
        return treeItem
      })
    }

    set(state => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as TreeItem[]
      const localItems = buildLocalItems(sourceItems, targetParentId)

      if (targetParentId) {
        const insertIntoFolder = (items: TreeItem[]): boolean => {
          for (const item of items) {
            if (item.masterId === targetParentId && item.children) {
              item.children.push(...localItems)
              return true
            }
            if (item.children && insertIntoFolder(item.children)) {
              return true
            }
          }
          return false
        }
        insertIntoFolder(newTree)
      } else {
        newTree.push(...localItems)
      }

      const newExpanded = new Set(state.expandedFolders)
      if (targetParentId) newExpanded.add(targetParentId)
      localItems.filter(i => i.type === 'folder').forEach(i => newExpanded.add(i.masterId))

      return {
        tree: newTree,
        expandedFolders: newExpanded,
        pendingChanges: [...state.pendingChanges, change],
        hasUnsavedChanges: true
      }
    })
  },

  getChanges: () => get().pendingChanges,

  clearChanges: () => set({ pendingChanges: [], hasUnsavedChanges: false }),

  revertChanges: () => {
    const { originalItems } = get()
    const tree = buildTree(originalItems.folders, originalItems.bookmarks)
    const topLevelIds = tree
      .filter(item => item.type === 'folder')
      .map(item => item.masterId)

    set({
      tree,
      expandedFolders: new Set(topLevelIds),
      selectedItems: new Set(),
      pendingChanges: [],
      hasUnsavedChanges: false
    })
  }
}))
