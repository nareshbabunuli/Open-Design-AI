"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import type {
  AutomationJob,
  FullAppTestPlan,
  AppScreenNode,
  TestPlanStep,
  ActionableElement,
  FeatureWorkflowSpec,
  FeatureWorkflowEdgeCase,
} from "@/lib/ai-automation/types"
import TestFlowGraph from "./test-flow-graph"
import ActionLedgerPanel from "./action-ledger-panel"
import { synthesizeFullAppPlanFromJob, buildFigmaWorkflowMap } from "@/lib/ai-automation/full-app-utils"
import FormattedMessageText from "./formatted-message-text"
import {
  Compass,
  Map as MapIcon,
  Layers,
  ListChecks,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileUp,
  Sparkles,
  Cpu,
  Eye,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Maximize2,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  Check,
  Clock,
  Ban,
  UploadCloud,
  FileSpreadsheet,
  Film,
  PlusCircle,
  HelpCircle,
  Columns,
  Loader2,
  Trash2,
  Archive,
  MessageSquare,
  RotateCcw,
  Edit3,
  KeyRound,
  Search,
  FileBarChart,
  X,
  Video,
  Smartphone,
} from "lucide-react"

interface FullAppTestingViewProps {
  job: AutomationJob | null
  isRunning: boolean
  targetUrl: string
  onStartFullAppTest: (
    dummyFiles?: Record<string, { name: string; url: string; type: string }>,
    credentialsOverride?: { username?: string; password?: string }
  ) => Promise<void>
  onCancelJob?: () => void
  onJobUpdate?: (updatedJob: AutomationJob) => void
  activeSubTab?: "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage"
  onSubTabChange?: (tab: "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage") => void
  fullPageView?: boolean
  hideSubNav?: boolean
  onOpenMapPage?: () => void
  isMapPageActive?: boolean
  onOpenBesideScreen?: () => void
  isBesideScreen?: boolean
  isFullStage?: boolean
  onToggleFullStage?: () => void
  testingMode?: "full_app" | "feature_workflow"
  onSelectTestingMode?: (mode: "full_app" | "feature_workflow") => void
  fallbackPlan?: FullAppTestPlan | null
  fallbackSpec?: FeatureWorkflowSpec | null
}

