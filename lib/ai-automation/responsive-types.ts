import type { AutomationViewport } from "./types"

export type ResponsiveGroup = {
  id: string
  members: Array<{ jobId: string; viewport: AutomationViewport }>
}
export type ResponsiveControl = {
  key: string
  label: string
  role: string
  visible: boolean
  box: [number, number, number, number]
  naturalRatio?: number
  objectFit?: string
}
export type ResponsiveFinding = {
  kind: "overflow" | "clipped" | "covered" | "distorted_image" | "small_target" | "missing_control" | "missing_screen" | "capture_error"
  status: "observed" | "review"
  message: string
  viewport: string
  controlKey?: string
}
export type ResponsiveSnapshot = {
  key: string
  url: string
  state: string
  viewport: AutomationViewport
  capturedAt: string
  screenshot?: string
  annotatedScreenshot?: string
  controls: ResponsiveControl[]
  findings: ResponsiveFinding[]
  engine: "opencv-js" | "heuristic-fallback" | "unavailable"
  error?: string
}
export type ResponsiveControlComparison = {
  controlKey: string
  label: string
  referenceViewport: string
  candidateViewport: string
  referenceSize: [number, number]
  candidateSize: [number, number]
  changedRatio?: number
  referenceCrop?: string
  candidateCrop?: string
  differenceMask?: string
  error?: string
}
export type ResponsiveRunSummary = {
  jobId: string
  viewport: AutomationViewport
  status: string
  phase?: string
  approval?: string
  currentStep: string
  snapshots: number
  error?: string
  steps: Array<{ id: string; screen: string; action: string; target: string; status: string }>
}
export type ResponsiveComparison = {
  groupId: string
  generatedAt: string
  status: "incomplete" | "issues_observed" | "review_required" | "no_observed_issues"
  runs: ResponsiveRunSummary[]
  screens: Array<{ key: string; state: string; url: string; snapshots: ResponsiveSnapshot[]; findings: ResponsiveFinding[]; controls: ResponsiveControlComparison[] }>
  limitations: string[]
}
