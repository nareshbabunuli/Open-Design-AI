"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AutomationJob } from "@/lib/ai-automation/types"
import type { ResponsiveComparison, ResponsiveRunSummary } from "@/lib/ai-automation/responsive-types"

type Props = { job: AutomationJob | null; enabled: boolean; onEnabledChange: (enabled: boolean) => void; onSelectJob: (job: AutomationJob) => void; busy?: boolean }

export function ResponsiveJourneyPanel({ job, enabled, onEnabledChange, onSelectJob, busy }: Props) {
  const groupId = job?.responsiveGroup?.id
  const groupJobId = job?.responsiveGroup?.members[0]?.jobId
  const [runs, setRuns] = useState<ResponsiveRunSummary[]>([])
  const [compare, setCompare] = useState(false)
  const [report, setReport] = useState<ResponsiveComparison | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [screenIndex, setScreenIndex] = useState(0)
  const version = useRef(0)
  const selectVersion = useRef(0)

  useEffect(() => {
    const current = ++version.current
    selectVersion.current++
    setCompare(false); setReport(null); setRuns([]); setScreenIndex(0); setError(""); setLoading(false); setSelecting(false)
    if (!groupId || !groupJobId) return
    const controller = new AbortController()
    let inFlight = false
    const poll = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await fetch(`/api/ai-automation/responsive?jobId=${encodeURIComponent(groupJobId)}&summary=1`, { cache: "no-store", signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not load responsive journeys.")
        if (version.current === current) setRuns(data.runs || [])
      } catch (failure) {
        if (!controller.signal.aborted && version.current === current) setError(failure instanceof Error ? failure.message : "Could not load responsive journeys.")
      } finally { inFlight = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 5000)
    return () => { version.current++; selectVersion.current++; controller.abort(); window.clearInterval(timer) }
  }, [groupId, groupJobId])

  const refreshComparison = useCallback(async () => {
    if (!groupJobId) return
    const current = version.current
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/ai-automation/responsive?jobId=${encodeURIComponent(groupJobId)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not compare responsive journeys.")
      if (version.current === current) { setReport(data); setScreenIndex(0) }
    } catch (failure) {
      if (version.current === current) setError(failure instanceof Error ? failure.message : "Responsive comparison failed.")
    } finally { if (version.current === current) setLoading(false) }
  }, [groupJobId])

  const selectJourney = async (jobId: string) => {
    const current = ++selectVersion.current
    setSelecting(true); setError("")
    try {
      const response = await fetch(`/api/ai-automation/status?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.job) throw new Error(data.error || "Could not open the selected journey.")
      if (current === selectVersion.current) { setCompare(false); onSelectJob(data.job) }
    } catch (failure) {
      if (current === selectVersion.current) setError(failure instanceof Error ? failure.message : "Could not open journey.")
    } finally { if (current === selectVersion.current) setSelecting(false) }
  }

  const approveSelected = async () => {
    if (!job || job.status !== "running" || job.planApprovalState !== "awaiting_review") return
    const current = ++selectVersion.current
    setSelecting(true); setError("")
    try {
      const response = await fetch("/api/ai-automation/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, action: "approve_test_plan" }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Plan approval failed.")
      if (current === selectVersion.current && data.job) onSelectJob(data.job)
    } catch (failure) {
      if (current === selectVersion.current) setError(failure instanceof Error ? failure.message : "Plan approval failed.")
    } finally { if (current === selectVersion.current) setSelecting(false) }
  }

  const stopAll = async () => {
    if (!groupJobId) return
    setError("")
    try {
      const response = await fetch("/api/ai-automation/responsive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: groupJobId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not stop all journeys.")
      if (job) await selectJourney(job.id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not stop all journeys.") }
  }

  const screen = report?.screens[screenIndex]
  return (
    <section aria-label="Responsive journey testing" className="shrink-0 border-b border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => onEnabledChange(event.target.checked)} />Repeat journey: desktop, tablet and mobile</label>
        <span className="text-[11px] text-slate-400">1440×900 · 768×1024 · 390×844. Each journey keeps its own plan review and results.</span>
      </div>
      {groupId && <>
        <div role="tablist" aria-label="Responsive journeys" className="flex flex-wrap items-center gap-2 px-4 pb-2 text-xs">
          {["Mobile", "Desktop", "Tablet"].map(name => {
            const member = job?.responsiveGroup?.members.find(item => item.viewport.name === name)
            const run = runs.find(item => item.viewport.name === name)
            const selected = !compare && job?.viewports[0]?.name === name
            return <button role="tab" aria-selected={selected} key={name} type="button" disabled={!member || selecting || busy} onClick={() => member && void selectJourney(member.jobId)} className={`rounded-lg border px-3 py-1.5 ${selected ? "border-indigo-400 bg-indigo-950 text-indigo-100" : "border-slate-700 text-slate-300"}`}>{name} · {run?.approval === "awaiting_review" ? "review plan" : run?.status || "loading"}</button>
          })}
          <button role="tab" aria-selected={compare} type="button" disabled={loading} onClick={() => { setCompare(true); if (!report) void refreshComparison() }} className={`rounded-lg border px-3 py-1.5 ${compare ? "border-indigo-400 bg-indigo-950" : "border-slate-700"}`}>Compare</button>
          {job?.status === "running" && job.planApprovalState === "awaiting_review" && <button type="button" disabled={selecting} onClick={() => void approveSelected()} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white">Approve {job.viewports[0]?.name} plan ({job.fullAppTestPlan?.steps.length || 0} steps)</button>}
          {runs.some(run => run.status === "running" || run.status === "queued") && <button type="button" onClick={() => void stopAll()} className="rounded-lg border border-rose-700 px-3 py-1.5 text-rose-300">Stop all journeys</button>}
          {runs.some(run => run.approval === "awaiting_review") && <span className="text-amber-300">Open each device tab to review its plan before execution.</span>}
        </div>
        {compare && <div role="tabpanel" aria-label="Responsive comparison" className="max-h-[55vh] space-y-3 overflow-auto border-t border-slate-800 p-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <strong>{report ? `Comparison: ${report.status.replaceAll("_", " ")}` : "Collecting comparison evidence…"}</strong>
            <button type="button" disabled={loading} onClick={() => void refreshComparison()} className="rounded border border-slate-600 px-3 py-1">{loading ? "Comparing…" : "Refresh comparison"}</button>
            <a href={`/api/ai-automation/responsive?jobId=${encodeURIComponent(groupJobId || "")}&format=html`} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">Printable report</a>
            <a href={`/api/ai-automation/responsive?jobId=${encodeURIComponent(groupJobId || "")}&format=download`} className="text-indigo-300 underline">Export JSON</a>
          </div>
          <p className="text-[11px] text-slate-400">Different responsive layouts are expected. OpenCV compares matched control crops; appearance changes alone are not defects. Refresh after journeys advance.</p>
          {report && report.screens.length === 0 && <p className="text-sm text-amber-300">No journey states captured yet. Results are unverified.</p>}
          {report && report.screens.length > 0 && <label className="block text-xs">Matched route/state <select className="ml-2 max-w-full rounded border border-slate-700 bg-slate-900 p-2" value={screenIndex} onChange={event => setScreenIndex(Number(event.target.value))}>{report.screens.map((item, index) => <option key={item.key} value={index}>{item.state} · {item.url}</option>)}</select></label>}
          {screen && <>
            <div className="grid gap-3 md:grid-cols-3">
              {["Mobile", "Desktop", "Tablet"].map(name => {
                const snapshot = screen.snapshots.find(item => item.viewport.name === name)
                return <article key={name} className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-3"><h3 className="text-sm font-bold">{name}</h3>{snapshot ? <><p className="mb-2 text-[11px] text-slate-400">{snapshot.viewport.width}×{snapshot.viewport.height} · {snapshot.engine}</p><a href={snapshot.annotatedScreenshot || snapshot.screenshot} target="_blank" rel="noopener noreferrer"><img className="w-full" src={snapshot.annotatedScreenshot || snapshot.screenshot} alt={`${name} ${screen.state} with control bounds`} /></a></> : <p className="mt-2 text-xs text-amber-300">Equivalent state not captured. Unverified.</p>}</article>
              })}
            </div>
            <ul className="space-y-1 text-xs">{screen.findings.map((finding, index) => <li key={index} className={finding.status === "observed" ? "text-rose-300" : "text-amber-200"}><strong>{finding.viewport} · {finding.kind} ({finding.status}): </strong>{finding.message}</li>)}</ul>
            <details className="rounded-lg border border-slate-700 p-3 text-xs"><summary className="cursor-pointer">Control measurements and OpenCV evidence ({screen.controls.length})</summary><div className="mt-3 space-y-3">{screen.controls.map((control, index) => <article key={index} className="rounded bg-slate-950 p-3"><h4 className="font-bold">{control.label}</h4><p className="my-1 text-slate-300">{control.referenceViewport} {control.referenceSize.map(Math.round).join("×")}px → {control.candidateViewport} {control.candidateSize.map(Math.round).join("×")}px</p><p className="text-slate-400">{control.changedRatio === undefined ? control.error : `${(control.changedRatio * 100).toFixed(2)}% normalized appearance change · informational`}</p><div className="mt-2 flex flex-wrap gap-3">{[[control.referenceCrop, "Reference"], [control.candidateCrop, "Candidate"], [control.differenceMask, "OpenCV mask"]].map(([src, label]) => src && <figure key={label}><img width={128} height={64} src={src} alt={label} /><figcaption className="mt-1 text-[10px] text-slate-500">{label}</figcaption></figure>)}</div></article>)}</div></details>
          </>}
          {report && <details className="text-[11px] text-slate-400"><summary>Coverage and limitations</summary><ul className="mt-2 list-disc pl-4">{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        </div>}
      </>}
      {error && <p role="alert" className="px-4 pb-2 text-xs text-rose-300">{error}</p>}
    </section>
  )
}
