import { createServerClient } from "@supabase/ssr"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

function getPublicSupabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (process.env.NEXT_PHASE === "phase-production-build"
      ? "https://placeholder.supabase.co"
      : undefined)

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    (process.env.NEXT_PHASE === "phase-production-build"
      ? "placeholder-anon-key"
      : undefined)

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in your environment (see .env.example)."
    )
  }

  return { url, key }
}

/**
 * User-scoped Supabase client (respects RLS). Prefer this in API routes.
 */
export async function createUserClient() {
  const { url, key } = getPublicSupabaseConfig()
  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component where cookies cannot be set.
        }
      },
    },
  })
}

/**
 * Service-role client — ONLY for trusted background workers after a job
 * has already been authorized. Never call this from an unauthenticated route.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    // Allow the production build to finish when secrets are not present in CI.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return createServiceClient(
        "https://placeholder.supabase.co",
        "placeholder-service-role-key",
        {
          auth: { persistSession: false, autoRefreshToken: false },
        }
      )
    }
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  }

  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
