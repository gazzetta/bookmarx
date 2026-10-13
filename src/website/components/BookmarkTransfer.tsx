'use client'

import { useState, useRef } from 'react'

interface ImportItem { type: 'folder' | 'bookmark'; title: string; url?: string; children?: ImportItem[]; rootKind?: string; dateAdded?: number; position?: number }
interface Preview { items: ImportItem[]; bookmarks: number; folders: number }
const base = process.env.NEXT_PUBLIC_API_URL || ''

export default function BookmarkTransfer({ token, collectionId, onImported }: { token: string; collectionId: string; onImported: () => void }) {
  const [content, setContent] = useState('')
  const [format, setFormat] = useState<'html' | 'json' | 'text'>('text')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const operation = useRef(crypto.randomUUID())
  const fileInput = useRef<HTMLInputElement>(null)
  const endpoint = `${base}/api/v1/collections/${encodeURIComponent(collectionId)}`
  const request = async (path: string, body?: any) => {
    const response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Request failed')
    return payload.data
  }
  const changeContent = (text: string, nextFormat: typeof format = format) => {
    setContent(text); setFormat(nextFormat); setPreview(null); setError(null); setMessage(null); operation.current = crypto.randomUUID()
  }
  const readFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { setError('Choose a bookmark file of at most 8 MB.'); return }
    try { changeContent(await file.text(), file.name.toLowerCase().endsWith('.json') ? 'json' : 'html') }
    catch { setError('This file could not be read. Please choose it again.') }
  }
  const prepare = async () => {
    setBusy(true); setError(null)
    try { setPreview(await request('/import/preview', { content, format })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Preview failed') }
    finally { setBusy(false) }
  }
  const commit = async () => {
    if (!preview) return
    setBusy(true); setError(null)
    try {
      const result = await request('/import', { items: preview.items, operationId: operation.current })
      setMessage(`Imported ${result.bookmarks} bookmarks and ${result.folders} folders.`)
      setPreview(null); setContent(''); operation.current = crypto.randomUUID(); onImported()
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed. Your preview is retained for retry.') }
    finally { setBusy(false) }
  }
  const exportFile = async (type: 'html' | 'json') => {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`${endpoint}/export?format=${type}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error((await response.json()).error?.message || 'Export failed')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bookmarx-bookmarks.${type}`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed') }
    finally { setBusy(false) }
  }
  const copyUrls = async () => {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`${endpoint}/export?format=json`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Bookmarks could not be loaded')
      const data = await response.json()
      const urls: string[] = []
      const collect = (items: ImportItem[]) => items.forEach(item => item.type === 'bookmark' ? urls.push(item.url!) : collect(item.children || []))
      collect(data.items)
      const text = urls.join('\n')
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); setMessage(`Copied ${urls.length} URLs.`); return } catch { /* Show a keyboard-copy fallback. */ }
      }
      changeContent(text, 'text'); setMessage('Clipboard access is unavailable. Select the URLs below and press Ctrl+C (Cmd+C on Mac).')
    } catch (e) { setError(e instanceof Error ? e.message : 'Copy failed') }
    finally { setBusy(false) }
  }
  return <details className="mb-8 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#242424] p-5">
    <summary className="cursor-pointer font-semibold">Import, export &amp; paste bookmarks</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-500 dark:text-white/60">Import browser bookmark HTML or a BookMarx JSON backup. Paste one URL per line, or a title and URL separated by a tab. Preview before saving. Duplicate URLs are preserved.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="rounded-lg border px-3 py-2">Choose bookmark file</button>
        <input ref={fileInput} type="file" accept=".html,.htm,.json" aria-label="Bookmark file" className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); e.target.value = '' }} />
        <button type="button" disabled={busy} onClick={() => void exportFile('html')} className="rounded-lg border px-3 py-2">Export HTML</button>
        <button type="button" disabled={busy} onClick={() => void exportFile('json')} className="rounded-lg border px-3 py-2">Export JSON backup</button>
        <button type="button" disabled={busy} onClick={() => void copyUrls()} className="rounded-lg border px-3 py-2">Copy URLs</button>
      </div>
      <label className="block text-sm font-medium" htmlFor="bookmark-paste">Paste bookmarks</label>
      <textarea id="bookmark-paste" rows={5} value={content} disabled={busy} onChange={e => changeContent(e.target.value, e.target.value.trimStart().startsWith('<') ? 'html' : e.target.value.trimStart().startsWith('{') ? 'json' : 'text')}
        placeholder="https://example.com" className="w-full rounded-xl border border-slate-300 dark:border-white/20 bg-transparent p-3" />
      <button type="button" disabled={busy || !content.trim()} onClick={() => void prepare()} className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Preview import</button>
      {preview && <div className="rounded-xl border p-4">
        <p>{preview.bookmarks} bookmarks and {preview.folders} folders will be added.</p>
        <ul className="my-3 text-sm">{preview.items.slice(0, 10).map((item, i) => <li key={i}>{item.type === 'folder' ? 'Folder: ' : ''}{item.title || item.url || '(empty title)'}</li>)}</ul>
        <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void commit()} className="rounded-lg bg-primary-600 px-4 py-2 text-white">Import bookmarks</button>
          <button type="button" disabled={busy} onClick={() => { setPreview(null); setError(null) }} className="rounded-lg border px-4 py-2">Cancel preview</button></div>
      </div>}
      {busy && <p role="status">Working…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
  </details>
}
