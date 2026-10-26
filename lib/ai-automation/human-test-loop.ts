/**
 * Closed-loop human-like autonomous testing controller.
 *
 * Pattern engine discovers bounded candidate tests.
 * Laya chooses the next candidate.
 * Puppeteer executes only safe candidates.
 * The Action Ledger records every decision and untested candidate.
 *
 * This controller deliberately does not replace Stagehand or the existing
 * scenario runner. It adds a deterministic, auditable decision loop before
 * the broader AI exploration pass.
 *
 * Vision: OpenCV (via vision-preprocessor) enriches candidates with
 * visual prominence so Laya can prefer what is actually salient on screen.
 */

import type { Page } from "puppeteer"
import { layaPredict, DEFAULT_LAYA_URL } from "@/lib/journey/laya-client"
import {
  generateCandidateTests,
  type CandidateTest,
  type PatternState,
} from "./interaction-pattern-engine"
import type { AutomationIssue, AutomationJob, AgentAction, ActionableElementType } from "./types"
import { appendLog, saveJob } from "./job-store"
import { inspectPageDom, exploreInternalLinkAndReturn, installDomNavigationObserver, drainDomNavigationEvents } from "./dom-first-discovery"
import { reconcileActionLedger } from "./action-ledger-reconciliation"
import { logActionExecution } from "./stagehand-config"
import { isSameOriginUrl } from "./full-app-utils"
import { resolveUploadFolder, scanUploadFolder, pickUploadFile } from "./test-file-manager"

const MAX_LOOP_STEPS = 24
const LAYA_THRESHOLD = 0.35
