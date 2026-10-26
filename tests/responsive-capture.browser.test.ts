import test from "node:test"
import assert from "node:assert/strict"
import puppeteer from "puppeteer"
import { mkdirSync, writeFileSync } from "node:fs"
import { renderResponsiveReport } from "../lib/ai-automation/responsive-report"
import type { AutomationJob } from "../lib/ai-automation/types"
import { captureResponsiveSnapshot } from "../lib/ai-automation/responsive-capture"
import { RESPONSIVE_VIEWPORTS } from "../lib/ai-automation/responsive-runs"
import { buildResponsiveComparison } from "../lib/ai-automation/responsive-comparison"

const fixture = (path: string, broken = false) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;font-family:sans-serif}button{width:260px;height:48px;background:#205fe0;color:white;border:0}input{height:40px;width:240px;max-width:100%}a{display:block;width:120px;height:40px;margin-top:16px}.clip{width:140px;overflow:hidden}.clip button{width:230px}.covered{position:relative;width:260px}.shade{position:absolute;inset:0;background:#3339;z-index:2}.wide{width:calc(100vw + 120px);height:30px;background:#eee}@media(max-width:600px){button{width:100%}}</style></head><body><h1>${path === "/details" ? "Details" : "Checkout"}</h1><label>Email <input id="email" aria-label="Fictional email" placeholder="Email"></label><p><button id="continue">Continue</button></p><a id="details" href="/details">Details</a>${broken ? '<div class="wide">Overflow</div><div class="clip"><button id="clipped">Clipped action</button></div><div class="covered"><button id="covered">Covered action</button><div class="shade"></div></div>' : ""}</body></html>`

function job(index: number): AutomationJob {
  return { id: `responsive-browser-${index}`, projectId: "responsive-fixture", targetUrl: "https://responsive.test/", status: "running", progress: 1, currentStep: "Fixture", startedAt: new Date().toISOString(), credentialsProvided: false, viewports: [RESPONSIVE_VIEWPORTS[index]], maxScreens: 5, logs: [], screens: [], issues: [], responsiveGroup: { id: "browser-group", members: RESPONSIVE_VIEWPORTS.map((viewport, i) => ({ jobId: `responsive-browser-${i}`, viewport })) } }
}

test("real browser journeys capture separate states and OpenCV evidence at all three viewport sizes", { timeout: 90000 }, async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  try {
    const jobs: AutomationJob[] = []
    for (let index = 0; index < RESPONSIVE_VIEWPORTS.length; index++) {
      const viewport = RESPONSIVE_VIEWPORTS[index]
      const current = job(index)
      jobs.push(current)
      const page = await browser.newPage()
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: viewport.name !== "Desktop", hasTouch: viewport.name !== "Desktop" })
      await page.setRequestInterception(true)
      page.on("request", request => {
        if (request.url().startsWith("https://responsive.test/")) void request.respond({ status: 200, contentType: "text/html", body: fixture(new URL(request.url()).pathname) })
        else void request.abort()
      })
      await page.goto("https://responsive.test/", { waitUntil: "networkidle0" })
      await captureResponsiveSnapshot(current, page, "Discovery: Checkout")
      await page.type("#email", "fictional@example.test")
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#details")])
      await captureResponsiveSnapshot(current, page, "After click: Details")
      assert.deepEqual(current.responsiveCaptureErrors || [], [])
      assert.equal(current.responsiveSnapshots!.length, 2)
      assert.ok(current.responsiveSnapshots!.every(snapshot => snapshot.engine === "opencv-js" && snapshot.screenshot && snapshot.annotatedScreenshot && snapshot.viewport.width === viewport.width))
      assert.ok(current.responsiveSnapshots!.every(snapshot => !snapshot.findings.some(finding => finding.status === "observed")), JSON.stringify(current.responsiveSnapshots!.map(snapshot => snapshot.findings)))
      current.status = "completed"
      await page.close()
    }
    const report = await buildResponsiveComparison(jobs)
    assert.equal(report.screens.length, 2)
    assert.ok(report.screens.every(screen => screen.snapshots.length === 3))
    assert.equal(report.status, "no_observed_issues")
    assert.ok(report.screens.every(screen => screen.controls.some(control => control.differenceMask)))
    mkdirSync("test-results/responsive", { recursive: true })
    writeFileSync("test-results/responsive/comparison.html", renderResponsiveReport(report))
    writeFileSync("test-results/responsive/comparison.json", JSON.stringify(report, null, 2))
  } finally { await browser.close() }
})

test("real browser evidence detects overflow, clipped controls and covered actions", { timeout: 60000 }, async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
    await page.setRequestInterception(true)
    page.on("request", request => void request.respond({ status: 200, contentType: "text/html", body: fixture("/", true) }))
    await page.goto("https://responsive.test/", { waitUntil: "networkidle0" })
    const current = job(2)
    await captureResponsiveSnapshot(current, page, "Broken checkout")
    const findings = current.responsiveSnapshots?.[0]?.findings || []
    assert.ok(findings.some(finding => finding.kind === "overflow" && finding.status === "observed"), JSON.stringify(findings))
    assert.ok(findings.some(finding => finding.kind === "clipped"), JSON.stringify(findings))
    assert.ok(findings.some(finding => finding.kind === "covered" && finding.status === "observed"), JSON.stringify(findings))
    assert.ok(current.issues.some(issue => issue.type === "responsive_overflow" && issue.viewport === "Mobile"))
  } finally { await browser.close() }
})
