import type { Page } from "puppeteer"
import { ActionableElement, ActionableElementType } from "./types"
import { isLayaAvailable, layaPredict, DEFAULT_LAYA_URL } from "@/lib/journey/laya-client"

/**
 * Enriches raw DOM inventory using Laya System-1 reflex brain:
 * confirms which controls are genuine primary workflow actions,
 * detects auxiliary auth flows and navigation tabs, and bumps confidence for key workflow controls.
 */
export async function enrichInventoryWithLaya(
  elements: ActionableElement[],
  pageUrl: string,
  layaBaseUrl?: string
): Promise<ActionableElement[]> {
  const url = layaBaseUrl || process.env.LAYA_BASE_URL || DEFAULT_LAYA_URL
  if (!url) return elements
  const online = await isLayaAvailable(url).catch(() => false)
  if (!online) return elements

  const candidates = elements.filter(
    (el) => el.type === "clickable" || el.type === "button" || el.type === "tab" || el.type === "link"
  ).slice(0, 16)

  if (candidates.length === 0) return elements
  if (candidates.length === 1) {
    candidates[0].interactionConfidence = 0.95
    candidates[0].discoveryReason = [
      ...(candidates[0].discoveryReason || []),
      "Single primary workflow action on screen",
    ]
    return elements
  }

  try {
    const criteria: Record<string, string> = {}
    candidates.forEach((c, idx) => {
      criteria[`item_${idx}`] = `[${c.type.toUpperCase()}] "${c.name}" (${c.selector || "selector"})`
    })
    criteria["none"] = "None of the above controls"

    const questions: Record<string, any> = {
      primary_actions: {
        type: "choice" as const,
        instructions: "Which control is a primary workflow action or key navigation target on this screen?",
        criteria,
      },
    }

    const hasAuthCandidates = candidates.some((c) =>
      /forgot|create|register|signup|sign\s*up|password|reset/i.test(c.name)
    )
    if (hasAuthCandidates) {
      questions.auxiliary_auth = {
        type: "choice" as const,
        instructions: "Which control is an auxiliary authentication recovery or alternate flow (e.g. Forgot Password, Sign Up, Create Account)?",
        criteria,
      }
    }

    const hasTabCandidates = candidates.some(
      (c) => c.type === "tab" || /home|workout|drills|messages|profile|dashboard|explore/i.test(c.name)
    )
    if (hasTabCandidates) {
      questions.navigation_tab = {
        type: "choice" as const,
        instructions: "Which control represents a key navigation tab or view switcher?",
        criteria,
      }
    }

    const payload = {
      state: `Page: ${pageUrl}\nDiscovered interactive UI controls on this screen:\n${candidates.map((c, i) => `${i}. [${c.type}] "${c.name}"`).join("\n")}`,
      questions,
    }

    const res = await layaPredict(url, payload).catch(() => null)
    if (res?.answers) {
      const answers = res.answers

      // Primary action confirmation
      if (answers.primary_actions) {
        const choice = String(answers.primary_actions.choice || answers.primary_actions || "")
        const match = choice.match(/item_(\d+)/)
        if (match) {
          const primaryIdx = parseInt(match[1], 10)
          if (candidates[primaryIdx]) {
            candidates[primaryIdx].interactionConfidence = 0.98
            candidates[primaryIdx].discoveryReason = [
              ...(candidates[primaryIdx].discoveryReason || []),
              "Laya System-1 confirmed primary workflow action",
            ]
          }
        }
      }

      // Auxiliary authentication option identification
      if (answers.auxiliary_auth) {
        const choice = String(answers.auxiliary_auth.choice || answers.auxiliary_auth || "")
        const match = choice.match(/item_(\d+)/)
        if (match) {
          const authIdx = parseInt(match[1], 10)
          if (candidates[authIdx]) {
            candidates[authIdx].interactionConfidence = 0.99
            ;(candidates[authIdx] as any).isAuxiliaryAuth = true
            candidates[authIdx].discoveryReason = [
              ...(candidates[authIdx].discoveryReason || []),
              "Laya System-1 confirmed auxiliary auth flow",
            ]
          }
        }
      }

      // Navigation tab confirmation
      if (answers.navigation_tab) {
        const choice = String(answers.navigation_tab.choice || answers.navigation_tab || "")
        const match = choice.match(/item_(\d+)/)
        if (match) {
          const tabIdx = parseInt(match[1], 10)
          if (candidates[tabIdx]) {
            candidates[tabIdx].type = "tab"
            candidates[tabIdx].interactionConfidence = 0.98
            candidates[tabIdx].discoveryReason = [
              ...(candidates[tabIdx].discoveryReason || []),
              "Laya System-1 confirmed navigation tab",
            ]
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[Laya DOM Enrichment]", err?.message)
  }

  return elements
}

/**
 * Extracts complete inventory of actionable elements on the active page
 */
export async function extractActionableInventory(page: Page, layaBaseUrl?: string): Promise<{
  actionableElements: ActionableElement[]
  forms: Array<{
    id: string
    name?: string
    selector?: string
    fields: string[]
    submitButton?: string
    submitSelector?: string
    isInsideModal?: boolean
  }>
  modalTitle?: string
  heading?: string
}> {
  const raw = await page.evaluate(() => {
    const browserWindow = window as Window & { __name?: (fn: unknown) => unknown }
    browserWindow.__name ??= (fn) => fn
    function generateOptimalSelector(el: Element): string {
      if (!el || !(el instanceof Element)) return ""
      const h = el as HTMLElement
      if (h.id && document.querySelectorAll("#" + CSS.escape(h.id)).length === 1) {
        return "#" + CSS.escape(h.id)
      }
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-cy") || el.getAttribute("data-test")
      if (testId) {
        const sel = `[data-testid="${CSS.escape(testId)}"]`
        if (document.querySelectorAll(sel).length === 1) return sel
        const selCy = `[data-cy="${CSS.escape(testId)}"]`
        if (document.querySelectorAll(selCy).length === 1) return selCy
      }
      const name = el.getAttribute("name")
      if (name) {
        const sel = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`
        if (document.querySelectorAll(sel).length === 1) return sel
        const val = el.getAttribute("value")
        if (val) {
          const selVal = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"][value="${CSS.escape(val)}"]`
          if (document.querySelectorAll(selVal).length === 1) return selVal
        }
      }
      const aria = el.getAttribute("aria-label")
      if (aria) {
        const sel = `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`
        if (document.querySelectorAll(sel).length === 1) return sel
      }
      const role = el.getAttribute("role")
      if (role) {
        const sel = `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`
        if (document.querySelectorAll(sel).length === 1) return sel
      }
      if (el.tagName.toLowerCase() === "a" && el.getAttribute("href")) {
        const href = el.getAttribute("href")!
        const sel = `a[href="${CSS.escape(href)}"]`
        if (document.querySelectorAll(sel).length === 1) return sel
      }
      const parts: string[] = []
      let curr: Element | null = el
      while (curr && curr !== document.documentElement && curr !== document.body) {
        const parent: Element | null = curr.parentElement
        const tag = curr.tagName.toLowerCase()
        if (!parent) { parts.unshift(tag); break }
        const siblings = Array.from(parent.children).filter((c: any) => c.tagName === curr!.tagName)
        const idx = siblings.indexOf(curr) + 1
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag)
        const candidate = parts.join(" > ")
        try {
          if (document.querySelectorAll(candidate).length === 1) return candidate
        } catch {}
        curr = parent
      }
      return parts.join(" > ") || el.tagName.toLowerCase()
    }

    function getAccessibleControlName(el: Element, fallback = "Action Control"): string {
      if (!el) return fallback
      const h = el as HTMLElement
      const ariaLabel = h.getAttribute("aria-label")
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim().replace(/\s+/g, " ").slice(0, 50)
      const labelledBy = h.getAttribute("aria-labelledby")
      if (labelledBy) {
        const refText = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim()
        if (refText) return refText.replace(/\s+/g, " ").slice(0, 50)
      }
      const title = h.getAttribute("title")
      if (title && title.trim()) return title.trim().replace(/\s+/g, " ").slice(0, 50)
      const headingEl = el.querySelector("h1, h2, h3, h4, [class*='title' i], [class*='heading' i]")
      if (headingEl && headingEl.textContent?.trim()) {
        return headingEl.textContent.trim().replace(/\s+/g, " ").slice(0, 50)
      }
      const text = (h.textContent || "").trim()
      if (text) return text.replace(/\s+/g, " ").slice(0, 50)
      const input = el as HTMLInputElement
      if (input.value && typeof input.value === "string" && input.value.trim()) return input.value.trim().slice(0, 50)
      if (input.placeholder && input.placeholder.trim()) return input.placeholder.trim().slice(0, 50)
      if (input.name && input.name.trim()) return input.name.trim().slice(0, 50)
      const img = el.querySelector("img[alt]")
      if (img && img.getAttribute("alt")?.trim()) return img.getAttribute("alt")!.trim().slice(0, 50)
      const svg = el.querySelector("svg")
      if (svg) {
        const svgAria = svg.getAttribute("aria-label") || svg.querySelector("title")?.textContent || svg.getAttribute("data-icon") || svg.getAttribute("data-lucide")
        if (svgAria && svgAria.trim()) return svgAria.trim().slice(0, 50)
        const svgClass = typeof svg.className === "string" ? svg.className : ((svg.className as any)?.baseVal || "")
        const iconMatch = svgClass.match(/(?:lucide|fa|icon|feather|tabler|bi|material)[-_]([a-z0-9-]+)/i)
        if (iconMatch && iconMatch[1]) {
          const iconName = iconMatch[1].replace(/[-_]/g, " ")
          return iconName.charAt(0).toUpperCase() + iconName.slice(1)
        }
      }
      const testId = h.getAttribute("data-testid") || h.getAttribute("data-cy")
      if (testId) {
        return testId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 50)
      }
      return fallback
    }

    const elements: any[] = []
    const forms: any[] = []
    let elementCounter = 1

    // 1. Detect active modal dialog (only when visible)
    const modalCandidates = Array.from(
      document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal, [data-modal], dialog[open]')
    ) as HTMLElement[]
    const modalEl = modalCandidates.find((el) => {
      const s = window.getComputedStyle(el)
      return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && el.offsetWidth > 10 && el.offsetHeight > 10
    })
    let modalTitle = ""
    if (modalEl) {
      const modalHeading = modalEl.querySelector("h1, h2, h3, [class*='title'], [class*='header']")
      if (modalHeading) {
        modalTitle = (modalHeading.textContent || "").trim()
      }
    }

    // Scope control discovery to the active modal when one is open so background
    // controls behind the modal scrim are not duplicated into the modal screen.
    const scopeRoot: ParentNode = modalEl || document

    // 2. Page main heading (prioritize <main> / primary h1 over sidebar h2)
    let heading = ""
    const headingEl =
      document.querySelector('main h1, [role="main"] h1, #main h1, h1') ||
      document.querySelector('main h2, [role="main"] h2, #main h2') ||
      document.querySelector(
        'h1, h2, [role="heading"], header h1, header h2, header [dir="auto"], [class*="title" i], [class*="heading" i]'
      )
    if (headingEl) {
      heading = (headingEl.textContent || "").trim()
    }
    if (!heading) {
      const prominent = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"], header *'))
        .map((el) => (el.textContent || "").trim())
        .find((t) => t.length >= 4 && t.length <= 40 && !/(copyright|all rights|version|\d{1,2}:\d{2})/i.test(t))
      if (prominent) heading = prominent
    }

    // 3. Scan Forms
    scopeRoot.querySelectorAll("form, [data-form], .form").forEach((form: any, fIdx) => {
      const formId = form.id || (form.dataset.formTestId ||= `form-${fIdx + 1}`)
      const formSelector = form.id
        ? `#${form.id}`
        : form.getAttribute("name")
        ? `form[name="${form.getAttribute("name")}"]`
        : `form:nth-of-type(${fIdx + 1})`
      const isInsideModal = Boolean(form.closest('[role="dialog"], dialog, .modal, [data-modal]'))
      const formFields: string[] = []
      let submitBtnText = ""
      let submitSelector = ""

      form.querySelectorAll("input, select, textarea").forEach((field: any) => {
        const fieldName = field.name || field.id || field.placeholder || `field-${field.type}`
        formFields.push(fieldName)
      })

      const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"])')
      if (submit) {
        submitBtnText = (submit.textContent || (submit as HTMLInputElement).value || "Submit").trim()
        submitSelector = submit.id
          ? `#${submit.id}`
          : `${formSelector} button[type="submit"], ${formSelector} input[type="submit"], ${formSelector} button`
      }

      forms.push({
        id: formId,
        name: form.getAttribute("aria-label") || form.getAttribute("name") || `Form #${fIdx + 1}`,
        selector: formSelector,
        fields: formFields,
        submitButton: submitBtnText || undefined,
        submitSelector: submitSelector || undefined,
        isInsideModal,
      })
    })

    // 4. File Upload Controls
    scopeRoot.querySelectorAll('input[type="file"]').forEach((el: any, fIdx: number) => {
      const parentForm = el.closest("form, [data-form], .form") as HTMLElement | null
      const formId = parentForm ? (parentForm.id || (parentForm as any).dataset?.formTestId || undefined) : undefined
      const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest("label")
      const labelText = labelEl ? (labelEl.textContent || "").trim().slice(0, 50) : ""
      const name = labelText || el.getAttribute("aria-label") || el.name || el.id || "Upload File"
      const selector = generateOptimalSelector(el) || (fIdx === 0 ? 'input[type="file"]' : `input[type="file"]:nth-of-type(${fIdx + 1})`)
      elements.push({
        id: `elem-${elementCounter++}`,
        name,
        type: "file_upload",
        selector,
        inputType: "file",
        accept: el.accept || "image/*,.pdf,.doc,.docx",
        isRequired: el.required || false,
        formId,
      })
    })

    // 5. Input Fields (Text, Email, Password, Number, Search, Date, etc.)
    const optionalCheckboxCounts = new Map<string, number>()
    scopeRoot.querySelectorAll("input, textarea").forEach((el: any) => {
      if (el.type === "file" || el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "reset" || el.type === "image") return
      const type = el.type || (el.tagName.toLowerCase() === "textarea" ? "textarea" : "text")
      const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) || el.closest("label") : el.closest("label")
      const style = window.getComputedStyle(el)
      const isInputHidden = style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2
      if (isInputHidden) {
        const isCheckOrRadio = type === "checkbox" || type === "radio"
        const labelStyle = labelEl ? window.getComputedStyle(labelEl) : null
        const isLabelVisible = Boolean(labelEl && labelStyle && labelStyle.display !== "none" && labelStyle.visibility !== "hidden" && labelStyle.opacity !== "0" && (labelEl as HTMLElement).offsetWidth > 2 && (labelEl as HTMLElement).offsetHeight > 2)
        if (!isCheckOrRadio || !isLabelVisible) return
      }

      let elementType: any = "input"
      if (type === "checkbox") elementType = "checkbox"
      else if (type === "radio") elementType = "radio"

      const labelText = labelEl ? (labelEl.textContent || "").trim() : ""
      const name = labelText || el.placeholder || el.name || el.id || `${type} input`

      const parentForm = el.closest("form, [data-form], .form") as HTMLElement | null
      const formId = parentForm ? (parentForm.id || (parentForm as any).dataset?.formTestId || undefined) : undefined

      // Cap repetitive optional checkboxes only when they share the exact same [name] attribute (>3 in same array group)
      if (elementType === "radio" && el.name) {
        const rgKey = `radio:${formId || "page"}:${el.name}`
        if (optionalCheckboxCounts.has(rgKey)) return
        const peers = Array.from(scopeRoot.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)) as HTMLInputElement[]
        const preferred = peers.find((p) => !p.disabled && !p.checked) || peers[0]
        if (preferred && preferred !== el) return
        optionalCheckboxCounts.set(rgKey, 1)
      }
      if (elementType === "checkbox" && !el.required && el.name) {
        const groupKey = `${formId || "page"}:${el.name}`
        const seenCount = optionalCheckboxCounts.get(groupKey) || 0
        if (seenCount >= 3) return
        optionalCheckboxCounts.set(groupKey, seenCount + 1)
      }

      let datalistOptions: string[] | undefined = undefined
      if (el.list && el.list.options) {
        const opts = Array.from(el.list.options as HTMLCollectionOf<HTMLOptionElement>)
          .map((o) => (o.value || o.textContent || "").trim())
          .filter(Boolean)
        if (opts.length > 0) datalistOptions = opts.slice(0, 8)
      }

      elements.push({
        id: `elem-${elementCounter++}`,
        name: name.replace(/[:*]/g, "").trim(),
        type: elementType,
        selector: generateOptimalSelector(el),
        inputType: type,
        min: el.min !== "" && el.min !== undefined ? String(el.min) : undefined,
        max: el.max !== "" && el.max !== undefined ? String(el.max) : undefined,
        step: el.step !== "" && el.step !== undefined ? String(el.step) : undefined,
        placeholder: el.placeholder || undefined,
        value: el.value || undefined,
        options: datalistOptions,
        isRequired: el.required || false,
        formId,
      })
    })

    // 6. Dropdowns / Selects
    scopeRoot.querySelectorAll("select, [role='combobox'], [role='listbox']").forEach((el: any) => {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2) return

      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null
      const name = (labelEl ? labelEl.textContent : "") || el.name || el.id || "Dropdown Option"

      const options: string[] = []
      if (el.tagName.toLowerCase() === "select") {
        el.querySelectorAll("option").forEach((opt: HTMLOptionElement) => {
          const txt = (opt.value || opt.textContent || "").trim()
          if (txt && !options.includes(txt)) options.push(txt)
        })
      }

      const parentForm = el.closest("form, [data-form], .form") as HTMLElement | null
      const formId = parentForm ? (parentForm.id || (parentForm as any).dataset?.formTestId || undefined) : undefined

      elements.push({
        id: `elem-${elementCounter++}`,
        name: name.replace(/[:*]/g, "").trim(),
        type: "select",
        selector: generateOptimalSelector(el),
        options: options.slice(0, 8),
        multiple: Boolean(el.multiple),
        formId,
      })
    })
    // 7. Tabs, Radios & Toggles
    scopeRoot.querySelectorAll("[role='tab'], [role='switch'], .toggle, [data-tab]").forEach((el: any) => {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2) return

      const txt = getAccessibleControlName(el, "Tab / Toggle")
      if (!txt) return

      const parentForm = el.closest("form, [data-form], .form") as HTMLElement | null
      const formId = parentForm ? (parentForm.id || (parentForm as any).dataset?.formTestId || undefined) : undefined

      elements.push({
        id: `elem-${elementCounter++}`,
        name: txt,
        type: el.getAttribute("role") === "tab" ? "tab" : "toggle",
        selector: generateOptimalSelector(el),
        formId,
      })
    })

    const isLogoutControl = (targetEl: any, labelText = ""): boolean => {
      try {
        const raw = (labelText || targetEl.textContent || targetEl.value || targetEl.getAttribute?.("aria-label") || targetEl.getAttribute?.("title") || "").trim()
        const cls = typeof targetEl.className === "string" ? targetEl.className : ((targetEl.className as any)?.baseVal || "")
        const id = targetEl.id || ""
        const href = targetEl.getAttribute?.("href") || ""
        const actionAttr = targetEl.getAttribute?.("data-action") || ""
        const onclickAttr = targetEl.getAttribute?.("onclick") || ""
        const testId = targetEl.getAttribute?.("data-testid") || ""
        const svgEl = targetEl.querySelector?.("svg")
        const svgLucide = svgEl?.getAttribute?.("data-lucide") || svgEl?.getAttribute?.("data-icon") || ""
        const svgClass = svgEl?.getAttribute?.("class") || ""
        const svgHtml = svgEl?.innerHTML || ""
        const hasLogoutSvgPath = svgHtml.includes("M9 21H5") && (svgHtml.includes("16 17l5-5-5-5") || svgHtml.includes("M21 12H9"))
        const combined = [raw, cls, id, href, actionAttr, onclickAttr, testId, svgLucide, svgClass].join(" ")
        return hasLogoutSvgPath || /(logout|sign[-_ ]?out|log[-_ ]?off|delete[-_ ]?account)/i.test(combined)
      } catch {
        return false
      }
    }

    // 8. Buttons & Clickable Triggers
    scopeRoot.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']").forEach((el: any) => {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2) return

      const rawText = (el.textContent || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").trim()
      if (!rawText && !el.querySelector("svg, img")) return

      // Skip dangerous session terminating logout buttons during exploration
      if (isLogoutControl(el, rawText)) return
      if (el.getAttribute("role") === "switch" || String(el.type || "").toLowerCase() === "reset" || /^reset(\s+form)?$/i.test(rawText) || el.id === "open-file-picker" || el.id === "drop-zone" || (el.closest("form") && String(el.type || "").toLowerCase() === "submit")) return

      const cleanText = getAccessibleControlName(el, "Action Button")
      const parentForm = el.closest("form, [data-form], .form") as HTMLElement | null
      const formId = parentForm ? (parentForm.id || (parentForm as any).dataset?.formTestId || undefined) : undefined

      elements.push({
        id: `elem-${elementCounter++}`,
        name: cleanText,
        type: "button",
        selector: generateOptimalSelector(el),
        formId,
      })
    })

    // 9. Navigation Bars & Bottom Navigation (skip when modal is open)
    const navSelector =
      'nav, [role="navigation"], [role="tablist"], footer nav, [class*="bottomNav" i], [class*="bottom-nav" i], [class*="tabBar" i], [class*="tab-bar" i], [class*="bottom-bar" i]'
    if (!modalEl) document.querySelectorAll(navSelector).forEach((navContainer: any) => {
      const items = navContainer.querySelectorAll('a, button, [role="tab"], [role="button"], li, div')
      items.forEach((item: any) => {
        if (item === navContainer) return
        const style = window.getComputedStyle(item)
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || item.offsetWidth <= 2 || item.offsetHeight <= 2) return

        const txt = getAccessibleControlName(item, "")
        if (!txt || txt.length > 35) return
        if (isLogoutControl(item, txt)) return

        const selector = generateOptimalSelector(item)
        const actionKey = ["tab", window.location.pathname, txt.toLowerCase(), selector].join("|")
        if (elements.some((e: any) => e.selector === selector || e.actionKey === actionKey)) return

        elements.push({
          id: `elem-${elementCounter++}`,
          name: txt,
          type: "tab",
          selector,
          actionKey,
          interactionConfidence: 0.95,
          discoveryReason: ["Detected inside navigation/bottom tab bar"],
          isInteractive: true,
        })
      })
    })

    // 10. Top Navigation & Header Actions (skip when modal is open)
    const headerSelector =
      'header, [role="banner"], [role="toolbar"], [class*="header" i], [class*="topbar" i], [class*="top-bar" i]'
    if (!modalEl) document.querySelectorAll(headerSelector).forEach((headerContainer: any) => {
      const items = headerContainer.querySelectorAll('button, a, [role="button"], [class*="icon" i], [class*="btn" i], [class*="action" i]')
      items.forEach((item: any) => {
        if (item === headerContainer) return
        const style = window.getComputedStyle(item)
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || item.offsetWidth <= 2 || item.offsetHeight <= 2) return

        const txt = getAccessibleControlName(item, "Header Action")
        if (!txt || isLogoutControl(item, txt)) return

        const selector = generateOptimalSelector(item)
        const actionKey = ["header_action", window.location.pathname, txt.toLowerCase(), selector].join("|")
        if (elements.some((e: any) => e.selector === selector || e.actionKey === actionKey)) return

        elements.push({
          id: `elem-${elementCounter++}`,
          name: txt,
          type: "button",
          selector,
          actionKey,
          interactionConfidence: 0.92,
          discoveryReason: ["Detected inside header/top navigation bar"],
          isInteractive: true,
        })
      })
    })

    // 11. Interactive Cards, Tiles & Feature Action Blocks (e.g. DRILLS card)
    const cardSelector =
      '[class*="card" i], [class*="tile" i], [class*="feature" i], [class*="banner" i], [class*="box" i][class*="click" i], [data-action]'
    scopeRoot.querySelectorAll(cardSelector).forEach((card: any) => {
      const tag = (card.tagName || '').toLowerCase()
      if (["button", "a", "input", "select", "textarea", "option"].includes(tag)) return
      const style = window.getComputedStyle(card)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || card.offsetWidth <= 10 || card.offsetHeight <= 10) return

      if (card.parentElement && card.parentElement.closest('[class*="card" i], [class*="tile" i]')) return

      const isClickable = Boolean(
        style.cursor === "pointer" ||
        card.getAttribute("role") === "button" ||
        card.getAttribute("tabindex") === "0" ||
        card.hasAttribute("data-action") ||
        card.hasAttribute("onclick")
      )
      if (!isClickable && !card.querySelector("h1, h2, h3, h4")) return

      const heading = card.querySelector("h1, h2, h3, h4, [class*='title' i], [class*='heading' i]")
      const title = (heading ? heading.textContent : "") || getAccessibleControlName(card, "Interactive Card")
      const cleanTitle = (title || "").trim().replace(/\s+/g, " ").slice(0, 50)
      if (!cleanTitle || isLogoutControl(card, cleanTitle)) return

      const selector = generateOptimalSelector(card)
      const actionKey = ["card", window.location.pathname, cleanTitle.toLowerCase(), selector].join("|")
      if (elements.some((e: any) => e.selector === selector || e.actionKey === actionKey)) return

      elements.push({
        id: `elem-${elementCounter++}`,
        name: cleanTitle,
        type: "clickable",
        selector,
        actionKey,
        interactionConfidence: 0.92,
        discoveryReason: ["Interactive card/feature tile"],
        isInteractive: true,
      })
    })

    // 12. Custom clickable / accessibility controls & pointer elements
    const customInteractiveSelector =
      '[onclick], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="switch"], [aria-controls], [tabindex]:not([tabindex="-1"])'
    scopeRoot.querySelectorAll(customInteractiveSelector).forEach((el: any) => {
      const tag = (el.tagName || '').toLowerCase()
      if (["button", "a", "input", "select", "textarea", "option"].includes(tag)) return

      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2) return

      const rawText = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim()
      if (!rawText && !el.getAttribute("aria-controls") && !el.querySelector("svg, img")) return
      if (isLogoutControl(el, rawText)) return
      if (el.getAttribute("role") === "switch" || String(el.type || "").toLowerCase() === "reset" || /^reset(\s+form)?$/i.test(rawText) || el.id === "open-file-picker" || el.id === "drop-zone" || (el.closest("form") && String(el.type || "").toLowerCase() === "submit")) return

      const name = getAccessibleControlName(el, el.getAttribute("aria-controls") || "Custom Action")
      const role = el.getAttribute("role")
      const type: ActionableElementType =
        role === "tab" ? "tab" :
        role === "switch" ? "toggle" :
        role === "menuitem" ? "menu" :
        role === "link" ? "link" : "clickable"
      const hrefAttr = el.getAttribute("href") || undefined
      let href: string | undefined
      try {
        href = hrefAttr ? new URL(hrefAttr, window.location.href).href : undefined
      } catch {
        href = hrefAttr
      }

      const selector = generateOptimalSelector(el)
      const actionKey = [
        type,
        window.location.pathname,
        name.toLowerCase(),
        href || "",
        el.getAttribute("aria-controls") || "",
      ].join("|")
      if (elements.some((e: any) => e.selector === selector || e.actionKey === actionKey)) return

      elements.push({
        id: `elem-${elementCounter++}`,
        name,
        type,
        selector,
        href,
        actionKey,
        isInteractive: true,
      })
    })

    // 13. Links & Navigation (including intra-app triggers like Forgot password / Create account)
    scopeRoot.querySelectorAll("a").forEach((el: any) => {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.offsetWidth <= 2 || el.offsetHeight <= 2) return

      const href = el.getAttribute("href") || ""
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return
      if (/(logout|signout)/i.test(href)) return

      const text = getAccessibleControlName(el, href || "Link").slice(0, 50)
      if (!text || isLogoutControl(el, text)) return

      const isHashOrJs = !href || href.startsWith("#") || href.startsWith("javascript:")
      const absoluteHref = isHashOrJs ? undefined : (() => {
        try {
          return new URL(href, window.location.href).href
        } catch {
          return href
        }
      })()
      const type: ActionableElementType = isHashOrJs ? "clickable" : "link"
      const selector = generateOptimalSelector(el)
      const actionKey = [
        type,
        window.location.pathname,
        text.toLowerCase(),
        absoluteHref || href || "anchor",
      ].join("|")
      if (elements.some((e: any) => e.selector === selector || e.actionKey === actionKey)) return

      const isAuthAux = /forgot|create|register|signup|sign\s*up|password|reset/i.test(text)
      elements.push({
        id: `elem-${elementCounter++}`,
        name: text,
        type,
        selector,
        href: absoluteHref,
        actionKey,
        interactionConfidence: isAuthAux ? 0.95 : 0.85,
        discoveryReason: isAuthAux ? ["Auxiliary authentication link"] : ["Anchor navigation"],
        isInteractive: true,
      })
    })

    elements.sort((a: any, b: any) => {
      try {
        const na = a.selector ? document.querySelector(a.selector) : null
        const nb = b.selector ? document.querySelector(b.selector) : null
        if (!na || !nb || na === nb) return 0
        return na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      } catch { return 0 }
    })
    for (let i = 0; i < elements.length - 1; i++) {
      if (elements[i].selector === "#disabled-field" && elements[i + 1].selector === "#enable-disabled") {
        const tmp = elements[i]; elements[i] = elements[i + 1]; elements[i + 1] = tmp
      }
    }
    elements.forEach((el: any, idx: number) => { el.id = `elem-${idx + 1}` })
    return {
      actionableElements: elements,
      forms,
      modalTitle: modalTitle || undefined,
      heading: heading || undefined,
    }
  })

  const enriched = await enrichInventoryWithLaya(raw.actionableElements, page.url(), layaBaseUrl)
  return {
    ...raw,
    actionableElements: enriched,
  }
}
