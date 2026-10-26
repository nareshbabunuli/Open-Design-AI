import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-project-access"
import {
  decryptConnection,
  encryptConnection,
  oauthCookieOptions,
  providerBaseUrl,
  refreshRepositoryConnection,
  tokenCookieName,
  type RepositoryConnection,
} from "@/lib/integrations/repository-connections"

import { extractTraceProposals } from "@/lib/integrations/duo-proposals"
import { sealDuoReview } from "@/lib/integrations/duo-review-context"

export const dynamic = "force-dynamic"

type GitLabConnection = RepositoryConnection

async function gitlabRequest(url: string, accessToken: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
}

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: NextRequest) {
  const user = await requireUser().catch(() => null)
  if (!user) return errorResponse(401, "Sign in to Open Design AI before starting a Duo review.")

  const connection = decryptConnection<GitLabConnection>(request.cookies.get(tokenCookieName("gitlab"))?.value)
  if (!connection || connection.userId !== user.id) {
    return errorResponse(401, "Connect your GitLab account in Settings before starting a Duo review.")
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, "Request body must be valid JSON.")
  }

  const projectId = typeof body.projectId === "string" || typeof body.projectId === "number"
    ? String(body.projectId).trim()
    : ""
  const goal = typeof body.goal === "string" ? body.goal.trim() : ""
  const appUrl = typeof body.appUrl === "string" ? body.appUrl.trim() : ""
  const baseBranch = typeof body.baseBranch === "string" ? body.baseBranch.trim() : ""
  const findings = Array.isArray(body.findings) ? body.findings.slice(0, 30) : []

  if (!projectId || !/^[0-9]+$/.test(projectId)) {
    return errorResponse(400, "Choose a GitLab repository before starting the Duo review.")
  }
  if (!baseBranch || baseBranch.length > 200 || baseBranch.startsWith("-")) {
    return errorResponse(400, "A valid repository base branch is required.")
  }
  if (!goal || goal.length > 8000) {
    return errorResponse(400, "Provide a review goal between 1 and 8,000 characters.")
  }

  const baseUrl = providerBaseUrl("gitlab")
  let activeConnection = connection
  let refreshedCookieValue: string | null = null
  const withCookie = (response: NextResponse) => {
    if (refreshedCookieValue) response.cookies.set(tokenCookieName("gitlab"), refreshedCookieValue, oauthCookieOptions(60 * 60 * 24 * 30))
    return response
  }
  const refreshedError = (status: number, message: string) => withCookie(errorResponse(status, message))
  try {
    const refreshed = await refreshRepositoryConnection("gitlab", connection)
    activeConnection = refreshed.connection
    if (refreshed.refreshed) refreshedCookieValue = encryptConnection(activeConnection)
    const branchResponse = await gitlabRequest(
      `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches/${encodeURIComponent(baseBranch)}`,
      activeConnection.accessToken
    )
    if (!branchResponse.ok) return refreshedError(409, "Could not resolve the review branch. Refresh repositories and try again.")
    const branch = await branchResponse.json()
    const baseCommit = branch.commit?.id
    if (typeof baseCommit !== "string" || !/^[a-f0-9]{40,64}$/.test(baseCommit)) {
      return refreshedError(502, "GitLab did not return a valid review commit.")
    }
    // Resolve the user's actual available privilege IDs and deliberately exclude
    // GitLab-write and git-push privileges. The agent may prepare changes in its
    // isolated workspace, but it cannot commit or push them to the project.
    const privilegesResponse = await gitlabRequest(
      `${baseUrl}/api/v4/ai/duo_workflows/workflows/agent_privileges`,
      activeConnection.accessToken
    )
    if (!privilegesResponse.ok) {
      const detail = privilegesResponse.status === 403
        ? "Your GitLab account cannot access the Duo Agent Platform API. Check your Ultimate/Duo access and project settings."
        : `GitLab could not list Duo agent privileges (HTTP ${privilegesResponse.status}).`
      return refreshedError(502, detail)
    }
    const privilegePayload = await privilegesResponse.json()
    const allowedNames = new Set(["read_write_files", "read_only_gitlab", "run_commands"])
    type AgentPrivilege = { id: number; name: string }
    const availablePrivileges = (privilegePayload.all_privileges || []) as Array<{ id?: number; name?: string }>
    const privileges: AgentPrivilege[] = availablePrivileges.filter(
      (item): item is AgentPrivilege =>
        typeof item.id === "number" &&
        typeof item.name === "string" &&
        allowedNames.has(item.name)
    )
    const privilegeIds = privileges.map(item => item.id)
    const privilegeNames = new Set(privileges.map(item => item.name))
    const requiredPrivileges = ["read_only_gitlab", "read_write_files", "run_commands"]
    const missingPrivileges = requiredPrivileges.filter(name => !privilegeNames.has(name))
    if (missingPrivileges.length > 0) {
      return refreshedError(
        502,
        `GitLab did not provide the required safe Duo capabilities: ${missingPrivileges.join(", ")}. Check Duo Agent Platform access and project configuration.`
      )
    }

    const fullGoal = [
      "You are reviewing a web application's end-to-end UI testing findings for Open Design AI.",
      goal,
      `Review source from branch ${baseBranch} at exact commit ${baseCommit}. Read source at that commit through read-only GitLab APIs. Only use workspace files if HEAD matches this commit; otherwise report the mismatch instead of proposing replacements.`,
      appUrl ? `Application under test: ${appUrl}` : "",
      "Work only in the isolated agent workspace. Do not commit, push, create a branch, open a merge request, or write to the GitLab project through GitLab APIs.",
      "Inspect relevant source files and tests. Prepare candidate fixes in priority order, explain the evidence and rationale, and run relevant local tests when possible.",
      "Do not create or modify files in the GitLab repository itself. Prepare candidate fixes and return your final result as one valid JSON object, with no markdown fences, shaped like: {\"proposals\":[{\"id\":\"fix-1\",\"issue\":\"short issue title\",\"summary\":\"why this change helps\",\"files\":[{\"path\":\"relative/path.ts\",\"content\":\"complete replacement file content\"}]}]}. Return at most 20 proposals, with unique proposal IDs and unique paths within each proposal. Each proposal must contain complete file contents for every changed file. Do not include unchanged files. Keep proposals small and separate by issue. Do not claim a fix has been applied to the user's repository. The user must review and explicitly approve each proposal before any repository mutation.",
    ].filter(Boolean).join("\n\n")

    const additionalContext = [{
      Category: "open_design_ai_ui_test_findings",
      Content: JSON.stringify({ appUrl, findings, baseBranch, baseCommit }),
    }]
    const createResponse = await gitlabRequest(
      `${baseUrl}/api/v4/ai/duo_workflows/workflows`,
      activeConnection.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          source_branch: baseBranch,
          goal: fullGoal,
          additional_context: additionalContext,
          workflow_definition: "developer/v1",
          environment: "web",
          source: "ide_extension",
          agent_privileges: privilegeIds,
          pre_approved_agent_privileges: privilegeIds,
          start_workflow: true,
          allow_agent_to_request_user: true,
        }),
      }
    )
    const data = await createResponse.json().catch(() => ({}))
    if (!createResponse.ok) {
      const apiMessage = typeof data.message === "string" ? data.message : ""
      const message = createResponse.status === 403
        ? `GitLab rejected the Duo workflow. ${apiMessage || "Check Duo Agent Platform access, identity verification, project settings, and service-account requirements."}`
        : `Could not start the GitLab Duo workflow (HTTP ${createResponse.status}). ${apiMessage}`
      return refreshedError(502, message.trim())
    }

    if (!/^\d+$/.test(String(data.id))) return refreshedError(502, "GitLab did not return a valid workflow ID.")
    const reviewToken = sealDuoReview({
      userId: user.id, workflowId: String(data.id), projectId, baseBranch, baseCommit,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }, process.env.REPOSITORY_CONNECTION_SECRET || "")
    const response = NextResponse.json({
      success: true,
      workflow: {
        id: String(data.id),
        status: data.status || "created",
        title: data.title || "Open Design AI fix review",
        summary: data.summary || "Duo is reviewing the supplied test findings.",
        webUrl: data.web_url || null,
        projectId,
        baseBranch,
        baseCommit,
        reviewToken,
        provider: "gitlab",
      },
      safety: {
        repositoryWritePrivilege: false,
        gitPushPrivilege: false,
        requiresHumanReview: true,
      },
    }, { status: 201 })
    if (refreshedCookieValue) response.cookies.set(tokenCookieName("gitlab"), refreshedCookieValue, oauthCookieOptions(60 * 60 * 24 * 30))
    return response
  } catch (error) {
    console.error("Failed to start GitLab Duo workflow", error)
    return refreshedError(502, "The GitLab Duo request failed unexpectedly. Check your connection and try again.")
  }
}

