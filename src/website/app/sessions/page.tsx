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
      setSessions(data.sessions || [])
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
        return { label: 'Initial Sync', color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' }
      case 'MERGE_IMPORT':
        return { label: 'Merge', color: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' }
      case 'MANUAL_EDIT':
        return { label: 'Manual Edit', color: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300' }
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
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Session History</h1>
          <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">View and rollback previous sync operations</p>
        </div>

        {/* Sessions List */}
        <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] overflow-hidden shadow-sm">
          {sessionsLoading ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 border-3 border-primary-100 dark:border-terra-500/20 border-t-primary-600 dark:border-t-terra-400 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-500 dark:text-white/50 mt-6 font-medium">Loading history...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">No sessions yet</h3>
              <p className="text-slate-500 dark:text-white/50 max-w-xs mx-auto">
                Your sync history will appear here after you connect a browser extension.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {sessions.map((session) => {
                const typeInfo = getSessionTypeLabel(session.type)
                return (
                  <Link
                    key={session.sessionId}
                    href={`/sessions/${session.sessionId}`}
                    className="group block p-6 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center group-hover:bg-white dark:group-hover:bg-[#2A2A2A] group-hover:shadow-md transition-all">
                          {session.type === 'INITIAL_IMPORT' ? (
                            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          ) : session.type === 'MERGE_IMPORT' ? (
                            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-900 dark:text-cream-100 group-hover:text-primary-600 dark:group-hover:text-terra-400 transition-colors">
                              {session.sourceBrowser || 'Web Editor'}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${typeInfo.color.replace('100', '100').replace('700', '700')}`}>
                              {typeInfo.label}
                            </span>
                          </div>
                          <div className="text-sm text-slate-500 dark:text-white/50 mt-1 font-medium italic">
                            {formatDate(session.timestamp)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-slate-900 dark:text-cream-100">
                          {session.itemCount.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-white/40 font-bold uppercase tracking-tighter">
                          Items Synced
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
        <div className="mt-8 relative overflow-hidden bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-3xl p-8 shadow-sm">
          <div className="relative z-10 flex gap-5">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-terra-500/10 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-primary-600 dark:text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-cream-100 mb-2">About Session Rollback</h3>
              <p className="text-slate-600 dark:text-cream-500 leading-relaxed">
                Mistakes happen. Rolling back a session will remove all bookmarks and folders that were added during that specific sync operation.
                Your Master Collection will return to its state prior to that sync, ensuring your library stays clean and organized.
              </p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 dark:bg-terra-500/10 rounded-full blur-3xl -translate-y-8 translate-x-8"></div>
        </div>
      </div>
    </DashboardLayout>
  )
}
