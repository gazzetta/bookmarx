'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Bookmark, BrowserHistoryBrowserInfo, BrowserHistoryEntry, Folder } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

interface SyncDetails {
  changesProcessed?: number
  bookmarksCreated?: number
  foldersCreated?: number
  bookmarksUpdated?: number
  foldersUpdated?: number
  bookmarksDeleted?: number
  foldersDeleted?: number
  bookmarksSkipped?: number
  foldersSkipped?: number
}

type BrowserHistoryDetail = BrowserHistoryEntry & {
  details?: SyncDetails | null
}

type FolderNode = Folder & {
  childFolders: FolderNode[]
  childBookmarks: Bookmark[]
}

export default function BrowserHistoryDetailPage() {
  const router = useRouter()
  const params = useParams()
  const browserInstanceId = params.browserInstanceId as string
  const historyId = params.historyId as string
  const { user, token, isLoading } = useAuth()
  const [browser, setBrowser] = useState<BrowserHistoryBrowserInfo | null>(null)
  const [history, setHistory] = useState<BrowserHistoryDetail | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (token && browserInstanceId && historyId) {
      loadHistoryDetail()
    }
  }, [token, browserInstanceId, historyId])

  const loadHistoryDetail = async () => {
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const data = await api.getBrowserHistoryDetail(token, browserInstanceId, historyId)
      setBrowser(data.browser)
      setHistory(data.history as BrowserHistoryDetail)
      setFolders(data.folders || [])
      setBookmarks(data.bookmarks || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history details')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'N/A'
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp
    return new Date(ms).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getBrowserIcon = (name: string) => {
    const lower = name.toLowerCase()
    if (lower.includes('chrome')) return '🌐'
    if (lower.includes('firefox')) return '🦊'
    if (lower.includes('edge')) return '📘'
    if (lower.includes('brave')) return '🦁'
    if (lower.includes('safari')) return '🧭'
    if (lower.includes('opera')) return '🎭'
    return '🔍'
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return 'Initial Import'
      case 'SYNC':
        return 'Sync'
      case 'MERGE_IMPORT':
        return 'Merge Import'
      default:
        return type
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
      case 'SYNC':
        return 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/60'
      case 'MERGE_IMPORT':
        return 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400'
      default:
        return 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/60'
    }
  }

  const getBreakdownRows = () => {
    const details = history?.details || {}
    const rows = [
      { label: 'Bookmarks created', value: details.bookmarksCreated ?? (history?.type === 'INITIAL_IMPORT' ? history.bookmarksProcessed : 0) },
      { label: 'Folders created', value: details.foldersCreated ?? (history?.type === 'INITIAL_IMPORT' ? history.foldersProcessed : 0) },
      { label: 'Bookmarks updated', value: details.bookmarksUpdated ?? 0 },
      { label: 'Folders updated', value: details.foldersUpdated ?? 0 },
      { label: 'Bookmarks deleted', value: details.bookmarksDeleted ?? 0 },
      { label: 'Folders deleted', value: details.foldersDeleted ?? 0 },
      { label: 'Bookmarks skipped', value: details.bookmarksSkipped ?? 0 },
      { label: 'Folders skipped', value: details.foldersSkipped ?? 0 },
    ]

    return rows.filter((row) => row.value > 0)
  }

  const buildHierarchy = () => {
    const folderMap = new Map<string, FolderNode>()

    const sortedFolders = [...folders].sort((a, b) => a.position - b.position)
    const sortedBookmarks = [...bookmarks].sort((a, b) => a.position - b.position)

    sortedFolders.forEach((folder) => {
      folderMap.set(folder.masterId, {
        ...folder,
        childFolders: [],
        childBookmarks: [],
      })
    })

    const rootFolders: FolderNode[] = []
    const rootBookmarks: Bookmark[] = []

    sortedFolders.forEach((folder) => {
      const node = folderMap.get(folder.masterId)
      if (!node) return

      const parent = folder.masterParentId ? folderMap.get(folder.masterParentId) : undefined
      if (parent) {
        parent.childFolders.push(node)
      } else {
        rootFolders.push(node)
      }
    })

    sortedBookmarks.forEach((bookmark) => {
      const parent = bookmark.masterParentId ? folderMap.get(bookmark.masterParentId) : undefined
      if (parent) {
        parent.childBookmarks.push(bookmark)
      } else {
        rootBookmarks.push(bookmark)
      }
    })

    const sortNodes = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
      nodes.forEach((node) => {
        node.childFolders.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
        node.childBookmarks.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
        sortNodes(node.childFolders)
      })
    }

    sortNodes(rootFolders)
    rootBookmarks.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

    return { rootFolders, rootBookmarks }
  }

  const renderFolderNode = (node: FolderNode, depth = 0): ReactNode => {
    const indent = depth * 20

    return (
      <div key={node.id}>
        <div className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors" style={{ paddingLeft: `${24 + indent}px` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center text-lg shrink-0">📁</div>
            <div className="min-w-0">
              <div className="font-bold text-slate-700 dark:text-white/70 break-words">{node.title}</div>
              <div className="text-xs text-slate-400 dark:text-white/40 mt-1">Folder</div>
            </div>
          </div>
        </div>
        {node.childFolders.map((childFolder) => renderFolderNode(childFolder, depth + 1))}
        {node.childBookmarks.map((bookmark) => (
          <div key={bookmark.id} className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors" style={{ paddingLeft: `${44 + indent}px` }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#242424] border border-slate-100 dark:border-white/5 flex items-center justify-center shadow-sm shrink-0">
                {bookmark.favicon ? (
                  <img src={bookmark.favicon} alt="" className="w-4 h-4 object-contain" />
                ) : (
                  <span className="text-lg">🔖</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-700 dark:text-white/70 break-words">{bookmark.title}</div>
                <div className="text-xs text-slate-400 dark:text-white/40 truncate mt-1">{bookmark.url}</div>
              </div>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 dark:text-white/30 hover:text-primary-600 dark:hover:text-terra-400 hover:bg-white dark:hover:bg-[#242424] hover:shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const { rootFolders, rootBookmarks } = buildHierarchy()

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <Link
          href={`/settings/browsers/${browserInstanceId}/history`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-cream-500 hover:text-primary-600 dark:hover:text-terra-400 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Browser History
        </Link>

        {error ? (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-5 mb-8 flex items-center gap-3 text-red-700 dark:text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        ) : loading ? (
          <div className="p-16 text-center">
            <div className="w-10 h-10 border-3 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 dark:text-white/50 mt-6 font-medium">Loading history details...</p>
          </div>
        ) : history && browser ? (
          <>
            <div className="mb-10 flex items-start gap-4">
              <div className="w-14 h-14 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-3xl">
                {getBrowserIcon(browser.browser)}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">
                  {browser.nickname || browser.browser} Import Details
                </h1>
                <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">
                  Full list of folders and bookmarks recorded for this history entry
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 shadow-sm mb-8">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${getTypeColor(history.type)}`}>
                  {getTypeLabel(history.type)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-white/50">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                  {history.collectionName}
                </span>
                <span className="text-sm text-slate-500 dark:text-white/50">
                  {formatDate(history.timestamp || history.createdAt)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] p-5">
                  <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">{history.changesCount}</div>
                  <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Total Changes</div>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] p-5">
                  <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">{bookmarks.length}</div>
                  <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Bookmarks Listed</div>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/[0.06] p-5">
                  <div className="text-2xl font-bold text-slate-900 dark:text-cream-100">{folders.length}</div>
                  <div className="text-sm text-slate-500 dark:text-white/50 mt-1">Folders Listed</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-3">
                  Change Breakdown
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {getBreakdownRows().map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] px-4 py-3"
                    >
                      <div className="text-lg font-bold text-slate-900 dark:text-cream-100">
                        {row.value}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-white/50 mt-1">
                        {row.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center justify-between">
                <h2 className="font-bold text-slate-900 dark:text-cream-100">Imported Hierarchy</h2>
                <span className="text-xs text-slate-400 dark:text-white/40">{folders.length + bookmarks.length} items</span>
              </div>
              <div className="max-h-[700px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-white/5">
                {rootFolders.length === 0 && rootBookmarks.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 dark:text-white/50">No items recorded for this entry.</div>
                ) : (
                  <>
                    {rootFolders.map((folder) => renderFolderNode(folder))}
                    {rootBookmarks.map((bookmark) => (
                      <div key={bookmark.id} className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#242424] border border-slate-100 dark:border-white/5 flex items-center justify-center shadow-sm shrink-0">
                            {bookmark.favicon ? (
                              <img src={bookmark.favicon} alt="" className="w-4 h-4 object-contain" />
                            ) : (
                              <span className="text-lg">🔖</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-700 dark:text-white/70 break-words">{bookmark.title}</div>
                            <div className="text-xs text-slate-400 dark:text-white/40 truncate mt-1">{bookmark.url}</div>
                          </div>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 dark:text-white/30 hover:text-primary-600 dark:hover:text-terra-400 hover:bg-white dark:hover:bg-[#242424] hover:shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
