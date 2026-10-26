import type { Page } from "puppeteer"
import { createHash } from "node:crypto"
import type { AutomationJob } from "./types"
import type { ResponsiveControl, ResponsiveFinding, ResponsiveSnapshot } from "./responsive-types"
import { preprocessWithOpenCV } from "./vision-preprocessor"
import { maskPageSecretsBeforeScreenshot, secretRedactor } from "./secure-credentials-manager"
import { saveJob } from "./job-store"

export function responsiveStateKey(address: string, state: string) {
  const url = new URL(address)
  for (const name of [...url.searchParams.keys()]) {
    if (/^(access_token|refresh_token|token|password|secret|session|session_id|auth|authorization|api_key|apikey)$/i.test(name)) url.searchParams.delete(name)
  }
  if (/token|password|secret|session|auth|api.?key/i.test(url.hash)) url.hash = ""
  url.searchParams.sort()
  return createHash("sha256").update(JSON.stringify([url.origin, url.pathname, url.search, url.hash, state.trim().toLowerCase().replace(/\s+/g, " ")])).digest("hex")
}

/** Evidence from the current journey state; never navigates, clicks or changes viewport. */
export async function captureResponsiveSnapshot(job: AutomationJob, page: Page, state: string): Promise<void> {
  if (!job.responsiveGroup) return
  const expected = job.viewports[0]
  try {
    const address = page.url()
    if (!/^https?:/.test(address) || new URL(address).origin !== new URL(job.targetUrl).origin) return
    const measurement = await page.evaluate(() => {
      const controls: ResponsiveControl[] = []
      const findings: Array<Omit<ResponsiveFinding, "viewport">> = []
      const seen = new Map<string, number>()
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="radio"],img'))
      const overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - innerWidth
      if (overflow > 3) findings.push({ kind: "overflow", status: "observed", message: `Page extends ${Math.round(overflow)}px beyond its ${innerWidth}px viewport.` })
      for (const el of nodes.slice(0, 400)) {
        if (el.closest('[id^="__antigravity"],[id^="__ai_cursor"]')) continue
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        const role = el.getAttribute("role") || (el.tagName === "INPUT" ? (el.getAttribute("type") || "input") : el.tagName.toLowerCase())
        const labelledBy = (el.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ")
        const fieldLabel = (el as HTMLInputElement).labels?.[0]?.textContent
        const label = (el.getAttribute("aria-label") || labelledBy.trim() || fieldLabel || el.getAttribute("alt") || el.getAttribute("placeholder") || el.textContent || el.getAttribute("name") || el.id || role).replace(/\s+/g, " ").trim().slice(0, 100)
        const identity = `${role}:${el.getAttribute("data-testid") || el.id || el.getAttribute("name") || label.toLowerCase()}`
        const count = seen.get(identity) || 0
        seen.set(identity, count + 1)
        const key = `${identity}:${count}`
        const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
        const control: ResponsiveControl = { key, label, role, visible, box: [rect.x, rect.y, rect.width, rect.height] }
        if (el instanceof HTMLImageElement && el.naturalWidth && el.naturalHeight) {
          control.naturalRatio = el.naturalWidth / el.naturalHeight
          control.objectFit = style.objectFit
          if (visible && style.objectFit === "fill" && Math.abs((rect.width / rect.height) / control.naturalRatio - 1) > 0.15) {
            findings.push({ kind: "distorted_image", status: "observed", controlKey: key, message: `${label}: rendered aspect ratio differs from the image's intrinsic ratio by more than 15% with object-fit: fill.` })
          }
        }
        controls.push(control)
        if (!visible) continue
        let ancestor = el.parentElement
        while (ancestor && ancestor !== document.body) {
          const css = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect()
          if ((/hidden|clip/.test(css.overflowX) && (rect.left < bounds.left - 3 || rect.right > bounds.right + 3)) ||
              (/hidden|clip/.test(css.overflowY) && (rect.top < bounds.top - 3 || rect.bottom > bounds.bottom + 3))) {
            findings.push({ kind: "clipped", status: "review", controlKey: key, message: `${label}: bounds extend outside a clipping container; check whether the cropping is intentional.` })
            break
          }
          ancestor = ancestor.parentElement
        }
        if (el.tagName === "IMG") continue
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
        if (cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight && !(el as HTMLButtonElement).disabled && style.pointerEvents !== "none") {
          const hit = document.elementFromPoint(cx, cy)
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !hit.closest('[id^="__antigravity"],[id^="__ai_cursor"]')) {
            findings.push({ kind: "covered", status: "observed", controlKey: key, message: `${label}: its center is covered by another element (${hit.tagName.toLowerCase()}).` })
          }
        }
        if (innerWidth <= 768 && (rect.width < 24 || rect.height < 24)) {
          findings.push({ kind: "small_target", status: "review", controlKey: key, message: `${label}: target measures ${Math.round(rect.width)}×${Math.round(rect.height)}px; review touch usability and spacing.` })
        }
      }
      const heading = document.querySelector('main h1,h1,[role="heading"][aria-level="1"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || ""
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"],dialog[open]')
      const dialogTitle = dialog?.getAttribute("aria-label") || dialog?.querySelector('h1,h2,[role="heading"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || ""
      return { width: innerWidth, height: innerHeight, controls, findings, heading, dialogTitle }
    })
    const stateContext = [state, measurement.heading, measurement.dialogTitle].filter(Boolean).join(" · ")
    const key = responsiveStateKey(secretRedactor.redact(address), secretRedactor.redact(stateContext))
    const existing = (job.responsiveSnapshots || []).findIndex(snapshot => snapshot.key === key)
    if (existing < 0 && (job.responsiveSnapshots?.length || 0) >= 60) throw new Error("Responsive evidence limit reached (60 states per journey); coverage is incomplete.")
    const viewport = { name: expected.name, width: measurement.width, height: measurement.height }
    const findings: ResponsiveFinding[] = measurement.findings.map(finding => ({ ...finding, controlKey: finding.controlKey ? secretRedactor.redact(finding.controlKey) : undefined, viewport: viewport.name, message: secretRedactor.redact(finding.message) }))
    if (viewport.width !== expected.width || viewport.height !== expected.height) {
      findings.push({ kind: "capture_error", status: "review", viewport: viewport.name, message: `Viewport changed to ${viewport.width}×${viewport.height}; expected ${expected.width}×${expected.height}.` })
    }
    const controls = measurement.controls.map(control => ({ ...control, label: secretRedactor.redact(control.label), key: secretRedactor.redact(control.key) }))
    const unmask = await maskPageSecretsBeforeScreenshot(page)
    let image: Buffer
    try { image = Buffer.from(await page.screenshot({ type: "png", fullPage: false })) } finally { await unmask() }
    const visual = await preprocessWithOpenCV(image, controls.filter(control => control.visible).map(control => ({ selector: control.key, label: control.label, bounds: { x: control.box[0], y: control.box[1], width: control.box[2], height: control.box[3] } })))
    const snapshot: ResponsiveSnapshot = {
      key, url: secretRedactor.redact(address), state: secretRedactor.redact(stateContext), viewport,
      capturedAt: new Date().toISOString(), controls, findings,
      screenshot: `data:image/png;base64,${image.toString("base64")}`,
      annotatedScreenshot: visual.annotatedImageBuffer ? `data:image/png;base64,${visual.annotatedImageBuffer.toString("base64")}` : undefined,
      engine: visual.engine || "unavailable",
    }
    job.responsiveSnapshots ||= []
    if (existing >= 0) job.responsiveSnapshots[existing] = snapshot
    else job.responsiveSnapshots.push(snapshot)
    for (const finding of findings.filter(item => item.status === "observed")) {
      const id = `responsive-${createHash("sha256").update(key + finding.kind + (finding.controlKey || "")).digest("hex").slice(0, 20)}`
      if (!job.issues.some(issue => issue.id === id)) job.issues.push({ id, screenUrl: snapshot.url, screenTitle: snapshot.state, type: finding.kind === "covered" ? "covered_element" : finding.kind === "overflow" ? "responsive_overflow" : "layout_shift", severity: "medium", viewport: viewport.name, description: finding.message, timestamp: snapshot.capturedAt })
    }
    for (const screen of job.screens.filter(item => item.url === snapshot.url)) {
      screen.responsiveStatus = findings.some(finding => finding.status === "observed") ? "failed" : findings.length || snapshot.engine !== "opencv-js" ? "warning" : "passed"
      screen.screenshots[viewport.name] = snapshot.screenshot || ""
    }
    saveJob(job)
  } catch (error) {
    const message = secretRedactor.redact(error instanceof Error ? error.message : "Responsive evidence capture failed.")
    job.responsiveCaptureErrors ||= []
    if (!job.responsiveCaptureErrors.includes(message)) job.responsiveCaptureErrors.push(message)
    saveJob(job)
  }
}
