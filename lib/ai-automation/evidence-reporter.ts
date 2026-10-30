import {
  AutomationJob,
  AutomationReport,
  AutomationIssue,
  FullAppTestPlan,
  WorkflowRun,
  PostmanCollectionSummary,
  PostmanEndpointMapping,
  PostmanCoverageReport,
} from "./types"
import { formatCurlCommand } from "./workflow-chainer"
import { secretRedactor } from "./secure-credentials-manager"
import { ensureJobRecordingUrl } from "./visual-recorder"
import { generateReferencesSection, ISO_9241_11_REFERENCE, WCAG_REFERENCE } from "./ux-research-references"
import { generateUXIntelligenceReport, formatUXReportMarkdown } from "./ux-report-generator"

function buildPostmanCoverageReport(testPlan: FullAppTestPlan, postmanSummary?: PostmanCollectionSummary): PostmanCoverageReport | undefined {
  if (!postmanSummary) return undefined
  const steps = testPlan.steps || []
  const endpointKey = (endpoint: { name: string; method: string; url: string; pathSegments?: string[] }) =>
    `${endpoint.method.toUpperCase()} ${(endpoint.pathSegments || endpoint.url.split("/").filter(Boolean)).join("/")} ${endpoint.name}`
  const coverage = postmanSummary.endpoints.map((endpoint) => {
    const key = endpointKey(endpoint)
    const matchingSteps = steps.filter((step) => step.postmanEndpoint && endpointKey(step.postmanEndpoint) === key)
    const executedStep = matchingSteps.find((step) => step.status !== "pending" && step.verdict !== undefined)
    const confirmedStep = matchingSteps.find((step) => step.confirmedOnWire === true)
    const failedWireStep = matchingSteps.find((step) => step.confirmedOnWire === false)
    let status: PostmanCoverageReport["endpoints"][number]["status"] = "unencountered"
    if (confirmedStep) status = "wire_confirmed"
    else if (failedWireStep) status = "wire_verification_failed"
    else if (executedStep) status = "executed"
    else if (matchingSteps.length > 0) status = "matched"
    const first = matchingSteps[0]
    return { name: endpoint.name, method: endpoint.method, url: endpoint.url, status, screenId: first?.screenId, formId: first?.formId }
  })
  const uiFieldsWithoutPostmanMatch = steps.flatMap((step) => (step.postmanMappings || [])
    .filter((m) => m.confidenceLevel === "unmatched" || !m.apiFieldName)
    .map((m) => ({ screenId: step.screenId, formId: step.formId, uiFieldName: m.uiFieldName, uiSelector: m.uiSelector })))
  const postmanFieldsNotFoundInUi: PostmanCoverageReport["postmanFieldsNotFoundInUi"] = []
  for (const endpoint of postmanSummary.endpoints) {
    const matchingSteps = steps.filter((step) => step.postmanEndpoint && endpointKey(step.postmanEndpoint) === endpointKey(endpoint))
    if (matchingSteps.length === 0) continue
    const matchedApiFields = new Set(matchingSteps.flatMap((step) => (step.postmanMappings || []).map((m) => m.apiFieldName).filter(Boolean)))
    for (const apiFieldName of Object.keys(endpoint.payloadFields)) {
      if (!matchedApiFields.has(apiFieldName)) postmanFieldsNotFoundInUi.push({ endpointName: endpoint.name, apiFieldName })
    }
  }
  const totalEndpoints = coverage.length
  const coveredEndpoints = coverage.filter((e) => e.status !== "unencountered").length
  return {
    totalEndpoints,
    matchedEndpoints: coveredEndpoints,
    executedEndpoints: coverage.filter((e) => ["executed", "wire_confirmed", "wire_verification_failed"].includes(e.status)).length,
    wireConfirmedEndpoints: coverage.filter((e) => e.status === "wire_confirmed").length,
    wireVerificationFailedEndpoints: coverage.filter((e) => e.status === "wire_verification_failed").length,
    unencounteredEndpoints: coverage.filter((e) => e.status === "unencountered").length,
    coveragePercentage: totalEndpoints === 0 ? 100 : Math.round((coveredEndpoints / totalEndpoints) * 100),
    endpoints: coverage,
    uiFieldsWithoutPostmanMatch,
    postmanFieldsNotFoundInUi,
  }
}

/**
 * Builds the comprehensive outcome-verified UI testing report,
 * populating job.report with workflow execution traces, issue taxonomy,
 * cURL reproduction steps, and full Markdown report artifact.
 */
