import sharp from "sharp"
import type { AutomationJob } from "./types"
import type { ResponsiveComparison, ResponsiveControl, ResponsiveControlComparison, ResponsiveRunSummary, ResponsiveSnapshot } from "./responsive-types"
import { loadOpenCvForLayout } from "./opencv-layout-optimizer"

export function summarizeResponsiveRun(job: AutomationJob): ResponsiveRunSummary {
  return {
    jobId: job.id, viewport: job.viewports[0], status: job.status, phase: job.testingPhase,
    approval: job.planApprovalState, currentStep: job.currentStep,
    snapshots: job.responsiveSnapshots?.length || 0, error: job.error,
    steps: (job.fullAppTestPlan?.steps || []).map(step => ({ id: step.id, screen: step.screenName, action: step.actionType, target: step.targetName, status: step.status })),
  }
}

function imageBuffer(source?: string) {
  if (!source || source.length > 24_000_000 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(source)) throw new Error("A valid captured screenshot is required.")
  return Buffer.from(source.slice(source.indexOf(",") + 1), "base64")
}

async function normalizedCrop(snapshot: ResponsiveSnapshot, control: ResponsiveControl) {
  const image = imageBuffer(snapshot.screenshot)
  const info = await sharp(image).metadata()
  const [x, y, width, height] = control.box
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || !info.width || !info.height) throw new Error("Invalid control bounds or screenshot dimensions.")
  const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y))
  const right = Math.min(info.width, Math.ceil(x + width)), bottom = Math.min(info.height, Math.ceil(y + height))
  if (right <= left || bottom <= top) throw new Error("Control is outside the screenshot.")
  return sharp(image).extract({ left, top, width: right - left, height: bottom - top })
    .flatten({ background: "#ffffff" }).resize(128, 64, { fit: "fill" }).greyscale().png().toBuffer()
}

/** Normalized appearances are evidence only: responsive resizing is never a failure. */
export async function compareControlRegions(reference: ResponsiveSnapshot, candidate: ResponsiveSnapshot, a: ResponsiveControl, b: ResponsiveControl): Promise<ResponsiveControlComparison> {
  const result: ResponsiveControlComparison = {
    controlKey: a.key, label: a.label, referenceViewport: reference.viewport.name, candidateViewport: candidate.viewport.name,
    referenceSize: [a.box[2], a.box[3]], candidateSize: [b.box[2], b.box[3]],
  }
  const mats: any[] = []
  try {
    const cv = await loadOpenCvForLayout()
    const crops = await Promise.all([normalizedCrop(reference, a), normalizedCrop(candidate, b)])
    const decoded = await Promise.all(crops.map(crop => sharp(crop).greyscale().raw().toBuffer()))
    const mat = () => { const value = new cv.Mat(64, 128, cv.CV_8UC1); mats.push(value); return value }
    const left = mat(), right = mat(), diff = mat(), mask = mat()
    left.data.set(decoded[0]); right.data.set(decoded[1])
    cv.absdiff(left, right, diff)
    cv.threshold(diff, mask, 18, 255, cv.THRESH_BINARY)
    result.changedRatio = cv.countNonZero(mask) / (128 * 64)
    result.referenceCrop = `data:image/png;base64,${crops[0].toString("base64")}`
    result.candidateCrop = `data:image/png;base64,${crops[1].toString("base64")}`
    const maskImage = await sharp(Buffer.from(mask.data), { raw: { width: 128, height: 64, channels: 1 } }).png().toBuffer()
    result.differenceMask = `data:image/png;base64,${maskImage.toString("base64")}`
  } catch (error) {
    result.error = error instanceof Error ? error.message : "OpenCV comparison failed."
  } finally {
    for (const mat of mats.reverse()) { try { mat.delete() } catch {} }
  }
  return result
}

