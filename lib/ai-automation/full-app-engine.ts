import { uploadControl } from "./upload-interaction"
import { setSelection, ControlBlocked } from "./control-interactions"
import fs from "fs"
import path from "path"
import os from "os"
import puppeteer, { type Browser, type Page, type ElementHandle } from "puppeteer"
import { safePuppeteerLaunch } from "../browser/secure-browser"
import {
  AutomationJob,
  AutomationIssue,
  DiscoveredScreen,
  ActionableElement,
  ActionableElementType,
  AppScreenNode,
  AppWorkflowTransition,
  TestPlanStep,
  FullAppTestPlan,
  StartAutomationRequest,
  FlowGraph,
  StepEvidence,
  AutomationVerdict,
  ActionLedgerEntry,
  AgentAction,
} from "./types"
import { saveJob, getJob, appendLog, emitSessionEvent } from "./job-store"
import { discoverLocalProjectRoutes, matchRouteForPath } from "./discover-routes"
import { getJobSecrets } from "./job-secret-vault"
import { assertSafeTargetUrlWithDevBypass } from "../security/url-guard"
import { isLayaAvailable, layaPredict, classifyPage, DEFAULT_LAYA_URL } from "@/lib/journey/laya-client"

import {
  SYNTHETIC_TEST_DATA,
  normalizePath,
  normalizeUrlForRestore,
  isSameOriginUrl,
  deriveScreenName,
  buildFigmaWorkflowMap,
  synthesizeFullAppPlanFromJob,
  isFullAppCommand,
} from "./full-app-utils"
export { isSameOriginUrl } from "./full-app-utils"
import { collectScreenEvidence, collectWorkflowEvidence, type ScreenEvidenceBundle } from "./ux-evidence-collector"
import { applyAllScoringChecks } from "./ux-scoring-checks"
import { calculateOverallUXScore } from "./ux-scoring-rubric"
import { classifyAction, isProductionLike, installNetworkGuard } from "./safety-guard"
import {
  expectFor,
  captureState,
  settle,
  classifyEffect,
  runWithLadder,
  verifyModalCloseAndFocus,
  detectEmptyDataSurfaces,
  detectBrokenDomAssets,
  NetworkRecorder,
  ConsoleRecorder,
} from "./outcome-verifier"
import {
  parsePostmanCollection,
  matchEndpointToForm,
  buildFormPayloadFromPostman,
  confirmMappingOnWire,
} from "./postman-importer"
import {
  PostmanCollectionSummary,
  PostmanEndpointMapping,
  WorkflowRun,
  TestPaymentCredentials,
} from "./types"
import { executeChainedWorkflows } from "./workflow-chainer"
import { buildAutomationReport } from "./evidence-reporter"
import { humanClick, humanType, humanMouseMove } from "./human-actions"
import {
  installVisualOverlay,
  animateCursorTo,
  animateCursorToSelector,
  triggerClickAnimation,
  highlightInputTyping,
  showActionBanner,
  SessionVideoRecorder,
} from "./visual-recorder"
import {
  createDummyFileBuffer,
  resolveUploadFolder,
  scanUploadFolder,
  pickUploadFile,
  UploadFolderInventory,
} from "./test-file-manager"

export {
  createDummyFileBuffer,
  resolveUploadFolder,
  scanUploadFolder,
  pickUploadFile,
  type UploadFolderInventory,
} from "./test-file-manager"

import {
  detectVerificationScreen,
  waitForExternalVerification,
  detectSettingsCredentialsRequirement,
  promptAndFillSecureSettings,
  maskPageSecretsBeforeScreenshot,
  secretRedactor,
} from "./secure-credentials-manager"

export {
  detectVerificationScreen,
  waitForExternalVerification,
  detectSettingsCredentialsRequirement,
  promptAndFillSecureSettings,
  maskPageSecretsBeforeScreenshot,
  secretRedactor,
} from "./secure-credentials-manager"

import {
  type LoginCreds,
  takeSecureScreenshot,
  publishLiveAction,
  publishLiveFrame,
  waitForSpaPageReady,
  hasLoginWall,
  attemptLogin,
  authenticateIfNeeded,
  collectLinks,
  collectLinksWithExpansion,
  discoverAndMapApp,
  completeJourneyReturnAndLogout,
} from "./full-app-discovery"

export {
  type LoginCreds,
  takeSecureScreenshot,
  publishLiveAction,
  publishLiveFrame,
  waitForSpaPageReady,
  hasLoginWall,
  attemptLogin,
  authenticateIfNeeded,
  collectLinks,
  collectLinksWithExpansion,
  discoverAndMapApp,
  completeJourneyReturnAndLogout,
} from "./full-app-discovery"

