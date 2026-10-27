import type { ElementHandle, Page } from "puppeteer"
import { basename } from "node:path"
import { humanClick } from "./human-actions"

export type ControlResult = { ok: boolean; reason: string }

export async function observeFileSelection(page: Page) {
  const observer = await page.evaluateHandle(() => {
    const state = { target: null as HTMLInputElement | null, handler: null as EventListener | null }
    state.handler = event => {
      const target = event.target as HTMLInputElement
      if (target?.matches('input[type="file"]')) state.target = target
    }
    document.addEventListener("change", state.handler, true)
    return state
  })
  return {
    async verify(paths: string[]): Promise<boolean> {
      try {
        await page.waitForFunction((state, names) => {
          const files = state.target?.files
          return Boolean(files && JSON.stringify(Array.from(files).map(file => file.name).sort()) === JSON.stringify([...names].sort()))
        }, { timeout: 1500 }, observer, paths.map(file => basename(file)))
        return true
      } catch { return false }
    },
    async dispose() {
      await observer.evaluate(state => { if (state.handler) document.removeEventListener("change", state.handler, true) }).catch(() => {})
      await observer.dispose()
    },
  }
}

/** Verifies attachment only; server-side upload is a separate outcome. */
export async function attachControlFiles(page: Page, target: ElementHandle<Element>, paths: string[]): Promise<ControlResult> {
  const native = await target.evaluate(node => node.matches('input[type="file"]'))
  const observer = await observeFileSelection(page)
  try {
    if (await target.evaluate(node => node.matches(":disabled") || node.getAttribute("aria-disabled") === "true")) {
      return { ok: false, reason: "File control is disabled." }
    }
    if (native) {
      if (paths.length > 1 && !await target.evaluate(node => (node as HTMLInputElement).multiple)) {
        return { ok: false, reason: "File control does not allow multiple files." }
      }
      await (target as ElementHandle<HTMLInputElement>).uploadFile(...paths)
      await page.waitForFunction((node, names) => JSON.stringify(Array.from((node as HTMLInputElement).files || []).map(file => file.name).sort()) === JSON.stringify([...names].sort()),
        { timeout: 1500 }, target, paths.map(file => basename(file)))
      return { ok: true, reason: "Exact attached file names/count verified; server processing was not tested." }
    }
    const chooserPromise = page.waitForFileChooser({ timeout: 2000 })
    const [chooser, clicked] = await Promise.all([chooserPromise, humanClick(page, target)])
    if (!clicked || (paths.length > 1 && !chooser.isMultiple())) {
      await chooser.cancel()
      return { ok: false, reason: "File chooser was not actionable or does not allow multiple files." }
    }
    await chooser.accept(paths)
    const ok = await observer.verify(paths)
    return { ok, reason: ok ? "Chooser attachment verified on its changed file input." : "Chooser acceptance did not produce verified attached files." }
  } catch { return { ok: false, reason: "Could not attach the requested files to this control." } }
  finally { await observer.dispose() }
}

/** Tab clicks must select the intended tab and expose its associated panel. */
export async function verifyTabSelection(page: Page, target: ElementHandle<Element>): Promise<ControlResult> {
  try {
    await page.waitForFunction(node => {
      const tab = node as HTMLElement
      const selected = tab.getAttribute("aria-selected") === "true" || tab.getAttribute("data-state") === "active"
      if (!selected) return false
      const panelId = tab.getAttribute("aria-controls")
      const panels = panelId ? [tab.ownerDocument.getElementById(panelId)] :
        Array.from(tab.ownerDocument.querySelectorAll('[role="tabpanel"]')).filter(panel =>
          tab.id && (panel.getAttribute("aria-labelledby") || "").split(/\s+/).includes(tab.id))
      if (panels.length !== 1 || !panels[0]) return false
      const panel = panels[0] as HTMLElement, rect = panel.getBoundingClientRect(), style = getComputedStyle(panel)
      return !panel.hidden && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
    }, { timeout: 1500 }, target)
    return { ok: true, reason: "Intended tab is selected and its associated panel is visible." }
  } catch { return { ok: false, reason: "Selected tab and associated visible panel could not both be verified." } }
}

