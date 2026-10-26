import Link from "next/link";

const cases = [
  { id: "test-case-123", number: "123", title: "Visual detection", description: "A controlled page with icons, buttons, cards, form fields, and visual defect toggles.", tags: ["Screenshot analysis", "Element visibility", "Visual changes"] },
  { id: "test-case-456", number: "456", title: "Interaction flow", description: "A predictable workflow with tabs, a modal, validation, and a multi-step form.", tags: ["Clicks and typing", "Form validation", "State changes"] },
  { id: "test-case-789", number: "789", title: "Resilience checks", description: "Deliberate UI failures and recovery paths for repeatable end-to-end tests.", tags: ["Failure injection", "Recovery", "Evidence"] },
];

export default function TestLabsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Open Design AI · Test Labs</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Controlled testing playgrounds</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Three isolated demo sites with predictable elements and reproducible UI states. Use them to walk through automation scripts and collect evidence without touching production data.</p>
          </div>
          <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900">Back to app</Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {cases.map((item) => (
            <article key={item.id} className="flex min-h-80 flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
              <div className="mb-5 flex items-center justify-between">
                <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">TEST CASE {item.number}</span>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-label="Available" />
              </div>
              <h2 className="text-xl font-semibold">{item.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{item.description}</p>
              <div className="my-5 flex flex-wrap gap-2">
                {item.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{tag}</span>)}
              </div>
              <Link href={`/test-labs/${item.id}`} data-testid={`open-${item.id}`} className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Open test case <span className="ml-2" aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">Testing contract</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Each case uses stable <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-200">data-testid</code> selectors and has optional defects that can be enabled deliberately. DOM checks are the baseline; screenshot/OpenCV analysis can be layered on top and compared against the same expected outcomes.</p>
        </div>
      </div>
    </main>
  );
}