/** Find the visible field represented by a planned selector, with a semantic fallback. */
async function findVisibleInput(
  page: Page,
  selector: string | undefined,
  name: string,
): Promise<import("puppeteer").ElementHandle<Element> | null> {
  if (selector) {
    try {
      const matches = await page.$$(selector)
      for (const match of matches) {
        if (await match…24156 tokens truncated…"navigation",
        })
        step.screenId = newScreenId
        step.screenName = currentScreenName
        step.url = currentUrl
        step.componentLocation = compLoc
        appendLog(job, "success", `🌟 [ACTION SCREEN] Created screen ${newScreenId}: "${currentScreenName}" with verified return path to ${originScreenId}.`)
      } else if (step.screenshotUrl && !currentScreen.screenshotUrl) {
        currentScreen.screenshotUrl = step.screenshotUrl
      }

      const resolvedScreen = currentScreen as AppScreenNode

      // Merge inventory into the existing screen instead of replacing it.
      // Stable keys preserve history and allow the queue to distinguish new actions.
      const knownElementKeys = new Set(
        resolvedScreen.actionableElements.map((element) => {
          const key = stableActionKeyForScreen(resolvedScreen, element)
          element.actionKey = key
          return key
        })
      )
      for (const element of newInv.actionableElements) {
        const key = stableActionKeyForScreen(resolvedScreen, element)
        element.actionKey = key
        if (!knownElementKeys.has(key)) {
          resolvedScreen.actionableElements.push(element)
          knownElementKeys.add(key)
        }
      }

      const knownFormKeys = new Set(
        resolvedScreen.forms.map((form) => [form.id, form.selector || "", form.name || ""].join("|").toLowerCase())
      )
      for (const form of newInv.forms) {
        const key = [form.id, form.selector || "", form.name || ""].join("|").toLowerCase()
        if (!knownFormKeys.has(key)) {
          resolvedScreen.forms.push(form)
          knownFormKeys.add(key)
        }
      }

      resolvedScreen.url = currentUrl
      if (step.screenshotUrl) resolvedScreen.screenshotUrl = step.screenshotUrl

      // Record / update transition for this click so the workflow map reflects actual navigation
      if (step.actionType === "click" || step.actionType === "toggle") {
        const destScreenId = resolvedScreen.id || step.screenId
        const existingTrans = testPlan.transitions.find(
          (t) => t.fromScreenId === step.screenId && t.action === step.targetName
        )
        if (existingTrans) {
          existingTrans.toScreenId = destScreenId
        } else {
          testPlan.transitions.push({
            id: `tr-${testPlan.transitions.length + 1}`,
            fromScreenId: step.screenId,
            toScreenId: destScreenId,
            action: step.targetName,
            actionType: step.actionType === "click" ? "click" : "toggle",
            triggerSelector: step.targetSelector,
          })
        }
      }

      mergeScreenActionsIntoLedger(job, resolvedScreen)
      linkTestPlanStepsToLedger(job, testPlan)
      const queuedNow = queueUnplannedLedgerActions(job, testPlan, resolvedScreen.id, i)
      const prioritizedNow = prioritizePendingStepsForScreen(testPlan, resolvedScreen.id, i)
      job.currentUrl = currentUrl
      job.flowGraph = buildFigmaWorkflowMap(testPlan)
      job.fullAppTestPlan = testPlan
      if (createdNewScreen) {
        emitSessionEvent(job, "screen_discovered", {
          url: currentUrl,
          message: `Discovered ${hasActiveModal ? "modal/view" : "screen"} ${resolvedScreen.name} while testing.`,
          payload: { screenId: resolvedScreen.id, path: resolvedScreen.path, actionableCount: resolvedScreen.actionableElements.length },
        })
      }
      emitSessionEvent(job, "test_result", {
        url: currentUrl,
        message: `Step ${step.id}: ${step.status} — ${step.targetName}`,
        payload: {
          stepId: step.id,
          screenId: resolvedScreen.id,
          status: step.status,
          verdict: step.verdict,
          hasScreenshot: Boolean(step.screenshotUrl),
        },
      })
      if (step.screenshotUrl) {
        emitSessionEvent(job, "evidence", {
          url: currentUrl,
          message: `Screenshot evidence captured for ${step.id}.`,
          payload: { stepId: step.id, screenId: resolvedScreen.id, capturedAt: step.evidenceTimestamp },
        })
      }
      if (queuedNow > 0 || prioritizedNow > 0) {
        appendLog(
          job,
          "info",
          `[COVERAGE] "${resolvedScreen.name}" has ${resolvedScreen.actionableElements.length} known controls; ${queuedNow} new action(s) queued and ${prioritizedNow} pending step(s) prioritized for this screen.`
        )
      }
      saveJob(job)

      // 6. Update Coverage
      testPlan.coverage = {
        screensTested: testedScreensSet.size,
        totalScreens: testPlan.screens.length,
        actionsTested: passedCount + failedCount + blockedCount + suspectedCount + skippedUnsafeCount,
        totalActions: testPlan.steps.length,
        formsTested: testPlan.screens.filter((s) => testedScreensSet.has(s.id)).reduce((acc, s) => acc + (s.forms?.length || 0), 0),
        totalForms: testPlan.screens.reduce((acc, s) => acc + (s.forms?.length || 0), 0),
        percentage: Math.round(((passedCount + failedCount + blockedCount + suspectedCount + skippedUnsafeCount) / testPlan.steps.length) * 100),
      }

      saveJob(job)
    } catch (stepErr: any) {
      step.status = stepErr instanceof ControlBlocked ? "blocked" : "failed"
      step.verdict = step.status
      if (step.status === "blocked") blockedCount++; else failedCount++
      step.error = secretRedactor.redact(stepErr?.message || "Execution exception")
      updateActionLedgerForStep(job, step, step.status === "blocked" ? "blocked" : "failed", step.error, step.error)
      appendLog(job, "warn", `Step ${i + 1} exception: ${secretRedactor.redact(stepErr?.message || "Execution exception")}`)
    } finally {
      netRecorder.cleanup()
      consoleRecorder.cleanup()
    }
  }

  // A run is not complete while any discovered action remains untested or running.
  // This prevents the report from claiming full coverage after a queueing gap.
  const unresolvedLedgerEntries = (job.actionLedger?.entries || []).filter(
    (entry) => entry.status === "untested" || entry.status === "running"
  )
  const unresolvedSteps = testPlan.steps.filter(
    (queued) => queued.status === "pending" || queued.status === "running"
  )
  if (unresolvedLedgerEntries.length > 0 || unresolvedSteps.length > 0) {
    const detail = `${unresolvedLedgerEntries.length} ledger action(s) and ${unresolvedSteps.length} plan step(s) remain unverified.`
    appendLog(job, "error", `[COVERAGE INCOMPLETE] ${detail} The run will not be marked complete.`)
    testPlan.status = "error"
    job.testingPhase = "executing"
    job.status = "failed"
    job.progress = Math.min(job.progress, 99)
    job.currentStep = detail
    saveJob(job)
    return
  }

  // PHASE 4: Chained Multi-Step Workflows ("go next next" & state persistence)
  if (!options?.skipWorkflows) {
    appendLog(job, "info", `Starting Phase 4: Chained Workflow Execution & State Persistence...`)
    try {
      testPlan.workflows = await executeChainedWorkflows(
        job,
        page,
        testPlan.screens,
        testPlan.transitions,
        testPlan.targetUrl,
        {
          postmanSummary: options?.postmanSummary || testPlan.postmanSummary,
          allowActions: options?.allowActions,
          noiseHosts: options?.noiseHosts,
          allowTestPayments: isPaymentPermitted,
          paymentCredentials: options?.paymentCredentials,
        }
      )
    } catch (wfErr: any) {
      appendLog(job, "warn", `Workflow chaining encountered error: ${wfErr?.message}`)
    }
  }

  // PHASE 4.5: Return to Main Page & Complete Authenticated Logout Journey
  try {
    const journeyEnd = await completeJourneyReturnAndLogout(
      job,
      page,
      testPlan.targetUrl,
      testPlan.screens,
      testPlan.transitions,
      credentials
    )
    if (journeyEnd.loggedOut) {
      const mainScreen = testPlan.screens.find((s) => s.id === journeyEnd.mainScreenId) || testPlan.screens[0]
      const logoutStep: TestPlanStep = {
        id: `STEP-${String(testPlan.steps.length + 1).padStart(3, "0")}`,
        stepIndex: testPlan.steps.length + 1,
        screenId: mainScreen?.id || "S001",
        screenName: mainScreen?.name || "Main Page",
        url: journeyEnd.finalUrl,
        actionType: "click",
        targetName: journeyEnd.logoutLabel || "Log Out",
        expectedResult: "Return to main page and log out to complete the authenticated application journey.",
        actualResult: `Returned to main page and clicked "${journeyEnd.logoutLabel || "Log Out"}" -> navigated to ${secretRedactor.redact(journeyEnd.finalUrl)}.`,
        status: "passed",
        verdict: "passed",
        screenshotUrl: journeyEnd.screenshotUrl,
        evidenceTimestamp: new Date().toISOString(),
      }
      testPlan.steps.push(logoutStep)
      passedCount++
    }
    job.flowGraph = buildFigmaWorkflowMap(testPlan)
    job.fullAppTestPlan = testPlan
    saveJob(job)
  } catch (journeyErr: any) {
    appendLog(job, "warn", `Journey completion return/logout check encountered error: ${journeyErr?.message}`)
  }

  // PHASE 5: UX Intelligence Evidence Collection & Scoring
  appendLog(job, "info", `Collecting UX Intelligence evidence across ${testPlan.steps.length} steps...`)
  try {
    const uxEvidenceBundles: ScreenEvidenceBundle[] = []
    const processedScreens = new Set<string>()
    
    for (const step of testPlan.steps) {
      const screen = testPlan.screens.find((s) => s.id === step.screenId)
      
      if (screen && step.screenshotUrl && !processedScreens.has(screen.id)) {
        try {
          const screenSteps = testPlan.steps.filter((s) => s.screenId === screen.id)
          const workflowEvidence = collectWorkflowEvidence(
            screen.id,
            screen.name,
            screenSteps,
            screenSteps.every(s => s.status === "passed") // completedSuccessfully
          )
          
          const evidenceBundle = await collectScreenEvidence(
            page,
            screen,
            step.screenshotUrl,
            [workflowEvidence]
          )
          
          uxEvidenceBundles.push(evidenceBundle)
          processedScreens.add(screen.id)
        } catch (uxErr: any) {
          appendLog(job, "warn", `UX evidence collection failed for screen ${screen.id}: ${uxErr?.message}`)
        }
      }
    }

    if (uxEvidenceBundles.length > 0) {
      appendLog(job, "info", `Running UX scoring checks across ${uxEvidenceBundles.length} screens...`)
      const allScoringChecks = uxEvidenceBundles.flatMap((bundle) => applyAllScoringChecks(bundle))
      const uxScore = calculateOverallUXScore(allScoringChecks)
      
      // Store UX audit score with evidence bundles
      job.uxAuditScore = {
        overall: uxScore.overall,
        grade: uxScore.grade,
        confidence: uxScore.confidence,
        dimensions: uxScore.dimensions,
        totalChecksApplied: uxScore.totalChecksApplied,
        evidenceBundles: uxEvidenceBundles as any[]
      }
      
      const taskEffScore = uxScore.dimensions.find(d => d.dimension === 'taskEffectiveness')?.score || 0
      const workflowEffScore = uxScore.dimensions.find(d => d.dimension === 'workflowEfficiency')?.score || 0
      
      appendLog(job, "success", `✓ UX Intelligence Score: ${uxScore.overall.toFixed(1)}/100 (${uxScore.grade}) | Task Effectiveness: ${taskEffScore.toFixed(1)} | Workflow Efficiency: ${workflowEffScore.toFixed(1)}`)
      saveJob(job)
    }
  } catch (uxErr: any) {
    appendLog(job, "warn", `UX Intelligence scoring encountered error: ${uxErr?.message}`)
  }

  // PHASE 6: Comprehensive Evidence Reporting & Markdown Artifact
  appendLog(job, "info", `Generating Phase 6: Evidence-Based Failure Report & Markdown Artifact...`)
  try {
    buildAutomationReport(job, testPlan, testPlan.workflows || [], {
      postmanSummary: options?.postmanSummary || testPlan.postmanSummary,
    })
  } catch (repErr: any) {
    appendLog(job, "warn", `Evidence report generation encountered error: ${repErr?.message}`)
  }

  testPlan.status = "completed"
  job.testingPhase = "reporting"
  job.status = "completed"
  job.progress = 100
  job.currentStep = `Outcome-verified Full App Testing completed: ${passedCount} Passed, ${suspectedCount} Suspected Non-Functional, ${failedCount} Failed, ${skippedUnsafeCount} Skipped Unsafe.`
  saveJob(job)

  appendLog(
    job,
    "success",
    `✅ Outcome-Verified Testing Finished! ${passedCount} passed, ${suspectedCount} suspected non-functional, ${failedCount} failed, ${skippedUnsafeCount} skipped unsafe across ${testPlan.screens.length} mapped screens.`
  )
}

