"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CaseId = "test-case-123" | "test-case-456" | "test-case-789";
const config: Record<CaseId, { number: string; title: string; subtitle: string }> = {
  "test-case-123": { number: "123", title: "Visual detection", subtitle: "Inspect visible elements and toggle controlled visual defects." },
  "test-case-456": { number: "456", title: "Interaction flow", subtitle: "Exercise form entry, tabs, validation, and modal handling." },
  "test-case-789": { number: "789", title: "Resilience checks", subtitle: "Introduce predictable failures and verify the UI recovers." },
};

export default function TestPlayground({ caseId }: { caseId: string }) {
  const selectedCase = config[caseId as CaseId];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "activity">("overview");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showDefect, setShowDefect] = useState(false);
  const [hideIcon, setHideIcon] = useState(false);
  const [events, setEvents] = useState<string[]>(["Playground ready"]);
  const [error, setError] = useState("");

  const checks = useMemo(() => [
    { label: "Primary action visible", pass: !(showDefect && caseId === "test-case-123") },
    { label: "Status icon visible", pass: !(hideIcon && caseId !== "test-case-456") },
    { label: "Form responds to input", pass: true },
    { label: "Navigation state updates", pass: true },
  ], [showDefect, hideIcon, caseId]);

  function log(message: string) {
    setEvents((current) => [message, ...current].slice(0, 8));
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.includes("@")) {
      setError("Enter a name and a valid email address.");
      setSubmitted(false);
      log("Form validation failed");
      return;
    }
    setError("");
    setSubmitted(true);
    log("Form submitted successfully");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/test-labs" className="text-sm text-cyan-300 hover:text-cyan-200">← All test cases</Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Test Case {selectedCase.number}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{selectedCase.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{selectedCase.subtitle}</p>
          </div>
          <div data-testid="case-status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">Ready for testing</div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Sample workspace</p>
                  <h2 className="mt-1 text-xl font-semibold">Project Atlas</h2>
                  <p className="mt-1 text-sm text-slate-400">A controlled UI with stable selectors for automation.</p>
                </div>
                <span data-testid="status-badge" className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">All systems normal</span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-500">Screens checked</p><p className="mt-2 text-2xl font-semibold">24</p><p className="mt-1 text-xs text-emerald-300">+4 this session</p></div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-500">Issues detected</p><p className="mt-2 text-2xl font-semibold" data-testid="issue-count">{showDefect || hideIcon ? "1" : "0"}</p><p className="mt-1 text-xs text-slate-500">Simulated findings</p></div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-slate-500">Run status</p><p className="mt-2 text-2xl font-semibold">{submitted ? "Pass" : "Idle"}</p><p className="mt-1 text-xs text-slate-500">Local demo state</p></div>
              </div>

              <div className="mt-6 flex gap-2 border-b border-slate-800 pb-3">
                <button type="button" data-testid="tab-overview" aria-pressed={activeTab === "overview"} onClick={() => { setActiveTab("overview"); log("Opened overview tab"); }} className={`rounded-lg px-3 py-2 text-sm transition ${activeTab === "overview" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Overview</button>
                <button type="button" data-testid="tab-activity" aria-pressed={activeTab === "activity"} onClick={() => { setActiveTab("activity"); log("Opened activity tab"); }} className={`rounded-lg px-3 py-2 text-sm transition ${activeTab === "activity" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Activity</button>
              </div>

              {activeTab === "overview" ? (
                <div className="py-5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300/10 text-xl text-cyan-200 ${hideIcon && caseId !== "test-case-456" ? "invisible" : ""}`} data-testid="status-icon" aria-label="Status icon">✦</div>
                    <div><h3 className="font-medium">Visual checkpoint</h3><p className="mt-1 text-sm text-slate-400">Use this section to validate element presence and layout.</p></div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" data-testid="primary-action" onClick={() => { setSubmitted(true); log("Primary action clicked"); }} className={`rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 ${showDefect && caseId === "test-case-123" ? "invisible" : ""}`}>Run sample action</button>
                    <button type="button" data-testid="open-modal" onClick={() => { setModalOpen(true); log("Opened confirmation modal"); }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800">Open modal</button>
                  </div>
                  {submitted && <p data-testid="success-message" role="status" className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">Action completed successfully.</p>}
                </div>
              ) : (
                <div data-testid="activity-panel" className="py-5"><h3 className="font-medium">Recent activity</h3><p className="mt-2 text-sm text-slate-400">The test script can verify this tab changes the visible content.</p><ul className="mt-4 space-y-2 text-sm text-slate-300"><li className="rounded-lg bg-slate-950 p-3">10:42 · Page inspected</li><li className="rounded-lg bg-slate-950 p-3">10:43 · Elements indexed</li><li className="rounded-lg bg-slate-950 p-3">10:44 · Evidence captured</li></ul></div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Form validation</h2>
              <p className="mt-1 text-sm text-slate-400">A deterministic form for typing, validation, and submit checks.</p>
              <form onSubmit={submitForm} className="mt-5 space-y-4" data-testid="sample-form" noValidate>
                <label className="block text-sm text-slate-300">Name<input data-testid="name-input" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" placeholder="Enter a name" /></label>
                <label className="block text-sm text-slate-300">Email<input data-testid="email-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" placeholder="you@example.com" /></label>
                {error && <p data-testid="form-error" role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
                <button type="submit" data-testid="submit-form" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-200">Submit form</button>
              </form>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-semibold">Defect controls</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Enable a deliberate defect, run your script, then confirm it appears in the evidence.</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <input data-testid="toggle-missing-action" type="checkbox" checked={showDefect} onChange={(event) => { setShowDefect(event.target.checked); log(event.target.checked ? "Injected missing primary action" : "Restored primary action"); }} className="mt-1 accent-cyan-300" />
                <span><span className="block text-sm font-medium">Hide primary action</span><span className="mt-1 block text-xs leading-5 text-slate-500">Tests detection of a missing visible control.</span></span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <input data-testid="toggle-missing-icon" type="checkbox" checked={hideIcon} onChange={(event) => { setHideIcon(event.target.checked); log(event.target.checked ? "Injected missing status icon" : "Restored status icon"); }} className="mt-1 accent-cyan-300" />
                <span><span className="block text-sm font-medium">Hide status icon</span><span className="mt-1 block text-xs leading-5 text-slate-500">Tests visibility and screenshot difference checks.</span></span>
              </label>
              <button type="button" data-testid="reset-playground" onClick={() => { setName(""); setEmail(""); setActiveTab("overview"); setModalOpen(false); setSubmitted(false); setShowDefect(false); setHideIcon(false); setError(""); setEvents(["Playground reset"]); }} className="mt-4 w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800">Reset playground</button>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Expected checks</h2><span className="text-xs text-slate-500">{checks.filter((check) => check.pass).length}/{checks.length} baseline</span></div>
              <ul className="mt-4 space-y-3">{checks.map((check) => <li key={check.label} className="flex items-center gap-3 text-sm"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${check.pass ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>{check.pass ? "✓" : "!"}</span><span className={check.pass ? "text-slate-300" : "text-rose-200"}>{check.label}</span></li>)}</ul>
              <p className="mt-3 text-xs leading-5 text-slate-500">These are UI-state indicators, not automated OpenCV results.</p>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-semibold">Interaction log</h2>
              <ol data-testid="interaction-log" className="mt-3 space-y-2">{events.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-400">{item}</li>)}</ol>
            </section>
          </aside>
        </div>
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="confirmation-modal"><div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"><h2 id="modal-title" className="text-xl font-semibold">Confirm sample action</h2><p className="mt-3 text-sm leading-6 text-slate-400">This modal exists so the automation can test overlays, buttons, and close behaviour.</p><div className="mt-6 flex justify-end gap-3"><button type="button" data-testid="close-modal" onClick={() => { setModalOpen(false); log("Closed confirmation modal"); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">Cancel</button><button type="button" data-testid="confirm-modal" onClick={() => { setModalOpen(false); setSubmitted(true); log("Confirmed modal action"); }} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Confirm</button></div></div></div>}
    </main>
  );
}
