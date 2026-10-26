import type { Page, ElementHandle } from 'puppeteer'

export class ControlBlocked extends Error { name = 'ControlBlocked' }
export type ControlTarget = { selector?: string; name?: string }

/** Resolve one intended control; ambiguous matches are never replaced with the first input. */
export async function resolveControl(page: Page, target: ControlTarget, kind: 'upload' | 'selection'): Promise<ElementHandle<Element>> {
  const handle = await page.evaluateHandle(({ target, kind }) => {
    const allowed = kind === 'upload' ? 'input[type=file],button,[role=button],label,[data-dropzone]' : 'input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]'
    const named = (el: Element) => {
      const input = el as HTMLInputElement
      const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
      return [el.getAttribute('aria-label'), labelled, ...(Array.from(input.labels || []).map(l => l.textContent)), el.getAttribute('name'), el.id, el.textContent].filter(Boolean).map(s => String(s).trim().toLowerCase())
    }
    let el: Element | null = null
    if (target.selector) {
      try { const matches = document.querySelectorAll(target.selector); if (matches.length === 1) el = matches[0] } catch {}
    }
    if (!el && target.name) {
      const matches = Array.from(document.querySelectorAll(allowed)).filter(e => named(e).includes(target.name!.trim().toLowerCase()))
      if (matches.length === 1) el = matches[0]
      // A label and its control are the same target.
      else if (matches.length === 2 && matches.some(e => e instanceof HTMLLabelElement && matches.includes(e.control!))) el = matches.find(e => !(e instanceof HTMLLabelElement))!
    }
    if (el instanceof HTMLLabelElement && el.control) el = el.control
    if (kind === 'selection' && el && !el.matches(allowed)) {
      const children = el.querySelectorAll(allowed)
      el = children.length === 1 ? children[0] : null
    }
    return el
  }, { target, kind })
  const element = handle.asElement() as ElementHandle<Element> | null
  if (!element) { await handle.dispose(); throw new ControlBlocked(`Cannot uniquely locate ${kind} control: ${target.name || target.selector}`) }
  return element
}

export async function setSelection(page: Page, target: ControlTarget, desired = true) {
  let element = await resolveControl(page, target, 'selection')
  const read = (handle: ElementHandle<Element>) => handle.evaluate(el => {
    const native = el instanceof HTMLInputElement
    return { checked: native ? el.checked : el.getAttribute('aria-checked') === 'true',
      mixed: !native && el.getAttribute('aria-checked') === 'mixed',
      disabled: (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true',
      radio: (el as HTMLInputElement).type === 'radio' || el.getAttribute('role') === 'radio' }
  })
  try {
    const before = await read(element)
    if (before.disabled) throw new ControlBlocked('Selection control is disabled')
    if (before.radio && !desired) throw new ControlBlocked('Select another radio option instead of clearing a radio')
    if (before.checked === desired && !before.mixed) return { ok: true, observation: 'Required selection state already satisfied' }
    await element.evaluate(el => el.scrollIntoView({ block: 'center' }))
    const labelHandle = await element.evaluateHandle(el => {
      const labels = Array.from((el as HTMLInputElement).labels || [])
      return labels.find(label => { const r = label.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) || null
    })
    try {
      // Styled native inputs may be hidden; activate their visible label.
      const visible = await element.evaluate(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.opacity !== '0' && s.display !== 'none' && s.visibility !== 'hidden' })
      const clickTarget = visible ? element : labelHandle.asElement() as ElementHandle<Element> | null
      if (!clickTarget) throw new ControlBlocked('No visible control or associated label')
      await clickTarget.evaluate(el => el.scrollIntoView({ block: 'center' }))
      const box = await clickTarget.boundingBox()
      if (!box) throw new ControlBlocked('Selection control is hidden')
      const unobstructed = await clickTarget.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && (hit === el || el.contains(hit)) })
      if (!unobstructed) throw new ControlBlocked('Selection control is obstructed')
      await clickTarget.click()
    } finally { await labelHandle.dispose() }
    const deadline = Date.now() + 2500
    while (Date.now() < deadline) {
      await element.dispose()
      element = await resolveControl(page, target, 'selection')
      const after = await read(element)
      if (after.checked === desired && !after.mixed) {
        const validGroup = await element.evaluate(el => {
          if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) return Array.from(document.querySelectorAll('input[type=radio]')).filter(e => (e as HTMLInputElement).name === el.name && (e as HTMLInputElement).form === el.form && (e as HTMLInputElement).checked).length === 1
          const group = el.closest('[role=radiogroup]')
          return !group || group.querySelectorAll('[role=radio][aria-checked=true]').length === 1
        })
        return { ok: validGroup, observation: validGroup ? `Verified selection is ${desired ? 'checked' : 'unchecked'}` : 'Radio group has multiple selected options' }
      }
      await new Promise(r => setTimeout(r, 100))
    }
    return { ok: false, observation: 'Selection did not reach the requested state' }
  } finally { await element.dispose() }
}
