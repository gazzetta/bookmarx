'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, SessionSummary, Folder, Bookmark } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function SessionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const { user, token, isLoading, isPremium } = useAuth()
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [isRolledBack, setIsRolledBack] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
    if (!isLoading && user && !isPremium) {
      router.push('/dashboard')
    }
  }, [isLoading, user, isPremium, router])

  useEffect(() => {
    if (token && sessionId && isPremium) {
      loadSession()
    }
  }, [token, sessionId, isPremium])

  const loadSession = async () => {
    if (!token) return
    try {
      const data = await api.getSession(token, sessionId)
      setSession(data.session)
      setFolders(data.folders)
      setBookmarks(data.bookmarks)
    } catch (error) {
      console.error('Failed to load session:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = async () => {
    if (!token || !confirm('Are you sure you want to rollback this session? All items from this sync will be removed from your Master Collection.')) {
      return
    }

    setActionLoading(true)
    try {
      const result = await api.rollbackSession(token, sessionId)
      setIsRolledBack(true)
      alert(`Successfully rolled back ${result.rolledBackCount} items.`)
    } catch (error) {
      console.error('Failed to rollback session:', error)
      alert('Failed to rollback session. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestore = async () => {
    if (!token || !confirm('Are you sure you want to restore this session? All items will be added back to your Master Collection.')) {
      return
    }

    setActionLoading(true)
    try {
      const result = await api.restoreSession(token, sessionId)
      setIsRolledBack(false)
      alert(`Successfully restored ${result.restoredCount} items.`)
    } catch (error) {
      console.error('Failed to restore session:', error)
      alert('Failed to restore session. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return { label: 'Initial Sync', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', icon: '🚀' }
      case 'MERGE_IMPORT':
        return { label: 'Merge', color: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300', icon: '🔄' }
      case 'MANUAL_EDIT':
        return { label: 'Manual Edit', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300', icon: '✏️' }
      default:
        return { label: type, color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300', icon: '📝' }
    }
  }

  if (isLoading || !user || !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  const typeInfo = session ? getSessionTypeLabel(session.type) : null

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <Link
              href="/sessions"
              className="w-12 h-12 bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-2xl flex items-center justify-center text-slate-400 dark:text-white/40 hover:text-primary-600 dark:hover:text-terra-400 hover:border-primary-100 hover:shadow-lg hover:shadow-primary-500/5 transition-all group"
            >
              <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-cream-100 tracking-tight">Session Details</h1>
              <p className="text-slate-500 dark:text-white/50 mt-1 font-medium">
                {loading ? 'Analyzing data...' : `Sync from ${session?.sourceBrowser || 'Unknown Source'}`}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-[#242424] rounded-[2.5rem] border border-slate-200 dark:border-white/[0.06] p-20 text-center shadow-sm">
            <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 dark:text-white/50 mt-6 font-bold tracking-tight uppercase text-xs">Retrieving session manifest...</p>
          </div>
        ) : session ? (
          <>
            {/* Session Info card */}
            <div className={`relative overflow-hidden bg-white dark:bg-[#242424] rounded-[2.5rem] border p-10 mb-8 shadow-sm transition-all ${isRolledBack ? 'border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10' : 'border-slate-200 dark:border-white/[0.06]'}`}>
              {isRolledBack && (
                <div className="mb-8 p-4 bg-red-100/50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-2xl flex items-center gap-3 text-red-700 dark:text-red-300 font-bold text-sm animate-in fade-in slide-in-from-top-2">
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  This session has been rolled back and is hidden from your collection.
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-10">
                <div>
                  <div className="flex items-center gap-5 mb-6">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-4xl shadow-sm border border-slate-100 dark:border-white/5">
                      {typeInfo?.icon}
                    </div>
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${typeInfo?.color}`}>
                        {typeInfo?.label}
                      </span>
                      <h2 className="text-2xl font-black text-slate-900 dark:text-cream-100 mt-2 tracking-tight">
                        {session.sourceBrowser || 'Unknown'}
                      </h2>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400 dark:text-white/40 font-bold uppercase tracking-tighter text-xs">Sync Date</span>
                      <span className="text-slate-900 dark:text-cream-100 font-bold">{formatDate(session.timestamp)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-50 dark:border-white/5">
                      <span className="text-slate-400 dark:text-white/40 font-bold uppercase tracking-tighter text-xs">Signature</span>
                      <span className="text-slate-900 dark:text-cream-100 font-mono text-xs bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-md">{session.sessionId.slice(0, 12)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-400 dark:text-white/40 uppercase tracking-[0.2em] mb-4">Payload Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 dark:bg-white/5 rounded-[2rem] p-5 text-center border border-slate-100/50 dark:border-white/5">
                      <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{session.itemCount}</div>
                      <div className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-tighter mt-1">Total</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-[2rem] p-5 text-center border border-slate-100/50 dark:border-white/5">
                      <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{session.foldersAdded}</div>
                      <div className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-tighter mt-1">Folders</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-[2rem] p-5 text-center border border-slate-100/50 dark:border-white/5">
                      <div className="text-2xl font-black text-slate-900 dark:text-cream-100">{session.bookmarksAdded}</div>
                      <div className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-tighter mt-1">Links</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              <div className="mt-10 pt-10 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-slate-500 dark:text-white/50 text-sm font-medium">Use rollback to undo an accidental sync or import.</p>
                <div className="flex gap-4 w-full sm:w-auto">
                  {isRolledBack ? (
                    <button
                      onClick={handleRestore}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-initial bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-green-500/20 active:scale-95 flex items-center justify-center gap-2"
                    >
                      {actionLoading ? (
                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restore Data
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleRollback}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-initial bg-slate-900 dark:bg-slate-800 hover:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 text-white px-8 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-slate-900/10 active:scale-95 flex items-center justify-center gap-2"
                    >
                      {actionLoading ? (
                        <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Rollback Sync
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Content list card */}
            <div className="bg-white dark:bg-[#242424] rounded-[2.5rem] border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
              <div className="px-10 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-cream-100">Items Synchronized</h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">{folders.length + bookmarks.length} elements</span>
              </div>

              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                {folders.length === 0 && bookmarks.length === 0 ? (
                  <div className="p-20 text-center text-slate-400 dark:text-white/40 font-medium">
                    No items recorded for this session.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {/* Folders */}
                    {folders.map((folder) => (
                      <div key={folder.id} className="px-10 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center text-xl group-hover:bg-white dark:group-hover:bg-[#242424] group-hover:shadow-sm transition-all shrink-0">📁</div>
                        <div className="flex-1">
                          <span className="font-bold text-slate-700 dark:text-white/70">{folder.title}</span>
                          <div className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-tighter mt-0.5">Directory</div>
                        </div>
                      </div>
                    ))}

                    {/* Bookmarks */}
                    {bookmarks.map((bookmark) => (
                      <div key={bookmark.id} className="px-10 py-4 flex items-center gap-4 hover:bg-primary-50/30 dark:hover:bg-terra-500/10 transition-colors group">
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#242424] border border-slate-100 dark:border-white/5 flex items-center justify-center shadow-sm group-hover:border-primary-100 transition-all shrink-0">
                          {bookmark.favicon ? (
                            <img src={bookmark.favicon} alt="" className="w-5 h-5 object-contain" />
                          ) : (
                            <span className="text-xl">🔖</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-700 dark:text-white/70 truncate group-hover:text-primary-700 dark:group-hover:text-terra-400 transition-colors">{bookmark.title}</div>
                          <div className="text-[10px] font-medium text-slate-400 dark:text-white/40 truncate mt-0.5">{bookmark.url}</div>
                        </div>
                        <a
                          href={bookmark.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 dark:text-white/30 hover:text-primary-600 dark:hover:text-terra-400 hover:bg-white dark:hover:bg-[#242424] hover:shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-[#242424] rounded-[2.5rem] border border-slate-200 dark:border-white/[0.06] p-20 text-center shadow-sm">
            <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-cream-100 mb-4">Manifest Not Found</h3>
            <p className="text-slate-500 dark:text-white/50 max-w-xs mx-auto text-lg leading-relaxed">This session trace could not be located in our system.</p>
            <Link
              href="/sessions"
              className="inline-flex items-center gap-2 mt-8 text-primary-600 dark:text-terra-400 hover:text-primary-700 dark:hover:text-terra-300 font-black uppercase tracking-widest text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
              </svg>
              Back to History
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
