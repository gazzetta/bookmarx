'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Collection, Folder, Bookmark, CollectionEvent, CollectionBrowser } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

interface TreeItem {
  type: 'folder' | 'bookmark'
  id: string
  masterId: string
  title: string
  url?: string
  favicon?: string | null
  children?: TreeItem[]
  position: number
}

export default function CollectionViewPage() {
  const router = useRouter()
  const params = useParams()
  const collectionId = params.id as string
  const { user, token, isLoading, isPremium } = useAuth()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [tree, setTree] = useState<TreeItem[]>([])
  const [events, setEvents] = useState<CollectionEvent[]>([])
  const [folderCount, setFolderCount] = useState(0)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [eventLoading, setEventLoading] = useState(true)
  const [rollingBackEventId, setRollingBackEventId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveBrowsers, setArchiveBrowsers] = useState<CollectionBrowser[]>([])
  const [archiveCheckDone, setArchiveCheckDone] = useState(false)

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
      const [data, eventsData] = await Promise.all([
        api.getCollection(token, collectionId),
        isPremium ? api.getCollectionEvents(token, collectionId) : Promise.resolve({ collection: null as unknown as Collection, events: [], count: 0 }),
      ])
      setCollection(data.collection)
      setEvents(eventsData.events || [])
      setFolderCount(data.folders.length)
      setBookmarkCount(data.bookmarks.length)

      const treeData = buildTree(data.folders, data.bookmarks)
      setTree(treeData)

      const topLevelIds = treeData
        .filter(item => item.type === 'folder')
        .map(item => item.masterId)
      setExpandedFolders(new Set(topLevelIds))
    } catch (error) {
      console.error('Failed to load collection:', error)
    } finally {
      setLoading(false)
      setEventLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEventLabel = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return 'Initial Import'
      case 'MERGE_IMPORT':
        return 'Merge Import'
      case 'MANUAL_EDIT':
        return 'Manual Edit'
      default:
        return type
    }
  }

  const getEventTheme = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return {
          icon: '🚀',
          badge: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
          iconWrap: 'bg-blue-50 dark:bg-blue-500/10'
        }
      case 'MERGE_IMPORT':
        return {
          icon: '🔄',
          badge: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          iconWrap: 'bg-emerald-50 dark:bg-emerald-500/10'
        }
      case 'MANUAL_EDIT':
        return {
          icon: '✏️',
          badge: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',
          iconWrap: 'bg-purple-50 dark:bg-purple-500/10'
        }
      default:
        return {
          icon: '📝',
          badge: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/70',
          iconWrap: 'bg-slate-50 dark:bg-white/5'
        }
    }
  }

  const getEventSummary = (event: CollectionEvent) => {
    const details = event.details || {}
    const parts: string[] = []

    const foldersCreated = typeof details.foldersCreated === 'number' ? details.foldersCreated : null
    const foldersSkipped = typeof details.foldersSkipped === 'number' ? details.foldersSkipped : null
    const bookmarksCreated = typeof details.bookmarksCreated === 'number' ? details.bookmarksCreated : null
    const bookmarksSkipped = typeof details.bookmarksSkipped === 'number' ? details.bookmarksSkipped : null
    const applied = typeof details.applied === 'number' ? details.applied : null

    if (foldersCreated !== null) parts.push(`${foldersCreated} folders added`)
    if (bookmarksCreated !== null) parts.push(`${bookmarksCreated} bookmarks added`)
    if (foldersSkipped) parts.push(`${foldersSkipped} folders skipped`)
    if (bookmarksSkipped) parts.push(`${bookmarksSkipped} bookmarks skipped`)
    if (applied !== null) parts.push(`${applied} editor changes applied`)

    return parts.length > 0 ? parts.join(' • ') : `${event.changesCount} change${event.changesCount === 1 ? '' : 's'} recorded`
  }

  const collectFolderIds = (items: TreeItem[]): string[] => {
    return items.flatMap((item) => {
      if (item.type !== 'folder') return []
      return [item.masterId, ...(item.children ? collectFolderIds(item.children) : [])]
    })
  }

  const expandAllFolders = () => {
    setExpandedFolders(new Set(collectFolderIds(tree)))
  }

  const collapseAllFolders = () => {
    setExpandedFolders(new Set())
  }

  const handleRollbackEvent = async (eventId: string) => {
    if (!token) return
    if (!confirm('Rollback this collection to the state before this event?')) return

    setRollingBackEventId(eventId)
    setNotice(null)
    try {
      const result = await api.rollbackCollectionEvent(token, collectionId, eventId)
      await loadCollection()
      setNotice({
        type: 'success',
        message: `Collection restored. ${result.restoredFolders} folders and ${result.restoredBookmarks} bookmarks were restored to the pre-event state.`
      })
    } catch (error) {
      console.error('Failed to rollback collection event:', error)
      setNotice({
        type: 'error',
        message: 'Failed to rollback this restore point. Please try again.'
      })
    } finally {
      setRollingBackEventId(null)
    }
  }

  const handleArchiveClick = async () => {
    if (!token || !collectionId) return
    setArchiveCheckDone(false)
    setArchiveBrowsers([])
    setShowArchiveModal(true)

    try {
      const data = await api.getCollectionBrowsers(token, collectionId)
      setArchiveBrowsers(data.browsers || [])
    } catch (error) {
      console.error('Failed to check browser usage:', error)
      setArchiveBrowsers([])
    } finally {
      setArchiveCheckDone(true)
    }
  }

  const handleConfirmArchive = async () => {
    if (!token || !collectionId) return
    setArchiveLoading(true)
    try {
      await api.archiveCollection(token, collectionId)
      setShowArchiveModal(false)
      setNotice({
        type: 'success',
        message: 'Collection has been archived. Your data will be kept for 30 days before permanent deletion.'
      })
      setTimeout(() => router.push('/collections'), 2000)
    } catch (error: any) {
      if (error?.code === 'COLLECTION_IN_USE') {
        setArchiveBrowsers(error.browsers || [])
      } else {
        setNotice({
          type: 'error',
          message: 'Failed to archive collection. Please try again.'
        })
        setShowArchiveModal(false)
      }
    } finally {
      setArchiveLoading(false)
    }
  }

  const buildTree = (folders: Folder[], bookmarks: Bookmark[]): TreeItem[] => {
    // Create a map of items by masterId
    const folderMap = new Map<string, TreeItem>()
    const rootItems: TreeItem[] = []

    // Convert folders to tree items
    folders.forEach(folder => {
      folderMap.set(folder.masterId, {
        type: 'folder',
        id: folder.id,
        masterId: folder.masterId,
        title: folder.title,
        children: [],
        position: folder.position ?? 0
      })
    })

    // Add bookmarks to their parent folders or root
    bookmarks.forEach(bookmark => {
      const item: TreeItem = {
        type: 'bookmark',
        id: bookmark.id,
        masterId: bookmark.masterId,
        title: bookmark.title,
        url: bookmark.url,
        favicon: bookmark.favicon,
        position: bookmark.position ?? 0
      }

      if (bookmark.masterParentId && folderMap.has(bookmark.masterParentId)) {
        folderMap.get(bookmark.masterParentId)!.children!.push(item)
      } else {
        rootItems.push(item)
      }
    })

    // Build folder hierarchy
    folders.forEach(folder => {
      const treeItem = folderMap.get(folder.masterId)!

      if (folder.masterParentId && folderMap.has(folder.masterParentId)) {
        folderMap.get(folder.masterParentId)!.children!.push(treeItem)
      } else {
        rootItems.push(treeItem)
      }
    })

    // Sort children by position (preserving original browser order)
    const sortChildren = (items: TreeItem[]) => {
      items.sort((a, b) => {
        // Sort purely by position to match browser extension order
        return (a.position ?? 0) - (b.position ?? 0)
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
        <div key={item.masterId} className="select-none">
          <button
            onClick={() => toggleFolder(item.masterId)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-all group/folder"
            style={{ paddingLeft: `${depth * 28 + 16}px` }}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-primary-50 dark:bg-terra-500/10 text-primary-600 dark:text-terra-400' : 'text-slate-400 dark:text-white/40 group-hover/folder:text-slate-600 dark:group-hover/folder:text-cream-500'}`}>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center text-lg group-hover/folder:bg-white dark:group-hover/folder:bg-[#242424] group-hover/folder:shadow-sm transition-all">
              📁
            </div>

            <span className="font-bold text-slate-700 dark:text-white/70 group-hover/folder:text-slate-900 dark:group-hover/folder:text-cream-100 transition-colors">
              {item.title}
            </span>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-white/30 group-hover/folder:text-slate-400 dark:group-hover/folder:text-white/40 transition-colors">
                {item.children?.length || 0} items
              </span>
            </div>
          </button>

          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
            {item.children && item.children.map(child => renderTreeItem(child, depth + 1))}
          </div>
        </div>
      )
    }

    return (
      <a
        key={item.masterId}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 px-4 py-3 hover:bg-primary-50/50 dark:hover:bg-terra-500/10 rounded-2xl transition-all group/bookmark"
        style={{ paddingLeft: `${depth * 28 + 48}px` }}
      >
        <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#242424] border border-slate-100 dark:border-white/5 flex items-center justify-center shadow-sm group-hover/bookmark:border-primary-100 transition-all">
          {item.favicon ? (
            <img src={item.favicon} alt="" className="w-4 h-4 object-contain" />
          ) : (
            <span className="text-slate-400 dark:text-white/40 text-xs">🔖</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-700 dark:text-white/70 group-hover/bookmark:text-primary-700 dark:group-hover/bookmark:text-terra-400 transition-colors truncate">
            {item.title}
          </div>
          {item.url && (
            <div className="text-[10px] font-medium text-slate-400 dark:text-white/40 truncate mt-0.5">
              {item.url.replace(/^https?:\/\/(www\.)?/, '')}
            </div>
          )}
        </div>

        <div className="opacity-0 group-hover/bookmark:opacity-100 transition-all translate-x-1 group-hover/bookmark:translate-x-0">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-primary-600 dark:text-terra-400 shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
        </div>
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
  const filteredCount = (items: TreeItem[]): number => items.reduce((total, item) => total + 1 + (item.children ? filteredCount(item.children) : 0), 0)
  const visibleItemCount = filteredCount(filteredTree)
  const latestEvent = events[0]

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <Link
              href="/collections"
              className="w-12 h-12 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-primary-600 dark:hover:text-terra-400 hover:border-primary-100 hover:shadow-lg hover:shadow-primary-500/5 transition-all group"
            >
              <svg className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-cream-100 tracking-tight">
                {loading ? 'Loading...' : collection?.name || 'Collection'}
              </h1>
              {collection?.description && (
                <p className="text-slate-500 dark:text-white/50 mt-1 font-medium">{collection.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {collection?.isDefault ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-white/10 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-white/70 uppercase tracking-wider">
                    Master Collection
                  </span>
                ) : null}
                <span className="inline-flex items-center rounded-full bg-primary-50 dark:bg-terra-500/10 px-3 py-1 text-[11px] font-bold text-primary-700 dark:text-terra-300 uppercase tracking-wider">
                  {folderCount + bookmarkCount} saved items
                </span>
                {isPremium ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                    {events.length} restore points
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {isPremium ? (
              <>
                <Link
                  href={`/collections/${collectionId}/edit`}
                  className="inline-flex items-center justify-center gap-2 bg-primary-600 dark:bg-terra-500 hover:bg-primary-700 dark:hover:bg-terra-600 text-white px-6 py-3 rounded-xl font-bold transition-all hover:shadow-lg shadow-primary-500/20 active:scale-95"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Modify Collection
                </Link>
                {!collection?.isDefault && (
                  <button
                    onClick={handleArchiveClick}
                    className="inline-flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-600 dark:text-white/60 hover:text-red-600 dark:hover:text-red-400 px-5 py-3 rounded-xl font-bold transition-all border border-slate-200 dark:border-white/[0.06] hover:border-red-200 dark:hover:border-red-500/20 active:scale-95"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Archive
                  </button>
                )}
              </>
            ) : (
              <Link
                href="/settings/subscription"
                className="inline-flex items-center justify-center gap-2 bg-primary-50 dark:bg-terra-500/10 border border-primary-100 text-primary-700 dark:text-terra-400 px-6 py-3 rounded-xl font-bold transition-all hover:bg-primary-100 active:scale-95"
              >
                <span className="text-lg">⭐</span>
                Upgrade to Edit
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
          <div className="bg-white dark:bg-[#242424] rounded-[1.75rem] border border-slate-200 dark:border-white/[0.06] p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Folders</div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-cream-100">{folderCount}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-white/50">Structured sections inside this collection</div>
          </div>
          <div className="bg-white dark:bg-[#242424] rounded-[1.75rem] border border-slate-200 dark:border-white/[0.06] p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Bookmarks</div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-cream-100">{bookmarkCount}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-white/50">Saved links ready to open from any device</div>
          </div>
          <div className="bg-white dark:bg-[#242424] rounded-[1.75rem] border border-slate-200 dark:border-white/[0.06] p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Restore Points</div>
            <div className="mt-3 text-3xl font-black text-slate-900 dark:text-cream-100">{events.length}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-white/50">Moments you can roll back to safely</div>
          </div>
          <div className="bg-white dark:bg-[#242424] rounded-[1.75rem] border border-slate-200 dark:border-white/[0.06] p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Latest Activity</div>
            <div className="mt-3 text-lg font-black text-slate-900 dark:text-cream-100 leading-tight">
              {latestEvent ? getEventLabel(latestEvent.type) : 'No activity yet'}
            </div>
            <div className="mt-2 text-sm text-slate-500 dark:text-white/50">
              {latestEvent ? formatDate(latestEvent.createdAt || latestEvent.timestamp) : 'Your next import or edit will appear here'}
            </div>
          </div>
        </div>

        {notice ? (
          <div className={`mb-8 rounded-[1.75rem] border px-6 py-5 shadow-sm ${notice.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-200'}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-lg">{notice.type === 'success' ? '✅' : '⚠️'}</div>
              <div>
                <div className="font-bold">{notice.type === 'success' ? 'Collection updated' : 'Action failed'}</div>
                <div className="mt-1 text-sm opacity-90">{notice.message}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-8 bg-white dark:bg-[#242424] rounded-[2rem] border border-slate-200 dark:border-white/[0.06] p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="relative flex-1 group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                <svg
                  className="w-5 h-5 text-slate-400 dark:text-white/40 group-focus-within:text-primary-500 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles, folders, or URLs..."
                className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-900 dark:text-cream-100 placeholder:text-slate-400 dark:placeholder:text-white/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={expandAllFolders}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/[0.06] px-4 py-3 text-sm font-bold text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
              >
                Expand all
              </button>
              <button
                onClick={collapseAllFolders}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/[0.06] px-4 py-3 text-sm font-bold text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
              >
                Collapse all
              </button>
              <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 text-sm font-bold text-slate-600 dark:text-white/60">
                {visibleItemCount} visible
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#242424] rounded-[2rem] border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-20 text-center">
              <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-500 dark:text-white/50 mt-6 font-bold tracking-tight uppercase text-xs">Assembling Library...</p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="p-20 text-center">
              <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1m-6 9a3 3 0 100-6 3 3 0 000 6zm-7 0a3 3 0 110-6 3 3 0 010 6z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">
                {searchQuery ? 'No matches found' : 'This collection is empty'}
              </h3>
              <p className="text-slate-500 dark:text-white/50 max-w-xs mx-auto text-lg leading-relaxed">
                {searchQuery
                  ? 'Try expanding your search criteria'
                  : 'Add some bookmarks from your browser extension to get started.'}
              </p>
            </div>
          ) : (
            <div className="py-4">
              <div className="px-8 pb-4 mb-2 border-b border-slate-50 dark:border-white/5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
                  <span>Structure & Content</span>
                  <span>{searchQuery ? 'Filtered View' : 'Action'}</span>
                </div>
                <div className="mt-3 text-sm text-slate-500 dark:text-white/50">
                  {searchQuery
                    ? `Showing ${visibleItemCount} matching items for “${searchQuery}”`
                    : 'Browse your saved folders and links in browser order.'}
                </div>
              </div>
              <div className="px-4">
                {filteredTree.map(item => renderTreeItem(item))}
              </div>
            </div>
          )}
        </div>

        {isPremium && (
          <div className="mt-8 bg-white dark:bg-[#242424] rounded-[2rem] border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-cream-100">Collection Restore Points</h2>
                <p className="text-sm text-slate-500 dark:text-white/50 mt-1">Restore this collection to how it looked before each major import or edit. Great for undoing a bad import, merge, or batch edit.</p>
              </div>
              <div className="hidden sm:flex items-center rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">
                {events.length} total checkpoints
              </div>
            </div>

            {eventLoading ? (
              <div className="p-8 text-sm text-slate-500 dark:text-white/50">Loading event history...</div>
            ) : events.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto mb-5 text-2xl">🕘</div>
                <div className="text-lg font-bold text-slate-900 dark:text-cream-100">No restore points yet</div>
                <div className="mt-2 text-sm text-slate-500 dark:text-white/50 max-w-md mx-auto">Your next sync, import, or editor save will automatically create a rollback checkpoint here.</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {events.map((event) => (
                  <div key={event.eventId} className="px-8 py-6 flex flex-col xl:flex-row xl:items-center gap-5 xl:gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${getEventTheme(event.type).iconWrap}`}>
                      {getEventTheme(event.type).icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${getEventTheme(event.type).badge}`}>
                          {getEventLabel(event.type)}
                        </span>
                        {event.rolledBackAt ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                            Rolled back
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-base font-bold text-slate-900 dark:text-cream-100">
                        {getEventSummary(event)}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-white/50">
                        <span>{formatDate(event.createdAt || event.timestamp)}</span>
                        {event.sourceBrowser ? <span>Source: {event.sourceBrowser}</span> : <span>Source: Web editor</span>}
                        {event.sessionId ? <span>Session: {event.sessionId.slice(0, 10)}...</span> : null}
                        <span>{event.changesCount} change{event.changesCount === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-3 text-sm text-slate-500 dark:text-white/50">
                        Restoring this point returns the collection to its state immediately before this event ran.
                      </div>
                    </div>
                    <div className="flex items-center gap-3 xl:justify-end">
                      <button
                        onClick={() => handleRollbackEvent(event.eventId)}
                        disabled={rollingBackEventId === event.eventId}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50"
                      >
                        {rollingBackEventId === event.eventId ? 'Rolling back...' : 'Rollback to Before This'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Archive Collection Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#2A2A2A] rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            {!archiveCheckDone ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 border-4 border-slate-100 dark:border-white/10 border-t-red-500 rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-500 dark:text-white/50 mt-6 font-bold">Checking browser usage...</p>
              </div>
            ) : archiveBrowsers.length > 0 ? (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Cannot Archive Yet</h2>
                    <p className="text-slate-500 dark:text-white/50">This collection is currently in use</p>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5 mb-6">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-4">
                    This collection cannot be archived because it is currently being used by the following browser{archiveBrowsers.length > 1 ? 's' : ''}. Please disconnect the collection from these browsers first.
                  </p>
                  <div className="space-y-3">
                    {archiveBrowsers.map((b) => (
                      <Link
                        key={b.browserInstanceId}
                        href={`/settings/browsers`}
                        onClick={() => setShowArchiveModal(false)}
                        className="flex items-center gap-4 bg-white dark:bg-[#242424] rounded-xl p-4 border border-amber-100 dark:border-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/30 transition-all group"
                      >
                        <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center">
                          <svg className="w-5 h-5 text-slate-500 dark:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">
                            {b.nickname || b.browser}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-white/50">
                            {b.browser} {b.os ? `on ${b.os}` : ''}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-slate-400 dark:text-white/30 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setShowArchiveModal(false)}
                  className="w-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 py-4 rounded-2xl font-bold transition-all"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Archive Collection</h2>
                    <p className="text-slate-500 dark:text-white/50">This action can be undone within 30 days</p>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-5 mb-6">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium leading-relaxed">
                    Are you sure you want to archive <strong>{collection?.name}</strong>? This collection and all its bookmarks and folders will be moved to your archive.
                  </p>
                  <div className="mt-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700 dark:text-red-300 font-bold">
                      Your data will be kept for 30 days. After 30 days, the collection and all its contents will be permanently deleted from the database.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowArchiveModal(false)}
                    className="flex-1 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 py-4 rounded-2xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmArchive}
                    disabled={archiveLoading}
                    className="flex-[2] bg-red-600 hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-500/30 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-red-500/25"
                  >
                    {archiveLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Archiving...
                      </span>
                    ) : 'Yes, Archive Collection'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