// Re-export pure client-safe utilities
export {
  buildFigmaWorkflowMap,
  synthesizeFullAppPlanFromJob,
  isFullAppCommand,
  normalizePath,
  deriveScreenName,
} from "./full-app-utils"


// Merge targeted rediscovery into the existing graph without throwing away verified
// screens. URL + screen name distinguishes meaningful UI states on the same route.
function mergeRediscoveredGraph(
  existingScreens: AppScreenNode[],
  existingTransitions: AppWorkflowTransition[],
  freshScreens: AppScreenNode[],
  freshTransitions: AppWorkflowTransition[],
): { screens: AppScreenNode[]; transitions: AppWorkflowTransition[] } {
  const screens = existingScreens.map((screen) => ({ ...screen }))
  const transitions = existingTransitions.map((transition) => ({ ...transition }))
  const identity = (screen: AppScreenNode) => {
    let route = screen.path || screen.url
    try {
      const parsed = new URL(screen.url)
      route = `${parsed.origin}${parsed.pathname.replace(/\/$/, "") || "/"}`
    } catch {
      route = route.split(/[?#]/)[0].replace(/\/$/, "") || "/"
    }
    return `${route.toLowerCase()}::${screen.name.trim().toLowerCase()}::${(screen.modalTriggerText || "").trim().toLowerCase()}`
  }
  const ids = new Map<string, string>()
  const known = new Map(screens.map((screen) => [identity(screen), screen]))
  let sequence = screens.reduce((max, screen) => Math.max(max, Number(screen.id.replace(/^S/i, "")) || 0), 0) + 1

  for (const fresh of freshScreens) {
    const key = identity(fresh)
    const prior = known.get(key)
    if (prior) {
      // Refresh evidence/inventory for a known state but preserve its stable ID.
      Object.assign(prior, fresh, { id: prior.id, isNewDiscovery: false })
      ids.set(fresh.id, prior.id)
      continue
    }
    const id = `S${String(sequence++).padStart(3, "0")}`
    const added = { ...fresh, id, isNewDiscovery: true }
    screens.push(added)
    known.set(key, added)
    ids.set(fresh.id, id)
  }

  const transitionKeys = new Set(transitions.map((t) => `${t.fromScreenId}::${t.toScreenId}::${t.action.toLowerCase()}`))
  for (const fresh of freshTransitions) {
    const fromScreenId = ids.get(fresh.fromScreenId) || fresh.fromScreenId
    const toScreenId = ids.get(fresh.toScreenId) || fresh.toScreenId
    if (!screens.some((screen) => screen.id === fromScreenId) || !screens.some((screen) => screen.id === toScreenId)) continue
    const key = `${fromScreenId}::${toScreenId}::${fresh.action.toLowerCase()}`
    if (transitionKeys.has(key)) continue
    transitions.push({ ...fresh, id: `tr-${transitions.length + 1}`, fromScreenId, toScreenId })
    transitionKeys.add(key)
  }
  return { screens, transitions }
}

function extractRediscoveryUrl(prompt: string, fallback: string, origin: string): string {
  const match = prompt.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return fallback
  try {
    const candidate = new URL(match[0].replace(/[),.;]+$/, ""))
    if (candidate.origin === origin) return candidate.toString()
  } catch {}
  return fallback
}

export async function executeFullAppTestingJob(
  job: AutomationJob,
  params: StartAutomationRequest
): Promise<void> {
  let browser: Browser | null = null
  let videoRecorder: SessionVideoRecorder | null = null
  let liveFrameTimer: ReturnType<typeof setInterval> | null = null

  try {
    secretRedactor.registerMultiple([
      params.credentials?.username,
      params.credentials?.password,
      params.credentials?.token,
      params.paymentCredentials?.cardNumber,
      params.paymentCredentials?.cardHolder,
      params.paymentCredentials?.expiryDate,
      params.paymentCredentials?.cvv,
      params.paymentCredentials?.zipCode,
    ])
    job.status = "running"
    job.testingPhase = "discovery"
    job.progress = 5
    job.currentStep = "Initiating Phase 1: Application Discovery & Mapping..."
    saveJob(job)

    appendLog(job, "info", `🚀 [FULL APP TESTING] Target: ${job.targetUrl}`)
    appendLog(job, "info", "Architecture: DISCOVER → MAP → CREATE TEST PLAN → EXECUTE → VERIFY → REPORT")

    browser = await safePuppeteerLaunch()

    const page = await browser.newPage()
    const primaryVp = params.viewports?.[0] || { width: 1440, height: 900 }
    const isMobileVp = primaryVp.width <= 768
    await page.setViewport({
      width: primaryVp.width,
      height: primaryVp.height,
      deviceScaleFactor: 1,
      isMobile: isMobileVp,
      hasTouch: isMobileVp,
    })

    // Live mirror: capture frames continuously so cursor moves / keystrokes are visible.
    // In-memory only (job object is shared with the store); the frame endpoint reads it.
    // ponytail: JPEG polling ~4fps; upgrade to CDP screencast if recorder stops using it.
    let frameBusy = false
    liveFrameTimer = setInterval(async () => {
      if (frameBusy || page.isClosed()) return
      frameBusy = true
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40, fullPage: false })
        job.currentScreenshotUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString("base64")}`
      } catch {} finally {
        frameBusy = false
      }
    }, 250)

    // Safety environment inspection
    const isProd = isProductionLike(job.targetUrl)
    const allowTestPayments = params.allowTestPayments ?? !isProd
    if (isProd) {
      appendLog(
        job,
        "warn",
        `⚠️ [SAFETY WARNING] Target URL "${job.targetUrl}" appears to be a production environment. Destructive/payment actions will be guarded.`
      )
    }

    // Install network guard for payment/email hosts
    await installNetworkGuard(page, {
      allowActions: params.allowActions,
      allowTestPayments,
      isProduction: isProd,
      onBlocked: (url, reason) => {
        appendLog(job, "warn", `[SAFETY GUARD] Aborted request to ${url} (${reason}).`)
      },
    })

    // Start session video recorder (with visible mouse cursor, ripples & interaction highlights)
    if (params.recordVideo !== false) {
      videoRecorder = new SessionVideoRecorder(page, job.projectId, job.id)
      await videoRecorder.start(job)
      job.recordingControl = "recording"
      emitSessionEvent(job, "recording", { message: "Continuous session recording started.", payload: { state: "recording" } })
      appendLog(job, "info", "🎥 Session journey recording active with visible cursor & interaction overlay.")
    } else {
      await installVisualOverlay(page)
    }

    // Track console JS errors
    page.on("pageerror", (err: any) => {
      const errMsg = err?.message || String(err)
      const issue: AutomationIssue = {
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        screenUrl: page.url(),
        screenTitle: "Console Error",
        type: "js_error",
        severity: "medium",
        description: `Uncaught JavaScript Exception: ${errMsg}`,
        timestamp: new Date().toISOString(),
      }
      job.issues.push(issue)
      appendLog(job, "warn", `JavaScript error on ${page.url()}: ${errMsg}`)
      saveJob(job)
    })

    // PHASE 1: Systematic Discovery & Mapping
    await page.goto(job.targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null)
    await waitForSpaPageReady(page, 4500)
    if (page.url().startsWith("http://") || page.url().startsWith("https://")) {
      job.currentUrl = page.url()
      try {
        const preview = await page.screenshot({ type: "jpeg", quality: 45, fullPage: false })
        job.currentScreenshotUrl = `data:image/jpeg;base64,${Buffer.from(preview).toString("base64")}`
        saveJob(job)
      } catch {}
      emitSessionEvent(job, "navigation_completed", {
        url: job.currentUrl,
        message: `Browser opened ${job.currentUrl}.`,
        payload: { phase: "discovery" },
      })
    }

    const sessionCreds: { username?: string; password?: string } = { ...(params.credentials || {}) }
    const vaultCreds = getJobSecrets(job.id)?.credentials
    if (vaultCreds) {
      if (!sessionCreds.username && vaultCreds.username) sessionCreds.username = vaultCreds.username
      if (!sessionCreds.password && vaultCreds.password) sessionCreds.password = vaultCreds.password
    }
    let testPlan: FullAppTestPlan

    if (job.planApprovalState === "approved" && job.fullAppTestPlan && job.fullAppTestPlan.steps?.length > 0) {
      testPlan = job.fullAppTestPlan
      appendLog(
        job,
        "info",
        `⚡ Executing approved test plan with ${testPlan.steps.length} steps directly.`
      )
    } else {
      const rediscoveryPrompt = typeof (job as any).rediscoveryPrompt === "string" ? (job as any).rediscoveryPrompt : ""
      const discoveryStartUrl = rediscoveryPrompt
        ? extractRediscoveryUrl(rediscoveryPrompt, job.targetUrl, new URL(job.targetUrl).origin)
        : job.targetUrl
      if (rediscoveryPrompt) {
        appendLog(job, "info", `[REDISCOVERY] User requested a targeted map update: ${rediscoveryPrompt.slice(0, 240)}`)
        await page.goto(discoveryStartUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null)
        await waitForSpaPageReady(page, 2500)
      }
      let discovery = await discoverAndMapApp(job, page, discoveryStartUrl, {
        maxScreens: rediscoveryPrompt ? Math.max(params.maxScreens || 10, 15) : (params.maxScreens || 10),
        credentials: sessionCreds,
        projectDir: params.projectDir,
        layaUrl: (params as any).layaBaseUrl || (job as any).layaBaseUrl,
      })
      if (rediscoveryPrompt && job.fullAppTestPlan) {
        const merged = mergeRediscoveredGraph(
          job.fullAppTestPlan.screens || [],
          job.fullAppTestPlan.transitions || [],
          discovery.screens,
          discovery.transitions,
        )
        discovery = merged
        appendLog(job, "success", `[REDISCOVERY] Merged verified discoveries into the existing map: ${merged.screens.length} screens, ${merged.transitions.length} transitions.`)
        ;(job as any).rediscoveryPrompt = undefined
      }

      // Populate screens for UI compatibility
      job.screens = discovery.screens.map((s) => {
        const shots: Record<string, string> = {}
        if (s.screenshotUrl) shots["Desktop"] = s.screenshotUrl
        return {
          url: s.url,
          path: s.path,
          title: `${s.id} ${s.name}`,
          screenshotUrl: s.screenshotUrl,
          testedAt: new Date().toISOString(),
          screenshots: shots,
          backNavigationStatus: "passed" as const,
          responsiveStatus: "passed" as const,
          issuesCount: 0,
        }
      })

      // PHASE 2: Generate Structured Test Plan from Discovered Map
      job.testingPhase = "planning"
      job.currentStep = "Phase 2: Generating structured test plan and actionable element inventory..."
      job.progress = 30
      saveJob(job)

      appendLog(job, "info", "Phase 2: Generating structured test plan from discovered screens & elements...")
      testPlan = generateStructuredTestPlan(job.targetUrl, discovery.screens, discovery.transitions, {
        isAuthenticated: job.authState === "logged_in",
        postmanCollection: params.postmanCollection || job.postmanCollection,
      })
      linkTestPlanStepsToLedger(job, testPlan)
      queueUnplannedLedgerActions(job, testPlan)
      job.fullAppTestPlan = testPlan
      job.flowGraph = buildFigmaWorkflowMap(testPlan)
      saveJob(job)

      appendLog(
        job,
        "info",
        `📋 Test Plan Generated: ${testPlan.steps.length} test steps across ${testPlan.screens.length} screens (${testPlan.requiredFileTypes.length} file upload types detected).`
      )

      // MAP & PLAN FIRST: keep the authenticated browser and recording alive while
      // the user reviews the plan. Execution resumes only after explicit approval.
      job.planApprovalState = "awaiting_review"
      job.testingPhase = "planning"
      job.currentStep = "Test plan ready. Review it in the Plan tab, chat to revise it, then approve execution."
      job.progress = 35
      saveJob(job)
      emitSessionEvent(job, "progress", {
        message: "Authenticated discovery is complete. The test plan is waiting for review and approval.",
        payload: { phase: "plan_review", stepCount: testPlan.steps.length, screenCount: testPlan.screens.length },
      })
      appendLog(job, "info", "⏸️ Execution paused for plan review. Revise the plan in chat or approve it to continue this same browser session.")

      while (job.status === "running" && job.planApprovalState !== "approved") {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const refreshed = getJob(job.id)
        if (!refreshed) {
          job.status = "failed"
          job.error = "The testing job disappeared while waiting for plan approval."
          saveJob(job)
          return
        }
        if (refreshed.status !== "running") {
          job.status = refreshed.status
          return
        }
        const requestedRediscovery = typeof (refreshed as any).rediscoveryPrompt === "string" ? (refreshed as any).rediscoveryPrompt.trim() : ""
        if (requestedRediscovery && requestedRediscovery !== (job as any).lastProcessedRediscoveryPrompt) {
          ;(job as any).lastProcessedRediscoveryPrompt = requestedRediscovery
          appendLog(job, "info", `[REDISCOVERY] Revisiting the application for: ${requestedRediscovery.slice(0, 240)}`)
          const startUrl = extractRediscoveryUrl(requestedRediscovery, job.targetUrl, new URL(job.targetUrl).origin)
          await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null)
          await waitForSpaPageReady(page, 2500)
          const extra = await discoverAndMapApp(job, page, startUrl, {
            maxScreens: Math.max(params.maxScreens || 10, 15),
            credentials: sessionCreds,
            projectDir: params.projectDir,
            layaUrl: (params as any).layaBaseUrl || (job as any).layaBaseUrl,
          })
          const merged = mergeRediscoveredGraph(testPlan.screens || [], testPlan.transitions || [], extra.screens, extra.transitions)
          testPlan = generateStructuredTestPlan(job.targetUrl, merged.screens, merged.transitions, {
            isAuthenticated: job.authState === "logged_in",
            postmanCollection: params.postmanCollection || job.postmanCollection,
          })
          linkTestPlanStepsToLedger(job, testPlan)
          queueUnplannedLedgerActions(job, testPlan)
          job.screens = merged.screens.map((screen) => ({
            url: screen.url,
            path: screen.path,
            title: `${screen.id} ${screen.name}`,
            screenshotUrl: screen.screenshotUrl,
            testedAt: new Date().toISOString(),
            screenshots: screen.screenshotUrl ? { Desktop: screen.screenshotUrl } : ({} as Record<string, string>),
            backNavigationStatus: "passed" as const,
            responsiveStatus: "passed" as const,
            issuesCount: 0,
          }))
          job.fullAppTestPlan = testPlan
          job.flowGraph = buildFigmaWorkflowMap(testPlan)
          job.planApprovalState = "awaiting_review"
          job.progress = 35
          job.currentStep = "Map updated with rediscovered screens. Review the updated map and test plan, then approve execution."
          ;(job as any).rediscoveryPrompt = undefined
          saveJob(job)
          emitSessionEvent(job, "progress", {
            message: "Targeted rediscovery finished and the existing app map was updated. Review the revised plan.",
            payload: { phase: "rediscovery", screenCount: merged.screens.length, transitionCount: merged.transitions.length },
          })
          appendLog(job, "success", `[REDISCOVERY] Updated plan now covers ${testPlan.screens.length} screens and ${testPlan.steps.length} steps. Awaiting user review.`)
          continue
        }
        if (refreshed.fullAppTestPlan && refreshed.fullAppTestPlan.id === testPlan.id) {
          Object.assign(testPlan, refreshed.fullAppTestPlan)
          job.fullAppTestPlan = testPlan
        }
        job.planApprovalState = refreshed.planApprovalState
      }

      if (job.status !== "running" || job.planApprovalState !== "approved") return
      // Use the latest server-persisted revision, not the original generated plan.
      const approvedJob = getJob(job.id)
      if (approvedJob?.fullAppTestPlan?.id === testPlan.id) {
        Object.assign(testPlan, approvedJob.fullAppTestPlan)
        job.fullAppTestPlan = testPlan
      }
    }
    job.testingPhase = "files"
    job.currentStep = "Plan approved. Preparing test assets before execution..."
    job.progress = 38
    saveJob(job)
    appendLog(job, "success", `✅ Plan approved with ${testPlan.steps.length} steps. Continuing in the existing browser session.`)

    // Resolve upload folder from params / user prompt mention / project conventions
    const uploadFilesDir = resolveUploadFolder({
      uploadFilesDir: params.uploadFilesDir || job.uploadFilesDir,
      projectDir: params.projectDir || job.projectDir,
      prompt: params.userInstruction || params.workflowPrompt,
    })

    let uploadInventory = null
    if (uploadFilesDir) {
      uploadInventory = scanUploadFolder(uploadFilesDir)
      job.uploadFilesDir = uploadFilesDir
      appendLog(
        job,
        "info",
        `📁 Detected upload test folder: "${uploadFilesDir}" (${uploadInventory.files.length} test files indexed).`
      )
    }

    // PHASE 3: Systematic Execution of Test Plan & Workflows
    await executeStructuredTestPlan(job, page, testPlan, params.dummyTestFiles, sessionCreds, {
      allowActions: params.allowActions,
      noiseHosts: params.noiseHosts,
      postmanSummary: testPlan.postmanSummary,
      allowTestPayments,
      paymentCredentials: params.paymentCredentials,
      uploadFilesDir: uploadFilesDir || undefined,
      uploadInventory,
      projectDir: params.projectDir,
    })

    // Finalize session video recording
    if (videoRecorder) {
      const recUrl = await videoRecorder.stop(job)
      if (recUrl) {
        job.recordingUrl = recUrl
        if (job.report) job.report.recordingUrl = recUrl
      }
      job.recordingControl = "stopped"
      emitSessionEvent(job, "recording", { message: recUrl ? "Session recording finalized." : "Session recording stopped without a published URL.", payload: { state: "stopped", recordingUrl: recUrl || undefined } })
    }

    // Preserve an explicit incomplete-coverage failure from the execution phase.
    if ((job.status as string) === "failed" || job.fullAppTestPlan?.status === "error") {
      job.status = "failed"
      job.testingPhase = "reporting"
      job.finishedAt = new Date().toISOString()
      saveJob(job)
      appendLog(job, "error", "Full App Testing stopped without claiming completion because coverage remains unresolved.")
      return
    }

    // PHASE 4: Final Reporting & Coverage
    job.testingPhase = "reporting"
    job.status = "completed"
    job.progress = 100
    job.finishedAt = new Date().toISOString()
    saveJob(job)

    appendLog(job, "success", "🏁 Full App Testing pipeline completed successfully with full evidence and coverage report.")
  } catch (err: any) {
    console.error("[FullAppEngine] Fatal execution failure:", err)
    if (videoRecorder) {
      const recUrl = await videoRecorder.stop(job).catch(() => "")
      if (recUrl) {
        job.recordingUrl = recUrl
        if (job.report) job.report.recordingUrl = recUrl
      }
      job.recordingControl = "stopped"
      emitSessionEvent(job, "recording", {
        message: recUrl ? "Session recording finalized after an error." : "Session recording stopped after an error.",
        payload: { state: "stopped", recordingUrl: recUrl || undefined },
      })
    }
    job.status = "failed"
    job.error = secretRedactor.redact(err?.message || "Execution exception occurred during Full App Testing")
    job.finishedAt = new Date().toISOString()
    appendLog(job, "error", `Fatal Full App Testing failure: ${job.error}`)
    saveJob(job)
  } finally {
    if (liveFrameTimer) {
      clearInterval(liveFrameTimer)
      liveFrameTimer = null
    }
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
  }
}

