'use client'

import { useEffect, useState } from 'react'
import { api, Collection, Folder, Bookmark } from '@/lib/api'
import { useDraggable } from '@dnd-kit/core'

interface SourceTreeItem {
  type: 'folder' | 'bookmark'
  id: string
  masterId: string
  title: string
  url?: string
  favicon?: string | null
  masterParentId: string | null
  position: number
  children?: SourceTreeItem[]
}

interface SourceCollectionPanelProps {
  token: string
  currentCollectionId: string
  onClose: () => void
  onSourceCollectionChange?: (collectionId: string) => void
}

interface SelectedSourceItemData {
  masterId: string
  type: 'folder' | 'bookmark'
  title: string
  url?: string
  favicon?: string | null
  children?: SelectedSourceItemData[]
}

function sourceTreeToSelectedData(item: SourceTreeItem): SelectedSourceItemData {
  return {
    masterId: item.masterId,
    type: item.type,
    title: item.title,
    url: item.url,
    favicon: item.favicon,
    children: item.children?.map(sourceTreeToSelectedData),
  }
}

function DraggableSourceItem({
  item,
  depth,
  isExpanded,
  isSelected,
  onToggleFolder,
  onToggleSelect,
  selectedItemsData,
  sourceCollectionId,
}: {
  item: SourceTreeItem
  depth: number
  isExpanded: boolean
  isSelected: boolean
  onToggleFolder: () => void
  onToggleSelect: () => void
  selectedItemsData: SelectedSourceItemData[]
  sourceCollectionId: string
}) {
  const dragItems = isSelected && selectedItemsData.length > 1
    ? selectedItemsData
    : [sourceTreeToSelectedData(item)]

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `source-${item.masterId}`,
    data: {
      sourceItem: true,
      masterId: item.masterId,
      type: item.type,
      title: item.title,
      url: item.url,
      selectedItems: dragItems,
      sourceCollectionId,
    },
  })

  return (
    <div ref={setNodeRef} className={`${isDragging ? 'opacity-30' : ''}`}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          isDragging
            ? 'bg-primary-50 dark:bg-terra-500/10 border border-primary-200 dark:border-terra-500/20'
            : isSelected
              ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/10'
              : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-white/30 hover:text-primary-600 dark:hover:text-terra-400 transition-colors p-0.5"
          title="Drag to copy"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
          </svg>
        </button>

        {/* Checkbox */}
        <div className="relative flex items-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="peer h-4 w-4 cursor-pointer appearance-none rounded-md border-2 border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#1A1A1A] transition-all checked:border-emerald-500 dark:checked:border-emerald-500 checked:bg-emerald-500 dark:checked:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <svg className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Folder toggle */}
        {item.type === 'folder' ? (
          <button
            onClick={onToggleFolder}
            className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
              isExpanded
                ? 'text-primary-600 dark:text-terra-400'
                : 'text-slate-400 dark:text-white/40'
            }`}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* Icon */}
        <div className="w-6 h-6 rounded-lg bg-white dark:bg-[#1A1A1A] border border-slate-100 dark:border-white/5 flex items-center justify-center text-sm shrink-0">
          {item.type === 'folder' ? '📁' : item.favicon ? (
            <img src={item.favicon} alt="" className="w-3.5 h-3.5 object-contain" />
          ) : '🔖'}
        </div>

        {/* Title */}
        <span className="text-sm font-medium text-slate-700 dark:text-white/70 truncate flex-1">
          {item.title}
        </span>

        {/* Item count for folders */}
        {item.type === 'folder' && (
          <span className="text-[9px] font-bold text-slate-300 dark:text-white/25 uppercase tracking-wider">
            {item.children?.length || 0}
          </span>
        )}
      </div>
    </div>
  )
}

function buildSourceTree(folders: Folder[], bookmarks: Bookmark[]): SourceTreeItem[] {
  const folderMap = new Map<string, SourceTreeItem>()

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

  const rootBookmarks: SourceTreeItem[] = []
  bookmarks.forEach(bookmark => {
    const item: SourceTreeItem = {
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

  const rootItems: SourceTreeItem[] = []
  folders.forEach(folder => {
    const treeItem = folderMap.get(folder.masterId)!
    if (folder.masterParentId && folderMap.has(folder.masterParentId)) {
      folderMap.get(folder.masterParentId)!.children!.push(treeItem)
    } else {
      rootItems.push(treeItem)
    }
  })

  rootItems.push(...rootBookmarks)

  const sortChildren = (items: SourceTreeItem[]) => {
    items.sort((a, b) => a.position - b.position)
    items.forEach(item => {
      if (item.children) sortChildren(item.children)
    })
  }
  sortChildren(rootItems)

  return rootItems
}

export default function SourceCollectionPanel({
  token,
  currentCollectionId,
  onClose,
  onSourceCollectionChange,
}: SourceCollectionPanelProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const [tree, setTree] = useState<SourceTreeItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedSourceItems, setSelectedSourceItems] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(true)

  useEffect(() => {
    loadCollections()
  }, [])

  useEffect(() => {
    if (selectedCollectionId) {
      loadSourceCollection()
    }
  }, [selectedCollectionId])

  const loadCollections = async () => {
    try {
      const data = await api.getCollections(token)
      const otherCollections = data.collections.filter(c => c.id !== currentCollectionId)
      setCollections(otherCollections)
      if (otherCollections.length > 0) {
        setSelectedCollectionId(otherCollections[0].id)
        onSourceCollectionChange?.(otherCollections[0].id)
      }
    } catch (error) {
      console.error('Failed to load collections:', error)
    } finally {
      setLoadingCollections(false)
    }
  }

  const loadSourceCollection = async () => {
    setLoading(true)
    setSelectedSourceItems(new Set())
    try {
      const data = await api.getCollection(token, selectedCollectionId)
      const treeData = buildSourceTree(data.folders, data.bookmarks)
      setTree(treeData)
      const topLevelIds = treeData
        .filter(item => item.type === 'folder')
        .map(item => item.masterId)
      setExpandedFolders(new Set(topLevelIds))
    } catch (error) {
      console.error('Failed to load source collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFolder = (masterId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(masterId)) {
        next.delete(masterId)
      } else {
        next.add(masterId)
      }
      return next
    })
  }

  const toggleSourceSelect = (masterId: string) => {
    setSelectedSourceItems(prev => {
      const next = new Set(prev)
      if (next.has(masterId)) {
        next.delete(masterId)
      } else {
        next.add(masterId)
      }
      return next
    })
  }

  const collectAllMasterIds = (items: SourceTreeItem[]): string[] => {
    const ids: string[] = []
    for (const item of items) {
      ids.push(item.masterId)
      if (item.children) ids.push(...collectAllMasterIds(item.children))
    }
    return ids
  }

  const selectAllSourceItems = () => {
    setSelectedSourceItems(new Set(collectAllMasterIds(tree)))
  }

  const clearSourceSelection = () => {
    setSelectedSourceItems(new Set())
  }

  const findSourceItem = (items: SourceTreeItem[], masterId: string): SourceTreeItem | null => {
    for (const item of items) {
      if (item.masterId === masterId) return item
      if (item.children) {
        const found = findSourceItem(item.children, masterId)
        if (found) return found
      }
    }
    return null
  }

  const selectedItemsData: SelectedSourceItemData[] = Array.from(selectedSourceItems)
    .map(id => {
      const item = findSourceItem(tree, id)
      if (!item) return null
      return sourceTreeToSelectedData(item)
    })
    .filter((x): x is SelectedSourceItemData => x !== null)

  const countItems = (items: SourceTreeItem[]): number =>
    items.reduce((total, item) => total + 1 + (item.children ? countItems(item.children) : 0), 0)

  const renderSourceItem = (item: SourceTreeItem, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(item.masterId)
    const isSelected = selectedSourceItems.has(item.masterId)

    return (
      <div key={item.masterId}>
        <DraggableSourceItem
          item={item}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          onToggleFolder={() => toggleFolder(item.masterId)}
          onToggleSelect={() => toggleSourceSelect(item.masterId)}
          selectedItemsData={selectedItemsData}
          sourceCollectionId={selectedCollectionId}
        />
        {item.type === 'folder' && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderSourceItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#1E1E1E] rounded-[2rem] border border-slate-200 dark:border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-50 dark:bg-terra-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-600 dark:text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-cream-100">Import Source</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-cream-100 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Collection Picker */}
        {loadingCollections ? (
          <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
        ) : collections.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-white/50 text-center py-2">
            No other collections available
          </div>
        ) : (
          <select
            value={selectedCollectionId}
            onChange={(e) => {
              setSelectedCollectionId(e.target.value)
              onSourceCollectionChange?.(e.target.value)
            }}
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-xl text-sm font-bold text-slate-900 dark:text-cream-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-terra-500/20 focus:border-primary-500 dark:focus:border-terra-500 transition-all appearance-none cursor-pointer"
          >
            {collections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.isDefault ? '(Master)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Item count bar */}
      {!loading && tree.length > 0 && (
        <div className="px-5 py-2 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
            Source Items
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
            {countItems(tree)} total
          </span>
        </div>
      )}

      {/* Selection toolbar */}
      {!loading && tree.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
          {selectedSourceItems.size > 0 ? (
            <>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {selectedSourceItems.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllSourceItems}
                  className="text-[10px] font-bold text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                >
                  All
                </button>
                <button
                  onClick={clearSourceSelection}
                  className="text-[10px] font-bold text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-[10px] font-medium text-slate-400 dark:text-white/30">
                Select items to drag multiple
              </span>
              <button
                onClick={selectAllSourceItems}
                className="text-[10px] font-bold text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
              >
                Select All
              </button>
            </>
          )}
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-3 border-slate-100 dark:border-white/5 border-t-primary-600 dark:border-t-terra-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/40">Loading...</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-500 dark:text-white/50">Source is empty</p>
          </div>
        ) : (
          <div className="py-2 px-2">
            {tree.map(item => renderSourceItem(item))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424]">
        <p className="text-[10px] font-bold text-slate-400 dark:text-white/40 text-center uppercase tracking-wider">
          Select &amp; drag items into folders on the right
        </p>
      </div>
    </div>
  )
}