/** A supplied selector is authoritative: never substitute another page-level field. */
export async function resolveExecutionTarget(
  page: Page, selector: string | undefined, name: string,
  candidates = 'input,textarea,select,[contenteditable],[role="checkbox"],[role="radio"],[role="switch"],[aria-pressed],[role="combobox"]',
): Promise<ElementHandle<Element> | null> {
  const handles = await page.$$(selector || candidates).catch(() => [])
  const matches: ElementHandle<Element>[] = []
  for (const handle of handles) {
    const matchesName = selector || await handle.evaluate((node, expected) => {
      const el = node as HTMLInputElement
      const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
      const labelledBy = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
        .map(id => el.ownerDocument.getElementById(id)?.textContent || "").join(" ")
      const names = [el.id, el.name, labelledBy, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title"), el.textContent,
        el.getAttribute("data-testid"),
        el.labels ? Array.from(el.labels).map(label => label.textContent || "").join(" ") : ""]
      return names.some(value => value && normalize(value) === normalize(expected))
    }, name).catch(() => false)
    if (matchesName) matches.push(handle)
    else await handle.dispose()
  }
  if (matches.length === 1) return matches[0]
  await Promise.all(matches.map(handle => handle.dispose()))
  return null
}

export async function readCheckedState(target: ElementHandle<Element>): Promise<boolean | null> {
  return target.evaluate(node => {
    const input = node as HTMLInputElement
    if (input.matches('input[type="checkbox"],input[type="radio"]')) return input.checked
    const state = node.getAttribute("aria-checked") ?? node.getAttribute("aria-pressed")
    if (state === "true" || state === "false") return state === "true"
    const data = node.getAttribute("data-state")
    if (data === "checked" || data === "on") return true
    if (data === "unchecked" || data === "off") return false
    return null
  }).catch(() => null)
}

/** Idempotent selection. Neither clicks an already-correct control nor assigns checked. */
export async function setCheckedState(
  page: Page, target: ElementHandle<Element>, desired: boolean,
): Promise<ControlResult> {
  const unavailable = await target.evaluate(node => {
    const el = node as HTMLInputElement
    return el.matches(":disabled") || el.getAttribute("aria-disabled") === "true"
  }).catch(() => true)
  if (unavailable) return { ok: false, reason: "Selection control is disabled or detached." }
  const radio = await target.evaluate(node => node.matches('input[type="radio"],[role="radio"]'))
  if (radio && !desired) return { ok: false, reason: "Select another radio option to clear this selection." }
  const before = await readCheckedState(target)
  if (before === null) return { ok: false, reason: "Control has no supported checked/pressed state." }
  if (before !== desired) {
    // Hidden native inputs are operated through their associated visible label.
    const surfaceHandle = await target.evaluateHandle(node => {
      const el = node as HTMLInputElement
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (rect.width <= 2 || rect.height <= 2 || style.opacity === "0" || style.visibility === "hidden" || style.display === "none") {
        return el.labels ? Array.from(el.labels).find(label => {
          const r = label.getBoundingClientRect(), s = getComputedStyle(label)
          return r.width > 2 && r.height > 2 && s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0"
        }) || null : null
      }
      return el
    })
    const surface = surfaceHandle.asElement() as ElementHandle<Element> | null
    const clicked = surface ? await humanClick(page, surface) : null
    await surfaceHandle.dispose()
    if (!clicked) return { ok: false, reason: "Could not click the control or its visible associated label." }
  }
  try {
    await page.waitForFunction((node, wanted) => {
      const el = node as HTMLInputElement
      const native = el.matches('input[type="checkbox"],input[type="radio"]')
      const attr = el.getAttribute("aria-checked") ?? el.getAttribute("aria-pressed")
      const data = el.getAttribute("data-state")
      const state = native ? el.checked : attr === "true" ? true : attr === "false" ? false :
        data === "checked" || data === "on" ? true : data === "unchecked" || data === "off" ? false : null
      if (state !== wanted) return false
      if (el.matches('input[type="checkbox"]') && el.indeterminate) return false
      if (el.matches('input[type="radio"]') && el.name) {
        const selected = Array.from((el.getRootNode() as Document | ShadowRoot).querySelectorAll('input[type="radio"]'))
          .filter(peer => (peer as HTMLInputElement).name === el.name && (peer as HTMLInputElement).form === el.form && (peer as HTMLInputElement).checked)
        return selected.length === 1 && selected[0] === el
      }
      if (el.getAttribute("role") === "radio") {
        const group = el.closest('[role="radiogroup"]')
        if (group) return group.querySelectorAll('[role="radio"][aria-checked="true"]').length === 1
      }
      return true
    }, { timeout: 1500 }, target, desired)
    return { ok: true, reason: before === desired ? "Requested state already present and verified." : "Requested state verified after one interaction." }
  } catch {
    return { ok: false, reason: "Requested checked/pressed state or radio exclusivity was not verified." }
  }
}

