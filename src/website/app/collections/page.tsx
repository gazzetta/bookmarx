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
      setCollections(data)
    } catch (error) {
      console.error('Failed to load collections:', error)
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
            <p className="text-gray-600 mt-1">Organize your bookmarks into collections</p>
          </div>
          {isPremium && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Collection
            </button>
          )}
        </div>

        {/* Collections Grid */}
        {collectionsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No collections yet</h3>
            <p className="text-gray-600 mb-4">Your Master Collection will appear here after your first sync.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      {collection.name}
                      {collection.isDefault === 1 && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </h3>
                    {collection.description && (
                      <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
                    )}
                  </div>
                  <span className="text-2xl">📚</span>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Link
                    href={`/collections/${collection.id}`}
                    className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    View
                  </Link>
                  {isPremium ? (
                    <Link
                      href={`/collections/${collection.id}/edit`}
                      className="flex-1 text-center bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Edit
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="flex-1 text-center bg-gray-200 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
                      title="Premium feature"
                    >
                      Edit ⭐
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upgrade prompt for free users */}
        {!isPremium && collections.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-6 text-center">
            <h3 className="font-semibold text-gray-900 mb-2">Want multiple collections?</h3>
            <p className="text-gray-600 mb-4">
              Upgrade to Premium to create unlimited collections and use the drag-drop editor.
            </p>
            <Link
              href="/settings/subscription"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Upgrade to Premium
            </Link>
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Collection</h2>
            <form onSubmit={handleCreateCollection}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Collection Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  placeholder="Work, Personal, Research..."
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
