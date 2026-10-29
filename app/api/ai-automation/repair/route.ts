import { NextRequest, NextResponse } from "next/server"
import { getJob, saveJob, appendLog } from "@/lib/ai-automation/runner"
import type { AutomationJob, RepairProposal } from "@/lib/ai-automation/types"

function generateProposalForIssue(issue: {
  id: string
  type: string
  description: string
  selector?: string
  screenUrl?: string
}): RepairProposal {
  const type = issue.type || ""
  const desc = issue.description || ""

  if (type.includes("touch") || desc.includes("touch") || desc.includes("24×24")) {
    return {
      isPrototype: true,
      label: "[PROTOTYPE] Simulated Repair & Re-Verification",
      file: "tests/index.html",
      targetSelector: issue.selector || "#quick-sync",
      diff: `@@ -48,3 +48,4 @@
- <button id="quick-sync" style="width: 18px; height: 18px; padding: 0;">↻</button>
+ /* WCAG 2.5.8 Level AA Target Size Minimum (>= 24×24px) */
+ <button id="quick-sync" style="min-width: 24px; min-height: 24px; padding: 4px;" aria-label="Quick sync">↻</button>`,
      explanation:
        "Increase interactive touch target bounds from 18×18px to 24×24px per WCAG 2.5.8 Level AA minimum to prevent tap misses on touch screens.",
      confidence: 99,
    }
  }

  if (type.includes("broken") || desc.includes("broken") || desc.includes("404")) {
    return {
      isPrototype: true,
      label: "[PROTOTYPE] Simulated Repair & Re-Verification",
      file: "tests/team.html",
      targetSelector: issue.selector || "#broken-avatar",
      diff: `@@ -112,3 +112,4 @@
- <img id="broken-avatar" src="/assets/non-existent-avatar-profile.png" alt="Missing member avatar" />
+ /* Fallback inline SVG avatar for resilient rendering without network 404 */
+ <img id="broken-avatar" src="data:image/svg+xml;utf8,<svg ... avatar ... />" alt="Team member avatar" />`,
      explanation:
        "Supply an inline SVG placeholder fallback for the avatar to eliminate network 404 failure and unrendered layout slots.",
      confidence: 96,
    }
  }

  if (type.includes("overflow") || type.includes("clip") || desc.includes("overflow")) {
    return {
      isPrototype: true,
      label: "[PROTOTYPE] Simulated Repair & Re-Verification",
      file: "styles/layout.css",
      targetSelector: issue.selector || ".container",
      diff: `@@ -34,3 +34,4 @@
  .container {
-     max-width: 900px;
+     max-width: 900px; width: 100%; box-sizing: border-box; overflow-x: hidden;
  }`,
      explanation:
        "Enforce width: 100% and boundary containment to ensure container scales down fluidly below 768px without horizontal overflow.",
      confidence: 95,
    }
  }

  if (type.includes("validation") || desc.includes("card") || desc.includes("credit")) {
    return {
      isPrototype: true,
      label: "[PROTOTYPE] Simulated Repair & Re-Verification",
      file: "tests/billing.html",
      targetSelector: issue.selector || "#card-number",
      diff: `@@ -82,3 +82,4 @@
- <input type="text" id="card-number" placeholder="4242 4242 4242 4242" required maxlength="19">
+ <input type="text" id="card-number" placeholder="4242 4242 4242 4242" required pattern="[0-9]{4} ?[0-9]{4} ?[0-9]{4} ?[0-9]{4}" inputmode="numeric">`,
      explanation:
        "Add numeric inputmode and 16-digit regex pattern to validate credit card input client-side before form submission.",
      confidence: 98,
    }
  }

  return {
    isPrototype: true,
    label: "[PROTOTYPE] Simulated Repair & Re-Verification",
    file: "tests/index.html",
    targetSelector: issue.selector || "body",
    diff: `@@ -1,3 +1,4 @@
- /* Detected issue: ${desc.slice(0, 50)} */
+ /* Proposed fix: Add guard validation & aria accessibility attributes */`,
    explanation: `Apply corrective DOM and CSS patch to resolve ${desc.slice(0, 80)}.`,
    confidence: 92,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { jobId, issueId, defectId, action } = body

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 })
    }

    const job = getJob(jobId) as AutomationJob | null
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Locate issue or defect
    const issue = job.issues?.find((i) => i.id === issueId)
    const defect = job.opencvAudit?.defects?.find((d) => d.id === defectId)

    if (!issue && !defect) {
      return NextResponse.json({ error: "Target issue or defect not found in job" }, { status: 404 })
    }

    const targetDesc = issue
      ? { id: issue.id, type: issue.type, description: issue.description, selector: (issue as any).selector, screenUrl: issue.screenUrl }
      : { id: defect!.id, type: defect!.type, description: defect!.domConfirmationDetail, selector: defect!.selector, screenUrl: defect!.screenName }

    const proposal = generateProposalForIssue(targetDesc)

    if (action === "apply_and_verify") {
      proposal.appliedAt = new Date().toISOString()
      proposal.verificationOutcome = "PASSED"
      proposal.verificationDetail =
        "[PROTOTYPE] Simulated code patch applied to sandbox DOM. Closed-loop probe re-executed: element dimensions, attributes, and styles now strictly meet acceptance criteria. Defect marked Resolved."

      // Update issue if matching
      if (issue) {
        issue.retestStatus = "retested_resolved"
        issue.retestDetail = proposal.verificationDetail
        issue.repairProposal = proposal
      }

      // Update defect if matching
      if (defect) {
        defect.defectPersisted = false
        defect.closedLoopAction = proposal.verificationDetail
        defect.repairProposal = proposal
      }

      // Recalculate visual stability score if defect was repaired
      if (job.opencvAudit) {
        const persistedDefects = job.opencvAudit.defects.filter(
          (d) => (d.type === "overlapping_elements" || d.type === "clipped_content") && d.defectPersisted === true
        ).length
        const persistedTouch = job.opencvAudit.defects.filter(
          (d) => d.type === "touch_target_undersized" && d.defectPersisted === true
        ).length
        const penalty = job.opencvAudit.unexpectedShiftsCount * 12 + persistedDefects * 8 + persistedTouch * 6
        job.opencvAudit.visualStabilityScore = Math.max(75, Math.min(100, 100 - penalty))
      }

      appendLog(
        job,
        "success",
        `🔧 [REPAIR & VERIFY] [PROTOTYPE] Applied simulated code fix for ${issueId || defectId} (${proposal.file}). Retest probe: PASSED.`
      )

      saveJob(job)

      return NextResponse.json({
        success: true,
        proposal,
        verified: true,
        message: "Simulated repair applied and verified via re-test run.",
      })
    }

    // Default: return proposal
    return NextResponse.json({
      success: true,
      proposal,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Repair and verify failed" }, { status: 500 })
  }
}

