import { NextRequest, NextResponse } from "next/server"
import { isLayaAvailable } from "@/lib/journey/laya-client"
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth/require-project-access"
import { configuredLayaBase } from "@/lib/security/provider-policy"

export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const raw = req.nextUrl.searchParams.get("baseUrl") || undefined
    let baseUrl: string
    try {
      baseUrl = configuredLayaBase(raw)
    } catch {
      return NextResponse.json({ error: "Laya URL must match server configuration" }, { status: 400 })
    }
    return NextResponse.json({ live: await isLayaAvailable(baseUrl) })
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error)
    return NextResponse.json({ live: false })
  }
}
