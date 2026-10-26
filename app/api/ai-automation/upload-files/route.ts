import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { getJob, saveJob } from '@/lib/ai-automation/job-store'
import { requireProjectAccess, requireUser, authErrorResponse, AuthError } from '@/lib/auth/require-project-access'
import { scanUploadFolder, pickUploadFile } from '@/lib/ai-automation/test-file-manager'
import { generateUploadFixtures } from '@/lib/ai-automation/upload-fixtures'

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const multipart = req.headers.get('content-type')?.includes('multipart/form-data')
    const form = multipart ? await req.formData() : null
    const body = form ? Object.fromEntries(form.entries()) : await req.json()
    const job = getJob(String(body.jobId || ''))
    if (!job) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (job.projectId) await requireProjectAccess(job.projectId, 'edit')
    else if ((job as any).userId !== user.id) throw new AuthError(403, 'Session access denied')
    const pending = job.pendingUpload
    if (job.status !== 'running' || !pending || pending.id !== body.requestId || pending.status !== 'waiting' || Date.now() - Date.parse(pending.createdAt) > 600000) return NextResponse.json({ error: 'This upload request is no longer waiting' }, { status: 409 })
    if (body.action === 'skip') { pending.status = 'skip'; saveJob(job); return NextResponse.json({ success: true }) }
    if (!['generate', 'provide'].includes(body.action)) return NextResponse.json({ error: 'Choose generate, provide, or skip' }, { status: 400 })
    // Server-owned paths only; never accept arbitrary filesystem paths from the client.
    const folder = path.join(process.cwd(), '.jobs', 'upload-fixtures', randomUUID())
    await fs.mkdir(folder, { recursive: true })
    try {
      let generated: string | undefined
      if (body.action === 'generate') generated = await generateUploadFixtures(folder, pending.targetName, pending.context, pending.accept, pending.fileTypeRequired)
      else {
        const files = (form?.getAll('files') || []).filter((f): f is File => typeof f !== 'string')
        if (!files.length || files.length > (pending.multiple ? 10 : 1)) throw new Error('Provide the required number of files (maximum 10)')
        if (files.reduce((sum, f) => sum + f.size, 0) > 20 * 1024 * 1024) throw new Error('Test files must total at most 20 MB')
        for (const [i, file] of files.entries()) {
          const name = `${i}-${path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`
          if (!file.size) throw new Error('Empty test files are not supported')
          await fs.writeFile(path.join(folder, name), Buffer.from(await file.arrayBuffer()))
        }
      }
      const inventory = scanUploadFolder(folder)
      let selected: string[]
      if (body.action === 'generate') selected = [generated!]
      else selected = inventory.files.map(file => pickUploadFile({ ...inventory, files: [file] }, { acceptAttr: pending.accept, fileTypeRequired: pending.fileTypeRequired, targetName: file.fileName }).filePath)
      if (!selected.length) throw new Error('No compatible files found')
      if (job.status !== 'running' || job.pendingUpload?.id !== pending.id || pending.status !== 'waiting') throw new Error('Upload request changed; try again')
      pending.filePaths = selected
      pending.error = undefined
      pending.status = 'ready'
      job.uploadFilesDir = folder
      saveJob(job)
      return NextResponse.json({ success: true, files: selected.map(file => path.basename(file)) })
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true })
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error)
    return NextResponse.json({ error: (error as Error).message || 'Could not prepare test files' }, { status: 500 })
  }
}