export async function selectControlOptions(
  page: Page, target: ElementHandle<Element>, requested: string | string[],
  options?: { alreadyOpen?: boolean },
): Promise<ControlResult> {
  const values = Array.isArray(requested) ? requested : [requested]
  const native = await target.evaluate(node => node.tagName === "SELECT")
  if (native) {
    const resolved = await target.evaluate((node, wanted) => {
      const select = node as HTMLSelectElement
      if (select.matches(":disabled") || (!select.multiple && wanted.length !== 1)) return null
      const options = Array.from(select.options)
      const result: string[] = []
      for (const value of wanted) {
        const exactValues = options.filter(option => option.value === value)
        const matches = exactValues.length ? exactValues : options.filter(option => option.text.trim() === value.trim())
        if (matches.length !== 1 || matches[0].disabled || (matches[0].parentElement?.tagName === "OPTGROUP" && (matches[0].parentElement as HTMLOptGroupElement).disabled)) return null
        result.push(matches[0].value)
      }
      return result
    }, values)
    if (!resolved) return { ok: false, reason: "Requested option is missing, ambiguous, disabled, or incompatible with this select." }
    try {
      await target.select(...resolved)
      await page.waitForFunction((node, wanted) => {
        const selected = Array.from((node as HTMLSelectElement).selectedOptions).map(option => option.value).sort()
        return JSON.stringify(selected) === JSON.stringify([...wanted].sort())
      }, { timeout: 1500 }, target, resolved)
      return { ok: true, reason: "Exact native selection set verified." }
    } catch { return { ok: false, reason: "Native select did not retain the requested selection." } }
  }
  if (values.length !== 1) return { ok: false, reason: "Custom multiselect requires a widget-specific handler." }
  if (!options?.alreadyOpen && !await humanClick(page, target)) return { ok: false, reason: "Could not open custom option list." }
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="option"]')).some(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }), { timeout: 1500 })
    const scopeHandle = await target.evaluateHandle(node => {
      const ids = (node.getAttribute("aria-controls") || node.getAttribute("aria-owns") || "").split(/\s+/).filter(Boolean)
      if (ids.length) return ids.length === 1 ? document.getElementById(ids[0]) : null
      const lists = Array.from(document.querySelectorAll('[role="listbox"]')).filter(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"
      })
      return lists.length === 1 ? lists[0] : null
    })
    const scope = scopeHandle.asElement() as ElementHandle<Element> | null
    if (!scope) { await scopeHandle.dispose(); return { ok: false, reason: "Custom option list cannot be uniquely scoped to its trigger." } }
    const options = await scope.$$('[role="option"]')
    const matches: ElementHandle<Element>[] = []
    for (const option of options) {
      if (await option.evaluate((node, value) => {
        const r = node.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && node.getAttribute("aria-disabled") !== "true" &&
          [node.getAttribute("aria-label"), node.textContent?.trim(), node.getAttribute("data-value")].includes(value)
      }, values[0])) matches.push(option)
    }
    const chosen = matches.length === 1 ? matches[0] : null
    const clicked = chosen ? await humanClick(page, chosen) : null
    if (clicked) await page.waitForFunction((control, option, value) => {
      const el = control as HTMLInputElement
      return (el.tagName === "INPUT" && el.value === value) || el.textContent?.trim() === value ||
        (option.isConnected && option.getAttribute("aria-selected") === "true")
    }, { timeout: 1500 }, target, chosen!, values[0])
    await Promise.all(options.map(option => option.dispose()))
    await scopeHandle.dispose()
    return { ok: Boolean(clicked), reason: clicked ? "Custom option selection verified." : "Custom option missing or ambiguous." }
  } catch { return { ok: false, reason: "Custom dropdown did not expose or confirm the intended option." } }
}
