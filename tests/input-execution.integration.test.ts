import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import puppeteer, { type Browser, type Page } from "puppeteer"
import { humanClick, humanType } from "../lib/ai-automation/human-actions"
import { resolveExecutionTarget, selectControlOptions, setCheckedState, verifyTabSelection, attachControlFiles } from "../lib/ai-automation/control-execution"
import { NetworkRecorder, ConsoleRecorder, runWithLadder } from "../lib/ai-automation/outcome-verifier-impl"

let browser: Browser
let page: Page
before(async () => {
  browser = await puppeteer.launch({ headless: "shell", pipe: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
})
after(async () => { await browser?.close() })

async function fixture() {
  await page.goto(pathToFileURL(resolve("public/test-inputs.html")).href)
}
async function target(selector: string) {
  const handle = await resolveExecutionTarget(page, selector, "")
  assert.ok(handle, `Expected one target: ${selector}`)
  return handle
}

test("one requested switch click emits one event and selection is idempotent", async () => {
  await fixture()
  await page.evaluate(() => {
    ;(window as any).clicks = 0
    document.querySelector("#toggle-notifications")!.addEventListener("click", () => (window as any).clicks++)
  })
  const switchControl = await target("#toggle-notifications")
  assert.ok(await humanClick(page, switchControl))
  assert.equal(await switchControl.evaluate(el => el.getAttribute("aria-checked")), "true")
  assert.equal(await page.evaluate(() => (window as any).clicks), 1)
  assert.equal((await setCheckedState(page, switchControl, true)).ok, true)
  assert.equal(await page.evaluate(() => (window as any).clicks), 1)
  assert.equal((await setCheckedState(page, switchControl, false)).ok, true)
  assert.equal(await page.evaluate(() => (window as any).clicks), 2)
})

test("every radio option can be selected without toggling the selected option off", async () => {
  await fixture()
  for (const value of ["house", "commercial", "flat"]) {
    const radio = await target(`input[name="property_type"][value="${value}"]`)
    assert.equal((await setCheckedState(page, radio, true)).ok, true)
    assert.equal((await setCheckedState(page, radio, true)).ok, true)
    assert.deepEqual(await page.$$eval('input[name="property_type"]:checked', nodes => nodes.map(el => (el as HTMLInputElement).value)), [value])
  }
})

test("standard, nested, hidden-label checkboxes and pressed toggle use real interactions", async () => {
  await fixture()
  for (const selector of ["#std-checkbox", 'input[name="kensington_flat_nested"]', "#custom-kensington"]) {
    const checkbox = await target(selector)
    assert.equal((await setCheckedState(page, checkbox, true)).ok, true, selector)
    assert.equal(await checkbox.evaluate(el => (el as HTMLInputElement).checked), true)
    assert.equal((await setCheckedState(page, checkbox, false)).ok, true, selector)
    assert.equal(await checkbox.evaluate(el => (el as HTMLInputElement).checked), false)
  }
  await page.setContent('<button id="pressed" aria-pressed="false" onclick="this.setAttribute(\'aria-pressed\',String(this.getAttribute(\'aria-pressed\')!==\'true\'))">Toggle</button>')
  assert.equal((await setCheckedState(page, await target("#pressed"), true)).ok, true)
})

test("native selects support exact labels and complete multiple selections", async () => {
  await fixture()
  assert.equal((await selectControlOptions(page, await target("#property-category"), "Residential")).ok, true)
  assert.equal(await page.$eval("#property-category", el => (el as HTMLSelectElement).value), "residential")
  assert.equal((await selectControlOptions(page, await target("#multi-category"), ["residential", "commercial"])).ok, true)
  assert.deepEqual(await page.$eval("#multi-category", el => Array.from((el as HTMLSelectElement).selectedOptions).map(option => option.value)), ["residential", "commercial"])
  assert.equal((await selectControlOptions(page, await target("#property-category"), "Resident")).ok, false)
})

test("custom dropdown selects from its associated list and verifies application state", async () => {
  await page.setContent(`<button id="combo" role="combobox" aria-controls="countries" onclick="document.querySelector('#countries').hidden=false">Choose</button>
    <div id="countries" role="listbox" hidden><div role="option" onclick="this.setAttribute('aria-selected','true');document.querySelector('#combo').textContent=this.textContent">United Kingdom</div></div>`)
  assert.equal((await selectControlOptions(page, await target("#combo"), "United Kingdom")).ok, true)
  assert.equal(await page.$eval("#combo", el => el.textContent), "United Kingdom")
})

test("text, multiline, numeric, date/time, month/week, range and color values are read back", async () => {
  await fixture()
  const cases = [
    ["#plain-text", "QA Example"], ["#username", "qa@example.com"], ["#password", "QaTest!234"],
    ["#phone", "+447700900000"], ["#website", "https://example.com"], ["#search", "Camden"],
    ["#username-hint", "Chrome"], ["#notes", "First line\nSecond line"], ["#monthly-rent", "1250"],
    ["#lease-start", "2026-11-15"], ["#appointment-time", "13:15"],
    ["#appointment-datetime", "2026-11-15T13:15"], ["#billing-month", "2026-11"],
    ["#report-week", "2026-W46"], ["#volume", "75"], ["#theme-color", "#336699"],
  ]
  for (const [selector, value] of cases) {
    const field = await target(selector)
    assert.equal(await humanType(page, field, value), true, selector)
    assert.equal(await field.evaluate(el => (el as HTMLInputElement).value), value, selector)
  }
  await page.setContent('<div id="editor" contenteditable="true" style="min-height:50px">Old text</div>')
  assert.equal(await humanType(page, await target("#editor"), "Edited content"), true)
  assert.equal(await page.$eval("#editor", el => el.textContent), "Edited content")
})

test("rejected, disabled, blocked, missing and ambiguous controls cannot report success", async () => {
  await page.setContent(`<input id="reject" oninput="this.value=''">
    <input id="readonly" value="fixed" readonly><input id="disabled" disabled>
    <button id="broken" role="switch" aria-checked="false">Broken switch</button>
    <button id="blocked" style="position:absolute;left:0;top:200px">Covered</button>
    <div style="position:absolute;left:0;top:200px;width:150px;height:50px;z-index:99999"></div>
    <input aria-label="Same"><input aria-label="Same">`)
  assert.equal(await humanType(page, await target("#reject"), "rejected"), false)
  assert.equal(await humanType(page, await target("#readonly"), "changed"), false)
  assert.equal(await humanType(page, await target("#disabled"), "changed"), false)
  assert.equal((await setCheckedState(page, await target("#broken"), true)).ok, false)
  assert.equal(await page.$eval("#broken", el => el.getAttribute("aria-checked")), "false")
  assert.equal(await humanClick(page, await target("#blocked")), null)
  assert.equal(await resolveExecutionTarget(page, "#missing", "Same"), null)
  assert.equal(await resolveExecutionTarget(page, undefined, "Same"), null)
})

test("constraint violations fail while explicit invalid-format scenarios can enter invalid data", async () => {
  await fixture()
  assert.equal(await humanType(page, await target("#monthly-rent"), "1251"), false)
  const email = await target("#username")
  assert.equal(await humanType(page, email, "not-an-email"), false)
  assert.equal(await humanType(page, email, "not-an-email", { allowInvalid: true }), true)
  assert.equal(await email.evaluate(el => (el as HTMLInputElement).validity.valid), false)
})

test("click verdict rejects unexpected effects and does not automatically repeat actions", async () => {
  await page.setContent('<main><button id="open" onclick="window.clicks=(window.clicks||0)+1;document.querySelector(\'#dialog\').hidden=false">Open</button><div id="dialog" role="dialog" hidden>Dialog</div></main>')
  const network = new NetworkRecorder(page, "http://localhost")
  const consoleRecorder = new ConsoleRecorder(page)
  const result = await runWithLadder(page, "#open", "Open", ["navigated"], network, consoleRecorder,
    { maxSettleMs: 100, dialogShownRef: { value: false } })
  assert.equal(result.verdict, "failed")
  assert.equal(result.observedEffect, "modal_opened")
  assert.equal(await page.evaluate(() => (window as any).clicks), 1)
})

test("tab success requires its own selected state and associated visible panel", async () => {
  await page.setContent(`<button role="tab" id="details" aria-selected="false" aria-controls="panel" onclick="this.setAttribute('aria-selected','true');document.querySelector('#panel').hidden=false">Details</button>
    <section role="tabpanel" id="panel" hidden>Address fields</section>`)
  const tab = await target("#details")
  assert.ok(await humanClick(page, tab))
  assert.equal((await verifyTabSelection(page, tab)).ok, true)
  await page.$eval("#panel", el => (el as HTMLElement).hidden = true)
  assert.equal((await verifyTabSelection(page, tab)).ok, false)
})

test("file operations verify exact attachments, removal, and hidden chooser trigger", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "input-files-"))
  const first = resolve(dir, "one.txt"), second = resolve(dir, "two.txt")
  await writeFile(first, "first file")
  await writeFile(second, "second file")
  try {
    await fixture()
    const multi = await target("#multiple-files")
    assert.equal((await attachControlFiles(page, multi, [first, second])).ok, true)
    assert.equal((await attachControlFiles(page, multi, [])).ok, true)
    assert.equal((await attachControlFiles(page, await target("#single-file"), [first, second])).ok, false)
    assert.equal((await attachControlFiles(page, await target("#open-file-picker"), [first])).ok, true)
    assert.equal(await page.$eval("#hidden-file-status", el => el.textContent), "one.txt")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("actual Full App executor operates email, radios, checkbox, switch and select without credentials", async () => {
  const { executeStructuredTestPlan } = await import("../lib/ai-automation/full-app-engine")
  const { extractActionableInventory } = await import("../lib/ai-automation/full-app-inventory")
  const { generateStructuredTestPlan, mergeScreenActionsIntoLedger, linkTestPlanStepsToLedger, queueUnplannedLedgerActions } = await import("../lib/ai-automation/full-app-planner")
  const { saveJob } = await import("../lib/ai-automation/job-store")
  const url = "https://input-execution.test/public"
  const isolatedPage = await browser.newPage()
  await isolatedPage.setRequestInterception(true)
  isolatedPage.on("request", request => { void request.respond({ contentType: "text/html", body:
    `<main><h1>Public form</h1><label for="contact-email">Email</label><input id="contact-email" type="email">
      <label><input id="flat" type="radio" name="property" value="flat" checked>Flat</label>
      <label><input id="house" type="radio" name="property" value="house">Detached house</label>
      <label><input id="agreement" type="checkbox">Agree</label>
      <button id="notifications" role="switch" type="button" aria-label="Notifications" aria-checked="false" onclick="this.setAttribute('aria-checked',String(this.getAttribute('aria-checked')!=='true'))">Notifications</button>
      <label for="category">Category</label><select id="category"><option value="">-- Choose --</option><option value="residential">Residential</option></select>
    </main>` }) })
  try {
    await isolatedPage.goto(url)
    const inventory = await extractActionableInventory(isolatedPage)
    const screen = { id: "S001", name: "Public form", url, path: "/public", ...inventory, discoveredAt: new Date().toISOString() }
    const job: import("../lib/ai-automation/types").AutomationJob = {
      id: `input-execution-${Date.now()}`, targetUrl: url, projectId: "input-tests", status: "running", progress: 0,
      currentStep: "Input execution test", startedAt: new Date().toISOString(), credentialsProvided: false,
      viewports: [{ name: "Desktop", width: 1440, height: 900 }], maxScreens: 1, logs: [], screens: [], issues: [], mode: "full_app",
    }
    mergeScreenActionsIntoLedger(job, screen)
    const plan = generateStructuredTestPlan(url, [screen], [])
    linkTestPlanStepsToLedger(job, plan)
    queueUnplannedLedgerActions(job, plan)
    saveJob(job)
    await executeStructuredTestPlan(job, isolatedPage, plan, undefined, undefined, { skipWorkflows: true })
    assert.equal(plan.steps.find(step => step.targetSelector === "#contact-email")?.status, "passed")
    assert.equal(await isolatedPage.$eval("#contact-email", el => (el as HTMLInputElement).value), "synthetic.test.user+auto@example.com")
    for (const step of plan.steps) assert.equal(step.status, "passed", `${step.targetName}: ${step.actualResult}`)
    assert.deepEqual(await isolatedPage.$$eval('input[name="property"]:checked', nodes => nodes.map(el => (el as HTMLInputElement).value)), ["house"])
    assert.equal(await isolatedPage.$eval("#agreement", el => (el as HTMLInputElement).checked), true)
    assert.equal(await isolatedPage.$eval("#notifications", el => el.getAttribute("aria-checked")), "true")
    assert.equal(await isolatedPage.$eval("#category", el => (el as HTMLSelectElement).value), "residential")
    assert.equal((job.messages || []).some(message => /enter your email|credentials/i.test(message.text)), false)
    assert.notEqual(job.authState, "awaiting_credentials")
  } finally { await isolatedPage.close() }
})