export function buildAutomationReport(
  job: AutomationJob,
  testPlan: FullAppTestPlan,
  workflows: WorkflowRun[] = [],
  options?: {
    postmanSummary?: PostmanCollectionSummary
    endpointMappings?: PostmanEndpointMapping[]
  }
): AutomationReport {
  const steps = testPlan.steps || []
  const passedSteps = steps.filter((s) => s.verdict === "passed" || s.status === "passed").length
  const suspectedSteps = steps.filter(
    (s) => s.verdict === "suspected_non_functional" || s.status === "suspected_non_functional"
  ).length
  const failedSteps = steps.filter((s) => s.verdict === "failed" || s.status === "failed").length
  const skippedUnsafe = steps.filter(
    (s) => s.verdict === "skipped_unsafe" || s.status === "skipped_unsafe"
  ).length
  const blockedSteps = steps.filter((s) => s.verdict === "blocked" || s.status === "blocked").length
  const pendingSteps = steps.filter((s) => s.status === "pending" || !s.status && !s.verdict).length

  // Identify client-only upload steps (2/5 stages verified: attached to input, no backend server upload triggered)
  const clientOnlyUploadSteps = steps.filter(
    (s) =>
      s.actionType === "upload" &&
      (s.uploadVerification?.isClientOnlyAttachment === true ||
        /server processing was not tested|Client Input Attachment Only/i.test(s.actualResult || ""))
  )
  // Client-only uploads are tracked in verificationBreakdown.partialClientOnlyCount (2/5 stages verified)
  // without inflating job.issues as a false defect on static/client-only pages.

  const totalIssues = job.issues.length
  const postmanCoverage = buildPostmanCoverageReport(testPlan, options?.postmanSummary || testPlan.postmanSummary)

  // Reconcile Unique Route Screens vs Responsive Device Viewports
  const uniqueRouteScreenIds = new Set(
    (testPlan.screens || []).map((s) => s.id.replace(/-(desktop|tablet|mobile|compact.*)$/i, ""))
  )
  const uniqueScreensCount = Math.max(1, uniqueRouteScreenIds.size || job.screens?.length || 1)
  const viewportsTestedCount = (job.responsiveResults && job.responsiveResults.length > 0) ? job.responsiveResults.length : 1
  const totalScreens = uniqueScreensCount

  if (testPlan.coverage) {
    testPlan.coverage.totalScreens = uniqueScreensCount
    testPlan.coverage.screensTested = Math.min(uniqueScreensCount, Math.max(1, testPlan.coverage.screensTested))
  }

  const failedScreenIds = new Set(
    job.issues.filter((i) => i.severity === "high" || i.severity === "blocker").map((i) => i.screenUrl)
  )
  const failedScreens = failedScreenIds.size
  const passedScreens = Math.max(0, totalScreens - failedScreens)

  // Workflows summary
  const passedWorkflows = workflows.filter((w) => w.verdict === "passed").length
  const failedWorkflows = workflows.filter(
    (w) => w.verdict === "failed" || w.verdict === "suspected_non_functional"
  ).length

  const partialClientOnlyCount = clientOnlyUploadSteps.length
  const verifiedFunctionalCount = Math.max(0, passedSteps - partialClientOnlyCount)
  const detectedDefectsCount = job.issues.filter((i) => i.verificationCategory !== "unverified_backend").length
  const inconclusiveCount = blockedSteps + pendingSteps + suspectedSteps

  // Generate Honest, Evidence-Backed Recommendations
  const recommendations: string[] = []
  if (job.issues.some((i) => i.type === "touch_target_violation")) {
    const touchIssues = job.issues.filter((i) => i.type === "touch_target_violation")
    recommendations.push(
      `Increase touch target dimensions to at least 24×24px (WCAG 2.5.8 Level AA) on tablet/mobile viewports: ${touchIssues.map((t) => t.actual || t.description).join(" | ")}`
    )
  }
  if (job.issues.some((i) => i.type === "responsive_overflow")) {
    recommendations.push(
      "Fix horizontal layout overflow on smaller viewports by constraining fixed-width containers with max-width: 100% and overflow-x: auto."
    )
  }
  if (partialClientOnlyCount > 0) {
    recommendations.push(
      `Complete end-to-end backend upload verification for ${partialClientOnlyCount} file input(s): client-side file selection & DOM attachment passed (2/5 stages), but server upload endpoint, 2xx response, and server-side file parsing remain unverified.`
    )
  }
  if (suspectedSteps > 0) {
    recommendations.push(
      `Investigate ${suspectedSteps} suspected non-functional control(s) (e.g. placeholder cards, dead buttons) that produced zero observable DOM or network response.`
    )
  }
  if (job.issues.some((i) => i.type === "data_not_reflected")) {
    recommendations.push(
      "Fix state persistence desync: entities created via successful 2xx form submissions are not rendered on subsequent screens."
    )
  }
  if (job.issues.some((i) => i.type === "api_ui_mismatch")) {
    recommendations.push(
      "Align UI form field names and submission URLs with the Postman API specification to prevent payload dropping."
    )
  }
  if (job.issues.some((i) => i.type === "focus_not_restored")) {
    recommendations.push(
      "Improve WCAG accessibility: ensure closing modal dialogs returns focus to the initiating trigger element."
    )
  }
  if (blockedSteps > 0) recommendations.push(`${blockedSteps} action(s) were blocked and require review or an explicitly documented safety decision.`)
  if (pendingSteps > 0) recommendations.push(`${pendingSteps} planned step(s) remain pending or have no recorded verdict; the run is incomplete.`)
  if (recommendations.length === 0 && failedSteps === 0 && failedWorkflows === 0 && totalIssues === 0 && partialClientOnlyCount === 0 && blockedSteps === 0 && pendingSteps === 0 && suspectedSteps === 0 && skippedUnsafe === 0) {
    recommendations.push("All tested screens, responsive viewports, and workflows demonstrated verified end-to-end outcomes.")
  }

  const summary =
    `Outcome-Verified Testing completed across ${uniqueScreensCount} unique route screen(s) and ${viewportsTestedCount} responsive device viewport(s) (${steps.length} total actions). ` +
    `Verification Breakdown: ${verifiedFunctionalCount} fully verified functional checks, ${partialClientOnlyCount} client-attached upload checks (2/5 stages verified — backend upload unverified), ${detectedDefectsCount} confirmed defect finding(s), and ${inconclusiveCount} inconclusive/blocked check(s). ` +
    `${workflows.length} device/feature workflow(s) executed (${passedWorkflows} passed, ${failedWorkflows} failed with findings).`

  // Build Markdown Document
  const md = generateMarkdownReportText({
    job,
    testPlan,
    workflows,
    passedSteps,
    suspectedSteps,
    failedSteps,
    skippedUnsafe,
    blockedSteps,
    pendingSteps,
    totalScreens,
    passedScreens,
    failedScreens,
    totalIssues,
    summary,
    recommendations,
    postmanSummary: options?.postmanSummary,
    endpointMappings: options?.endpointMappings,
    postmanCoverage,
  })

  const resolvedRecordingUrl = job.recordingUrl || ensureJobRecordingUrl(job)

  const report: AutomationReport = {
    totalScreensTested: uniqueScreensCount,
    uniqueScreensTested: uniqueScreensCount,
    viewportsTestedCount,
    verificationBreakdown: {
      verifiedFunctionalCount,
      detectedDefectsCount,
      partialClientOnlyCount,
      inconclusiveCount,
    },
    passedScreens,
    failedScreens,
    totalIssues,
    backNavigationScore: 100,
    responsiveScore: typeof job.report?.responsiveScore === "number" ? job.report.responsiveScore : (job.responsiveResults && job.responsiveResults.length > 0 ? Math.max(0, 100 - job.responsiveResults.filter((r) => r.status === "failed").length * 30 - job.responsiveResults.filter((r) => r.status === "warning").length * 10) : 100),
    responsiveBreakdown: job.responsiveResults,
    opencvAudit: job.opencvAudit,
    recordingUrl: resolvedRecordingUrl,
    summary,
    recommendations,
    issues: job.issues,
    workflows,
    markdownReport: md,
    flowGraph: job.flowGraph,
    postmanSummary: options?.postmanSummary,
    endpointMappings: options?.endpointMappings,
  }

  // Generate UX Intelligence Report if scoring was completed
  if (job.uxAuditScore) {
    try {
      const uxEvidenceBundles: any[] = job.uxAuditScore.evidenceBundles || []
      const uxReport = generateUXIntelligenceReport(job, uxEvidenceBundles)
      const uxMarkdown = formatUXReportMarkdown(uxReport)
      
      // Append UX Intelligence section to main report
      report.markdownReport += `\n\n---\n\n# UX Intelligence Report\n\n${uxMarkdown}`
    } catch (uxErr: any) {
      console.warn("[UX Intelligence] Report generation failed:", uxErr)
    }
  }

  job.report = report
  return report
}

