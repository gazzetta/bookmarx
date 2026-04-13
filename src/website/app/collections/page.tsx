'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api, Collection } from '@/lib/api'
import DashboardLayout from '@/components/DashboardLayout'

export default function CollectionsPage() {
  const router = useRouter()
  const { user, token, isLoading, isPremium } = useAuth()
  const [collections, setCollections] = useState<Collection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (token) {
      loadCollections()
    }
  }, [token])

  const loadCollections = async () => {
    if (!token) return
    try {
      const data = await api.getCollections(token)
      // API returns { collections: [...], count, canCreate }
      setCollections(data.collections || [])
    } catch (error) {
      console.error('Failed to load collections:', error)
      setCollections([])
    } finally {
      setCollectionsLoading(false)
    }
  }

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !newCollectionName.trim()) return

    setCreating(true)
    try {
      await api.createCollection(token, newCollectionName.trim())
      setShowCreateModal(false)
      setNewCollectionName('')
      loadCollections()
    } catch (error) {
      console.error('Failed to create collection:', error)
    } finally {
      setCreating(false)
    }
  }

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-cream-100">Collections</h1>
            <p className="text-slate-600 dark:text-cream-500 mt-2 text-lg">Organize your bookmarks into custom collections</p>
          </div>
          {isPremium && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 dark:bg-terra-500 dark:hover:bg-terra-600 text-white px-6 py-3 rounded-xl font-bold transition-all hover:shadow-lg shadow-primary-500/20 dark:shadow-terra-500/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Collection
            </button>
          )}
        </div>

        {/* Collection Slots Counter */}
        <div className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-cream-100">Collection Slots</h2>
              <p className="text-slate-500 dark:text-white/50 mt-2 font-medium">
                {isPremium
                  ? 'You have unlimited collections'
                  : `Free plan usage: ${collections.length} of ${user.collectionLimit} slots used`
                }
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-4xl font-black text-slate-900 dark:text-cream-100 tracking-tight">
                  {collections.length} / {user.collectionLimit >= 50 ? '∞' : user.collectionLimit}
                </div>
                <div className="text-xs text-slate-400 dark:text-white/40 font-bold uppercase tracking-widest mt-1">Active Slots</div>
              </div>
            </div>
          </div>
        </div>

        {/* Collections Grid */}
        {collectionsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-[#242424] rounded-3xl border border-slate-100 dark:border-white/5 p-8 shadow-sm animate-pulse">
                <div className="w-12 h-12 bg-slate-100 dark:bg-white/10 rounded-2xl mb-6"></div>
                <div className="h-6 bg-slate-100 dark:bg-white/10 rounded-xl w-3/4 mb-4"></div>
                <div className="h-4 bg-slate-50 dark:bg-white/5 rounded-lg w-1/2"></div>
              </div>
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] border-dashed">
            <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-slate-300 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">No collections yet</h3>
            <p className="text-slate-500 dark:text-white/50 max-w-sm mx-auto">Your Master Collection will appear here after your first sync from the browser extension.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="group bg-white dark:bg-[#242424] rounded-3xl border border-slate-200 dark:border-white/[0.06] p-8 shadow-sm hover:shadow-xl hover:shadow-primary-500/5 dark:hover:shadow-none hover:border-primary-100 dark:hover:border-terra-500/20 transition-all"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 bg-primary-50 dark:bg-terra-500/10 rounded-2xl flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </div>
                  {collection.isDefault === 1 && (
                    <span className="bg-primary-100 dark:bg-terra-500/15 text-primary-700 dark:text-terra-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                      Default
                    </span>
                  )}
                </div>

                <div className="mb-8">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-cream-100 mb-2">
                    {collection.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-white/50 line-clamp-2">
                    {collection.description || 'Self-contained bookmark collection from your synced browsers.'}
                  </p>
                </div>

                <Link
                  href={`/collections/${collection.id}`}
                  className="w-full inline-flex items-center justify-center bg-terra-500 hover:bg-terra-600 dark:bg-terra-500 dark:hover:bg-terra-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-terra-500/10"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Upgrade prompt for free users */}
        {!isPremium && collections.length > 0 && (
          <div className="mt-12 relative overflow-hidden bg-white dark:bg-[#242424] border border-slate-200 dark:border-white/[0.06] rounded-3xl p-10 text-center shadow-lg shadow-slate-200/50">
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-cream-100 mb-3">Want multiple collections?</h3>
              <p className="text-slate-600 dark:text-cream-500 mb-8 max-w-xl mx-auto text-lg leading-relaxed">
                Upgrade to Premium to create unlimited collections, use the drag-drop editor,
                and get priority support for your entire bookmark library.
              </p>
              <Link
                href="/settings/subscription"
                className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 dark:bg-terra-500 dark:hover:bg-terra-600 text-white px-10 py-4 rounded-xl font-bold text-lg transition-all hover:shadow-xl shadow-primary-500/30 dark:shadow-terra-500/10"
              >
                Start Premium Journey
              </Link>
            </div>
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-primary-50 dark:bg-terra-500/10 rounded-full blur-3xl -translate-y-12 -translate-x-12"></div>
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-teal-50 dark:bg-teal-500/10 rounded-full blur-3xl translate-y-12 translate-x-12"></div>
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all animate-in fade-in">
          <div className="bg-white dark:bg-[#2A2A2A] rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-primary-50 dark:bg-terra-500/10 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-primary-600 dark:text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-cream-100">Create Collection</h2>
                <p className="text-slate-500 dark:text-white/50">Add a new organization to your library</p>
              </div>
            </div>

            <form onSubmit={handleCreateCollection} className="space-y-8">
              <div>
                <label htmlFor="name" className="block text-sm font-bold text-slate-700 dark:text-white/70 mb-3 ml-1">
                  Collection Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:bg-white dark:focus:bg-white/5 outline-none transition-all text-lg font-medium text-slate-900 dark:text-cream-100 placeholder:text-slate-400 dark:placeholder:text-white/40"
                  placeholder="e.g. Work Resources, Research..."
                  required
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 py-4 rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-[2] bg-primary-600 hover:bg-primary-700 dark:bg-terra-500 dark:hover:bg-terra-600 disabled:bg-primary-300 dark:disabled:bg-terra-500/30 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-primary-500/25 dark:shadow-terra-500/10"
                >
                  {creating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </span>
                  ) : 'Create Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
