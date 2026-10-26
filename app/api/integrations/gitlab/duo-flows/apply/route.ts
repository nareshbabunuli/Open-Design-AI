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

import { extractTraceProposals, isSafeProposalPath, type ProposedFix } from "@/lib/integrations/duo-proposals"
import { openDuoReview } from "@/lib/integrations/duo-review-context"

export const dynamic = "force-dynamic"

type GitLabConnection = RepositoryConnection

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

async function gitlabFetch(url: string, accessToken: string, init?: RequestInit) {
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

export async function POST(request: NextRequest) {
  const user = await requireUser().catch(() => null)
  if (!user) return errorResponse(401, "Sign in before approving a proposed fix.")

  const connection = decryptConnection<GitLabConnection>(request.cookies.get(tokenCookieName("gitlab"))?.value)
  if (!connection || connection.userId !== user.id) return errorResponse(401, "Reconnect GitLab before approving a proposed fix.")

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return errorResponse(400, "Request body must be valid JSON.") }

  if (body.approved !== true) return errorResponse(400, "Explicit approval is required before any repository change.")
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  const baseBranch = typeof body.baseBranch === "string" ? body.baseBranch.trim() : ""
  const workflowId = typeof body.workflowId === "string" ? body.workflowId : ""
  const proposals = Array.isArray(body.proposals) ? body.proposals as ProposedFix[] : []
  if (!/^\d+$/.test(projectId)) return errorResponse(400, "Invalid GitLab project ID.")
  if (!baseBranch || baseBranch.length > 200 || baseBranch.startsWith("-")) return errorResponse(400, "Invalid base branch.")
  if (!/^\d+$/.test(workflowId)) return errorResponse(400, "Invalid Duo workflow ID.")
  const review = openDuoReview(body.reviewToken, process.env.REPOSITORY_CONNECTION_SECRET || "")
  if (!review || review.userId !== user.id || review.workflowId !== workflowId ||
      review.projectId !== projectId || review.baseBranch !== baseBranch) {
    return errorResponse(409, "This review has no valid code snapshot. Start a new Duo review before approving changes.")
  }
  if (proposals.length < 1 || proposals.length > 20) return errorResponse(400, "Select between 1 and 20 proposed fixes to approve.")

  const files = new Map<string, string>()
  const proposalIds = new Set<string>()
  for (const proposal of proposals) {
    if (!proposal || typeof proposal.id !== "string" || !Array.isArray(proposal.files) || proposal.files.length === 0) {
      return errorResponse(400, "A proposed fix has an invalid file list.")
    }
    if (proposalIds.has(proposal.id)) return errorResponse(400, "Duplicate proposal IDs are not allowed.")
    proposalIds.add(proposal.id)
    const proposalPaths = new Set<string>()
    for (const file of proposal.files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
        return errorResponse(400, "Every proposed file must include a path and complete file content.")
      }
      const path = file.path.trim()
      if (!isSafeProposalPath(file.path) || proposalPaths.has(path)) {
        return errorResponse(400, "A proposed file path is unsafe or duplicated.")
      }
      proposalPaths.add(path)
      if (file.content.length > 200_000) return errorResponse(413, `Proposed file ${path} is too large to approve in this workflow.`)
      if (files.has(path) && files.get(path) !== file.content) return errorResponse(400, `The approved fixes contain conflicting versions of ${path}. Ask Duo for one combined replacement based on the reviewed commit.`)
      files.set(path, file.content)
    }
  }
  if (files.size > 40) return errorResponse(413, "A single approval can change at most 40 files.")

  const baseUrl = providerBaseUrl("gitlab")
  const branchName = `open-design-ai/duo-fixes-${workflowId}`
  if (baseBranch === branchName) return errorResponse(409, "The review branch cannot also be the target fix branch.")
  const projectUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}`

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

    // Verify that the workflow belongs to the selected project and that the target
    // base branch exists before creating or changing any repository branch.
    const [workflowResponse, traceResponse, baseBranchResponse] = await Promise.all([
      gitlabFetch(`${baseUrl}/api/v4/ai/duo_workflows/workflows/${workflowId}`, activeConnection.accessToken),
      gitlabFetch(`${baseUrl}/api/v4/ai/duo_workflows/workflows/${workflowId}/trace.jsonl`, activeConnection.accessToken),
      gitlabFetch(`${projectUrl}/repository/branches/${encodeURIComponent(baseBranch)}`, activeConnection.accessToken),
    ])
    if (!workflowResponse.ok) {
      return refreshedError(workflowResponse.status === 404 ? 404 : 502, `Could not verify the Duo workflow (HTTP ${workflowResponse.status}).`)
    }
    const workflow = await workflowResponse.json().catch(() => null)
    if (workflow?.status !== "finished") return refreshedError(409, "Wait for Duo to finish before approving proposals.")
    const workflowProjectId = workflow?.project_id ?? workflow?.project?.id
    if (workflowProjectId === undefined || String(workflowProjectId) !== projectId) {
      return refreshedError(403, "The Duo workflow could not be verified as belonging to this GitLab project.")
    }
    if (!traceResponse.ok) {
      return refreshedError(502, `Could not verify the approved proposals against the Duo trace (HTTP ${traceResponse.status}).`)
    }
    const traceText = await traceResponse.text()
    const authoritativeProposals = extractTraceProposals(traceText)
    if (!authoritativeProposals) {
      return refreshedError(409, "The Duo trace does not contain a verifiable proposals JSON object. Refresh the review and try again.")
    }
    for (const approvedProposal of proposals) {
      const authoritative = authoritativeProposals.find(item => item.id === approvedProposal?.id)
      if (!authoritative) return refreshedError(403, "An approved proposal was not found in the server-side Duo trace.")
      const expectedFiles = new Map(authoritative.files.map(file => [file.path, file.content]))
      if (approvedProposal.files.length !== expectedFiles.size ||
          approvedProposal.files.some(file => expectedFiles.get(file.path) !== file.content)) {
        return refreshedError(403, `Approved proposal ${approvedProposal.id} does not match the server-side Duo trace.`)
      }
    }
    if (!baseBranchResponse.ok) {
      return refreshedError(baseBranchResponse.status === 404 ? 400 : 502, `Could not verify base branch ${baseBranch} (HTTP ${baseBranchResponse.status}).`)
    }

    const currentBase = await baseBranchResponse.json()
    if (currentBase.commit?.id !== review.baseCommit) {
      return refreshedError(409, "The base branch changed since this review. Start a new review to preserve newer work.")
    }

    // Always apply approved proposals to a dedicated branch, never the base/default branch.
    const branchCheck = await gitlabFetch(`${projectUrl}/repository/branches/${encodeURIComponent(branchName)}`, activeConnection.accessToken)
    if (branchCheck.status === 404) {
      const createBranch = await gitlabFetch(`${projectUrl}/repository/branches`, activeConnection.accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ branch: branchName, ref: review.baseCommit }).toString(),
      })
      if (!createBranch.ok) {
        const data = await createBranch.json().catch(() => ({}))
        return refreshedError(502, `Could not create the isolated fix branch. ${data.message || `GitLab returned HTTP ${createBranch.status}.`}`)
      }
    } else if (!branchCheck.ok) {
      return refreshedError(502, `Could not verify the fix branch (HTTP ${branchCheck.status}).`)
    }

    const actions: Array<{ action: "create" | "update"; file_path: string; content: string; last_commit_id?: string }> = []
    for (const [path, content] of files.entries()) {
      const encodedPath = encodeURIComponent(path)
      const [fileCheck, snapshotCheck] = await Promise.all([
        gitlabFetch(`${projectUrl}/repository/files/${encodedPath}?ref=${encodeURIComponent(branchName)}`, activeConnection.accessToken),
        gitlabFetch(`${projectUrl}/repository/files/${encodedPath}?ref=${review.baseCommit}`, activeConnection.accessToken),
      ])
      if ((!fileCheck.ok && fileCheck.status !== 404) || (!snapshotCheck.ok && snapshotCheck.status !== 404)) {
        return refreshedError(502, `Could not verify ${path} against the reviewed commit.`)
      }
      const currentFile = fileCheck.ok ? await fileCheck.json() : null
      const snapshotFile = snapshotCheck.ok ? await snapshotCheck.json() : null
      if (Boolean(currentFile) !== Boolean(snapshotFile) ||
          (currentFile && (!currentFile.blob_id || currentFile.blob_id !== snapshotFile?.blob_id))) {
        return refreshedError(409, `${path} changed since the review or was changed by another approval. Start a new review with the combined changes.`)
      }
      if (currentFile) {
        if (typeof currentFile.last_commit_id !== "string" || !currentFile.last_commit_id) {
          return refreshedError(502, `GitLab did not return a version for ${path}. No commit was made.`)
        }
        actions.push({ action: "update", file_path: path, content, last_commit_id: currentFile.last_commit_id })
      } else {
        actions.push({ action: "create", file_path: path, content })
      }
    }

    const title = proposals.length === 1
      ? (proposals[0].summary || proposals[0].issue || "approved Duo fix")
      : `approved batch of ${proposals.length} Duo fixes`
    const commitResponse = await gitlabFetch(`${projectUrl}/repository/commits`, activeConnection.accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch: branchName,
        commit_message: `Open Design AI: ${title} (workflow ${workflowId})`,
        actions,
      }),
    })
    const commit = await commitResponse.json().catch(() => ({}))
    if (!commitResponse.ok) {
      return refreshedError(502, `GitLab rejected the approved change (HTTP ${commitResponse.status}). ${commit.message || ""}`.trim())
    }

    const response = NextResponse.json({
      success: true,
      approved: true,
      branch: branchName,
      commit: { id: commit.id, shortId: commit.short_id, message: commit.message, webUrl: commit.web_url },
      filesChanged: actions.length,
      proposalsApproved: proposals.length,
      pushPolicy: "User explicitly approved this branch commit. No changes were pushed to the default branch.",
    }, { status: 201 })
    if (refreshedCookieValue) response.cookies.set(tokenCookieName("gitlab"), refreshedCookieValue, oauthCookieOptions(60 * 60 * 24 * 30))
    return response
  } catch (error) {
    console.error("Failed to apply approved GitLab Duo fix", error)
    return refreshedError(502, "Could not apply the approved fix. No success was reported; check the GitLab branch and retry safely.")
  }
}