export async function GET(request: NextRequest) {
  const user = await requireUser().catch(() => null)
  if (!user) return errorResponse(401, "Sign in to view a Duo review.")

  const connection = decryptConnection<GitLabConnection>(request.cookies.get(tokenCookieName("gitlab"))?.value)
  if (!connection || connection.userId !== user.id) {
    return errorResponse(401, "Reconnect GitLab to view this Duo review.")
  }

  const workflowId = request.nextUrl.searchParams.get("workflowId") || ""
  if (!/^\d+$/.test(workflowId)) return errorResponse(400, "A valid workflowId is required.")

  const baseUrl = providerBaseUrl("gitlab")
  let activeConnection = connection
  let refreshedCookieValue: string | null = null
  const withCookie = (response: NextResponse) => {
    if (refreshedCookieValue) response.cookies.set(tokenCookieName("gitlab"), refreshedCookieValue, oauthCookieOptions(60 * 60 * 24 * 30))
    return response
  }
  const refreshedError = (status: number, message: string) => withCookie(errorResponse(status, message))
  try {
    const refreshed = await refreshRepositoryConnection("gitlab", connection)
    activeConnection = refreshed.connection
    if (refreshed.refreshed) refreshedCookieValue = encryptConnection(activeConnection)
    const [flowResponse, traceResponse] = await Promise.all([
      gitlabRequest(`${baseUrl}/api/v4/ai/duo_workflows/workflows/${workflowId}`, activeConnection.accessToken),
      gitlabRequest(`${baseUrl}/api/v4/ai/duo_workflows/workflows/${workflowId}/trace.jsonl`, activeConnection.accessToken),
    ])
    if (!flowResponse.ok) {
      return refreshedError(flowResponse.status === 404 ? 404 : 502, `Could not retrieve the Duo workflow status (HTTP ${flowResponse.status}).`)
    }
    const flow = await flowResponse.json()
    if (!traceResponse.ok) return refreshedError(502, `Could not retrieve Duo proposals (HTTP ${traceResponse.status}). Retry the review refresh.`)
    const traceText = await traceResponse.text()
    const proposals = flow.status === "finished" ? extractTraceProposals(traceText) : []
    const messages = traceText.split("\n").filter(Boolean).slice(-80).flatMap(line => {
      try {
        const entry = JSON.parse(line)
        if (typeof entry.content !== "string" || !entry.content.trim()) return []
        return [{
          role: entry.message_type === "human" ? "user" : "assistant",
          content: entry.content.slice(0, 12000),
          status: entry.status || "success",
        }]
      } catch {
        return []
      }
    })
    const response = NextResponse.json({
      workflow: {
        id: String(flow.id),
        status: flow.status || "unknown",
        title: flow.title || "Open Design AI fix review",
        summary: flow.summary || "",
        webUrl: flow.web_url || null,
      },
      messages,
      proposals: proposals || [],
      proposalError: proposals === null
        ? "Duo finished without valid structured proposals. Open the GitLab session to inspect its output."
        : null,
    })
    if (refreshedCookieValue) response.cookies.set(tokenCookieName("gitlab"), refreshedCookieValue, oauthCookieOptions(60 * 60 * 24 * 30))
    return response
  } catch (error) {
    console.error("Failed to retrieve GitLab Duo workflow", error)
    return refreshedError(502, "Could not retrieve the Duo session. Retry in a moment.")
  }
}
