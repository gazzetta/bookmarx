'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Collection } from '@/lib/api'
import { useEditorStore, TreeItem } from '@/lib/editor-store'
import DashboardLayout from '@/components/DashboardLayout'
import SourceCollectionPanel from '@/components/SourceCollectionPanel'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortableItemProps {
  item: TreeItem
  depth: number
  isExpanded: boolean
  isSelected: boolean
  isDropTarget: boolean
  onToggleFolder: () => void
  onToggleSelect: () => void
  onRename: (newTitle: string) => void
  onUpdateUrl?: (newUrl: string) => void
  onDelete: () => void
}

function SortableItem({
  item,
  depth,
  isExpanded,
  isSelected,
  isDropTarget,
  onToggleFolder,
  onToggleSelect,
  onRename,
  onUpdateUrl,
  onDelete
}: SortableItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [editUrl, setEditUrl] = useState(item.url || '')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.masterId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  }

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== item.title) {
      onRename(editTitle.trim())
    }
    setIsEditing(false)
  }

  const handleSaveUrl = () => {
    if (editUrl.trim() && editUrl !== item.url && onUpdateUrl) {
      onUpdateUrl(editUrl.trim())
    }
    setIsEditingUrl(false)
  }

  return (
    <div ref={setNodeRef} style={style} className="group/item mb-1">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all border ${
          isDropTarget
            ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-400 dark:border-emerald-500/40 ring-2 ring-emerald-400/50 dark:ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
            : isSelected
              ? 'bg-primary-50/50 dark:bg-terra-500/10 border-primary-200 dark:border-terra-500/20 shadow-sm'
              : 'hover:bg-slate-50 dark:hover:bg-white/5 border-transparent hover:border-slate-100 dark:hover:border-white/5'
          } ${isDragging ? 'shadow-2xl brightness-95' : ''}`}
        style={{ paddingLeft: `${depth * 28 + 16}px` }}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-white/30 hover:text-slate-600 dark:hover:text-cream-500 transition-colors p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8h16M4 16h16" />
          </svg>
        </button>

        {/* Checkbox */}
        <div className="relative flex items-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#242424] transition-all checked:border-primary-600 dark:checked:border-terra-500 checked:bg-primary-600 dark:checked:bg-terra-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:focus:ring-terra-500/20"
          />
          <svg className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Folder toggle or spacer */}
        {item.type === 'folder' ? (
          <button
            onClick={onToggleFolder}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-primary-50 dark:bg-terra-500/10 text-primary-600 dark:text-terra-400' : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-cream-500'}`}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="w-6"></div>
        )}

        {/* Content Icon */}
        <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#242424] border border-slate-100 dark:border-white/5 flex items-center justify-center text-lg shadow-sm shrink-0">
          {item.type === 'folder' ? '📁' : item.favicon ? (
            <img src={item.favicon} alt="" className="w-4 h-4 object-contain" />
          ) : '🔖'}
        </div>

        {/* Title Logic */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') {
                  setEditTitle(item.title)
                  setIsEditing(false)
                }
              }}
              className="w-full px-3 py-1 bg-white dark:bg-[#242424] border-2 border-primary-500 dark:border-terra-500 rounded-lg focus:outline-none font-bold text-slate-900 dark:text-cream-100"
              autoFocus
            />
          ) : (
            <div className="flex flex-col">
              <span
                className="font-bold text-slate-700 dark:text-white/70 truncate cursor-text"
                onDoubleClick={() => setIsEditing(true)}
              >
                {item.title}
              </span>
              {item.type === 'bookmark' && item.url && !isEditingUrl && (
                <span
                  className="text-[10px] font-medium text-slate-400 dark:text-white/40 truncate max-w-[300px] cursor-text"
                  onDoubleClick={() => setIsEditingUrl(true)}
                >
                  {item.url.replace(/^https?:\/\/(www\.)?/, '')}
                </span>
              )}
            </div>
          )}
        </div>

        {isEditingUrl && (
          <input
            type="text"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            onBlur={handleSaveUrl}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveUrl()
              if (e.key === 'Escape') {
                setEditUrl(item.url || '')
                setIsEditingUrl(false)
              }
            }}
            className="w-64 px-3 py-1 text-xs bg-white dark:bg-[#242424] border-2 border-primary-500 dark:border-terra-500 rounded-lg focus:outline-none font-medium text-slate-900 dark:text-cream-100"
            autoFocus
          />
        )}

        {/* Stats for folders */}
        {item.type === 'folder' && (
          <span className="text-[10px] font-black text-slate-300 dark:text-white/30 uppercase tracking-widest hidden sm:block">
            {item.children?.length || 0} items
          </span>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all ml-4">
          {item.type === 'bookmark' && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-primary-600 dark:hover:text-terra-400 hover:bg-white dark:hover:bg-[#242424] rounded-lg transition-all border border-transparent hover:border-slate-100 dark:hover:border-white/5 hover:shadow-sm"
              title="Open link"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-100 dark:hover:border-red-500/20"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function DroppableFolder({ masterId, children }: { masterId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${masterId}`,
    data: { targetFolderId: masterId },
  })

  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-2xl ${
        isOver
          ? 'ring-2 ring-primary-500 dark:ring-terra-500 bg-primary-50/50 dark:bg-terra-500/10'
          : ''
      }`}
    >
      {children}
    </div>
  )
}

export default function CollectionEditorPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const collectionId = params.id as string
  const { user, token, isLoading, isPremium } = useAuth()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState<'folder' | 'bookmark' | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemUrl, setNewItemUrl] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<{ title: string; type: string; isSource: boolean; count: number } | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [sourceCollectionIdRef, setSourceCollectionIdRef] = useState<string>('')

  const showImportPanel = searchParams.get('import') === 'true'

  const toggleImportPanel = () => {
    const editPath = `/collections/${collectionId}/edit`
    if (showImportPanel) {
      router.replace(editPath)
    } else {
      router.replace(`${editPath}?import=true`)
    }
  }

  const {
    tree,
    expandedFolders,
    selectedItems,
    hasUnsavedChanges,
    pendingChanges,
    loadData,
    toggleFolder,
    toggleSelect,
    clearSelection,
    renameItem,
    updateBookmarkUrl,
    deleteItem,
    addFolder,
    addBookmark,
    moveItem,
    importSourceItems,
    clearChanges,
    revertChanges
  } = useEditorStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
    if (!isLoading && user && !isPremium) {
      router.push(`/collections/${collectionId}`)
    }
  }, [isLoading, user, isPremium, router, collectionId])

  useEffect(() => {
    if (token && collectionId && isPremium) {
      loadCollection()
    }
  }, [token, collectionId, isPremium])

  const loadCollection = async () => {
    if (!token) return
    try {
      const data = await api.getCollection(token, collectionId)
      setCollection(data.collection)
      loadData(data.folders, data.bookmarks)
    } catch (error) {
      console.error('Failed to load collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!token || pendingChanges.length === 0) return

    setSaving(true)
    try {
      await api.applyChanges(token, collectionId, pendingChanges)
      clearChanges()
      // Reload to get updated data
      await loadCollection()
    } catch (error) {
      console.error('Failed to save changes:', error)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemTitle.trim()) return

    if (showAddModal === 'folder') {
      addFolder(null, newItemTitle.trim())
    } else if (showAddModal === 'bookmark' && newItemUrl.trim()) {
      addBookmark(null, newItemTitle.trim(), newItemUrl.trim())
    }

    setShowAddModal(null)
    setNewItemTitle('')
    setNewItemUrl('')
  }

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return
    if (!confirm(`Delete ${selectedItems.size} selected item(s)?`)) return

    selectedItems.forEach(masterId => {
      const item = findItemByMasterId(tree, masterId)
      if (item) {
        deleteItem(masterId, item.type)
      }
    })
    clearSelection()
  }

  const findItemByMasterId = (items: TreeItem[], masterId: string): TreeItem | null => {
    for (const item of items) {
      if (item.masterId === masterId) return item
      if (item.children) {
        const found = findItemByMasterId(item.children, masterId)
        if (found) return found
      }
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string
    setActiveId(id)
    setDropTargetId(null)

    const data = event.active.data?.current
    if (data?.sourceItem) {
      const count = data.selectedItems?.length || 1
      setActiveDragData({ title: data.title || 'item', type: data.type || 'bookmark', isSource: true, count })
    } else {
      const item = findItemByMasterId(tree, id)
      if (item) {
        setActiveDragData({ title: item.title, type: item.type, isSource: false, count: 1 })
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    const isSourceDrag = (active.id as string).startsWith('source-') || active.data?.current?.sourceItem

    if (over && typeof over.id === 'string') {
      if (over.id.startsWith('drop-')) {
        setDropTargetId(over.data?.current?.targetFolderId || null)
        return
      }
      // For source drags, also highlight when hovering over a destination folder's SortableItem
      if (isSourceDrag) {
        const overItem = findItemByMasterId(tree, over.id)
        if (overItem && overItem.type === 'folder') {
          setDropTargetId(overItem.masterId)
          return
        }
      }
    }
    setDropTargetId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setDropTargetId(null)

    if (!over) return

    const activeIdStr = active.id as string
    const isSourceItem = activeIdStr.startsWith('source-') || active.data?.current?.sourceItem

    if (isSourceItem) {
      // Cross-panel import: source → destination (staged as pending change)
      const sourceData = active.data?.current
      if (!sourceData) return

      const srcCollectionId = sourceData.sourceCollectionId || sourceCollectionIdRef
      if (!srcCollectionId) return

      const overId = over.id as string
      let targetParentId: string | null = null

      if (overId.startsWith('drop-')) {
        targetParentId = over.data?.current?.targetFolderId || null
      } else {
        const overItem = findItemByMasterId(tree, overId)
        if (overItem && overItem.type === 'folder') {
          targetParentId = overItem.masterId
        }
      }

      const itemsToImport = sourceData.selectedItems && sourceData.selectedItems.length > 0
        ? sourceData.selectedItems
        : [{ masterId: sourceData.masterId, type: sourceData.type, title: sourceData.title, url: sourceData.url }]

      importSourceItems(itemsToImport, targetParentId, srcCollectionId)

      const count = itemsToImport.length
      setImportNotice(`Staged ${count} item${count !== 1 ? 's' : ''} for import — click Commit to save`)
      setTimeout(() => setImportNotice(null), 4000)
      return
    }

    // Internal reorder (existing behavior)
    if (active.id === over.id) return

    const activeItem = findItemByMasterId(tree, active.id as string)
    if (!activeItem) return

    const oldIndex = tree.findIndex(item => item.masterId === active.id)
    const newIndex = tree.findIndex(item => item.masterId === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      moveItem(active.id as string, activeItem.type, null, newIndex)
    }
  }

  const renderItem = (item: TreeItem, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(item.masterId)
    const isSelected = selectedItems.has(item.masterId)

    const itemContent = (
      <div key={item.masterId}>
        <SortableItem
          item={item}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          isDropTarget={item.type === 'folder' && dropTargetId === item.masterId}
          onToggleFolder={() => toggleFolder(item.masterId)}
          onToggleSelect={() => toggleSelect(item.masterId)}
          onRename={(newTitle) => renameItem(item.masterId, item.type, newTitle)}
          onUpdateUrl={item.type === 'bookmark' ? (newUrl) => updateBookmarkUrl(item.masterId, newUrl) : undefined}
          onDelete={() => {
            if (confirm(`Delete "${item.title}"${item.type === 'folder' ? ' and all its contents' : ''}?`)) {
              deleteItem(item.masterId, item.type)
            }
          }}
        />
        {item.type === 'folder' && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    )

    // Wrap folders in DroppableFolder when import panel is active
    if (showImportPanel && item.type === 'folder') {
      return (
        <DroppableFolder key={item.masterId} masterId={item.masterId}>
          {itemContent}
        </DroppableFolder>
      )
    }

    return itemContent
  }

  if (isLoading || !user || !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  const activeItem = activeId ? findItemByMasterId(tree, activeId) : null
  const allItemIds = tree.map(item => item.masterId)

  return (
    <DashboardLayout>
      <div className={`mx-auto ${showImportPanel ? 'max-w-7xl' : 'max-w-4xl'} transition-all duration-300`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <Link
              href={`/collections/${collectionId}`}
              className="w-12 h-12 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-primary-600 dark:hover:text-terra-400 hover:border-primary-100 dark:hover:border-terra-500/30 hover:shadow-lg hover:shadow-primary-500/5 transition-all group"
            >
              <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-cream-100 tracking-tight">
                {loading ? 'Entering Editor...' : `Edit: ${collection?.name}`}
              </h1>
              <p className="text-slate-500 dark:text-white/50 mt-1 font-medium flex items-center gap-2">
                {hasUnsavedChanges ? (
                  <>
                    <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></span>
                    <span className="text-primary-600 dark:text-terra-400 font-bold uppercase tracking-widest text-[10px]">
                      {pendingChanges.length} Unsaved Changes
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 dark:text-white/40 font-bold uppercase tracking-widest text-[10px]">
                    Environment Synced
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <button
                onClick={revertChanges}
                className="bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-white/70 px-6 py-3 rounded-xl font-bold transition-all active:scale-95"
              >
                Discard
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              className="bg-primary-600 dark:bg-terra-500 hover:bg-primary-700 dark:hover:bg-terra-600 disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-white/20 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/20 active:scale-95 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Commit changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 p-4 bg-white dark:bg-[#242424] rounded-[2rem] border border-slate-200 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowAddModal('folder')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:bg-white dark:hover:bg-[#242424] hover:border-slate-200 dark:hover:border-white/[0.06] hover:shadow-sm rounded-xl font-bold text-slate-700 dark:text-white/70 transition-all"
            >
              <span className="text-base">📁</span> New Folder
            </button>
            <button
              onClick={() => { setNewItemUrl('https://'); setShowAddModal('bookmark') }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:bg-white dark:hover:bg-[#242424] hover:border-slate-200 dark:hover:border-white/[0.06] hover:shadow-sm rounded-xl font-bold text-slate-700 dark:text-white/70 transition-all"
            >
              <span className="text-base">🔖</span> New Link
            </button>
            <div className="w-px h-8 bg-slate-200 dark:bg-white/[0.06] hidden sm:block" />
            <button
              onClick={toggleImportPanel}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-sm border rounded-xl font-bold transition-all ${
                showImportPanel
                  ? 'bg-primary-50 dark:bg-terra-500/10 border-primary-200 dark:border-terra-500/20 text-primary-700 dark:text-terra-400'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5 hover:bg-white dark:hover:bg-[#242424] hover:border-slate-200 dark:hover:border-white/[0.06] hover:shadow-sm text-slate-700 dark:text-white/70'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {showImportPanel ? 'Close Import' : 'Import from Collection'}
            </button>
          </div>
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-4 w-full sm:w-auto bg-slate-900 text-white px-5 py-2.5 rounded-xl animate-in zoom-in-95 duration-200">
              <span className="text-xs font-black uppercase tracking-widest border-r border-white/20 pr-4">{selectedItems.size} Selected</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={clearSelection}
                  className="text-white/60 hover:text-white font-bold text-xs"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-colors"
                >
                  Purge Items
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Import notice toast */}
        {importNotice && (
          <div className="mb-4 px-5 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-bold flex items-center gap-3 animate-in slide-in-from-top duration-300">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {importNotice}
          </div>
        )}

        {/* Main Content Area — wraps DndContext around both panels */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className={`flex gap-6 mb-10 ${showImportPanel ? '' : ''}`}>
            {/* Source Panel (left) */}
            {showImportPanel && token && (
              <div className="w-[38%] shrink-0 min-h-[500px]">
                <SourceCollectionPanel
                  token={token}
                  currentCollectionId={collectionId}
                  onClose={() => router.replace(`/collections/${collectionId}/edit`)}
                  onSourceCollectionChange={(id) => setSourceCollectionIdRef(id)}
                />
              </div>
            )}

            {/* Editor Container (right or full) */}
            <div className={`${showImportPanel ? 'flex-1 min-w-0' : 'w-full'}`}>
              <div className="bg-white dark:bg-[#242424] rounded-[2.5rem] border border-slate-200 dark:border-white/[0.06] min-h-[500px] shadow-sm overflow-hidden">
                <div className="px-10 py-5 border-b border-slate-50 dark:border-white/5 bg-slate-50/30 dark:bg-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
                  <span>{showImportPanel ? 'Destination Collection' : 'Structure Hierarchy'}</span>
                  <span>Management</span>
                </div>
                {loading ? (
                  <div className="p-32 text-center text-slate-400 dark:text-white/40">
                    <div className="w-10 h-10 border-4 border-slate-100 dark:border-white/5 border-t-primary-600 dark:border-t-terra-500 rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="font-bold uppercase tracking-widest text-[10px]">Calibrating Editor...</p>
                  </div>
                ) : tree.length === 0 ? (
                  <div className="p-32 text-center">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-cream-100 mb-2">Workspace Empty</h3>
                    <p className="text-slate-500 dark:text-white/50 font-medium">
                      {showImportPanel
                        ? 'Drag items from the source panel on the left into this collection.'
                        : 'Use the toolbar above to populate your collection.'}
                    </p>
                  </div>
                ) : (
                  <SortableContext items={allItemIds} strategy={verticalListSortingStrategy}>
                    <div className="py-4 px-4">
                      {tree.map(item => renderItem(item))}
                    </div>
                  </SortableContext>
                )}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeDragData?.isSource ? (
              <div className="bg-white dark:bg-[#242424] border-2 border-emerald-500 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-4 scale-105 opacity-90 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-lg shadow-inner">
                  {activeDragData.count > 1 ? '📦' : activeDragData.type === 'folder' ? '📁' : '🔖'}
                </div>
                <span className="font-bold text-slate-900 dark:text-cream-100 truncate max-w-[200px]">
                  {activeDragData.count > 1
                    ? `${activeDragData.count} items`
                    : activeDragData.title}
                </span>
                <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase shrink-0">Copy</span>
              </div>
            ) : activeItem ? (
              <div className="bg-white dark:bg-[#242424] border-2 border-primary-500 dark:border-terra-500 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-4 scale-105 opacity-90 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center text-xl shadow-inner">
                  {activeItem.type === 'folder' ? '📁' : '🔖'}
                </div>
                <span className="font-bold text-slate-900 dark:text-cream-100">{activeItem.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Support Guide */}
        <div className="bg-slate-900/5 dark:bg-white/5 rounded-2xl p-6 border border-slate-900/5 dark:border-white/5 text-center">
          <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Interface Active
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-cream-500 leading-relaxed max-w-lg mx-auto">
            <span className="text-slate-900 dark:text-cream-100 font-bold">Double-click</span> any label to rename.
            <span className="text-slate-900 dark:text-cream-100 font-bold ml-1">Drag</span> items to adjust hierarchy.
            {showImportPanel && (
              <span className="ml-1">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Select &amp; drag items</span> from the source panel into any folder to copy them. Drop onto a folder to place items inside it.
              </span>
            )}
            {' '}Changes only persist once <span className="text-primary-600 dark:text-terra-400 font-bold">committed</span>.
          </p>
        </div>
      </div>

      {/* Modern Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
          <div className="bg-white dark:bg-[#242424] rounded-[2.5rem] border border-slate-200 dark:border-white/[0.06] p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-primary-50 dark:bg-terra-500/10 rounded-2xl flex items-center justify-center text-3xl">
                {showAddModal === 'folder' ? '📁' : '🔖'}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-cream-100 tracking-tight">
                  Add New {showAddModal === 'folder' ? 'Folder' : 'Bookmark'}
                </h2>
                <p className="text-slate-500 dark:text-white/50 font-medium">Define your new organizational element below.</p>
              </div>
            </div>

            <form onSubmit={handleAddItem} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2 ml-1">
                  Label Title
                </label>
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-2xl focus:ring-4 focus:ring-primary-500/10 dark:focus:ring-terra-500/20 focus:border-primary-500 dark:focus:border-terra-500 focus:bg-white dark:focus:bg-[#242424] outline-none transition-all font-bold text-slate-900 dark:text-cream-100 placeholder:text-slate-300 dark:placeholder:text-white/30"
                  placeholder={showAddModal === 'folder' ? 'e.g., Research' : 'e.g., Google Search'}
                  required
                  autoFocus
                />
              </div>
              {showAddModal === 'bookmark' && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2 ml-1">
                    Resource URL
                  </label>
                  <input
                    type="url"
                    value={newItemUrl}
                    onChange={(e) => setNewItemUrl(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-2xl focus:ring-4 focus:ring-primary-500/10 dark:focus:ring-terra-500/20 focus:border-primary-500 dark:focus:border-terra-500 focus:bg-white dark:focus:bg-[#242424] outline-none transition-all font-bold text-slate-900 dark:text-cream-100 placeholder:text-slate-300 dark:placeholder:text-white/30"
                    placeholder="https://example.com/target"
                    required
                  />
                </div>
              )}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(null)
                    setNewItemTitle('')
                    setNewItemUrl('')
                  }}
                  className="flex-1 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-white/70 py-4 rounded-2xl font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary-600 dark:bg-terra-500 hover:bg-primary-700 dark:hover:bg-terra-600 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                >
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