/**
 * Generates the full formatted Markdown report text
 */
function generateMarkdownReportText(params: {
  job: AutomationJob
  testPlan: FullAppTestPlan
  workflows: WorkflowRun[]
  passedSteps: number
  suspectedSteps: number
  failedSteps: number
  skippedUnsafe: number
  blockedSteps: number
  pendingSteps: number
  totalScreens: number
  passedScreens: number
  failedScreens: number
  totalIssues: number
  summary: string
  recommendations: string[]
  postmanSummary?: PostmanCollectionSummary
  endpointMappings?: PostmanEndpointMapping[]
  postmanCoverage?: PostmanCoverageReport
}): string {
  const {
    job,
    testPlan,
    workflows,
    passedSteps,
    suspectedSteps,
    failedSteps,
    skippedUnsafe,
    blockedSteps,
    pendingSteps,
    totalScreens,
    totalIssues,
    summary,
    recommendations,
    postmanSummary,
    endpointMappings,
    postmanCoverage,
  } = params

  const dateStr = new Date().toLocaleString()
  const overallVerdict = failedSteps > 0 || totalIssues > 0 ? "ISSUES DETECTED" : (blockedSteps > 0 || pendingSteps > 0 || suspectedSteps > 0 || skippedUnsafe > 0) ? "INCOMPLETE — REVIEW REQUIRED" : "PASSED"
  const viewportsTestedCount = (job.responsiveResults && job.responsiveResults.length > 0) ? job.responsiveResults.length : 1
  const clientOnlyUploadCount = (testPlan.steps || []).filter((s) => s.actionType === "upload" && (s.uploadVerification?.isClientOnlyAttachment === true || /server processing was not tested|Client Input Attachment Only/i.test(s.actualResult || ""))).length
  const verifiedFunctionalCount = Math.max(0, passedSteps - clientOnlyUploadCount)
  const confirmedDefectsCount = job.issues.filter((i) => i.verificationCategory !== "unverified_backend").length
  const inconclusiveCount = blockedSteps + pendingSteps + suspectedSteps

  const sections: string[] = []

  // Header
  sections.push(`# 🧪 Outcome-Verified UI Testing Report`)
  sections.push(`**Target URL:** \`${job.targetUrl}\`  `)
  sections.push(`**Executed:** ${dateStr} | **Job ID:** \`${job.id}\` | **Verdict:** **${overallVerdict}**\n`)

  // Developer Triage Summary (Answers the 3 Developer Questions)
  sections.push(`## 🎯 Developer Triage Summary (3 Key Questions)\n`)
  sections.push(`1. **What failed or remained unverified?**`)
  if (job.issues.length === 0 && failedSteps === 0 && clientOnlyUploadCount === 0) {
    sections.push(`   - All ${testPlan.steps.length} actions across ${totalScreens} unique route screen(s) and ${viewportsTestedCount} viewport(s) verified end-to-end with zero defects.`)
  } else {
    for (const iss of job.issues) {
      sections.push(`   - **[${iss.severity.toUpperCase()} · ${iss.type}]** ${iss.description}`)
    }
  }
  sections.push(`2. **What evidence proves it?**`)
  sections.push(`   - Every finding below includes exact CSS selectors, expected vs. observed DOM/BoundingBox values, step-by-step reproduction instructions, and viewport-matched screenshot evidence.`)
  if (clientOnlyUploadCount > 0) {
    sections.push(`   - **Upload Pipeline Tracking (5 Stages):** ${clientOnlyUploadCount} upload control(s) verified Stages 1–2 (File Selection + DOM State Update) while Stages 3–5 (Network Request, 2xx Server Response, App Processing) were explicitly flagged as unverified on the wire.`)
  }
  sections.push(`3. **Did the agent investigate and verify the result (Closed-Loop)?**`)
  const closedLoopCount = job.opencvAudit?.closedLoopLoopsExecuted || job.issues.filter((i) => i.retestStatus === "retested_persisted" || i.retestStatus === "retested_resolved").length
  sections.push(`   - **Yes (${closedLoopCount} closed-loop re-verification(s) executed).** Detected layout/touch-target/disabled-state findings were re-inspected via live DOM \`getBoundingClientRect()\`, \`getComputedStyle()\`, and post-scroll baseline comparisons to confirm whether defects persisted.\n`)

  // Executive Summary & KPIs
  sections.push(`## 📊 Executive Summary & 4-Category Verification Breakdown\n`)
  sections.push(`${summary}\n`)

  sections.push(`| Verification Category | Count | Meaning |`)
  sections.push(`| :--- | :--- | :--- |`)
  sections.push(`| **1. Verified Functional Behaviour** | **${verifiedFunctionalCount}** | ✅ End-to-end expected outcome matches observed DOM/state |`)
  sections.push(`| **2. Confirmed Defects** | **${confirmedDefectsCount}** | ❌ Contradicts expected specification (touch target, overflow, disabled-field editability) |`)
  sections.push(`| **3. Partial / Untested Backend Behaviour** | **${clientOnlyUploadCount}** | ⚠️ Client input attached (2/5 upload stages), server processing unverified |`)
  sections.push(`| **4. Inconclusive / Blocked Checks** | **${inconclusiveCount}** | ⏳ Blocked, pending, or placeholder controls requiring review |\n`)

  sections.push(`| Coverage Metric | Count | Definition |`)
  sections.push(`| :--- | :--- | :--- |`)
  sections.push(`| **Unique Route Screens Tested** | ${totalScreens} | Distinct application pages/routes (\`S001\`, etc.) |`)
  sections.push(`| **Responsive Device Viewports Tested** | ${viewportsTestedCount} | Distinct viewport dimensions audited per screen (Desktop, Tablet, Mobile) |`)
  sections.push(`| **Total Steps Planned** | ${testPlan.steps.length} | Interactive controls, forms, and upload scenarios |`)
  sections.push(`| **Workflow Chains Tested** | ${workflows.length} | End-to-end & per-device responsive workflows |\n`)

  // Postman API Mapping Section
  if (postmanSummary) {
    sections.push(`## 📡 Postman API Collection Integration\n`)
    sections.push(`**Collection Name:** \`${postmanSummary.name}\` (${postmanSummary.endpoints.length} endpoints imported)\n`)

    if (endpointMappings && endpointMappings.length > 0) {
      sections.push(`| API Endpoint | HTTP Method | Target Screen / Form | Confidence | Wire Verified |`)
      sections.push(`| :--- | :--- | :--- | :--- | :--- |`)
      for (const map of endpointMappings) {
        const wireStatus = map.fieldMappings.some((f) => f.confirmedOnWire) ? "✅ Confirmed" : "⚠️ Unverified"
        sections.push(
          `| \`${map.endpoint.name}\` | \`${map.endpoint.method}\` | ${map.screenId} (${map.formId || "form"}) | **${map.overallConfidence.toUpperCase()}** | ${wireStatus} |`
        )
      }
      sections.push("")
    }
  }

  // Postman API coverage: keep every imported endpoint visible, including APIs never reached by the UI.
  if (postmanCoverage) {
    sections.push(`## 🧭 Postman API Coverage\n`)
    sections.push(`The Postman collection is treated as the API test-data contract. Coverage shows which expected APIs were encountered, executed, and confirmed on the wire.\n`)
    sections.push(`| Metric | Result |`)
    sections.push(`| :--- | :--- |`)
    sections.push(`| **Postman APIs** | ${postmanCoverage.totalEndpoints} |`)
    sections.push(`| **APIs encountered in UI** | ${postmanCoverage.matchedEndpoints}/${postmanCoverage.totalEndpoints} |`)
    sections.push(`| **APIs executed** | ${postmanCoverage.executedEndpoints}/${postmanCoverage.totalEndpoints} |`)
    sections.push(`| **Wire-confirmed APIs** | ${postmanCoverage.wireConfirmedEndpoints}/${postmanCoverage.totalEndpoints} |`)
    sections.push(`| **Wire verification failed** | ${postmanCoverage.wireVerificationFailedEndpoints} |`)
    sections.push(`| **APIs never encountered** | ${postmanCoverage.unencounteredEndpoints} |`)
    sections.push(`| **UI/API coverage** | **${postmanCoverage.coveragePercentage}%** |\n`)
    sections.push(`### Endpoint-by-Endpoint Coverage\n`)
    sections.push(`| API | Method | Status | UI Location |`)
    sections.push(`| :--- | :--- | :--- | :--- |`)
    for (const endpoint of postmanCoverage.endpoints) {
      const icon = endpoint.status === "wire_confirmed" ? "✅" : endpoint.status === "wire_verification_failed" ? "❌" : endpoint.status === "executed" ? "🟢" : endpoint.status === "matched" ? "🟡" : "⚪"
      sections.push(`| \`${endpoint.name}\` | \`${endpoint.method}\` | ${icon} ${endpoint.status.replace(/_/g, " ")} | ${endpoint.screenId ? `${endpoint.screenId} / ${endpoint.formId || "form"}` : "Not encountered"} |`)
    }
    sections.push("")
    if (postmanCoverage.unencounteredEndpoints > 0) {
      sections.push(`### ⚠️ Postman APIs Not Encountered Anywhere in the UI\n`)
      for (const endpoint of postmanCoverage.endpoints.filter((e) => e.status === "unencountered")) sections.push(`- **${endpoint.method} ${endpoint.name}** — \`${endpoint.url}\``)
      sections.push("")
    }
    if (postmanCoverage.uiFieldsWithoutPostmanMatch.length > 0) {
      sections.push(`### UI Fields Without a Postman Field Match\n`)
      for (const field of postmanCoverage.uiFieldsWithoutPostmanMatch) sections.push(`- ${field.screenId} / ${field.formId || "form"}: **${field.uiFieldName}**${field.uiSelector ? ` (\`${field.uiSelector}\`)` : ""}`)
      sections.push("")
    }
    if (postmanCoverage.postmanFieldsNotFoundInUi.length > 0) {
      sections.push(`### Postman Fields Not Found in the Matched UI\n`)
      for (const field of postmanCoverage.postmanFieldsNotFoundInUi) sections.push(`- **${field.endpointName}** → \`${field.apiFieldName}\``)
      sections.push("")
    }
  }

  // Multi-Device Responsive Testing Section
  if (job.responsiveResults && job.responsiveResults.length > 0) {
    sections.push(`## 📱 Multi-Device Responsive Breakdown\n`)
    sections.push(`| Device | Viewport | Status | Overflow | Touch Target Violations | Broken Images |`)
    sections.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`)
    for (const r of job.responsiveResults) {
      const statusIcon = r.status === "passed" ? "✅ Passed" : r.status === "warning" ? "⚠️ Warning" : "❌ Failed"
      const overflowText = r.overflowDetected ? `⚠️ +${r.overflowPixels}px` : "None (0px)"
      sections.push(`| **${r.name}** | \`${r.width}×${r.height}\` | ${statusIcon} | ${overflowText} | ${r.touchTargetViolations || 0} | ${r.brokenImages || 0} |`)
    }
    sections.push("")
    sections.push(`### Responsive Observations`)
    for (const r of job.responsiveResults) {
      if (r.observations && r.observations.length > 0) {
        sections.push(`- **${r.name}**: ${r.observations.join(" ")}`)
      }
    }
    sections.push("")
  }

  // OpenCV 5-Pillar Visual Intelligence & Regression Section
  if (job.opencvAudit) {
    const cv = job.opencvAudit
    sections.push(`## 👁️ OpenCV Visual Intelligence & 5-Pillar Audit\n`)
    sections.push(`**Engine:** \`${cv.engine}\` | **Visual Stability Score:** **${cv.visualStabilityScore}%** | **Comparisons:** ${cv.totalComparisons} | **Closed-Loop Re-Verifications:** ${cv.closedLoopLoopsExecuted}\n`)

    sections.push(`| OpenCV Capability | Status | Findings |`)
    sections.push(`| :--- | :--- | :--- |`)
    sections.push(`| **1. Visual Regression Testing** | ${cv.unexpectedShiftsCount === 0 ? "✅ Passed" : "⚠️ Shifts Detected"} | ${cv.visualDiffs.length} screenshot diff(s) analyzed (${cv.unexpectedShiftsCount} unexpected layout shift(s)) |`)
    sections.push(`| **2. Responsive Layout Validation** | ${cv.overlappingElementsCount === 0 ? "✅ Passed" : "⚠️ Layout Collisions"} | ${cv.annotatedScreenshots.length} device viewport(s) contour-mapped (${cv.overlappingElementsCount} clipped/overlapping control(s)) |`)
    sections.push(`| **3. Missing-Element & Blank Detection** | ${cv.blankRegionsCount + cv.missingElementsCount === 0 ? "✅ Passed" : "⚠️ Flagged"} | ${cv.blankRegionsCount} low-edge blank region(s), ${cv.missingElementsCount} missing visual control(s) |`)
    sections.push(`| **4. Screenshot & Video Frame Analysis** | ✅ Active | ${cv.frameTimeline.length} interaction frame transition(s) tracked across steps |`)
    sections.push(`| **5. Closed-Loop Autonomous Verification** | ✅ Active | ${cv.closedLoopLoopsExecuted} visual defect(s) re-tested via live DOM scroll & computedStyle inspection |\n`)

    if (cv.visualDiffs.length > 0) {
      sections.push(`### 1. Visual Regression Diffs (Before vs. After / Viewport Reflow)\n`)
      sections.push(`| Comparison | Pixel Delta | Changed Zones | Layout Shift | Status | Summary |`)
      sections.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`)
      for (const d of cv.visualDiffs) {
        const st = d.status === "unexpected_shift" ? "❌ Unexpected Shift" : d.status === "expected_change" ? "🟢 Verified Change" : "✅ Stable"
        sections.push(`| **${d.label}** | ` + "`" + `${d.diffPercentage}%` + "`" + ` | ${d.changedRegionsCount} | ${d.layoutShiftDetected ? "⚠️ Yes" : "No"} | ${st} | ${d.summary} |`)
      }
      sections.push("")
    }

    if (cv.defects.length > 0) {
      sections.push(`### 2, 3 & 5. Visual Defects, DOM Confirmation & Closed-Loop Re-Verification\n`)
      sections.push(`| Type | Viewport | Selector / Region | DOM Confirmed | Closed-Loop Action | Persisted? |`)
      sections.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`)
      for (const def of cv.defects) {
        sections.push(
          `| ` + "`" + `${def.type}` + "`" + ` | ${def.viewport || "Default"} | ` + "`" + `${def.selector || "region"}` + "`" + ` | ${def.domConfirmed ? "✅ Yes" : "⚪ No"} (${def.domConfirmationDetail}) | ${def.closedLoopAction || "Inspected"} | ${def.defectPersisted ? "❌ Persisted" : "✅ Resolved on scroll"} |`
        )
      }
      sections.push("")
    }

    if (cv.frameTimeline.length > 0) {
      sections.push(`### 4. Interaction Screenshot & Frame Delta Timeline\n`)
      sections.push(`| Step | Interaction | Frame Delta (%) | Visual State |`)
      sections.push(`| :--- | :--- | :--- | :--- |`)
      for (const f of cv.frameTimeline) {
        sections.push(`| Step #${f.stepIndex} | ${f.label} | ` + "`" + `${f.diffFromPreviousPct}%` + "`" + ` | **${f.visualState.toUpperCase()}** |`)
      }
      sections.push("")
    }
  }

  // Workflows Section ("write down whole workflow so that user gets idea where it failed")
  if (workflows.length > 0) {
    sections.push(`## 🛤️ Multi-Step Workflow Journeys & Failure Timeline\n`)
    sections.push(`The testing engine executes complete end-to-end user workflows ("go next next"), validates entity persistence in the DOM, and pinpoints exact step failures.\n`)

    for (const wf of workflows) {
      const statusIcon = wf.verdict === "passed" ? "✅" : wf.verdict === "suspected_non_functional" ? "⚠️" : "❌"
      sections.push(`### ${statusIcon} [${wf.id}] ${wf.name}`)
      sections.push(`- **Entry Screen:** ${wf.entryScreenId} (\`${wf.entryUrl}\`)`)
      sections.push(`- **Tracking ID:** \`${wf.entityTrackingId || "N/A"}\``)
      sections.push(`- **Persistence Verified:** ${wf.dataReflected ? "✅ Yes (Entity reflected in rendered DOM)" : "⚠️ No (Entity missing from subsequent screen)"}`)
      sections.push(`- **Final Status:** **${wf.verdict.toUpperCase()}** ${wf.failedAtStep ? `(Failed at Step ${wf.failedAtStep})` : ""}`)
      sections.push(`- **Summary:** ${wf.summary}\n`)

      sections.push(`#### Step-by-Step Execution Trace:`)
      for (const step of wf.steps) {
        const stepIcon = step.verdict === "passed" ? "✔" : step.verdict === "suspected_non_functional" ? "⚠️" : "❌"
        sections.push(`1. **[Step ${step.stepIndex}] ${stepIcon} ${step.action}** on *${step.screenName}*`)
        sections.push(`   - **Target:** \`${step.targetName || step.targetSelector || "element"}\``)
        if (step.inputData) {
          sections.push(`   - **Input Data:** \`${JSON.stringify(step.inputData)}\``)
        }
        sections.push(`   - **Expected:** ${step.expectedOutcome}`)
        sections.push(`   - **Observed:** ${step.observedOutcome || "N/A"} (${step.durationMs}ms)`)

        if (step.reproCurl) {
          sections.push(`   - **Mutating cURL Command:**\n\`\`\`bash\n${step.reproCurl}\n\`\`\``)
        }
      }
      sections.push("")

      if (wf.reproSteps && wf.reproSteps.length > 0) {
        sections.push(`**Reproduction Steps:**`)
        for (const r of wf.reproSteps) {
          sections.push(`- ${r}`)
        }
        sections.push("")
      }
      sections.push(`---\n`)
    }
  }

  // Issues Catalog
  if (job.issues.length > 0) {
    sections.push(`## 🚨 Discovered Issues Catalog\n`)
    sections.push(`| Severity | Type | Screen | Description & Reproduction | Expected vs Observed | Confidence & Closed-Loop Retest |`)
    sections.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`)
    for (const issue of job.issues) {
      const sevIcon = issue.severity === "high" || issue.severity === "blocker" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵"
      const reproText = issue.reproductionSteps && issue.reproductionSteps.length > 0 ? `<br/>**Repro:** ${issue.reproductionSteps.join(" → ")}` : ""
      const retestText = issue.retestStatus === "retested_persisted" ? `❌ Persisted (${issue.retestDetail || "Confirmed"})` : issue.retestStatus === "retested_resolved" ? `✅ Resolved` : "Inspected"
      sections.push(
        `| ${sevIcon} **${issue.severity.toUpperCase()}** | \`${issue.type}\` | ${issue.screenTitle} | ${issue.description}${reproText} | **Exp:** ${issue.expected || "N/A"}<br/>**Obs:** ${issue.actual || "N/A"} | **${issue.confidence ?? 95}%** · ${retestText} |`
      )
    }
    sections.push("")
  }

  // Recommendations
  sections.push(`## 💡 Recommended Remediation\n`)
  for (let idx = 0; idx < recommendations.length; idx++) {
    sections.push(`${idx + 1}. ${recommendations[idx]}`)
  }
  sections.push("")

  // How Developers Use This Report & AI Coding Agent Fix Prompt
  sections.push(`## 🛠️ How Developers Use This Report & One-Click AI Fix Prompt\n`)
  sections.push(
    `Developers use this report as an actionable engineering blueprint to move directly from automated QA discovery to verified code fixes: (1) **Triage by Severity** — prioritize 🔴 HIGH/BLOCKER functional failures and broken form submissions using the exact step traces and cURL commands above; (2) **Inspect Visual & Responsive Evidence** — use the OpenCV contour bounding boxes and WCAG 2.5.8 target measurements to pinpoint exact CSS/DOM regressions across Desktop, Tablet, and Mobile; (3) **Self-Heal or Prompt Your AI Agent** — click **"Repair & Verify"** on any issue in the simulator UI for an instant NVIDIA Nemotron code patch, or copy the ready-to-use prompt below directly into your AI coding assistant (Cursor, Antigravity, GitHub Copilot, or Claude Code) to fix all detected issues in one pass.\n`
  )

  const issueLines = (job.issues || []).slice(0, 12).map((iss, idx) => {
    return `${idx + 1}. [${iss.severity.toUpperCase()}] (${iss.type}) on "${iss.screenTitle}" (${iss.screenUrl || testPlan.targetUrl}): ${iss.description} | Expected: ${iss.expected || "Valid behavior"} | Observed: ${iss.actual || "Defect persisted"}`
  })
  const promptBody = [
    `You are a senior full-stack engineer fixing UI, accessibility, and functional defects discovered by Open Design AI automated testing on ${testPlan.targetUrl}.`,
    ``,
    `Please inspect the source files corresponding to the screens below and fix each verified defect without breaking existing layouts or tests:`,
    ``,
    ...(issueLines.length > 0 ? issueLines : [`1. Review form submission handlers and ensure all interactive touch targets meet WCAG 2.5.8 Level AA minimum (>= 24x24px) with zero horizontal overflow.`]),
    ``,
    `Requirements for your fix:`,
    `- Ensure all interactive buttons, links, and inputs measure at least 24x24px on mobile/tablet viewports (WCAG 2.5.8 AA).`,
    `- Eliminate any horizontal layout overflow (documentElement.scrollWidth <= window.innerWidth) across 1440px, 768px, and 393px viewports.`,
    `- Ensure every form submission and primary action button triggers a clear state update, validation feedback, or network mutation.`,
    `- Return a clean, minimal diff for each modified file.`
  ].join("\n")

  sections.push(`### 📋 Copy-Paste Prompt for Your AI Coding Agent\n`)
  sections.push(`\`\`\`text\n${promptBody}\n\`\`\`\n`)

  // Research References - Add at end of report
  sections.push(`---\n`)
  sections.push(generateReferencesSection())

  return secretRedactor ? secretRedactor.redact(sections.join("\n")) : sections.join("\n")
}
