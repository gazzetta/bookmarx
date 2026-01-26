'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Collection } from '@/lib/api'
import { useEditorStore, TreeItem } from '@/lib/editor-store'
import DashboardLayout from '@/components/DashboardLayout'
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
    opacity: isDragging ? 0.5 : 1,
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
    <div ref={setNodeRef} style={style}>
      <div 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group ${
          isSelected ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
          </svg>
        </button>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
        />

        {/* Folder expand/collapse or bookmark icon */}
        {item.type === 'folder' ? (
          <button onClick={onToggleFolder} className="p-0.5">
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-5"></span>
        )}

        {/* Icon */}
        <span className="text-lg flex-shrink-0">
          {item.type === 'folder' ? '📁' : item.favicon ? (
            <img src={item.favicon} alt="" className="w-4 h-4" />
          ) : '🔖'}
        </span>

        {/* Title (editable) */}
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
            className="flex-1 px-2 py-0.5 border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 outline-none"
            autoFocus
          />
        ) : (
          <span 
            className="flex-1 truncate cursor-pointer"
            onDoubleClick={() => setIsEditing(true)}
          >
            {item.title}
          </span>
        )}

        {/* URL for bookmarks */}
        {item.type === 'bookmark' && item.url && !isEditingUrl && (
          <span 
            className="text-xs text-gray-400 truncate max-w-[200px] hidden lg:block cursor-pointer"
            onDoubleClick={() => setIsEditingUrl(true)}
            title={item.url}
          >
            {item.url}
          </span>
        )}

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
            className="w-48 px-2 py-0.5 text-xs border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 outline-none"
            autoFocus
          />
        )}

        {/* Item count for folders */}
        {item.type === 'folder' && (
          <span className="text-xs text-gray-400">
            {item.children?.length || 0}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.type === 'bookmark' && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Open link"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
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

export default function CollectionEditorPage() {
  const router = useRouter()
  const params = useParams()
  const collectionId = params.id as string
  const { user, token, isLoading, isPremium } = useAuth()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState<'folder' | 'bookmark' | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemUrl, setNewItemUrl] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

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
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeItem = findItemByMasterId(tree, active.id as string)
    if (!activeItem) return

    // For now, simple reorder at root level
    const oldIndex = tree.findIndex(item => item.masterId === active.id)
    const newIndex = tree.findIndex(item => item.masterId === over.id)
    
    if (oldIndex !== -1 && newIndex !== -1) {
      moveItem(active.id as string, activeItem.type, null, newIndex)
    }
  }

  const renderItem = (item: TreeItem, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(item.masterId)
    const isSelected = selectedItems.has(item.masterId)

    return (
      <div key={item.masterId}>
        <SortableItem
          item={item}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href={`/collections/${collectionId}`}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Edit: {loading ? 'Loading...' : collection?.name || 'Collection'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {hasUnsavedChanges 
                  ? `${pendingChanges.length} unsaved change(s)` 
                  : 'All changes saved'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <button
                onClick={revertChanges}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Revert
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal('folder')}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <span>📁</span> Add Folder
            </button>
            <button
              onClick={() => setShowAddModal('bookmark')}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <span>🔖</span> Add Bookmark
            </button>
          </div>
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{selectedItems.size} selected</span>
              <button
                onClick={clearSelection}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
              >
                Delete Selected
              </button>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="bg-white rounded-xl border border-gray-200 min-h-[400px]">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading collection...</p>
            </div>
          ) : tree.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">📭</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Collection is empty</h3>
              <p className="text-gray-600 mb-4">Start by adding folders and bookmarks.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={allItemIds} strategy={verticalListSortingStrategy}>
                <div className="py-2">
                  {tree.map(item => renderItem(item))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeItem && (
                  <div className="bg-white border border-amber-300 shadow-lg rounded-lg px-4 py-2 flex items-center gap-2">
                    <span>{activeItem.type === 'folder' ? '📁' : '🔖'}</span>
                    <span>{activeItem.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Help text */}
        <p className="mt-4 text-sm text-gray-500 text-center">
          💡 Double-click to edit titles • Drag items to reorder • Changes are saved when you click "Save Changes"
        </p>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Add {showAddModal === 'folder' ? 'Folder' : 'Bookmark'}
            </h2>
            <form onSubmit={handleAddItem}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  placeholder={showAddModal === 'folder' ? 'Folder name' : 'Bookmark title'}
                  required
                  autoFocus
                />
              </div>
              {showAddModal === 'bookmark' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL
                  </label>
                  <input
                    type="url"
                    value={newItemUrl}
                    onChange={(e) => setNewItemUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    placeholder="https://example.com"
                    required
                  />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(null)
                    setNewItemTitle('')
                    setNewItemUrl('')
                  }}
                  className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