export async function buildResponsiveComparison(jobs: AutomationJob[]): Promise<ResponsiveComparison> {
  if (jobs.length !== 3 || !jobs[0].responsiveGroup) throw new Error("All three responsive journeys are required.")
  const group = jobs[0].responsiveGroup
  if (new Set(jobs.map(job => job.id)).size !== 3 || jobs.some(job => job.responsiveGroup?.id !== group.id || job.projectId !== jobs[0].projectId)) throw new Error("Responsive journeys do not belong to the same group and project.")
  const byKey = new Map<string, ResponsiveSnapshot[]>()
  for (const job of jobs) for (const snapshot of job.responsiveSnapshots || []) {
    const existing = byKey.get(snapshot.key) || []
    // There is one current capture per state per independent viewport journey.
    if (!existing.some(item => item.viewport.name === snapshot.viewport.name)) existing.push(snapshot)
    byKey.set(snapshot.key, existing)
  }
  const screens: ResponsiveComparison["screens"] = []
  for (const [key, snapshots] of byKey) {
    const first = snapshots[0]
    const findings = snapshots.flatMap(snapshot => snapshot.findings)
    for (const job of jobs) if (!snapshots.some(snapshot => snapshot.viewport.name === job.viewports[0].name)) {
      findings.push({ kind: "missing_screen", status: "review", viewport: job.viewports[0].name, message: "No equivalent screen/state was captured in this journey. This is a coverage gap, not proof of a layout defect." })
    }
    const reference = snapshots.find(snapshot => snapshot.viewport.name === "Desktop") || first
    const controls: ResponsiveControlComparison[] = []
    for (const candidate of snapshots.filter(snapshot => snapshot !== reference)) {
      const baseline = reference.controls.filter(control => control.visible)
      const candidateVisible = candidate.controls.filter(control => control.visible)
      for (const control of baseline) {
        const match = candidateVisible.find(item => item.key === control.key)
        if (!match) {
          findings.push({ kind: "missing_control", status: "review", viewport: candidate.viewport.name, controlKey: control.key, message: `${control.label} is not visible in the matched state. Check alternate navigation, scrolling or intentional responsive hiding before calling it missing.` })
        }
      }
      for (const control of candidateVisible.filter(control => !baseline.some(item => item.key === control.key))) {
        findings.push({ kind: "missing_control", status: "review", viewport: reference.viewport.name, controlKey: control.key, message: `${control.label} is visible only in ${candidate.viewport.name}. Check whether this is intentional alternate navigation or a missing equivalent action.` })
      }
      const shared = baseline.flatMap(control => {
        const match = candidateVisible.find(item => item.key === control.key)
        return match ? [{ control, match }] : []
      })
      // Bound image processing and make the sampling limit explicit in the report.
      for (const { control, match } of shared.slice(0, 8)) controls.push(await compareControlRegions(reference, candidate, control, match))
    }
    screens.push({ key, state: first.state, url: first.url, snapshots, findings, controls })
  }
  const incomplete = jobs.some(job => job.status !== "completed" || !job.responsiveSnapshots?.length || job.responsiveCaptureErrors?.length) ||
    screens.some(screen => screen.snapshots.length !== 3 || screen.snapshots.some(snapshot => snapshot.engine !== "opencv-js" || snapshot.findings.some(finding => finding.kind === "capture_error")) || screen.controls.some(control => control.error))
  const observed = screens.some(screen => screen.findings.some(finding => finding.status === "observed"))
  const review = screens.some(screen => screen.findings.some(finding => finding.status === "review"))
  return {
    groupId: group.id, generatedAt: new Date().toISOString(), runs: jobs.map(summarizeResponsiveRun), screens,
    status: incomplete ? "incomplete" : observed ? "issues_observed" : review ? "review_required" : "no_observed_issues",
    limitations: [
      "Each viewport runs a separate journey and retains its own plan, approval gates and results. Repeated submissions may create separate test records.",
      "Screens match by route (including non-secret query and hash) plus discovery/action state. Unmatched states remain unverified.",
      "Intentional reflow, resizing and hidden navigation are not automatically treated as defects. Missing controls, clipping and small targets require review.",
      "OpenCV compares normalized crops of at most eight matched visible controls per screen/viewport pair. Appearance differences are evidence, not failure verdicts; whole desktop/mobile images are not pixel-compared.",
      "Captures cover the viewport at recorded journey states, up to 60 states per journey and 400 DOM controls per capture. This is not exhaustive device or accessibility certification.",
      ...jobs.flatMap(job => (job.responsiveCaptureErrors || []).map(error => `${job.viewports[0].name}: ${error}`)),
    ],
  }
}
