'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, SessionSummary } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function SessionsPage() {
  const router = useRouter()
  const { user, token, isLoading, isPremium } = useAuth()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
    if (!isLoading && user && !isPremium) {
      router.push('/dashboard')
    }
  }, [isLoading, user, isPremium, router])

  useEffect(() => {
    if (token && isPremium) {
      loadSessions()
    }
  }, [token, isPremium])

  const loadSessions = async () => {
    if (!token) return
    try {
      const data = await api.getSessions(token)
      setSessions(data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setSessionsLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case 'INITIAL_IMPORT':
        return { label: 'Initial Sync', color: 'bg-blue-100 text-blue-700' }
      case 'MERGE_IMPORT':
        return { label: 'Merge', color: 'bg-green-100 text-green-700' }
      case 'MANUAL_EDIT':
        return { label: 'Manual Edit', color: 'bg-purple-100 text-purple-700' }
      default:
        return { label: type, color: 'bg-gray-100 text-gray-700' }
    }
  }

  if (isLoading || !user || !isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Session History</h1>
          <p className="text-gray-600 mt-1">View and rollback previous sync operations</p>
        </div>

        {/* Sessions List */}
        <div className="bg-white rounded-xl border border-gray-200">
          {sessionsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">📜</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
              <p className="text-gray-600">
                Session history will appear here after you sync bookmarks.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessions.map((session) => {
                const typeInfo = getSessionTypeLabel(session.type)
                return (
                  <Link
                    key={session.sessionId}
                    href={`/sessions/${session.sessionId}`}
                    className="block p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">
                          {session.type === 'INITIAL_IMPORT' ? '🚀' : 
                           session.type === 'MERGE_IMPORT' ? '🔄' : '✏️'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {session.sourceBrowser || 'Unknown Browser'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {formatDate(session.timestamp)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {session.itemCount} items
                        </div>
                        <div className="text-xs text-gray-500">
                          {session.foldersAdded} folders, {session.bookmarksAdded} bookmarks
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-1">💡 About Session Rollback</h3>
          <p className="text-sm text-blue-700">
            Rolling back a session will remove all bookmarks and folders that were added during that sync operation.
            This is useful if you accidentally synced unwanted bookmarks to your Master Collection.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}
