import type { Page, ElementHandle, FileChooser, HTTPResponse } from 'puppeteer'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import type { AutomationJob } from './types'
import { saveJob, getJob } from './job-store'
import { resolveUploadFolder, scanUploadFolder, pickUploadFile } from './test-file-manager'
import { resolveControl, ControlBlocked, type ControlTarget } from './control-interactions'

export async function waitForUploadFiles(job: AutomationJob, targetName: string, accept: string, multiple: boolean, context?: string): Promise<string[]> {
  const request = { context, id: randomUUID(), targetName, accept, multiple, status: 'waiting' as const, createdAt: new Date().toISOString() }
  job.pendingUpload = request
  job.currentStep = `Test files required: ${targetName}`
  saveJob(job)
  try {
    const deadline = Date.now() + 10 * 60 * 1000
    while (Date.now() < deadline) {
      const current = getJob(job.id) || job
      if (current.status === 'stopped' || current.status === 'failed') throw new ControlBlocked('Upload cancelled with the test session')
      const pending = current.pendingUpload
      if (!pending || pending.id !== request.id) throw new ControlBlocked('Upload request expired or replaced')
      if (pending.status === 'skip') throw new ControlBlocked('Upload skipped: test files were not provided')
      if (pending.status === 'ready' && pending.filePaths?.length) {
        job.uploadFilesDir = current.uploadFilesDir
        return pending.filePaths
      }
      await new Promise(r => setTimeout(r, 250))
    }
    throw new ControlBlocked('Timed out waiting for compatible test files')
  } finally {
    if (job.pendingUpload?.id === request.id) { delete job.pendingUpload; saveJob(job) }
  }
}

export async function uploadControl(page: Page, job: AutomationJob, target: ControlTarget) {
  let control = await resolveControl(page, target, 'upload')
  let input: ElementHandle<Element> | null = null
  let chooser: FileChooser | undefined
  try {
    const linked = await control.evaluateHandle(el => {
      if (el.matches('input[type=file]')) return el
      const ids = [el.getAttribute('aria-controls'), el.getAttribute('for')].filter(Boolean)
      for (const id of ids) { const node = document.getElementById(id!); if (node?.matches('input[type=file]')) return node }
      const contained = el.querySelectorAll('input[type=file]')
      return contained.length === 1 ? contained[0] : null
    })
    input = linked.asElement() as ElementHandle<Element> | null
    if (!input) await linked.dispose()
    let accept = '', multiple = false
    const context = await control.evaluate(el => [el.getAttribute('placeholder'), el.getAttribute('aria-label'), ...(el.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent)].filter(Boolean).join(' ').slice(0, 500))
    if (input) {
      const info = await input.evaluate(el => ({ accept: (el as HTMLInputElement).accept || '', multiple: (el as HTMLInputElement).multiple, disabled: (el as HTMLInputElement).disabled }))
      if (info.disabled) throw new ControlBlocked('Upload input is disabled')
      accept = info.accept; multiple = info.multiple
    } else {
      // Capture the exact input activated by a custom button, including existing hidden inputs.
      await page.evaluate(() => {
        const state = window as any
        state.__qaOriginalInputClick = HTMLInputElement.prototype.click
        state.__qaUploadInput = null
        HTMLInputElement.prototype.click = function () {
          if (this.type === 'file') state.__qaUploadInput = this
          return state.__qaOriginalInputClick.call(this)
        }
      })
      try {
        const result = await Promise.all([page.waitForFileChooser({ timeout: 4000 }), control.click()])
        chooser = result[0]
        multiple = chooser.isMultiple()
        const captured = await page.evaluateHandle(() => (window as any).__qaUploadInput)
        input = captured.asElement() as ElementHandle<Element> | null
        if (!input) await captured.dispose()
        if (input) accept = await input.evaluate(el => (el as HTMLInputElement).accept || '')
      } catch { throw new ControlBlocked('Upload trigger did not open a supported file chooser') }
      finally {
        await page.evaluate(() => {
          const state = window as any
          if (state.__qaOriginalInputClick) HTMLInputElement.prototype.click = state.__qaOriginalInputClick
          delete state.__qaOriginalInputClick; delete state.__qaUploadInput
        }).catch(() => {})
      }
    }
    let files: string[] = []
    const folder = resolveUploadFolder({ uploadFilesDir: job.uploadFilesDir, projectDir: job.projectDir })
    if (input && folder) {
      try { files = [pickUploadFile(scanUploadFolder(folder), { acceptAttr: accept, targetName: target.name }).filePath] } catch {}
    }
    if (!files.length) files = await waitForUploadFiles(job, target.name || target.selector || 'Upload', accept, multiple, context)
    if (!multiple && files.length !== 1) throw new ControlBlocked('This control accepts only one file')
    if (files.some(file => !fs.existsSync(file))) throw new ControlBlocked('Selected test file is no longer available')
    // Revalidate accept on resume, including externally supplied fixtures.
    if (accept) for (const file of files) {
      const inventory = scanUploadFolder((await import('node:path')).dirname(file))
      inventory.files = inventory.files.filter(f => f.filePath === file)
      try { pickUploadFile(inventory, { acceptAttr: accept }) } catch { throw new ControlBlocked('Selected file does not match this control’s accepted formats') }
    }
    const network: Array<{ status: number; url: string }> = []
    const observe = (response: HTTPResponse) => {
      const req = response.request()
      const contentType = req.headers()['content-type'] || ''
      const data = req.postData() || ''
      // Require an action-local multipart request containing a selected filename.
      if (contentType.includes('multipart/form-data') && files.some(f => data.includes(f.split(/[\\/]/).pop()!))) network.push({ status: response.status(), url: response.url() })
    }
    page.on('response', observe)
    try {
      if (input) await (input as ElementHandle<HTMLInputElement>).uploadFile(...files)
      else await chooser!.accept(files)
      await new Promise(r => setTimeout(r, 1000))
      const selected = input ? await input.evaluate(el => Array.from((el as HTMLInputElement).files || []).map(f => f.name)).catch(() => []) : []
      const names = files.map(f => f.split(/[\\/]/).pop()!)
      const confirmed = selected.length === names.length && names.every(n => selected.includes(n))
      if (network.some(n => n.status >= 400)) return { ok: false, state: 'rejected', observation: `Upload rejected by server: HTTP ${network.find(n => n.status >= 400)!.status}`, files: names, network }
      if (!confirmed) return { ok: false, state: 'unverified', observation: 'File chooser accepted files, but selection could not be verified on the intended input', files: names, network }
      const invalid = input ? await input.evaluate(el => ({ invalid: el.getAttribute('aria-invalid') === 'true' || !(el as HTMLInputElement).validity.valid, message: (el as HTMLInputElement).validationMessage })).catch(() => ({ invalid: false, message: '' })) : { invalid: false, message: '' }
      if (invalid.invalid) return { ok: false, state: 'rejected', observation: `File rejected: ${invalid.message || 'control reports invalid selection'}`, files: names, network }
      return { ok: true, state: 'selected', observation: `Selected ${names.join(', ')} on the intended input. ${network.length ? 'Upload request observed; application completion still requires a separate assertion.' : 'Awaiting application submission/confirmation.'}`, files: names, network }
    } finally { page.off('response', observe) }
  } finally {
    if (chooser) await chooser.cancel().catch(() => {})
    await input?.dispose(); await control.dispose()
  }
}