export default function FullAppTestingView({
  job,
  isRunning,
  targetUrl,
  onStartFullAppTest,
  onCancelJob,
  onJobUpdate,
  activeSubTab: controlledSubTab,
  onSubTabChange,
  fullPageView = false,
  hideSubNav = false,
  onOpenMapPage,
  isMapPageActive = false,
  onOpenBesideScreen,
  isBesideScreen = false,
  isFullStage,
  onToggleFullStage,
  testingMode = "full_app",
  onSelectTestingMode,
  fallbackPlan = null,
  fallbackSpec = null,
}: FullAppTestingViewProps) {
  const plan = useMemo(() => {
    if (job?.fullAppTestPlan && job.fullAppTestPlan.screens?.length > 0) {
      return job.fullAppTestPlan
    }
    const synth = synthesizeFullAppPlanFromJob(job)
    if (synth && synth.screens?.length > 0) return synth
    return fallbackPlan || null
  }, [job, fallbackPlan])

  const activeEdgeCases = useMemo(() => {
    return job?.edgeCasesTested || job?.featureWorkflowSpec?.edgeCases || fallbackSpec?.edgeCases || []
  }, [job?.edgeCasesTested, job?.featureWorkflowSpec?.edgeCases, fallbackSpec?.edgeCases])

  const flowGraph = useMemo(() => {
    if (job?.flowGraph && job.flowGraph.nodes.length > 0) return job.flowGraph
    if (plan && plan.screens.length > 0) return buildFigmaWorkflowMap(plan)
    return null
  }, [job?.flowGraph, plan])

  const [internalSubTab, setInternalSubTab] = useState<
    "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage"
  >("map")
  const activeSubTab = controlledSubTab || internalSubTab
  const [planSection, setPlanSection] = useState<"steps" | "screens" | "files">("steps")

  useEffect(() => {
    if (activeSubTab === "screens") setPlanSection("screens")
    else if (activeSubTab === "files") setPlanSection("files")
  }, [activeSubTab])

  const handleSubTabChange = (tab: "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage") => {
    setInternalSubTab(tab)
    if (onSubTabChange) onSubTabChange(tab)
  }

  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null)
  const [filterStepStatus, setFilterStepStatus] = useState<string>("all")
  const [planChatInput, setPlanChatInput] = useState("")
  const [planChatBusy, setPlanChatBusy] = useState(false)
  const [planChatMessages, setPlanChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([])
  const [planApprovalBusy, setPlanApprovalBusy] = useState(false)
  const [isExportingZip, setIsExportingZip] = useState(false)
  const [isResettingData, setIsResettingData] = useState(false)

  // Evidence stream screen search state
  const [evidenceSearchInput, setEvidenceSearchInput] = useState("")
  const [evidenceSearchQuery, setEvidenceSearchQuery] = useState("")

  // Step value inline editing
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editingStepValue, setEditingStepValue] = useState<string>("")
  const [isSavingStepValue, setIsSavingStepValue] = useState(false)

  // Plan credentials quick-bar
  const [planCredUser, setPlanCredUser] = useState("")
  const [planCredPass, setPlanCredPass] = useState("")
  const [isApplyingPlanCreds, setIsApplyingPlanCreds] = useState(false)

  const testedScreensList = useMemo(() => {
    const screenNames = new Set<string>()
    if (plan?.screens) {
      plan.screens.forEach((s) => {
        if (s.name) screenNames.add(s.name)
        else if (s.path) screenNames.add(s.path)
      })
    }
    if (plan?.steps) {
      plan.steps.forEach((s) => {
        if (s.screenName) screenNames.add(s.screenName)
      })
    }
    if (job?.actionLedger?.entries) {
      job.actionLedger.entries.forEach((e) => {
        const name = (e as any).screenName || e.screenPath || e.name || e.screenId
        if (name) screenNames.add(name)
      })
    }
    return Array.from(screenNames)
  }, [plan?.screens, plan?.steps, job?.actionLedger?.entries])

  const filteredEvidenceSteps = useMemo(() => {
    const all = (plan?.steps || []).filter((s) => Boolean(s.screenshotUrl))
    const q = evidenceSearchQuery.trim().toLowerCase()
    if (!q) return all
    return all.filter((s) => {
      const sName = (s.screenName || "").toLowerCase()
      const tName = (s.targetName || "").toLowerCase()
      const sId = (s.screenId || s.id || "").toLowerCase()
      const exp = (s.expectedResult || "").toLowerCase()
      const act = (s.actualResult || "").toLowerCase()
      return sName.includes(q) || tName.includes(q) || sId.includes(q) || exp.includes(q) || act.includes(q)
    })
  }, [plan?.steps, evidenceSearchQuery])

  useEffect(() => {
    try {
      const savedStr = typeof window !== "undefined" ? localStorage.getItem("simulator_auth_credentials") : null
      if (savedStr) {
        const parsed = JSON.parse(savedStr)
        if (parsed.username) setPlanCredUser(parsed.username)
        if (parsed.password) setPlanCredPass(parsed.password)
      }
    } catch {}
  }, [])

  const handleSaveStepValue = async (stepId: string) => {
    if (!job?.id) return
    setIsSavingStepValue(true)
    try {
      if (job.fullAppTestPlan?.steps) {
        const target = job.fullAppTestPlan.steps.find((s) => s.id === stepId)
        if (target) {
          target.syntheticValue = editingStepValue
          const isEmail = /e-?mail/i.test(target.targetName) || /e-?mail/i.test(target.targetSelector || "")
          const isPass = /pass/i.test(target.targetName) || /pass/i.test(target.targetSelector || "")
          try {
            const savedStr = localStorage.getItem("simulator_auth_credentials")
            const parsed = savedStr ? JSON.parse(savedStr) : {}
            if (isEmail) parsed.username = editingStepValue
            if (isPass) parsed.password = editingStepValue
            localStorage.setItem("simulator_auth_credentials", JSON.stringify(parsed))
          } catch {}
        }
      }

      await fetch("/api/ai-automation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          projectId: job.projectId,
          action: "update_step_value",
          stepId,
          value: editingStepValue,
        }),
      })

      if (onJobUpdate) onJobUpdate({ ...job })
      setEditingStepId(null)
    } catch (e) {
      console.error("Failed to update step value:", e)
    } finally {
      setIsSavingStepValue(false)
    }
  }

  const handleApplyPlanCredentials = async () => {
    if (!job?.id || (!planCredUser.trim() && !planCredPass.trim())) return
    setIsApplyingPlanCreds(true)
    try {
      const u = planCredUser.trim()
      const p = planCredPass.trim()

      try {
        const savedStr = localStorage.getItem("simulator_auth_credentials")
        const parsed = savedStr ? JSON.parse(savedStr) : {}
        if (u) parsed.username = u
        if (p) parsed.password = p
        localStorage.setItem("simulator_auth_credentials", JSON.stringify(parsed))
      } catch {}

      if (job.fullAppTestPlan?.steps) {
        for (const s of job.fullAppTestPlan.steps) {
          if (s.actionType === "fill") {
            const isEmail = /e-?mail/i.test(s.targetName) || /e-?mail/i.test(s.targetSelector || "")
            const isUser = /user|login/i.test(s.targetName) || /user|login/i.test(s.targetSelector || "")
            const isPass = /pass/i.test(s.targetName) || /pass/i.test(s.targetSelector || "")
            if ((isEmail || isUser) && u) s.syntheticValue = u
            if (isPass && p) s.syntheticValue = p
          }
        }
      }

      await fetch("/api/ai-automation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          projectId: job.projectId,
          action: "provide_credentials",
          username: u,
          password: p,
        }),
      })

      if (onJobUpdate) onJobUpdate({ ...job })
    } catch (e) {
      console.error("Failed to apply plan credentials:", e)
    } finally {
      setIsApplyingPlanCreds(false)
    }
  }

  const handleExportZip = async () => {
    if (!job?.id || isExportingZip) return
    setIsExportingZip(true)
    try {
      const res = await fetch(`/api/ai-automation/export-zip?jobId=${job.id}`)
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || "Failed to generate export zip")
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const disposition = res.headers.get("content-disposition") || ""
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      a.download = filenameMatch?.[1] || `test-bundle-${job.id.slice(0, 8)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`Export failed: ${err?.message || "Could not generate ZIP bundle"}`)
    } finally {
      setIsExportingZip(false)
    }
  }

  const handleResetData = async () => {
    if (!job?.id || isResettingData) return
    const confirmed = window.confirm(
      "Are you sure you want to reset all discovered screens and test plan data? This will clear the current map and tests so you can start a fresh run."
    )
    if (!confirmed) return

    setIsResettingData(true)
    try {
      const res = await fetch("/api/ai-automation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "reset_test_data" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not reset map data")
      if (data.job) onJobUpdate?.(data.job)
      window.dispatchEvent(new CustomEvent("ai-simulator-data-reset", { detail: { jobId: job.id } }))
    } catch (err: any) {
      alert(`Reset failed: ${err?.message || "Could not reset data"}`)
    } finally {
      setIsResettingData(false)
    }
  }

  useEffect(() => {
    if (job?.planApprovalState === "awaiting_review" && job.fullAppTestPlan?.screens?.length) {
      setInternalSubTab("plan")
      onSubTabChange?.("plan")
    }
  }, [job?.planApprovalState, job?.fullAppTestPlan?.id, job?.fullAppTestPlan?.steps?.length, onSubTabChange])

  const submitPlanChat = async () => {
    if (!job?.id || !planChatInput.trim() || planChatBusy) return
    const instruction = planChatInput.trim()
    setPlanChatMessages((messages) => [...messages, { role: "user", text: instruction }])
    setPlanChatInput("")
    setPlanChatBusy(true)
    try {
      const asksForRediscovery = /\b(missing|missed|forgotten|not mapped|not in the map|not discovered)\b.{0,100}\b(screen|page|tab|dialog|modal|state|notification|settings|profile|security)\b|\b(screen|page|tab|dialog|modal|state)\b.{0,100}\b(missing|missed|not mapped|not discovered)\b/i.test(instruction)
      const action = asksForRediscovery ? "rediscover_missing_screen" : "edit_test_plan"
      const response = await fetch("/api/ai-automation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action, instruction }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || (asksForRediscovery ? "Could not rediscover the missing screen" : "Could not update the plan"))
      if (data.job) onJobUpdate?.(data.job)
      setPlanChatMessages((messages) => [...messages, {
        role: "assistant",
        text: data.message || (asksForRediscovery
          ? "I’ll revisit that part of the app and merge verified missing screens into the map."
          : "Plan updated. Review the changes before approving."),
      }])
    } catch (error) {
      setPlanChatMessages((messages) => [...messages, { role: "assistant", text: error instanceof Error ? error.message : "Could not update the plan." }])
    } finally {
      setPlanChatBusy(false)
    }
  }

  const approveTestPlan = async () => {
    if (!job?.id || planApprovalBusy) return
    setPlanApprovalBusy(true)
    try {
      const response = await fetch("/api/ai-automation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "approve_test_plan" }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not approve the plan")
      if (data.job) onJobUpdate?.(data.job)
      setPlanChatMessages((messages) => [...messages, { role: "assistant", text: "Plan approved. The current browser session will continue into execution." }])
    } catch (error) {
      setPlanChatMessages((messages) => [...messages, { role: "assistant", text: error instanceof Error ? error.message : "Could not approve the plan." }])
    } finally {
      setPlanApprovalBusy(false)
    }
  }

  const handleDeleteScreen = useCallback(
    (screenId: string) => {
      if (!job) return

      const currentScreens = plan?.screens || []
      const updatedScreens = currentScreens.filter((s) => s.id !== screenId)
      const currentNodes = flowGraph?.nodes || []
      const updatedNodes = currentNodes.filter((n) => n.id !== screenId)
      const currentEdges = flowGraph?.edges || []
      const updatedEdges = currentEdges.filter((e) => e.from !== screenId && e.to !== screenId)
      const currentTransitions = plan?.transitions || []
      const updatedTransitions = currentTransitions.filter(
        (t) => t.fromScreenId !== screenId && t.toScreenId !== screenId
      )
      const currentSteps = plan?.steps || []
      const updatedSteps = currentSteps.filter((s) => s.screenId !== screenId)

      const updatedJob: AutomationJob = {
        ...job,
        flowGraph: {
          nodes: updatedNodes,
          edges: updatedEdges,
        },
        fullAppTestPlan: {
          ...(job.fullAppTestPlan || ({} as any)),
          screens: updatedScreens,
          transitions: updatedTransitions,
          steps: updatedSteps,
        },
      }

      if (selectedScreenId === screenId) {
        setSelectedScreenId(updatedScreens[0]?.id || null)
      }

      onJobUpdate?.(updatedJob)
    },
    [job, plan, flowGraph, selectedScreenId, onJobUpdate]
  )
  // Dummy test files state (user-provided or synthetic defaults)
  const [dummyFiles, setDummyFiles] = useState<
    Record<string, { name: string; url: string; type: string }>
  >({})
  const [isUploadingFile, setIsUploadingFile] = useState(false)

  // Login-wall credential prompt
  const [authUser, setAuthUser] = useState("")
  const [authPass, setAuthPass] = useState("")
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const sendAuth = async (action: "provide_credentials" | "skip_auth") => {
    setAuthError(null)
    setIsSubmittingAuth(true)

    try {
      if (job?.id && job.status === "running") {
        const res = await fetch("/api/ai-automation/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, action, username: authUser, password: authPass }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || "Failed to submit credentials")
        }
        if (data?.job) {
          onJobUpdate?.(data.job)
        }
      } else {
        // Job was stopped or not running: launch testing run with provided credentials
        if (action === "provide_credentials") {
          await onStartFullAppTest(dummyFiles, { username: authUser.trim(), password: authPass.trim() })
        } else {
          await onStartFullAppTest(dummyFiles)
        }
      }
      setAuthPass("")
    } catch (err: any) {
      setAuthError(err?.message || "Failed to submit credentials and continue")
    } finally {
      setIsSubmittingAuth(false)
    }
  }

  // Selected screen node
  const selectedScreen = useMemo(() => {
    if (!plan || !plan.screens.length) return null
    if (selectedScreenId) {
      return plan.screens.find((s) => s.id === selectedScreenId) || plan.screens[0]
    }
    return plan.screens[0]
  }, [plan, selectedScreenId])

  // Filtered steps
  const filteredSteps = useMemo(() => {
    if (!plan || !plan.steps) return []
    if (filterStepStatus === "all") return plan.steps
    return plan.steps.filter((s) => s.status === filterStepStatus)
  }, [plan, filterStepStatus])

  // Coverage statistics
  const coverage = useMemo(() => {
    if (!plan) {
      return {
        screensTested: 0,
        totalScreens: 0,
        actionsTested: 0,
        totalActions: 0,
        formsTested: 0,
        totalForms: 0,
        percentage: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        newDiscoveries: 0,
      }
    }
    const passed = plan.steps.filter((s) => s.status === "passed").length
    const failed = plan.steps.filter((s) => s.status === "failed").length
    const blocked = plan.steps.filter((s) => s.status === "blocked").length
    const newDiscoveries = plan.steps.filter((s) => s.isNewDiscovery).length

    return {
      ...plan.coverage,
      passed,
      failed,
      blocked,
      newDiscoveries,
    }
  }, [plan])

  const actionLedger = job?.actionLedger
  // Handle local dummy file upload
  const handleFileUpload = (type: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingFile(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setDummyFiles((prev) => ({
        ...prev,
        [type]: {
          name: file.name,
          url: dataUrl,
          type: file.type || type,
        },
      }))
      setIsUploadingFile(false)
    }
    reader.onerror = () => setIsUploadingFile(false)
    reader.readAsDataURL(file)
  }

  // Phase calculation
  const currentPhase = job?.testingPhase || (job?.status === "running" ? "discovery" : "ready")

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sleek Progress Line when Running in Full Page View */}
      {fullPageView && isRunning && (
        <div className="h-0.5 bg-slate-900 w-full overflow-hidden shrink-0">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${job?.progress || 0}%` }}
          />
        </div>
      )}

      {/* Top Mode Switcher Header removed to eliminate redundant Run Full App Test & mode banner */}

      {/* 1. Header Banner & Architecture Stepper (shown only when not in full page view) */}
      {!fullPageView && (
        <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
                <Compass className="h-5 w-5 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-tight">Full App Systematic Testing</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 border border-indigo-400/40 text-indigo-300">
                    MAP & PLAN FIRST
                  </span>
                  {coverage.newDiscoveries > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-400/50 text-amber-300 animate-pulse flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {coverage.newDiscoveries} NEW DISCOVERY
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-md">
                  Target: <span className="font-mono text-slate-200">{targetUrl || "No target specified"}</span>
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-2">
              {isRunning ? (
                <button
                  type="button"
                  onClick={onCancelJob}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-rose-950"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>Stop Testing</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartFullAppTest(dummyFiles)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-950/60"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>{plan ? "Re-Run Full App Test" : "Start Full App Testing"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 5-Stage Architecture Pipeline Stepper */}
          <div className="grid grid-cols-5 gap-1.5 text-[10px] font-medium pt-1 border-t border-slate-800/80">
            {[
              { key: "discovery", label: "1. Discover & Map", icon: MapIcon, desc: "Systematic BFS" },
              { key: "planning", label: "2. Build Inventory", icon: Layers, desc: "All elements" },
              { key: "files", label: "3. Test Plan & Files", icon: FileText, desc: "Synthetic plan" },
              { key: "executing", label: "4. Systematic Exec", icon: Play, desc: "Action → Verify" },
              { key: "reporting", label: "5. Final Report", icon: CheckCircle2, desc: "Coverage & Bugs" },
            ].map((step, idx) => {
              const isCurrent =
                currentPhase === step.key ||
                (step.key === "reporting" && job?.status === "completed")
              const isPassed =
                (step.key === "discovery" && ["planning", "files", "executing", "reporting"].includes(currentPhase)) ||
                (step.key === "planning" && ["files", "executing", "reporting"].includes(currentPhase)) ||
                (step.key === "files" && ["executing", "reporting"].includes(currentPhase)) ||
                (step.key === "executing" && ["reporting"].includes(currentPhase)) ||
                job?.status === "completed"

              const Icon = step.icon

              return (
                <div
                  key={step.key}
                  className={`px-2 py-1 rounded-md flex items-center gap-1.5 border transition ${
                    isCurrent
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm"
                      : isPassed
                      ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                      : "bg-slate-900/60 border-slate-800 text-slate-500"
                  }`}
                >
                  <Icon className={`h-3 w-3 shrink-0 ${isCurrent ? "animate-pulse text-indigo-400" : ""}`} />
                  <div className="min-w-0 truncate">
                    <div className="truncate font-semibold">{step.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live Progress Bar */}
          {isRunning && (
            <div className="mt-2.5 pt-1.5 border-t border-slate-800/60">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-300 font-mono truncate">{job?.currentStep || "Running systematic testing..."}</span>
                <span className="text-indigo-400 font-bold">{job?.progress || 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${job?.progress || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Login wall: ask for credentials */}
      {job?.authState === "awaiting_credentials" && (
        <div className="px-4 py-3 bg-amber-950/40 border-b border-amber-500/40 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <ShieldAlert className="h-4 w-4" />
              <span>Login required</span>
              {(!job || job.status !== "running") && (
                <span className="text-[10px] text-amber-400/90 font-normal">
                  (Clicking continue will start testing with these credentials)
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-300 mb-2">
            {job.authPrompt || "Login required. Enter test credentials to continue testing the authenticated app, or skip."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (authUser.trim()) sendAuth("provide_credentials")
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              value={authUser}
              onChange={(e) => setAuthUser(e.target.value)}
              placeholder="Email / username"
              autoComplete="off"
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <input
              type="password"
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
              placeholder="Password (if required)"
              autoComplete="new-password"
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={isSubmittingAuth || !authUser.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition shadow-sm"
            >
              {isSubmittingAuth && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isSubmittingAuth ? "Submitting..." : authPass ? "Log in & continue" : "Use email & continue"}</span>
            </button>
            <button
              type="button"
              disabled={isSubmittingAuth}
              onClick={() => sendAuth("skip_auth")}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold cursor-pointer transition"
            >
              Skip login
            </button>
          </form>
          {authError && (
            <p className="text-[11px] text-rose-400 mt-1.5 font-medium">{authError}</p>
          )}
        </div>
      )}

      {/* 2. Coverage Metrics Bar (shown only when not in full page view) */}
      {plan && !fullPageView && (
        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs shrink-0">
          <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">Screens Mapped</div>
              <div className="text-sm font-bold text-white font-mono">
                {coverage.screensTested} / {coverage.totalScreens}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-bold text-indigo-400">
              {coverage.totalScreens > 0 ? Math.round((coverage.screensTested / coverage.totalScreens) * 100) : 0}%
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">Actions Tested</div>
              <div className="text-sm font-bold text-white font-mono">
                {coverage.actionsTested} / {coverage.totalActions}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-[10px] font-bold text-purple-400">
              {coverage.percentage}%
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">Test Results</div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold mt-0.5">
                <span className="text-emerald-400 flex items-center gap-0.5">
                  <Check className="h-3 w-3" /> {coverage.passed}
                </span>
                <span className="text-rose-400 flex items-center gap-0.5">
                  <XCircle className="h-3 w-3" /> {coverage.failed}
                </span>
                <span className="text-amber-400 flex items-center gap-0.5">
                  <Ban className="h-3 w-3" /> {coverage.blocked}
                </span>
              </div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">Form Submissions</div>
              <div className="text-sm font-bold text-white font-mono">
                {coverage.formsTested} / {coverage.totalForms} Forms
              </div>
            </div>
            <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
              100% Synthetic
            </div>
          </div>
        </div>
      )}

      {/* 3. Unified Sub-Tab Navigation (Hick's Law: 4 non-overlapping stage views) */}
      {!hideSubNav && (
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-2 text-xs shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-1">
            {[
              { id: "chat", label: "Chat", icon: MessageSquare, isLive: job?.status === "running" },
              { id: "plan", label: "Plan & Screens", icon: ListChecks, count: plan?.steps.length },
              { id: "map", label: "Flow Map", icon: MapIcon, count: plan?.screens.length },
              {
                id: "coverage",
                label: "Report",
                icon: ShieldAlert,
                count: job?.issues && job.issues.length > 0 ? `${job.issues.length} bugs` : coverage.percentage > 0 ? `${coverage.percentage}%` : undefined,
              },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive =
                activeSubTab === tab.id ||
                (tab.id === "plan" && (activeSubTab === "screens" || activeSubTab === "files")) ||
                (tab.id === "coverage" && activeSubTab === "execution")
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSubTabChange(tab.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-950"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive
                          ? "bg-indigo-800 text-white"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <button
                type="button"
                onClick={onCancelJob}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Ban className="h-3 w-3" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStartFullAppTest(dummyFiles)}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>{plan ? "Re-Run Full App" : "Full App Test"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Tab Contents */}
      <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${fullPageView && activeSubTab === "map" ? "p-0 flex flex-col" : "p-4"}`}>
        {/* SUBTAB 1: FIGMA-STYLE APPLICATION MAP */}
        {activeSubTab === "map" && (
          <div className={fullPageView ? "flex-1 flex flex-col min-h-0 h-full" : "space-y-4"}>
            {flowGraph && flowGraph.nodes.length > 0 ? (
              <div className={fullPageView ? "flex-1 flex flex-col min-h-[580px] h-full" : ""}>
                <TestFlowGraph
                  graph={flowGraph}
                  screens={plan?.screens}
                  steps={plan?.steps}
                  transitions={plan?.transitions}
                  plan={plan || undefined}
                  onSelectScreen={(screenId) => {
                    setSelectedScreenId(screenId)
                  }}
                  onDeleteScreen={handleDeleteScreen}
                  onViewScreenshot={(url) => setScreenshotModal(url)}
                  onOpenMapPage={onOpenMapPage || onOpenBesideScreen}
                  isFullStage={isFullStage !== undefined ? isFullStage : fullPageView}
                  isBesideScreen={isBesideScreen}
                  onToggleFullStage={onToggleFullStage}
                />
              </div>
            ) : (
              <div className="p-12 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 flex flex-col items-center justify-center text-center">
                <MapIcon className="h-10 w-10 text-slate-600 mb-3" />
                <h4 className="text-sm font-bold text-slate-300">Application Not Yet Mapped</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Click &quot;Start Full App Testing&quot; above to initiate Phase 1 Discovery. The AI crawler will systematically explore all screens and build this visual workflow map.
                </p>
              </div>
            )}
          </div>
        )}

        {/* UNIFIED PLAN, SCREENS & TEST FILES SUB-SWITCHER (Hick's Law: 3 related setup views in 1 tab) */}
        {(activeSubTab === "plan" || activeSubTab === "screens" || activeSubTab === "files") && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPlanSection("steps")
                  if (activeSubTab !== "plan") handleSubTabChange("plan")
                }}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition cursor-pointer ${
                  planSection === "steps" && activeSubTab !== "screens" && activeSubTab !== "files"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                <span>Test Steps</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-950/60 text-slate-200">
                  {plan?.steps.length || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlanSection("screens")
                  if (activeSubTab !== "plan") handleSubTabChange("plan")
                }}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition cursor-pointer ${
                  planSection === "screens" || activeSubTab === "screens"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Screens &amp; DOM</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-950/60 text-slate-200">
                  {plan?.screens.length || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlanSection("files")
                  if (activeSubTab !== "plan") handleSubTabChange("plan")
                }}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition cursor-pointer ${
                  planSection === "files" || activeSubTab === "files"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>Test Files</span>
              </button>
            </div>

            {plan && planSection === "steps" && activeSubTab === "plan" && (
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                {["all", "passed", "failed", "blocked", "pending"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStepStatus(st)}
                    className={`px-2.5 py-1 rounded capitalize font-medium transition cursor-pointer ${
                      filterStepStatus === st
                        ? "bg-indigo-600 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: DISCOVERED SCREENS & ACTION INVENTORY */}
        {(activeSubTab === "screens" || (activeSubTab === "plan" && planSection === "screens")) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  Screen & Actionable Elements Inventory
                </h3>
                <p className="text-xs text-slate-400">
                  Exhaustive catalog of every interactive control, form field, button, and dropdown discovered per screen.
                </p>
              </div>
            </div>

            {plan && plan.screens.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left Screen Selector Column */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Screens ({plan.screens.length})
                  </div>
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                    {plan.screens.map((s) => {
                      const isSelected = selectedScreen?.id === s.id
                      return (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedScreenId(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setSelectedScreenId(s.id)
                            }
                          }}
                          className={`w-full p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-indigo-600/20 border-indigo-500 text-white"
                              : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900"
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-indigo-400">{s.id}</span>
                              <span className="text-xs font-semibold truncate">{s.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-500 font-mono truncate">{s.path}</span>
                              {(s.componentLocation || s.sourceFile) && (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300 truncate shrink-0"
                                  title={`Component Location: ${s.componentLocation || s.sourceFile}`}
                                >
                                  📄 {(s.componentLocation || s.sourceFile)?.split("/").slice(-2).join("/")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteScreen(s.id)
                              }}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 transition cursor-pointer"
                              title={`Delete screen ${s.id}`}
                              aria-label={`Delete screen ${s.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                              {s.actionableElements.length}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Right Screen Inventory Column */}
                <div className="md:col-span-2 space-y-3">
                  {selectedScreen ? (
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
                      {/* Screen Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {selectedScreen.id}
                            </span>
                            <h4 className="text-sm font-bold text-white">{selectedScreen.name}</h4>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <p className="text-xs text-slate-400 font-mono">{selectedScreen.url}</p>
                            {(selectedScreen.componentLocation || selectedScreen.sourceFile) && (
                              <span
                                className="px-2 py-0.5 rounded font-mono text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40"
                                title="Component source file location"
                              >
                                📄 {selectedScreen.componentLocation || selectedScreen.sourceFile}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedScreen.screenshotUrl && (
                            <button
                              type="button"
                              onClick={() => setScreenshotModal(selectedScreen.screenshotUrl!)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View Screen</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteScreen(selectedScreen.id)}
                            className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-xs font-semibold text-rose-300 flex items-center gap-1 border border-rose-800/60 transition cursor-pointer"
                            title="Delete this screen from test plan"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                            <span>Delete Screen</span>
                          </button>
                        </div>
                      </div>

                      {/* Actionable Elements List */}
                      <div>
                        <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                          <span>Actionable Elements ({selectedScreen.actionableElements.length})</span>
                          <span className="text-[10px] text-slate-500 font-normal">Exhaustive DOM discovery</span>
                        </h5>

                        <div className="space-y-1.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                          {selectedScreen.actionableElements.map((elem, index) => (
                            <div
                              key={`${elem.id}-${index}`}
                              className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 pr-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                                      elem.type === "button"
                                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                        : elem.type === "input"
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : elem.type === "file_upload"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : elem.type === "select"
                                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                        : elem.type === "checkbox" || elem.type === "toggle"
                                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                        : "bg-slate-800 text-slate-400"
                                    }`}
                                  >
                                    {elem.type}
                                  </span>
                                  <span className="font-semibold text-white truncate">{elem.name}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                                  {elem.selector || "DOM Element"}
                                  {elem.accept && ` · accepts: ${elem.accept}`}
                                </div>
                              </div>

                              <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                {elem.inputType ? `type="${elem.inputType}"` : elem.isInteractive ? "Interactive" : "Static"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                      Select a screen on the left to inspect its actionable inventory.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                Discovery phase must run to populate screen action inventories.
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 3: STRUCTURED TEST PLAN */}
        {activeSubTab === "plan" && planSection === "steps" && (
          <div className="space-y-4">
            {/* Blocked Steps Resolution Alert Banner */}
            {plan && plan.steps.some((s) => s.status === "blocked") && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold text-amber-200 block">
                      {plan.steps.filter((s) => s.status === "blocked").length} Step(s) Blocked
                    </span>
                    <span className="text-[11px] text-slate-300">
                      Open Chat to provide credentials or synthetic data and unblock these steps.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubTabChange("chat")}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-md shadow-amber-950"
                >
                  Open Chat to Unblock →
                </button>
              </div>
            )}

            {/* Quick Test Credentials Bar */}
            <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white">Test Login Credentials</span>
                  <p className="text-[10px] text-slate-400">Write test email & password to use on login steps instead of synthetic faker data.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={planCredUser}
                  onChange={(e) => setPlanCredUser(e.target.value)}
                  placeholder="Test email / username"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-48"
                />
                <input
                  type="password"
                  value={planCredPass}
                  onChange={(e) => setPlanCredPass(e.target.value)}
                  placeholder="Test password"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-36"
                />
                <button
                  type="button"
                  onClick={handleApplyPlanCredentials}
                  disabled={isApplyingPlanCreds || (!planCredUser.trim() && !planCredPass.trim())}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isApplyingPlanCreds ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  <span>Apply to Plan</span>
                </button>
              </div>
            </div>

            {job?.planApprovalState === "awaiting_review" && plan && (
              <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Review and refine plan steps</h4>
                    <p className="text-xs text-slate-300 mt-1">The browser is paused after authenticated discovery. Request supported step changes below, review the updated steps, then approve execution.</p>
                  </div>
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">Waiting for approval</span>
                </div>
                {planChatMessages.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-2 rounded-lg bg-slate-950/70 p-2.5" aria-live="polite">
                    {planChatMessages.map((message, index) => (
                      <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                        <span className={message.role === "user" ? "inline-block max-w-[90%] rounded-lg bg-indigo-600/30 px-3 py-2 text-xs text-indigo-100" : "inline-block max-w-[90%] rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200"}>
                          <FormattedMessageText text={message.text} isUser={message.role === "user"} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <form className="flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); void submitPlanChat() }}>
                  <input
                    value={planChatInput}
                    onChange={(event) => setPlanChatInput(event.target.value)}
                    placeholder='Try: “add a test for signup validation” or “remove step 3”'
                    aria-label="Chat with the test plan"
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                    disabled={planChatBusy}
                  />
                  <button type="submit" disabled={planChatBusy || !planChatInput.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                    {planChatBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Apply change
                  </button>
                </form>
                <p className="text-[10px] text-slate-400">Supported edits: add a test, remove a numbered step, rename a step, or change a step’s expected result. Every edit is saved to the plan before approval.</p>
                <div className="flex justify-end border-t border-indigo-500/20 pt-3">
                  <button type="button" onClick={() => void approveTestPlan()} disabled={planApprovalBusy || planChatBusy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer">
                    {planApprovalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    Approve plan &amp; run tests
                  </button>
                </div>
              </div>
            )}

            {filteredSteps.length > 0 ? (
              <div className="space-y-2">
                {filteredSteps.map((step) => {
                  const isPassed = step.status === "passed"
                  const isFailed = step.status === "failed"
                  const isBlocked = step.status === "blocked"
                  const isRunning = step.status === "running"

                  return (
                    <div
                      key={step.id}
                      className={`p-3 rounded-xl border text-xs transition ${
                        isPassed
                          ? "bg-emerald-950/20 border-emerald-800/40"
                          : isFailed
                          ? "bg-rose-950/20 border-rose-800/40"
                          : isBlocked
                          ? "bg-amber-950/20 border-amber-800/40"
                          : isRunning
                          ? "bg-indigo-950/30 border-indigo-500 shadow-md"
                          : "bg-slate-900/60 border-slate-800"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-slate-500 font-bold">#{step.stepIndex}</span>
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {step.screenId}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                              step.actionType === "fill"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : step.actionType === "click"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                : step.actionType === "upload"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {step.actionType}
                          </span>
                          <span className="font-bold text-white truncate">{step.targetName}</span>

                          {step.isNewDiscovery && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 border border-amber-400/60 text-amber-300 animate-pulse">
                              NEW DISCOVERY
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPassed && (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <Check className="h-3 w-3" /> PASS
                            </span>
                          )}
                          {isFailed && (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              <XCircle className="h-3 w-3" /> FAIL
                            </span>
                          )}
                          {isBlocked && (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <Ban className="h-3 w-3" /> BLOCKED
                            </span>
                          )}
                          {isRunning && (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-500/30 text-indigo-300 border border-indigo-400 animate-pulse flex items-center gap-1">
                              <Clock className="h-3 w-3" /> RUNNING
                            </span>
                          )}
                          {step.status === "pending" && (
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expected vs Actual */}
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/60">
                        <div>
                          <span className="text-slate-400 font-medium">Expected Result: </span>
                          <span className="text-slate-300">{step.expectedResult}</span>
                        </div>
                        {step.actualResult && (
                          <div>
                            <span className="text-slate-400 font-medium">Observed Result: </span>
                            <span className={isPassed ? "text-emerald-300 font-medium" : "text-rose-300 font-medium"}>
                              {step.actualResult}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Synthetic test value note & inline edit */}
                      {step.syntheticValue && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                          <span className="text-slate-500 font-mono">Input Value:</span>
                          {editingStepId === step.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type={/pass/i.test(step.targetName) ? "password" : "text"}
                                value={editingStepValue}
                                onChange={(e) => setEditingStepValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveStepValue(step.id)
                                  if (e.key === "Escape") setEditingStepId(null)
                                }}
                                className="px-2 py-0.5 rounded bg-slate-950 border border-indigo-500 text-white font-mono text-xs focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveStepValue(step.id)}
                                disabled={isSavingStepValue}
                                className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStepId(null)}
                                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300 font-mono">
                                {step.syntheticValue}
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStepId(step.id)
                                  setEditingStepValue(step.syntheticValue || "")
                                }}
                                className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-300 transition cursor-pointer"
                                title="Edit this input value"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <span className="text-[9px] text-emerald-400/80">
                                {step.syntheticValue.includes("synthetic.test") || step.syntheticValue === "Password123!Safe"
                                  ? "(Synthetic Faker Data)"
                                  : "(Custom Value)"}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Screenshot Evidence Thumbnail */}
                      {step.screenshotUrl && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setScreenshotModal(step.screenshotUrl!)}
                            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View Step Evidence Screenshot</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                No test plan steps match current filter.
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 5: TEST FILES PROVISIONING */}
        {(activeSubTab === "files" || (activeSubTab === "plan" && planSection === "files")) && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileUp className="h-4 w-4 text-indigo-400" />
                Dummy Test Files Provisioning
              </h3>
              <p className="text-xs text-slate-400">
                Provide custom dummy test files for application upload controls, or let the systematic engine use built-in synthetic buffers (PNG, PDF, CSV, TXT).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { type: "image", label: "Image (.png, .jpg)", icon: ImageIcon, defaultName: "dummy_test_image.png" },
                { type: "pdf", label: "PDF Document (.pdf)", icon: FileText, defaultName: "dummy_test_doc.pdf" },
                { type: "csv", label: "CSV Dataset (.csv)", icon: FileSpreadsheet, defaultName: "dummy_test_data.csv" },
                { type: "document", label: "Text/Doc (.txt, .docx)", icon: FileText, defaultName: "dummy_sample.txt" },
                { type: "video", label: "Video (.mp4, .webm)", icon: Film, defaultName: "dummy_test_video.mp4" },
              ].map((f) => {
                const provided = dummyFiles[f.type]
                const Icon = f.icon

                return (
                  <div key={f.type} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-indigo-400" />
                        <span className="text-xs font-bold text-white">{f.label}</span>
                      </div>
                      {provided ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Custom File
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Synthetic Default
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      File: {provided ? provided.name : f.defaultName}
                    </div>

                    <label className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer">
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>{provided ? "Change File" : "Upload Custom Dummy"}</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => handleFileUpload(f.type, e)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SUBTAB 6: UNIFIED REPORT, EVIDENCE GALLERY, VIDEO & EDGE CASES */}
        {(activeSubTab === "coverage" || activeSubTab === "execution") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Coverage, Step Evidence &amp; Issues Report
                </h3>
                <p className="text-xs text-slate-400">
                  Unified audit report with screen/action coverage, session video, captured step screenshots, edge cases, and exceptions.
                </p>
              </div>
              {job?.id && (
                <button
                  type="button"
                  onClick={() => window.open(`/api/ai-automation/html-report?jobId=${job.id}`, "_blank")}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <FileBarChart className="h-3.5 w-3.5" />
                  <span>Open Printable Report ↗</span>
                </button>
              )}
            </div>

            {/* Current Active Step Banner when running */}
            {isRunning && job?.currentStep && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/60 to-slate-900 border border-indigo-500/50 shadow-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  <span className="font-mono text-white truncate">{job.currentStep}</span>
                </div>
                <span className="text-xs font-mono text-indigo-300 font-bold shrink-0">{job.progress || 0}%</span>
              </div>
            )}

            {/* Coverage & Verification Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-bold font-mono text-indigo-400">{coverage.percentage}%</div>
                <div className="text-xs font-semibold text-white mt-0.5">Action Coverage</div>
                <div className="text-[10px] text-slate-400">
                  {coverage.actionsTested} / {coverage.totalActions} steps
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {job?.report?.uniqueScreensTested ?? Math.max(1, coverage.totalScreens)} / {job?.report?.viewportsTestedCount ?? (job?.responsiveResults?.length || 1)}
                </div>
                <div className="text-xs font-semibold text-white mt-0.5">Screens / Viewports</div>
                <div className="text-[10px] text-slate-400">
                  {job?.report?.uniqueScreensTested ?? Math.max(1, coverage.totalScreens)} unique screen(s) • {job?.report?.viewportsTestedCount ?? (job?.responsiveResults?.length || 1)} viewport(s)
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-bold font-mono text-cyan-400">
                  {job?.opencvAudit?.closedLoopLoopsExecuted ?? (job?.issues?.filter((i) => i.retestStatus === "retested_persisted" || i.retestStatus === "retested_resolved").length || 0)}
                </div>
                <div className="text-xs font-semibold text-white mt-0.5">Closed-Loop Rechecks</div>
                <div className="text-[10px] text-slate-400">
                  Autonomous DOM &amp; visual retests
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                <div className="text-xl font-bold font-mono text-amber-400">
                  {job?.issues?.length || 0}
                </div>
                <div className="text-xs font-semibold text-white mt-0.5">Issues &amp; Findings</div>
                <div className="text-[10px] text-slate-400">
                  {job?.report?.verificationBreakdown ? `${job.report.verificationBreakdown.detectedDefectsCount} defect(s) • ${job.report.verificationBreakdown.partialClientOnlyCount} client-only upload(s)` : "DOM / Responsive / Upload"}
                </div>
              </div>
            </div>

            {/* Developer Triage Summary (3 Key Questions) & Executive Summary */}
            {job?.report && (
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-white block">🎯 Developer Triage Summary &amp; Executive Overview</span>
                  {job.report.verificationBreakdown && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                        ✓ {job.report.verificationBreakdown.verifiedFunctionalCount} Verified
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-800/60">
                        ✗ {job.report.verificationBreakdown.detectedDefectsCount} Defects
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800/60">
                        ⚠ {job.report.verificationBreakdown.partialClientOnlyCount} Client-Only Uploads (2/5 Stages)
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-slate-300 leading-relaxed">{job.report.summary}</p>
                {job.report.recommendations && job.report.recommendations.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <span className="font-semibold text-slate-400 text-[11px] block">Evidence-Backed Recommendations:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                      {job.report.recommendations.map((rec, rIdx) => (
                        <li key={rIdx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Multi-Device Responsive Testing Section */}
            {(Boolean(job?.responsiveResults?.length) || Boolean(job?.report?.responsiveBreakdown?.length)) && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                    Multi-Device Responsive Breakdown
                  </h4>
                  {typeof job?.report?.responsiveScore === "number" && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        job.report.responsiveScore >= 90
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : job.report.responsiveScore >= 70
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : "bg-rose-950 text-rose-300 border border-rose-800"
                      }`}
                    >
                      Responsive Score: {job.report.responsiveScore}%
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(job?.responsiveResults || job?.report?.responsiveBreakdown || []).map((device) => {
                    const isPassed = device.status === "passed"
                    const isWarning = device.status === "warning"
                    return (
                      <div
                        key={device.name}
                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-xs flex items-center gap-1.5">
                              <span>{device.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {device.width}×{device.height}
                              </span>
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                                isPassed
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                  : isWarning
                                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                                  : "bg-rose-950 text-rose-300 border border-rose-800"
                              }`}
                            >
                              {device.status}
                            </span>
                          </div>

                          {device.screenshotUrl && (
                            <div
                              onClick={() => setScreenshotModal(device.screenshotUrl!)}
                              className="mt-2 aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative cursor-pointer hover:border-cyan-500/60 transition group"
                              title="Click to view full screenshot"
                            >
                              <img
                                src={device.screenshotUrl}
                                alt={`${device.name} layout screenshot`}
                                className="w-full h-full object-cover object-top"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-xs text-white font-medium">
                                View Full Size ↗
                              </div>
                            </div>
                          )}

                          <div className="mt-2 space-y-1 text-[11px]">
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Horizontal Overflow:</span>
                              <span
                                className={`font-mono font-bold ${
                                  device.overflowDetected ? "text-rose-400" : "text-emerald-400"
                                }`}
                              >
                                {device.overflowDetected ? `+${device.overflowPixels || 0}px` : "None (0px)"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Touch Target Violations:</span>
                              <span
                                className={`font-mono font-bold ${
                                  (device.touchTargetViolations || 0) > 0 ? "text-amber-400" : "text-slate-300"
                                }`}
                              >
                                {device.touchTargetViolations || 0}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Broken Images:</span>
                              <span
                                className={`font-mono font-bold ${
                                  (device.brokenImages || 0) > 0 ? "text-rose-400" : "text-slate-300"
                                }`}
                              >
                                {device.brokenImages || 0}
                              </span>
                            </div>
                          </div>
                        </div>

                        {(device.annotatedScreenshotUrl || device.visualDiffHeatmapUrl) && (
                          <div className="pt-2 border-t border-slate-800 flex items-center gap-1.5 flex-wrap">
                            {device.annotatedScreenshotUrl && (
                              <button
                                type="button"
                                onClick={() => setScreenshotModal(device.annotatedScreenshotUrl!)}
                                className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/40 text-cyan-200 text-[10px] font-semibold cursor-pointer transition"
                              >
                                👁️ OpenCV Contours
                              </button>
                            )}
                            {device.visualDiffHeatmapUrl && (
                              <button
                                type="button"
                                onClick={() => setScreenshotModal(device.visualDiffHeatmapUrl!)}
                                className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 text-[10px] font-semibold cursor-pointer transition"
                              >
                                🔥 Diff Heatmap ({device.diffFromDesktopPct ?? 0}%)
                              </button>
                            )}
                          </div>
                        )}

                        {device.observations && device.observations.length > 0 && (
                          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 leading-relaxed">
                            {device.observations.join(" ")}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* OpenCV 5-Pillar Visual Intelligence & Regression Section */}
            {(() => {
              const cv = job?.opencvAudit || job?.report?.opencvAudit
              const respList = job?.responsiveResults || job?.report?.responsiveBreakdown || []
              const stepShots = (plan?.steps || []).filter((s) => Boolean(s.screenshotUrl))
              const visualDiffs = cv?.visualDiffs || []
              const annotatedShots = cv?.annotatedScreenshots || []
              const defects = cv?.defects || []
              const frameTimeline = cv?.frameTimeline || []
              const stabilityScore = cv?.visualStabilityScore ?? (job?.report?.responsiveScore ?? 100)

              return (
                <div className="space-y-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-cyan-400" />
                        OpenCV Visual Intelligence &amp; 5-Pillar Audit
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        1. Visual Regression • 2. Responsive Layout • 3. Missing-Element &amp; Defect Detection • 4. Frame &amp; Video Analysis • 5. Closed-Loop Autonomous Re-Verification
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                      Visual Stability: {stabilityScore}% ({cv?.engine || "opencv-js"})
                    </span>
                  </div>

                  {/* 5 OpenCV Pillars Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-300 text-[11px]">1. Visual Regression</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60">
                          {visualDiffs.length || Math.max(0, respList.length - 1)} diffs
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Before/after &amp; cross-viewport pixel absdiff heatmaps + layout shift detection.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-300 text-[11px]">2. Responsive Layout</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
                          {annotatedShots.length || respList.length} viewports
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Desktop, Tablet &amp; Mobile Canny contour mapping for clipped or overlapping UI.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300 text-[11px]">3. Missing &amp; Blank UI</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                          {defects.length} flagged
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Detects blank low-edge regions &amp; cross-checks live DOM to confirm missing elements.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-300 text-[11px]">4. Frame &amp; Video</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                          {frameTimeline.length || stepShots.length} frames
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Samples interaction frames &amp; recordings to pinpoint when UI updates or breaks.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300 text-[11px]">5. Closed-Loop Agent</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                          {cv?.closedLoopLoopsExecuted ?? defects.length} loops
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Feeds visual defects back into agent to scroll, re-inspect DOM &amp; verify persistence.
                      </p>
                    </div>
                  </div>

                  {/* Visual Diff Heatmaps & Annotated Contours Gallery */}
                  {(visualDiffs.length > 0 || annotatedShots.length > 0) && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-bold text-slate-300 block">
                        OpenCV Visual Diff Heatmaps &amp; Canny Bounding-Box Overlays
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {visualDiffs.map((diff) => (
                          <div
                            key={diff.id}
                            className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-semibold text-white truncate" title={diff.label}>
                                🔥 {diff.label}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800 shrink-0">
                                Δ {diff.diffPercentage}%
                              </span>
                            </div>
                            {diff.diffHeatmapUrl && (
                              <div
                                onClick={() => setScreenshotModal(diff.diffHeatmapUrl!)}
                                className="aspect-video rounded overflow-hidden bg-slate-900 border border-slate-800 cursor-pointer hover:border-rose-500/60 transition relative group"
                              >
                                <img
                                  src={diff.diffHeatmapUrl}
                                  alt={diff.label}
                                  className="w-full h-full object-cover object-top"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[11px] text-white font-semibold">
                                  Enlarge Diff Heatmap ↗
                                </div>
                              </div>
                            )}
                            <p className="text-[10px] text-slate-400">{diff.summary}</p>
                          </div>
                        ))}

                        {annotatedShots.map((shot, idx) => (
                          <div
                            key={`${shot.label}-${idx}`}
                            className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-semibold text-white truncate">
                                🎯 {shot.label}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 shrink-0">
                                {shot.elementsAnnotated} boxes
                              </span>
                            </div>
                            <div
                              onClick={() => setScreenshotModal(shot.annotatedImageUrl)}
                              className="aspect-video rounded overflow-hidden bg-slate-900 border border-slate-800 cursor-pointer hover:border-cyan-500/60 transition relative group"
                            >
                              <img
                                src={shot.annotatedImageUrl}
                                alt={shot.label}
                                className="w-full h-full object-cover object-top"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[11px] text-white font-semibold">
                                Enlarge Annotated Contours ↗
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Viewport {shot.viewport} • Avg Canny Edge Density: {Math.round(shot.edgeDensityAvg * 100)}%
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected Visual Defects & Closed-Loop DOM Verification */}
                  {defects.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-bold text-slate-300 block">
                        Visual Defects &amp; Closed-Loop DOM Confirmation ({defects.length})
                      </span>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {defects.map((def) => (
                          <div
                            key={def.id}
                            className="p-2 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.2 rounded font-mono text-[10px] uppercase bg-amber-950 text-amber-300 border border-amber-800">
                                  {def.type.replace(/_/g, " ")}
                                </span>
                                <span className="text-slate-400 font-mono text-[10px]">{def.viewport}</span>
                                {def.domConfirmed && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                                    ✓ DOM Confirmed
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-300 truncate" title={def.domConfirmationDetail}>
                                {def.domConfirmationDetail}
                              </p>
                            </div>
                            <div className="text-[10px] font-mono shrink-0 text-right">
                              <div className="text-indigo-300">{def.closedLoopAction || "Closed-loop verified"}</div>
                              <div className={def.defectPersisted ? "text-rose-400" : "text-emerald-400"}>
                                {def.defectPersisted ? "Persisted after re-check" : "Resolved on scroll/re-check"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Session Video Recording */}
            {(job?.report?.recordingUrl || job?.recordingUrl || (job?.recordingSegments && job.recordingSegments.length > 0)) && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-indigo-400" />
                  Session Video Recording
                </h4>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  {(job?.report?.recordingUrl || job?.recordingUrl) && (
                    <video
                      controls
                      preload="metadata"
                      src={job.report?.recordingUrl || job.recordingUrl}
                      className="w-full max-h-[420px] rounded-lg border border-slate-700 bg-black"
                      aria-label="Recorded session video"
                    />
                  )}
                  {job?.recordingSegments && job.recordingSegments.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {job.recordingSegments.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-indigo-300 hover:text-indigo-200 font-medium transition flex items-center gap-1.5"
                        >
                          <Film className="h-3.5 w-3.5" />
                          Segment {index + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Captured Step Evidence Gallery with Screen Filter */}
            {plan && plan.steps.some((s) => s.screenshotUrl) && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Captured Step Evidence ({filteredEvidenceSteps.length})
                  </h4>
                  {testedScreensList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {testedScreensList.map((sName) => (
                        <button
                          key={sName}
                          type="button"
                          onClick={() => {
                            const next = evidenceSearchQuery.toLowerCase() === sName.toLowerCase() ? "" : sName
                            setEvidenceSearchInput(next)
                            setEvidenceSearchQuery(next)
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                            evidenceSearchQuery.toLowerCase() === sName.toLowerCase()
                              ? "bg-indigo-600 text-white font-bold"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          }`}
                        >
                          {sName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredEvidenceSteps.map((step) => (
                    <div
                      key={step.id}
                      onClick={() => setScreenshotModal(step.screenshotUrl!)}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/60 transition cursor-pointer group"
                    >
                      <div className="aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800/80 relative">
                        <img
                          src={step.screenshotUrl}
                          alt={step.targetName}
                          className="w-full h-full object-cover object-top"
                        />
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono bg-slate-950/80 text-white border border-slate-700">
                          {step.status}
                        </div>
                      </div>
                      <div className="mt-2 text-xs">
                        <div className="font-bold text-white truncate">{step.targetName}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">{step.screenName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tested Edge Cases (when available from workflow spec or run) */}
            {activeEdgeCases.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Tested Edge Cases ({activeEdgeCases.length})
                </h4>
                <div className="space-y-2">
                  {activeEdgeCases.map((ec: FeatureWorkflowEdgeCase) => {
                    const isPassed = ec.status === "passed" || job?.status === "completed"
                    return (
                      <div
                        key={ec.id}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-purple-400 text-[11px]">{ec.id}</span>
                            <span className="font-bold text-white">{ec.name}</span>
                            <span className="text-[9px] font-mono uppercase px-1 rounded bg-slate-800 text-slate-400">
                              {ec.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">{ec.description}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                            isPassed
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {isPassed ? "PASSED" : ec.status || "PENDING"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Issues List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Detected Issues &amp; Exceptions ({job?.issues?.length || 0})
              </h4>
              {job?.issues && job.issues.length > 0 ? (
                job.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-400 uppercase font-mono text-[10px]">
                        {issue.type} · {issue.severity}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{issue.timestamp}</span>
                    </div>
                    <div className="text-slate-200 font-medium">{issue.description}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{issue.screenUrl}</div>
                  </div>
                ))
              ) : (
                <div className="p-6 rounded-xl bg-slate-900/30 border border-slate-800 text-center text-xs text-slate-500">
                  No critical exceptions or broken flows detected so far.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {screenshotModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setScreenshotModal(null)}
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 p-2 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={screenshotModal} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded" />
            <button
              type="button"
              onClick={() => setScreenshotModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-950/80 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
