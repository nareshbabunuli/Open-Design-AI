import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import type { AutomationJob, StartAutomationRequest } from "../lib/ai-automation/types"
import type { ResponsiveGroup, ResponsiveSnapshot } from "../lib/ai-automation/responsive-types"
import { RESPONSIVE_VIEWPORTS, createResponsiveRuns, localResponsiveResult, awaitResponsivePlanApproval } from "../lib/ai-automation/responsive-runs"
import { responsiveStateKey } from "../lib/ai-automation/responsive-capture"
import { buildResponsiveComparison } from "../lib/ai-automation/responsive-comparison"
import { renderResponsiveReport } from "../lib/ai-automation/responsive-report"

export function fakeJob(id: string, viewport = RESPONSIVE_VIEWPORTS[0]): AutomationJob {
  return { id, projectId: "project-1", targetUrl: "https://app.test/checkout", status: "completed", progress: 100, currentStep: "Finished", startedAt: new Date().toISOString(), credentialsProvided: false, viewports: [{ ...viewport }], maxScreens: 5, logs: [], screens: [], issues: [] }
}

async function completedJobs() {
  const group: ResponsiveGroup = { id: "group-1", members: RESPONSIVE_VIEWPORTS.map((viewport, index) => ({ jobId: `job-${index}`, viewport })) }
  return Promise.all(RESPONSIVE_VIEWPORTS.map(async (viewport, index) => {
    const job = fakeJob(`job-${index}`, viewport)
    const screenshot = await sharp({ create: { width: viewport.width, height: viewport.height, channels: 3, background: "#205fe0" } }).png().toBuffer()
    const snapshot: ResponsiveSnapshot = { key: responsiveStateKey(job.targetUrl, "Checkout"), url: job.targetUrl, state: "Checkout", viewport, capturedAt: new Date().toISOString(), screenshot: `data:image/png;base64,${screenshot.toString("base64")}`, controls: [{ key: "button:checkout:0", label: "Checkout", role: "button", visible: true, box: [10, 10, viewport.width - 20, 40] }], findings: [], engine: "opencv-js" }
    job.responsiveGroup = structuredClone(group)
    job.responsiveSnapshots = [snapshot]
    return job
  }))
}

test("three viewport journeys retain instructions, fixtures and safety flags without approving plans", async () => {
  const seen: StartAutomationRequest[] = []
  const saved: AutomationJob[] = []
  const params: StartAutomationRequest = { url: "https://app.test", projectId: "project-1", mode: "feature_workflow", workflowPrompt: "Create a fictional order", recordVideo: false, allowTestPayments: false, allowActions: [], uploadFilesDir: "/test-fixtures", credentials: { username: "fictional-user", password: "fictional-password" } }
  const result = await createResponsiveRuns(params, async input => { seen.push(input); return fakeJob(`child-${seen.length}`, input.viewports![0]) }, job => saved.push(job), () => assert.fail("Must not cancel successful group"))
  assert.equal(result.length, 3)
  assert.deepEqual(seen.map(input => input.viewports![0]), RESPONSIVE_VIEWPORTS)
  for (const input of seen) {
    assert.equal(input.workflowPrompt, params.workflowPrompt)
    assert.equal(input.allowTestPayments, false)
    assert.deepEqual(input.allowActions, [])
    assert.equal(input.uploadFilesDir, "/test-fixtures")
    assert.equal(input.recordVideo, false)
    assert.equal(input.responsiveJourney, false)
  }
  assert.ok(result.every(job => job.responsiveGroup?.members.length === 3 && job.planApprovalState !== "approved"))
  assert.equal(saved.length, 3)
  assert.equal(params.viewports, undefined)
})

test("partial group startup stops already-created journeys instead of reporting success", async () => {
  const stopped: string[] = []
  let count = 0
  await assert.rejects(createResponsiveRuns({ url: "https://app.test", projectId: "p", mode: "full_app" }, async input => { if (++count === 2) throw new Error("startup failure"); return fakeJob("first", input.viewports![0]) }, () => {}, id => stopped.push(id)), /startup failure/)
  assert.deepEqual(stopped, ["first"])
})

test("unsupported modes do not start any responsive journeys", async () => {
  await assert.rejects(createResponsiveRuns({ url: "https://app.test", projectId: "p", mode: "chat" }, async () => { assert.fail("Should not start"); return fakeJob("x") }, () => {}, () => {}), /Full App or Feature/)
})

test("state matching preserves query/hash/action differences without exposing token values", () => {
  const key = responsiveStateKey("https://app.test/orders?tab=open&token=private-value", "After click: Save")
  assert.equal(key, responsiveStateKey("https://app.test/orders?token=other-private-value&tab=open", "after CLICK:  Save"))
  assert.notEqual(key, responsiveStateKey("https://app.test/orders?tab=closed", "After click: Save"))
  assert.notEqual(key, responsiveStateKey("https://app.test/orders?tab=open#modal", "After click: Save"))
  assert.notEqual(key, responsiveStateKey("https://app.test/orders?tab=open", "After click: Cancel"))
  assert.notEqual(responsiveStateKey("https://app.test?code=product-A", "Product"), responsiveStateKey("https://app.test?code=product-B", "Product"))
  assert.ok(!key.includes("private-value"))
})

