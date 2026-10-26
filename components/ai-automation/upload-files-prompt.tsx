'use client'
import { useState } from 'react'
import type { PendingUpload } from '@/lib/ai-automation/types'

export function UploadFilesPrompt({ jobId, pending }: { jobId: string; pending: PendingUpload }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sent, setSent] = useState(false)
  async function submit(action: 'generate' | 'provide' | 'skip') {
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.set('jobId', jobId); form.set('requestId', pending.id); form.set('action', action)
      if (action === 'provide') files.forEach(file => form.append('files', file))
      const res = await fetch('/api/ai-automation/upload-files', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not prepare test files')
      setSent(true)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <section role="dialog" aria-modal="true" aria-labelledby="upload-prompt-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
    <div className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl space-y-4">
      <h2 id="upload-prompt-title" className="text-lg font-semibold">Test file needed</h2>
      <p>The test is paused at <strong>{pending.targetName}</strong>. Approve a fictional test file or provide your own to continue this step.</p>
      <p className="text-sm text-slate-300">Accepted formats: {pending.accept || 'Any format'}. {pending.multiple ? 'Multiple files allowed.' : 'One file required.'}</p>
      {pending.context && <p className="text-sm break-words">Field guidance: {pending.context}</p>}
      <p className="text-sm text-slate-300">Generate creates a compatible sample using this field’s label and guidance: a fictional résumé or invoice, sample contact rows, a document, image, or source file. Unsupported formats require your own file. No real personal data is generated.</p>
      <label className="block text-sm">Provide test files
        <input className="block mt-2 w-full" type="file" accept={pending.accept || undefined} multiple={pending.multiple} disabled={busy || sent} onChange={e => setFiles(Array.from(e.target.files || []))} />
      </label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {sent ? <p role="status">Response sent. Resuming the test…</p> : <div className="flex flex-wrap gap-3">
        <button className="rounded bg-indigo-600 px-3 py-2 disabled:opacity-50" disabled={busy} onClick={() => submit('generate')}>Generate and continue</button>
        <button className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50" disabled={busy || !files.length} onClick={() => submit('provide')}>Use selected files</button>
        <button className="rounded px-3 py-2 disabled:opacity-50" disabled={busy} onClick={() => submit('skip')}>Skip upload</button>
      </div>}
      <p className="text-xs text-slate-400">This request expires after 10 minutes. Skipping records a blocked step.</p>
    </div>
  </section>
}
