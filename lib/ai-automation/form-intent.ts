import type { Page } from "puppeteer"
import { AutonomousDecisionController, type DecisionResult } from "./autonomous-decision"

type FormPurpose = "login" | "signup" | "password_reset" | "ordinary_form" | "unknown"
export type FormIntent = { selector: string; purpose: FormPurpose; source: string }
const reasoning = new WeakMap<Page, { controller: AutonomousDecisionController; record?: (decision: DecisionResult) => void }>()

export function configurePageReasoning(page: Page, controller: AutonomousDecisionController, record?: (decision: DecisionResult) => void) {
  reasoning.set(page, { controller, record })
}

/** Classify each visible form, never a header's Sign in link or a password alone. No field values leave the browser. */
export async function classifyVisibleForms(page: Page): Promise<FormIntent[]> {
  const forms = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"],dialog[open],[aria-modal="true"]')).filter(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
    })
    const scope = dialogs[dialogs.length - 1] || document.querySelector('main,[role="main"]') || document.body
    const nativeForms = Array.from(scope.querySelectorAll('form,[role="form"]')).filter(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
    })
    const scopes: Element[] = nativeForms.length ? nativeForms : [scope]
    return scopes.slice(0, 8).map((form, index) => {
      const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]),textarea,select')).filter(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
    })
      const submit = Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')).find(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
    })
      const submitText = submit ? ((submit as HTMLInputElement).value || submit.textContent || submit.getAttribute("aria-label") || "").trim() : ""
      const heading = form.querySelector('h1,h2,h3,[role="heading"]')?.textContent || ""
      return {
        selector: form.id ? `#${CSS.escape(form.id)}` : `visible-form-${index}`,
        heading: heading.slice(0, 200), submit: submitText.slice(0, 120),
        fields: fields.map(node => {
          const input = node as HTMLInputElement
          const label = input.labels ? Array.from(input.labels).map(label => label.textContent || "").join(" ") : ""
          return { type: input.type || node.tagName.toLowerCase(), label: (label || input.getAttribute("aria-label") || input.placeholder || input.name || "").slice(0, 120), autocomplete: input.autocomplete || "" }
        }),
      }
    }).filter(form => form.fields.length)
  })
  const result: FormIntent[] = []
  for (const form of forms) {
    const hasPassword = form.fields.some(field => field.type === "password")
    const hasIdentity = form.fields.some(field => field.type === "email" || /user|e-?mail/i.test(field.label))
    const submit = form.submit.toLowerCase()
    let purpose: FormPurpose = "unknown"
    if (/sign\s*up|register|create\s*(an?\s*)?account|join\s*(now|us)/i.test(submit) ||
        (hasPassword && form.fields.some(field => /confirm|repeat|retype/i.test(field.label)))) purpose = "signup"
    else if (/reset\s*password|forgot\s*password|send\s*(reset|recovery)/i.test(submit)) purpose = "password_reset"
    else if (/^(sign\s*in|log\s*in|login)(\b|$)/i.test(submit) && (hasIdentity || hasPassword)) purpose = "login"
    else if (!hasPassword || form.fields.length > 4 || form.fields.some(field => !["email", "text", "tel", "password", "checkbox", "submit", "button"].includes(field.type))) purpose = "ordinary_form"
    else if (form.fields.some(field => field.autocomplete === "new-password") && !/sign\s*in|log\s*in|login/i.test(submit)) purpose = "signup"
    let source = "form-rules"
    const configured = reasoning.get(page)
    if (purpose === "unknown" && configured) {
      const decision = await configured.controller.decide({
        context: form,
        instruction: "Classify this specific form. A password field alone does not imply login. Distinguish sign-up, password reset and ordinary test/settings forms. Choose unknown when uncertain.",
        choices: { login: "Existing-account login", signup: "Create a new account", password_reset: "Recover/reset password", ordinary_form: "Ordinary data entry or test/settings form", unknown: "Insufficient evidence" },
      })
      configured.record?.(decision)
      if (decision.choice) { purpose = decision.choice as FormPurpose; source = decision.source }
    }
    result.push({ selector: form.selector, purpose, source })
  }
  return result
}

export async function isBlockingLoginForm(page: Page): Promise<boolean> {
  const forms = await classifyVisibleForms(page)
  // A login widget beside usable public forms is not a page-wide authentication wall.
  return forms.length > 0 && forms.every(form => form.purpose === "login")
}