test("intentional resizing across three different image dimensions does not become a defect", async () => {
  const jobs = await completedJobs()
  const report = await buildResponsiveComparison(jobs)
  assert.equal(report.status, "no_observed_issues")
  assert.equal(report.screens.length, 1)
  assert.equal(report.screens[0].controls.length, 2)
  for (const control of report.screens[0].controls) {
    assert.equal(control.changedRatio, 0)
    assert.ok(control.referenceSize[0] !== control.candidateSize[0])
    assert.match(control.differenceMask!, /^data:image\/png;base64,/)
  }
})

test("OpenCV appearance differences remain informational rather than automatic layout failures", async () => {
  const jobs = await completedJobs()
  const snapshot = jobs[2].responsiveSnapshots![0]
  const white = await sharp({ create: { width: snapshot.viewport.width, height: snapshot.viewport.height, channels: 3, background: "#ffffff" } }).png().toBuffer()
  snapshot.screenshot = `data:image/png;base64,${white.toString("base64")}`
  const report = await buildResponsiveComparison(jobs)
  assert.equal(report.status, "no_observed_issues")
  assert.ok(report.screens[0].controls.some(control => control.changedRatio === 1))
})

test("observed overflow produces an issue result with viewport evidence", async () => {
  const jobs = await completedJobs()
  jobs[2].responsiveSnapshots![0].findings.push({ kind: "overflow", status: "observed", viewport: "Mobile", message: "Page exceeds viewport by 120px" })
  const report = await buildResponsiveComparison(jobs)
  assert.equal(report.status, "issues_observed")
  assert.equal(report.screens[0].findings[0].viewport, "Mobile")
  assert.equal(localResponsiveResult(jobs[2]).score, 0)
})

test("hidden/missing controls require review because alternate navigation may be intentional", async () => {
  const jobs = await completedJobs()
  jobs[2].responsiveSnapshots![0].controls[0].visible = false
  const report = await buildResponsiveComparison(jobs)
  assert.equal(report.status, "review_required")
  assert.ok(report.screens[0].findings.some(finding => finding.kind === "missing_control" && finding.status === "review"))
})

test("missing states, pending journeys, failed captures and fallback engines cannot report a complete pass", async () => {
  for (const condition of ["missing", "pending", "capture", "fallback", "image"]) {
    const jobs = await completedJobs()
    if (condition === "missing") jobs[2].responsiveSnapshots = []
    if (condition === "pending") jobs[2].status = "running"
    if (condition === "capture") jobs[2].responsiveCaptureErrors = ["Screenshot timed out"]
    if (condition === "fallback") jobs[2].responsiveSnapshots![0].engine = "heuristic-fallback"
    if (condition === "image") jobs[2].responsiveSnapshots![0].screenshot = "https://untrusted.test/image.png"
    const report = await buildResponsiveComparison(jobs)
    assert.equal(report.status, "incomplete", condition)
  }
  assert.equal(localResponsiveResult(fakeJob("empty")).status, "incomplete")
})

test("cross-project and cross-group journeys cannot be compared", async () => {
  const jobs = await completedJobs()
  jobs[2].projectId = "other-project"
  await assert.rejects(buildResponsiveComparison(jobs), /same group and project/)
  jobs[2].projectId = "project-1"
  jobs[2].responsiveGroup!.id = "other-group"
  await assert.rejects(buildResponsiveComparison(jobs), /same group and project/)
})

test("HTML exports escape application text and retain evidence, separate flows and limitations", async () => {
  const report = await buildResponsiveComparison(await completedJobs())
  report.screens[0].state = '<script>alert("unsafe")</script>'
  report.screens[0].url = '<img src=x onerror=alert(1)>'
  const html = renderResponsiveReport(report)
  assert.ok(!html.includes("<script>"))
  assert.ok(html.includes("&lt;script&gt;"))
  assert.ok(!html.includes("<img src=x"))
  assert.ok(html.includes("OpenCV difference mask"))
  assert.ok(html.includes("Journey results"))
  assert.ok(html.includes("Coverage and limitations"))
})


test("responsive feature execution waits for explicit approval and respects stop/reject", async () => {
  const jobs = await completedJobs()
  const job = jobs[0]
  job.status = "running"
  let turns = 0
  const approved = await awaitResponsivePlanApproval(job, () => job, () => {}, async () => {
    turns++
    assert.equal(job.planApprovalState, "awaiting_review")
    job.planApprovalState = "approved"
  })
  assert.equal(approved, true)
  assert.equal(turns, 1)
  for (const condition of ["stop", "reject", "missing"]) {
    job.status = "running"
    const allowed = await awaitResponsivePlanApproval(job, () => condition === "missing" ? null : job, () => {}, async () => {
      if (condition === "stop") job.status = "stopped"
      if (condition === "reject") job.planApprovalState = "rejected"
    })
    assert.equal(allowed, false)
  }
})
