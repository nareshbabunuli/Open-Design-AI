import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | undefined

/**
 * Browser Supabase client (singleton).
 * During Next.js production builds / CI (when env vars are intentionally
 * absent) we fall back to inert placeholders so the build can complete.
 * Real runtime requests still require the correct NEXT_PUBLIC_* values.
 */
export function createClient() {
  if (client) return client

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (process.env.NEXT_PHASE === "phase-production-build"
      ? "https://placeholder.supabase.co"
      : undefined)

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (process.env.NEXT_PHASE === "phase-production-build"
      ? "placeholder-anon-key"
      : undefined)

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in your environment (see .env.example)."
    )
  }

  client = createBrowserClient(url, key)
  return client
}
