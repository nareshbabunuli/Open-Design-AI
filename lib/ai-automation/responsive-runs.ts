import { randomUUID } from "node:crypto"
import type { AutomationJob, AutomationViewport, StartAutomationRequest } from "./types"
import type { ResponsiveGroup } from "./responsive-types"

export const RESPONSIVE_VIEWPORTS: AutomationViewport[] = [
  { name: "Desktop", width: 1440, height: 900 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Mobile", width: 390, height: 844 },
]

/** Independent journeys keep their existing plan, auth, upload and safety gates. */
export async function createResponsiveRuns(
  params: StartAutomationRequest,
  start: (params: StartAutomationRequest) => Promise<AutomationJob>,
  save: (job: AutomationJob) => void,
  cancel: (id: string) => unknown,
): Promise<AutomationJob[]> {
  if (params.mode !== "full_app" && params.mode !== "feature_workflow") {
    throw new Error("Responsive journeys require Full App or Feature Workflow testing.")
  }
  const group: ResponsiveGroup = { id: randomUUID(), members: [] }
  const jobs: AutomationJob[] = []
  try {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      const job = await start({ ...params, responsiveJourney: false, responsiveGroup: group, viewports: [{ ...viewport }] })
      jobs.push(job)
      group.members.push({ jobId: job.id, viewport: { ...viewport } })
    }
    for (const job of jobs) {
      job.responsiveGroup = structuredClone(group)
      save(job)
    }
    return jobs
  } catch (error) {
    for (const job of jobs) cancel(job.id)
    throw error
  }
}

export function localResponsiveResult(job: AutomationJob) {
  const snapshots = job.responsiveSnapshots || []
  const incomplete = !snapshots.length || Boolean(job.responsiveCaptureErrors?.length) || snapshots.some(snapshot => snapshot.engine !== "opencv-js" || snapshot.findings.some(finding => finding.kind === "capture_error"))
  const observed = snapshots.filter(snapshot => snapshot.findings.some(finding => finding.status === "observed")).length
  const review = snapshots.some(snapshot => snapshot.findings.some(finding => finding.status === "review"))
  return {
    score: snapshots.length ? Math.round((snapshots.length - observed) / snapshots.length * 100) : 0,
    status: incomplete ? "incomplete" : observed ? "issues_observed" : review ? "review_required" : "no_observed_issues",
  }
}

export function responsiveScreenStatus(job: AutomationJob, url: string): "passed" | "warning" | "failed" {
  const captures = (job.responsiveSnapshots || []).filter(snapshot => snapshot.url === url)
  if (!captures.length || job.responsiveCaptureErrors?.length || captures.some(snapshot => snapshot.engine !== "opencv-js")) return "warning"
  if (captures.some(snapshot => snapshot.findings.some(finding => finding.status === "observed"))) return "failed"
  return captures.some(snapshot => snapshot.findings.some(finding => finding.status === "review")) ? "warning" : "passed"
}

export async function awaitResponsivePlanApproval(
  job: AutomationJob,
  load: (id: string) => AutomationJob | null,
  save: (job: AutomationJob) => void,
  wait = () => new Promise<void>(resolve => setTimeout(resolve, 500)),
): Promise<boolean> {
  if (!job.responsiveGroup) return true
  job.planApprovalState = "awaiting_review"
  job.currentStep = "Responsive journey plan ready. Review this device's plan, then approve execution."
  save(job)
  while (job.status === "running" && job.planApprovalState !== "approved") {
    await wait()
    const latest = load(job.id)
    if (!latest || latest.status !== "running" || latest.planApprovalState === "rejected") return false
    job.planApprovalState = latest.planApprovalState
    if (job.fullAppTestPlan && latest.fullAppTestPlan?.id === job.fullAppTestPlan.id) Object.assign(job.fullAppTestPlan, latest.fullAppTestPlan)
  }
  return job.status === "running" && job.planApprovalState === "approved"
}
