export type ProposedFile = { path: string; content: string }
export type ProposedFix = { id: string; summary?: string; issue?: string; files: ProposedFile[] }

export function isSafeProposalPath(path: string) {
  return Boolean(path) && path === path.trim() && !path.startsWith("/") &&
    !path.includes("\\") && path.length <= 500 &&
    !path.split("/").some(part => !part || part === ".." || part === "." || part === ".git")
}

/** Parse complete assistant output, never the shortened progress-message preview. */
export function extractTraceProposals(traceText: string): ProposedFix[] | null {
  const entries = traceText.split("\n").filter(Boolean)
  for (let index = entries.length - 1; index >= 0; index--) {
    try {
      const entry = JSON.parse(entries[index])
      if (entry.message_type !== "ai" || typeof entry.content !== "string") continue
      const raw = entry.content.trim()
      const candidates = [raw, raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]]
      const firstBrace = raw.indexOf("{")
      const lastBrace = raw.lastIndexOf("}")
      if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1))
      for (const candidate of candidates) {
        if (!candidate) continue
        let parsed
        try { parsed = JSON.parse(candidate) } catch { continue }
        if (!parsed || !Array.isArray(parsed.proposals)) continue
        const ids = new Set<string>()
        const valid = parsed.proposals.length <= 20 && parsed.proposals.every((proposal: unknown) => {
          if (!proposal || typeof proposal !== "object") return false
          const item = proposal as Record<string, unknown>
          if (typeof item.id !== "string" || !item.id || ids.has(item.id)) return false
          ids.add(item.id)
          const paths = new Set<string>()
          return Array.isArray(item.files) && item.files.length > 0 && item.files.length <= 40 &&
            item.files.every((file: unknown) => {
              if (!file || typeof file !== "object") return false
              const value = file as Record<string, unknown>
              if (typeof value.path !== "string" || !isSafeProposalPath(value.path) || paths.has(value.path) ||
                  typeof value.content !== "string" || value.content.length > 200_000) return false
              paths.add(value.path)
              return true
            })
        })
        // An invalid final proposal must not fall back to an older candidate fix.
        return valid ? parsed.proposals.map((item: ProposedFix) => ({
          id: item.id,
          issue: typeof item.issue === "string" ? item.issue : "Proposed fix",
          summary: typeof item.summary === "string" ? item.summary : "Review the proposed file content.",
          files: item.files,
        })) : null
      }
    } catch { /* Ignore malformed JSONL entries. */ }
  }
  return null
}
