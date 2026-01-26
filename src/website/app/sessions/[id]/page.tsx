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
        return { label: 'Initial Sync', color: 'bg-blue-100 text-blue-700', icon: '🚀' }
      case 'MERGE_IMPORT':
        return { label: 'Merge', color: 'bg-green-100 text-green-700', icon: '🔄' }
      case 'MANUAL_EDIT':
        return { label: 'Manual Edit', color: 'bg-purple-100 text-purple-700', icon: '✏️' }
      default:
        return { label: type, color: 'bg-gray-100 text-gray-700', icon: '📝' }
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
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/sessions"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Session Details</h1>
            <p className="text-gray-600 mt-1">
              {loading ? 'Loading...' : `Session from ${session?.sourceBrowser || 'Unknown'}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading session...</p>
          </div>
        ) : session ? (
          <>
            {/* Session Info Card */}
            <div className={`bg-white rounded-xl border p-6 mb-6 ${isRolledBack ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
              {isRolledBack && (
                <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg text-red-700 text-sm">
                  ⚠️ This session has been rolled back. Items are hidden from your Master Collection.
                </div>
              )}
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{typeInfo?.icon}</span>
                    <div>
                      <span className={`text-sm px-2 py-0.5 rounded ${typeInfo?.color}`}>
                        {typeInfo?.label}
                      </span>
                      <h2 className="text-lg font-semibold text-gray-900 mt-1">
                        {session.sourceBrowser || 'Unknown Browser'}
                      </h2>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date:</span>
                      <span className="text-gray-900">{formatDate(session.timestamp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Session ID:</span>
                      <span className="text-gray-900 font-mono text-xs">{session.sessionId.slice(0, 8)}...</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Items Added</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{session.itemCount}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{session.foldersAdded}</div>
                      <div className="text-xs text-gray-500">Folders</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">{session.bookmarksAdded}</div>
                      <div className="text-xs text-gray-500">Bookmarks</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end gap-3">
                {isRolledBack ? (
                  <button
                    onClick={handleRestore}
                    disabled={actionLoading}
                    className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {actionLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Restoring...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Restore Session
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleRollback}
                    disabled={actionLoading}
                    className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {actionLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Rolling back...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                        </svg>
                        Rollback Session
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Items List */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Items in this Session</h3>
              </div>
              
              {folders.length === 0 && bookmarks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No items found in this session.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                  {/* Folders */}
                  {folders.map((folder) => (
                    <div key={folder.id} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-lg">📁</span>
                      <span className="font-medium text-gray-900">{folder.title}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">folder</span>
                    </div>
                  ))}
                  
                  {/* Bookmarks */}
                  {bookmarks.map((bookmark) => (
                    <div key={bookmark.id} className="px-4 py-3 flex items-center gap-3">
                      {bookmark.favicon ? (
                        <img src={bookmark.favicon} alt="" className="w-4 h-4" />
                      ) : (
                        <span className="text-lg">🔖</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{bookmark.title}</div>
                        <div className="text-xs text-gray-400 truncate">{bookmark.url}</div>
                      </div>
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-4">❌</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Session not found</h3>
            <p className="text-gray-600">This session may have been deleted or doesn't exist.</p>
            <Link
              href="/sessions"
              className="inline-block mt-4 text-amber-600 hover:text-amber-700 font-medium"
            >
              ← Back to Sessions
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
