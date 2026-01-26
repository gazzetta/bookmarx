'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Collection, Folder, Bookmark } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

interface TreeItem {
  type: 'folder' | 'bookmark'
  id: string
  masterId: string
  title: string
  url?: string
  favicon?: string | null
  children?: TreeItem[]
}

export default function CollectionViewPage() {
  const router = useRouter()
  const params = useParams()
  const collectionId = params.id as string
  const { user, token, isLoading, isPremium } = useAuth()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (token && collectionId) {
      loadCollection()
    }
  }, [token, collectionId])

  const loadCollection = async () => {
    if (!token) return
    try {
      const data = await api.getCollection(token, collectionId)
      setCollection(data.collection)
      
      // Build tree structure
      const treeData = buildTree(data.folders, data.bookmarks)
      setTree(treeData)
      
      // Expand top-level folders by default
      const topLevelIds = treeData
        .filter(item => item.type === 'folder')
        .map(item => item.masterId)
      setExpandedFolders(new Set(topLevelIds))
    } catch (error) {
      console.error('Failed to load collection:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildTree = (folders: Folder[], bookmarks: Bookmark[]): TreeItem[] => {
    // Create a map of items by masterId
    const folderMap = new Map<string, TreeItem>()
    
    // Convert folders to tree items
    folders.forEach(folder => {
      folderMap.set(folder.masterId, {
        type: 'folder',
        id: folder.id,
        masterId: folder.masterId,
        title: folder.title,
        children: []
      })
    })

    // Add bookmarks to their parent folders
    bookmarks.forEach(bookmark => {
      const item: TreeItem = {
        type: 'bookmark',
        id: bookmark.id,
        masterId: bookmark.masterId,
        title: bookmark.title,
        url: bookmark.url,
        favicon: bookmark.favicon
      }

      if (bookmark.masterParentId && folderMap.has(bookmark.masterParentId)) {
        folderMap.get(bookmark.masterParentId)!.children!.push(item)
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

    // Sort children by title
    const sortChildren = (items: TreeItem[]) => {
      items.sort((a, b) => {
        // Folders first, then bookmarks
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.title.localeCompare(b.title)
      })
      items.forEach(item => {
        if (item.children) sortChildren(item.children)
      })
    }
    sortChildren(rootItems)

    return rootItems
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

  const filterItems = (items: TreeItem[], query: string): TreeItem[] => {
    if (!query.trim()) return items

    const lowerQuery = query.toLowerCase()
    
    return items.reduce<TreeItem[]>((acc, item) => {
      const matches = item.title.toLowerCase().includes(lowerQuery) ||
        (item.url && item.url.toLowerCase().includes(lowerQuery))

      if (item.type === 'folder' && item.children) {
        const filteredChildren = filterItems(item.children, query)
        if (filteredChildren.length > 0 || matches) {
          acc.push({
            ...item,
            children: filteredChildren
          })
        }
      } else if (matches) {
        acc.push(item)
      }

      return acc
    }, [])
  }

  const renderTreeItem = (item: TreeItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(item.masterId)
    
    if (item.type === 'folder') {
      return (
        <div key={item.masterId}>
          <button
            onClick={() => toggleFolder(item.masterId)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors"
            style={{ paddingLeft: `${depth * 20 + 12}px` }}
          >
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-lg">📁</span>
            <span className="font-medium text-gray-900">{item.title}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {item.children?.length || 0} items
            </span>
          </button>
          {isExpanded && item.children && (
            <div>
              {item.children.map(child => renderTreeItem(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <a
        key={item.masterId}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors group"
        style={{ paddingLeft: `${depth * 20 + 36}px` }}
      >
        {item.favicon ? (
          <img src={item.favicon} alt="" className="w-4 h-4" />
        ) : (
          <span className="text-gray-400 text-sm">🔖</span>
        )}
        <span className="text-gray-700 truncate flex-1">{item.title}</span>
        <svg 
          className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    )
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  const filteredTree = filterItems(tree, searchQuery)

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/collections"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {loading ? 'Loading...' : collection?.name || 'Collection'}
              </h1>
              {collection?.description && (
                <p className="text-gray-600 mt-1">{collection.description}</p>
              )}
            </div>
          </div>
          {isPremium ? (
            <Link
              href={`/collections/${collectionId}/edit`}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Collection
            </Link>
          ) : (
            <Link
              href="/settings/subscription"
              className="border border-amber-300 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>⭐</span>
              Upgrade to Edit
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bookmarks..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Tree View */}
        <div className="bg-white rounded-xl border border-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading collection...</p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">📭</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? 'No results found' : 'Collection is empty'}
              </h3>
              <p className="text-gray-600">
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Sync bookmarks from a browser to populate this collection.'}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filteredTree.map(item => renderTreeItem(item))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
