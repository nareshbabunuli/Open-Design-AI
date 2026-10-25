"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import {
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Map as MapIcon,
  ListChecks,
  Activity,
  FileText,
  Send,
  Loader2,
  HelpCircle,
  Compass,
  ShieldCheck,
  ArrowRight,
  Clock,
  RotateCcw,
  Image as ImageIcon,
  Check,
  Ban,
  Maximize2,
  ChevronRight,
  Video,
  Bot,
  User,
  MessageSquare,
  Wand2,
  Trash2,
  Paperclip,
  Camera,
  ChevronDown,
  Settings,
  Key,
  Mail,
  X,
  Square,
  ShieldAlert,
  FastForward,
  Zap,
  Search,
  FolderOpen,
} from "lucide-react"
import type {
  AutomationJob,
  FullAppTestPlan,
  FeatureWorkflowSpec,
  FeatureWorkflowEdgeCase,
  TestPlanStep,
  FlowGraph,
} from "@/lib/ai-automation/types"
import TestFlowGraph from "./test-flow-graph"
import { buildFigmaWorkflowMap, isFullAppCommand } from "@/lib/ai-automation/full-app-utils"
import AiConfigPanel from "./ai-config-panel"

interface FeatureWorkflowViewProps {
  job: AutomationJob | null
  isRunning: boolean
  targetUrl: string
  activeSubTab?: "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage"
  onSubTabChange?: (tab: "chat" | "map" | "screens" | "plan" | "execution" | "files" | "coverage") => void
  projectId?: string
  onStartWorkflowTest: (workflowPrompt: string, role?: string, workflowName?: string, attachedImg?: string | null) => Promise<void>
  onStartFullAppTest?: () => Promise<void>
  onCancelJob?: () => void
  onOpenMapPage?: () => void
  isMapPageActive?: boolean
  testingMode?: "full_app" | "feature_workflow"
  onSelectTestingMode?: (mode: "full_app" | "feature_workflow") => void
  fullPageView?: boolean
  hideSubNav?: boolean
  isFullStage?: boolean
  onToggleFullStage?: () => void
  onPreviewPlanChange?: (plan: FullAppTestPlan | null) => void
  onAnalyzedSpecChange?: (spec: FeatureWorkflowSpec | null) => void

  // AI Configuration & Provider display
  aiProvider?: "nebius" | "omnirouter" | "local"
  onUpdateAiProvider?: (provider: "nebius" | "omnirouter" | "local") => void
  nebiusApiKey?: string
  onUpdateNebiusApiKey?: (key: string) => void
  selectedAiModel?: string
  onUpdateAiModel?: (model: string) => void
  omniRouterBaseUrl?: string
  onUpdateOmniRouterUrl?: (url: string) => void
  omniRouterKey?: string
  onUpdateOmniRouterKey?: (key: string) => void
  omniRouterModel?: string
  onUpdateOmniRouterModel?: (model: string) => void
  localAiBaseUrl?: string
  onUpdateLocalBaseUrl?: (url: string) => void
  isTestingAiConnection?: boolean
  onTestAiConnection?: () => Promise<void> | void
  aiConnectionTestResult?: { success: boolean; message: string } | null
  onOpenAiConfig?: () => void

  // Live Screen Capture & Attachments
  onCaptureCurrentScreen?: () => void

  // Target Project & Routes Presets
  selectedProjectDir?: string
  onSelectProjectDir?: (dir: string) => void
  availableProjects?: Array<{ name: string; path: string; defaultPort?: number }>
  discoveredRoutes?: Array<{ path: string; url: string; sourceFile?: string }>
  onRescanRoutes?: () => void
  isScanningRoutes?: boolean
  onGenerateTestData?: () => void
  onUploadTestFiles?: (files: FileList) => void
  uploadFilesDir?: string
  onSelectUploadFilesDir?: (dir: string) => void
  availableTestFolders?: Array<{ label: string; path: string; filesCount: number }>
  testFilesCount?: number
  onOpenTestDataModal?: () => void
  isGeneratingTestData?: boolean
  onNavigateUrl?: (url: string) => void

  // Verification & Credentials forms
  onConfirmVerification?: (code?: string, url?: string) => Promise<void>
  onSkipVerification?: () => void
  onSaveSettingsCredentials?: (creds: Record<string, string>) => Promise<void>
  onSkipSettingsCredentials?: () => void
  onUnblockWorkflows?: (options: {
    mode: "synthetic_data" | "credentials" | "retry" | "skip"
    username?: string
    password?: string
    screenId?: string
  }) => Promise<void>

  // Laya System-1 Fast Reflex State
  enableLaya?: boolean
  onToggleLaya?: (enabled: boolean) => void
  layaBaseUrl?: string
  onUpdateLayaUrl?: (url: string) => void
  isLayaLive?: boolean
}

export interface BotWorkflowChatMessage {
  id: string
  sender: "user" | "agent"
  text: string
  timestamp: string
  status?: "thinking" | "completed" | "error"
  role?: string
  spec?: FeatureWorkflowSpec
  plan?: FullAppTestPlan
  workflowPrompt?: string
  imageUrl?: string
  isBlockedDiagnostic?: boolean
  blockedDetails?: {
    screens: Array<{ name: string; path?: string; reason?: string }>
    count: number
  }
}

const CONVERSATIONAL_PROMPT_SUGGESTIONS = [
  {
    label: "👤 Act as Customer & test checkout",
    prompt: "Act as a customer and test the checkout flow with synthetic payment details",
  },
  {
    label: "📝 Act as New User & test signup",
    prompt: "Act as a new user and test registration with valid synthetic credentials",
  },
  {
    label: "⚙️ Act as Admin & verify settings",
    prompt: "Act as an admin and test user roles and project settings",
  },
  {
    label: "⚠️ Test invalid inputs & edge cases",
    prompt: "Test form validation with empty required fields and invalid formats",
  },
]

export default function FeatureWorkflowView({
  job,
  isRunning,
  targetUrl,
  projectId = targetUrl || "default",
  activeSubTab = "chat",
  onSubTabChange,
  onStartWorkflowTest,
  onStartFullAppTest,
  onCancelJob,
  onOpenMapPage,
  isMapPageActive = false,
  testingMode = "feature_workflow",
  onSelectTestingMode,
  fullPageView = true,
  hideSubNav = false,
  isFullStage,
  onToggleFullStage,
  onPreviewPlanChange,
  onAnalyzedSpecChange,
  aiProvider = "nebius",
  onUpdateAiProvider,
  nebiusApiKey = "",
  onUpdateNebiusApiKey,
  selectedAiModel = "nvidia/Nemotron-3-Nano-Omni",
  onUpdateAiModel,
  omniRouterBaseUrl = "https://api.unorouter.com/v1",
  onUpdateOmniRouterUrl,
  omniRouterKey = "",
  onUpdateOmniRouterKey,
  omniRouterModel = "fast",
  onUpdateOmniRouterModel,
  localAiBaseUrl = "http://localhost:11434/v1",
  onUpdateLocalBaseUrl,
  isTestingAiConnection = false,
  onTestAiConnection,
  aiConnectionTestResult,
  onOpenAiConfig,
  onCaptureCurrentScreen,
  selectedProjectDir = "landlord-accounting-portal",
  onSelectProjectDir,
  availableProjects = [],
  discoveredRoutes = [],
  onRescanRoutes,
  isScanningRoutes = false,
  onGenerateTestData,
  onUploadTestFiles,
  uploadFilesDir = "",
  onSelectUploadFilesDir,
  availableTestFolders = [],
  testFilesCount,
  onOpenTestDataModal,
  isGeneratingTestData = false,
  onNavigateUrl,
  onConfirmVerification,
  onSkipVerification,
  onSaveSettingsCredentials,
  onSkipSettingsCredentials,
  onUnblockWorkflows,
  enableLaya = true,
  onToggleLaya,
  layaBaseUrl = "http://127.0.0.1:8000",
  onUpdateLayaUrl,
  isLayaLive = false,
}: FeatureWorkflowViewProps) {
  const [chatMessages, setChatMessages] = useState<BotWorkflowChatMessage[]>([
    {
      id: "bot-welcome",
      sender: "agent",
      text: "👋 I'm your AI Testing Bot. Describe any feature or workflow you want to test naturally.\n\nYou can tell me to act as any role (e.g. \"Act as a customer and test checkout\", \"Act as an admin to manage users\", or \"Test user signup with invalid email\"). I'll identify the path, generate a pre-flight plan, and test edge cases.",
      timestamp: new Date().toISOString(),
      status: "completed",
    },
  ])
  const [chatInput, setChatInput] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzedSpec, setAnalyzedSpec] = useState<FeatureWorkflowSpec | null>(null)
  const [previewPlan, setPreviewPlan] = useState<FullAppTestPlan | null>(null)
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState<string | null>(null)
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false)
  const [verificationUrlInput, setVerificationUrlInput] = useState("")
  const [verificationCodeInput, setVerificationCodeInput] = useState("")
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [showSettingsSecrets, setShowSettingsSecrets] = useState<Record<string, boolean>>({})
  const [isSubmittingSettings, setIsSubmittingSettings] = useState(false)
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false)
  const [blockedUsernameInput, setBlockedUsernameInput] = useState("")
  const [blockedPasswordInput, setBlockedPasswordInput] = useState("")
  const [isUnblockingWorkflows, setIsUnblockingWorkflows] = useState(false)
  const [screensSearchInput, setScreensSearchInput] = useState("")
  const [screensSearchQuery, setScreensSearchQuery] = useState("")

  const chatBottomRef = useRef<HTMLDivElement>(null)

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages, isAnalyzing])

  // Determine active plan (from current live job or locally generated preview)
  const activePlan = useMemo(() => {
    if (job?.fullAppTestPlan && job.fullAppTestPlan.screens?.length > 0) {
      return job.fullAppTestPlan
    }
    return previewPlan
  }, [job?.fullAppTestPlan, previewPlan])

  const filteredScreens = useMemo(() => {
    const list = activePlan?.screens || []
    const q = screensSearchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) => {
      const name = (s.name || "").toLowerCase()
      const path = (s.path || "").toLowerCase()
      const id = (s.id || "").toLowerCase()
      return name.includes(q) || path.includes(q) || id.includes(q)
    })
  }, [activePlan?.screens, screensSearchQuery])

  // Focused Figma workflow map
  const flowGraph: FlowGraph | null = useMemo(() => {
    if (job?.flowGraph && job.flowGraph.nodes.length > 0) return job.flowGraph
    if (activePlan && activePlan.screens.length > 0) return buildFigmaWorkflowMap(activePlan)
    return null
  }, [job?.flowGraph, activePlan])

  // Active spec (from running job or local analysis)
  const currentSpec = useMemo(() => {
    return job?.featureWorkflowSpec || analyzedSpec
  }, [job?.featureWorkflowSpec, analyzedSpec])

  // Auto-fill test credentials from saved simulator storage if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedStr = localStorage.getItem("simulator_auth_credentials")
        if (savedStr) {
          const parsed = JSON.parse(savedStr)
          if (parsed.username && !blockedUsernameInput) {
            setBlockedUsernameInput(parsed.username)
          }
          if (parsed.password && !blockedPasswordInput) {
            setBlockedPasswordInput(parsed.password)
          }
        }
      } catch {}
    }
  }, [job?.id])

  // Identify blocked steps and screens across the current plan or job
  const blockedSteps = useMemo(() => {
    return activePlan?.steps?.filter((s) => s.status === "blocked") || []
  }, [activePlan?.steps])

  const blockedScreenNames = useMemo(() => {
    const names = new Set<string>()
    blockedSteps.forEach((s) => {
      if (s.screenName) names.add(s.screenName)
      else if (s.screenId) names.add(s.screenId)
    })
    if (job?.authState === "awaiting_credentials" || job?.authState === "login_failed") {
      names.add("Authentication / Login Wall")
    }
    if (activePlan?.screens) {
      activePlan.screens.forEach((s) => {
        const hasBlockedStepOnScreen = blockedSteps.some(
          (step) => step.screenId === s.id || step.screenName === s.name
        )
        const isAuthAwaiting = job?.authState === "awaiting_credentials" || job?.authState === "login_failed"
        const isActuallyBlocked =
          (s as any).testStatus === "blocked" ||
          hasBlockedStepOnScreen ||
          (s.isLoginWall && isAuthAwaiting && job?.authState !== "logged_in")

        if (isActuallyBlocked) names.add(s.name || s.path)
      })
    }
    return Array.from(names)
  }, [blockedSteps, job?.authState, activePlan?.screens])

  // Execute unblock action (credentials, synthetic data, retry, or skip)
  const handleExecuteUnblock = async (
    mode: "synthetic_data" | "credentials" | "retry" | "skip",
    customUser?: string,
    customPass?: string
  ) => {
    setIsUnblockingWorkflows(true)
    const username = (customUser ?? blockedUsernameInput).trim()
    const password = (customPass ?? blockedPasswordInput).trim()
    try {
      if (onUnblockWorkflows) {
        await onUnblockWorkflows({ mode, username, password })
      } else if (job?.id) {
        await fetch("/api/ai-automation/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            action: "unblock_workflows",
            mode,
            username,
            password,
          }),
        })
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `unblock-ack-${Date.now()}`,
          sender: "agent",
          text:
            mode === "skip"
              ? "⏭️ Skipped blocked steps. Continuing with remaining workflows."
              : mode === "credentials"
              ? `🔑 Credentials applied for "${username || "account"}". Unblocked workflows and resumed testing!`
              : mode === "synthetic_data"
              ? "⚡ Auto-filled valid synthetic test data across required inputs. Unblocked workflows and resumed testing!"
              : "🔄 Cleared blockers and retrying workflows now!",
          timestamp: new Date().toISOString(),
          status: "completed",
        },
      ])
      setBlockedUsernameInput("")
      setBlockedPasswordInput("")
    } catch (err: any) {
      console.error("Failed to unblock workflows:", err)
    } finally {
      setIsUnblockingWorkflows(false)
    }
  }

  // Proactively ask diagnostic questions in chat when screens or workflows are blocked
  useEffect(() => {
    if (blockedScreenNames.length === 0 && job?.authState !== "awaiting_credentials") return
    const diagId = `diag-blocked-${job?.id || "run"}-${blockedScreenNames.join("-")}-${blockedSteps.length}`
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === diagId)) return prev
      return [
        ...prev,
        {
          id: diagId,
          sender: "agent",
          text: `⚠️ **I found ${blockedScreenNames.length} blocked screen${blockedScreenNames.length > 1 ? "s" : ""} on your workflows:**\n${blockedScreenNames.map((s) => `• **${s}**`).join("\n")}\n\n**Let's get back on track! Quick questions to unblock:**\n1. 🔑 **Credentials:** Does this screen require test account login? (Type credentials or enter below)\n2. ⚡ **Synthetic Data:** Should I auto-generate valid synthetic accounts and form data?\n3. 🔄 **Retry:** Should I dismiss overlays/modals and retry these actions?\n4. ⏭️ **Skip:** Or skip these blocked steps to continue the rest of the test?`,
          timestamp: new Date().toISOString(),
          status: "completed",
          isBlockedDiagnostic: true,
          blockedDetails: {
            screens: blockedScreenNames.map((n) => ({ name: n })),
            count: blockedScreenNames.length,
          },
        },
      ]
    })
  }, [blockedScreenNames, blockedSteps.length, job?.authState, job?.id])

  // When a test completes, post a summary in chat and automatically switch from execution back to chat
  useEffect(() => {
    if (job?.status === "completed" && job?.id) {
      const summaryId = `job-completed-summary-${job.id}`
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === summaryId)) return prev
        const pCount = activePlan?.steps?.filter((s) => s.status === "passed").length || 0
        const fCount = activePlan?.steps?.filter((s) => s.status === "failed").length || 0
        const bCount = activePlan?.steps?.filter((s) => s.status === "blocked").length || 0
        return [
          ...prev,
          {
            id: summaryId,
            sender: "agent",
            text: `🎉 **Workflow Test Execution Completed!**\n\n• **Steps Passed:** ${pCount}\n• **Steps Failed:** ${fCount}\n• **Steps Blocked:** ${bCount}\n• **Screens Discovered:** ${activePlan?.screens?.length || 0}\n\nYou can review step details in the **Plan** or **Map** tabs, ask me follow-up questions here in chat, or re-run testing.`,
            timestamp: new Date().toISOString(),
            status: "completed",
          },
        ]
      })

      // If user was watching execution, return to chat to see completed results and follow up
      if (activeSubTab === "execution" && onSubTabChange) {
        onSubTabChange("chat")
      }
    }
  }, [job?.status, job?.id, activeSubTab, onSubTabChange, activePlan])

  // Natural language chat / workflow analyzer
  const handleSendChatMessage = async (customPrompt?: string) => {
    const text = (customPrompt || chatInput).trim()
    if (!text || isAnalyzing) return

    setChatInput("")
    setIsAnalyzing(true)

    // Extract role if user wrote "Act as [role]..." or "As a [role]..."
    let detectedRole: string | undefined
    const actMatch = text.match(
      /(?:act\s+as\s+(?:a|an)?\s*([a-zA-Z0-9_\- ]+?)(?:\s+(?:and|to|who|testing|test)|\s*$)|(?:as\s+a|as\s+an)\s+([a-zA-Z0-9_\- ]+?)(?:\s+(?:user|and|to|who|testing|test)|\s*$))/i
    )
    if (actMatch) {
      detectedRole = (actMatch[1] || actMatch[2])?.trim()
    }

    const userMsg: BotWorkflowChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toISOString(),
      role: detectedRole,
    }

    // Check if user answered the unblock questionnaire in chat
    if (blockedScreenNames.length > 0 || job?.authState === "awaiting_credentials") {
      const isSkip = /^\s*(skip|bypass|ignore)\b/i.test(text)
      const isRetry = /^\s*(retry|try again|retest|re-test|unblock)\b/i.test(text)
      const isSynthetic = /^\s*(synthetic|auto-?fill|dummy|fake|generate)\b/i.test(text)
      const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
      const passMatch = text.match(/(?:pass(?:word)?[:=\s]+)(\S+)/i)

      if (isSkip) {
        setChatMessages((prev) => [...prev, userMsg])
        setIsAnalyzing(false)
        await handleExecuteUnblock("skip")
        return
      }
      if (isSynthetic) {
        setChatMessages((prev) => [...prev, userMsg])
        setIsAnalyzing(false)
        await handleExecuteUnblock("synthetic_data")
        return
      }
      if (isRetry && !emailMatch) {
        setChatMessages((prev) => [...prev, userMsg])
        setIsAnalyzing(false)
        await handleExecuteUnblock("retry")
        return
      }
      if (emailMatch || passMatch) {
        const u = emailMatch ? emailMatch[0] : (text.match(/(?:user(?:name)?|login|email)[:=\s]+(\S+)/i)?.[1] || "")
        const p = passMatch ? passMatch[1] : ""
        setChatMessages((prev) => [...prev, userMsg])
        setIsAnalyzing(false)
        await handleExecuteUnblock("credentials", u, p)
        return
      }
    }

    if (isFullAppCommand(text)) {
      const thinkingId = `agent-think-${Date.now()}`
      setChatMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: thinkingId,
          sender: "agent",
          text: "🚀 **Full App Test initiated!** Running comprehensive systematic discovery, mapping, and complete test plan generation across the application.",
          timestamp: new Date().toISOString(),
          status: "completed",
        },
      ])
      setIsAnalyzing(false)
      if (onStartFullAppTest) {
        await onStartFullAppTest()
      } else {
        await onStartWorkflowTest(text, undefined, "Full App Test")
      }
      if (onSubTabChange) onSubTabChange("plan")
      return
    }

    const thinkingId = `agent-think-${Date.now()}`
    const thinkingMsg: BotWorkflowChatMessage = {
      id: thinkingId,
      sender: "agent",
      text: detectedRole
        ? `Analyzing workflow acting as "${detectedRole}"... Identifying screens, synthetic data, and edge cases.`
        : `Analyzing feature workflow... Identifying path, synthetic data, and edge cases.`,
      timestamp: new Date().toISOString(),
      status: "thinking",
    }

    setChatMessages((prev) => [...prev, userMsg, thinkingMsg])

    try {
      const resolvedApiKey = aiProvider === "omnirouter" ? omniRouterKey : nebiusApiKey
      const resolvedBaseUrl = aiProvider === "omnirouter" ? omniRouterBaseUrl : (aiProvider === "local" ? localAiBaseUrl : undefined)
      const resolvedModel = aiProvider === "omnirouter" ? omniRouterModel : selectedAiModel

      const res = await fetch("/api/ai-automation/workflow-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowPrompt: text,
          targetUrl,
          openRouterApiKey: resolvedApiKey,
          aiModel: resolvedModel,
          aiBaseUrl: resolvedBaseUrl,
          layaBaseUrl: enableLaya ? (layaBaseUrl || "http://127.0.0.1:8000") : undefined,
        }),
      })
      const data = await res.json()
      if (data.success && data.spec) {
        setAnalyzedSpec(data.spec)
        setPreviewPlan(data.plan)
        onAnalyzedSpecChange?.(data.spec)
        onPreviewPlanChange?.(data.plan || null)
        if (detectedRole) setActiveRole(detectedRole)

        const responseText = `I've analyzed the **${data.spec.workflowName}** workflow${
          detectedRole ? ` acting as **${detectedRole}**` : ""
        }.\n\n🎯 **Goal:** ${data.spec.userGoal}\n📍 **Starting point:** ${
          data.spec.startingPoint
        }\n🔄 **Target screens:** ${data.spec.likelyScreens.join(" → ")}\n🧪 **Edge cases planned:** ${
          data.spec.edgeCases?.length || 0
        } scenarios.`

        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === thinkingId
              ? {
                  ...msg,
                  text: responseText,
                  status: "completed",
                  spec: data.spec,
                  plan: data.plan,
                  role: detectedRole,
                  workflowPrompt: text,
                }
              : msg
          )
        )
      } else {
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === thinkingId
              ? {
                  ...msg,
                  text: `I couldn't fully parse that workflow: ${data.error || "Please describe the feature in a bit more detail."}`,
                  status: "error",
                }
              : msg
          )
        )
      }
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? {
                ...msg,
                text: `Failed to analyze workflow: ${err?.message || "Network error. Please try again."}`,
                status: "error",
              }
            : msg
        )
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Confirm and start execution
  const handleRunTest = async (promptToRun?: string, roleOverride?: string, nameOverride?: string) => {
    const text = (promptToRun || currentSpec?.userGoal || "").trim()
    if (!text) return
    const role = roleOverride || activeRole || "Customer"
    const name = nameOverride || currentSpec?.workflowName || "Workflow test"
    await onStartWorkflowTest(`[User role: ${role}] [Workflow: ${name}] ${text}`, role, name)
    if (onSubTabChange) onSubTabChange("plan")
  }

  const passedSteps = activePlan?.steps?.filter((s) => s.status === "passed").length || 0
  const totalSteps = activePlan?.steps?.length || 0
  const coveragePct = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. UNIFIED STAGE NAVIGATION BAR (shown only when standalone) */}
      {!hideSubNav && (
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-2 text-xs shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-1">
            {[
              { id: "chat", label: "Chat", icon: MessageSquare, isLive: isRunning },
              { id: "plan", label: "Plan & Screens", icon: ListChecks, count: activePlan?.steps?.length },
              { id: "map", label: "Flow Map", icon: MapIcon, count: activePlan?.screens?.length },
              {
                id: "coverage",
                label: "Report",
                icon: ShieldCheck,
                count: job?.edgeCasesTested?.length ? job.edgeCasesTested.length : coveragePct > 0 ? `${coveragePct}%` : undefined,
              },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive = activeSubTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSubTabChange && onSubTabChange(tab.id as any)}
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
                        isActive ? "bg-indigo-800 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.isLive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. LIVE PROGRESS BAR WHEN RUNNING */}
      {isRunning && (
        <div className="h-1 bg-slate-900 w-full overflow-hidden shrink-0">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${job?.progress || 10}%` }}
          />
        </div>
      )}

      {/* 3. MAIN SUBTAB VIEWS */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        {/* SUBTAB 0: TESTING BOT CHAT CONVERSATION */}
        {(
          <div className="h-full flex flex-col max-w-4xl mx-auto space-y-2.5">
            {/* Minimal Clear Chat action (only shown once conversation has messages beyond welcome) */}
            {chatMessages.length > 1 && (
              <div className="flex items-center justify-end text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([
                      {
                        id: `welcome-${Date.now()}`,
                        sender: "agent",
                        text: "👋 I'm your AI Testing Bot. Describe any feature or workflow you want to test naturally.\n\nYou can tell me to act as any role (e.g. \"Act as a customer and test checkout\", \"Act as an admin to manage users\", or \"Test user signup with invalid email\"). I'll identify the path, generate a pre-flight plan, and test edge cases.",
                        timestamp: new Date().toISOString(),
                        status: "completed",
                      },
                    ])
                  }}
                  className="px-2 py-0.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 text-[11px] flex items-center gap-1 transition cursor-pointer"
                  title="Clear chat history"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Chat</span>
                </button>
              </div>
            )}

            {/* Live running status banner */}
            {isRunning && (
              <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/50 text-xs flex items-center justify-between gap-3 shadow-md shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 className="h-4 w-4 text-indigo-400 animate-spin shrink-0" />
                  <span className="font-semibold text-white truncate">
                    Testing in progress: {job?.currentStep || "Executing actions..."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSubTabChange && onSubTabChange("plan")}
                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                >
                  View Active Plan →
                </button>
              </div>
            )}

            {/* Chat Message Stream */}
            <div className="flex-1 min-h-[350px] overflow-y-auto custom-scrollbar p-3.5 space-y-3 rounded-2xl bg-slate-950/70 border border-slate-800">
              {chatMessages.map((msg) => {
                const isUser = msg.sender === "user"
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
                      {isUser ? (
                        <>
                          <span>You</span>
                          {msg.role && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                              Role: {msg.role}
                            </span>
                          )}
                          <span>· {msg.timestamp.slice(11, 16)}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] text-white">
                            <Bot className="h-2.5 w-2.5" />
                          </div>
                          <span className="font-semibold text-indigo-400">Testing Bot</span>
                          <span>· {msg.timestamp.slice(11, 16)}</span>
                        </>
                      )}
                    </div>

                    <div
                      className={`rounded-2xl px-3.5 py-2.5 max-w-[88%] text-xs leading-relaxed ${
                        isUser
                          ? "bg-indigo-600 text-white rounded-tr-none shadow-md"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none space-y-2.5 shadow-md"
                      }`}
                    >
                      {msg.imageUrl && (
                        <div className="relative rounded-lg overflow-hidden border border-slate-700 max-w-[260px] my-1.5 shadow-sm">
                          <img
                            src={msg.imageUrl}
                            alt="Attached Screen"
                            className="w-full h-auto object-cover max-h-48"
                          />
                        </div>
                      )}

                      {msg.status === "thinking" ? (
                        <div className="flex items-center gap-2 text-indigo-300 font-medium">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
                          <span>{msg.text}</span>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )}

                      {/* Understood Workflow Spec Card & Execution CTA */}
                      {msg.spec && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/40 shadow-lg space-y-2.5 text-xs text-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                              <div>
                                <span className="font-bold text-white text-xs block">
                                  {msg.spec.workflowName}
                                </span>
                                {msg.role && (
                                  <span className="text-[10px] text-indigo-300 font-mono">
                                    Persona: {msg.role}
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isRunning}
                              onClick={() =>
                                handleRunTest(msg.workflowPrompt, msg.role, msg.spec?.workflowName)
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-950"
                            >
                              <Play className="h-3 w-3 fill-current" />
                              <span>Execute Workflow Test</span>
                            </button>
                          </div>

                          {/* Target Path progression */}
                          {msg.spec.likelyScreens && msg.spec.likelyScreens.length > 0 && (
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-400 font-semibold">Path:</span>
                              {msg.spec.likelyScreens.map((sc, i) => (
                                <React.Fragment key={i}>
                                  <span className="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800 text-indigo-200 font-medium">
                                    {sc}
                                  </span>
                                  {i < msg.spec!.likelyScreens.length - 1 && (
                                    <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          )}

                          {/* Clarification if ambiguous */}
                          {msg.spec.isAmbiguous && msg.spec.clarificationQuestion && (
                            <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-2">
                              <HelpCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <span>{msg.spec.clarificationQuestion}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => onSubTabChange && onSubTabChange("plan")}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <ListChecks className="h-3 w-3" />
                              <span>View Generated Steps ({msg.plan?.steps?.length || 0})</span>
                            </button>
                            <span className="text-slate-600">·</span>
                            <button
                              type="button"
                              onClick={() => onSubTabChange && onSubTabChange("map")}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <MapIcon className="h-3 w-3" />
                              <span>View Flow Map</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Interactive Verification Prompt Card in Chat */}
            {job && job.verificationState === "awaiting_verification" && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 space-y-2 text-xs shrink-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-200 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-amber-400" />
                    Action Required: Confirm Email / Verification
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">Paused</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {job.verificationPrompt || "Please click confirmation link or enter verification URL/code below."}
                </p>
                <div className="space-y-1.5">
                  <input
                    type="url"
                    value={verificationUrlInput}
                    onChange={(e) => setVerificationUrlInput(e.target.value)}
                    placeholder="Verification / Magic Link URL"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 font-mono outline-none"
                  />
                  <input
                    type="text"
                    value={verificationCodeInput}
                    onChange={(e) => setVerificationCodeInput(e.target.value)}
                    placeholder="OTP / Code (if applicable)"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 font-mono outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmittingVerification}
                    onClick={async () => {
                      if (!onConfirmVerification) return
                      setIsSubmittingVerification(true)
                      try {
                        await onConfirmVerification(verificationCodeInput, verificationUrlInput)
                      } finally {
                        setIsSubmittingVerification(false)
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingVerification ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    <span>I&apos;ve Completed Verification</span>
                  </button>
                  {onSkipVerification && (
                    <button
                      type="button"
                      disabled={isSubmittingVerification}
                      onClick={onSkipVerification}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Interactive Settings Credentials Form in Chat */}
            {job && job.settingsState === "awaiting_credentials" && (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/50 space-y-2 text-xs shrink-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-200 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-indigo-400" />
                    Action Required: Enter Application Settings Secrets
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">Protected</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {job.settingsPrompt || "Enter credentials to configure application settings. Secrets are redacted and never logged."}
                </p>
                <div className="space-y-1.5">
                  {(job.requiredSettingsFields && job.requiredSettingsFields.length > 0
                    ? job.requiredSettingsFields
                    : [{ key: "apiKey", label: "API Key", isSecret: true, placeholder: "sk-..." }]
                  ).map((field) => (
                    <div key={field.key} className="space-y-0.5">
                      <label className="text-[10px] text-slate-300 block">{field.label}</label>
                      <input
                        type={field.isSecret && !showSettingsSecrets[field.key] ? "password" : "text"}
                        value={settingsFormValues[field.key] || ""}
                        onChange={(e) => setSettingsFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 font-mono outline-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmittingSettings}
                    onClick={async () => {
                      if (!onSaveSettingsCredentials) return
                      setIsSubmittingSettings(true)
                      try {
                        await onSaveSettingsCredentials(settingsFormValues)
                      } finally {
                        setIsSubmittingSettings(false)
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    <span>Save &amp; Resume</span>
                  </button>
                  {onSkipSettingsCredentials && (
                    <button
                      type="button"
                      disabled={isSubmittingSettings}
                      onClick={onSkipSettingsCredentials}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Interactive Blocked Screens Diagnostic & Resolution Card in Chat */}
            {(blockedScreenNames.length > 0 || job?.authState === "awaiting_credentials") && (
              <div className="p-3.5 rounded-xl bg-gradient-to-b from-amber-950/40 to-slate-900 border border-amber-500/50 space-y-3 text-xs shrink-0 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-200 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>⚠️ Blocked Screens Detected ({blockedScreenNames.length})</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                    Resolution Needed
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 space-y-1">
                  <p className="font-medium text-slate-200">
                    The bot hit blockers on the following screens. Answer the questions or click a quick action to unblock workflows:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {blockedScreenNames.map((name, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-200 font-mono text-[10px]"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Quick Diagnostic Inputs: Username / Email & Password */}
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                    1. Test Credentials (if screen has login wall):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={blockedUsernameInput}
                      onChange={(e) => setBlockedUsernameInput(e.target.value)}
                      placeholder="Username / Email"
                      className="bg-slate-900 border border-slate-700 focus:border-amber-500 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 font-mono outline-none"
                    />
                    <input
                      type="password"
                      value={blockedPasswordInput}
                      onChange={(e) => setBlockedPasswordInput(e.target.value)}
                      placeholder="Password (optional)"
                      className="bg-slate-900 border border-slate-700 focus:border-amber-500 rounded px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 font-mono outline-none"
                    />
                  </div>
                </div>

                {/* Unblock Action Chips */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                    2. Select Unblock Action:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      disabled={isUnblockingWorkflows}
                      onClick={() => handleExecuteUnblock("synthetic_data")}
                      className="px-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] flex flex-col items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 text-center shadow-sm"
                      title="Auto-fill form inputs with generated synthetic test data and unblock"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-indigo-200" />
                      <span>⚡ Auto-fill Synthetic</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUnblockingWorkflows || (!blockedUsernameInput.trim() && !blockedPasswordInput.trim())}
                      onClick={() => handleExecuteUnblock("credentials")}
                      className="px-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex flex-col items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 text-center shadow-sm"
                      title="Submit entered credentials to login and continue testing"
                    >
                      <Key className="h-3.5 w-3.5 text-emerald-200" />
                      <span>🔑 Submit Credentials</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUnblockingWorkflows}
                      onClick={() => handleExecuteUnblock("retry")}
                      className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex flex-col items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 text-center border border-slate-700"
                      title="Clear overlays and reset blocked status to retry screen"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-300" />
                      <span>🔄 Retry Screens</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUnblockingWorkflows}
                      onClick={() => handleExecuteUnblock("skip")}
                      className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] flex flex-col items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 text-center border border-slate-700"
                      title="Skip blocked steps and resume testing subsequent workflows"
                    >
                      <FastForward className="h-3.5 w-3.5 text-slate-400" />
                      <span>⏭️ Skip Steps</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Starter Role & Workflow Chips (Hick's Law: only shown on initial empty state before conversation starts) */}
            {chatMessages.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5 shrink-0">
                {CONVERSATIONAL_PROMPT_SUGGESTIONS.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setChatInput(sug.prompt)
                      handleSendChatMessage(sug.prompt)
                    }}
                    disabled={isAnalyzing || isRunning}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500/60 hover:bg-indigo-950/20 text-slate-300 hover:text-white text-[11px] font-medium transition cursor-pointer disabled:opacity-50"
                  >
                    {sug.label}
                  </button>
                ))}
              </div>
            )}

            {/* Unified Project Context, Routes & Quick Actions Drawer (Hick's Law: Progressive disclosure) */}
            <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs shrink-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white font-medium cursor-pointer group"
                  title="Toggle Project Target, Discovered Routes, Test Data & Presets"
                >
                  <Wand2 className="h-3 w-3 text-indigo-400" />
                  <span>Project, Routes &amp; Quick Presets</span>
                  {discoveredRoutes && discoveredRoutes.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">
                      {discoveredRoutes.length} routes
                    </span>
                  )}
                  <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isQuickActionsOpen ? "rotate-180" : ""}`} />
                </button>

                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
                  {selectedProjectDir}
                </span>
              </div>

              {/* Expanded Presets & Project Route Chips */}
              {isQuickActionsOpen && (
                <div className="pt-2 space-y-2 border-t border-slate-800 animate-in fade-in-50 duration-150">
                  <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                      "🎯 Test creating a new task",
                      "👤 Test the registration flow",
                      "🖼️ Test uploading profile picture",
                      "🔄 Test All Clickable Options",
                      "🧠 Analyze Screen & Build UI Checklist",
                      "Audit viewports (390px, 768px, 1440px)",
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const cleanPrompt = chip.replace(/^[^\s]+\s+/, "")
                          setChatInput(cleanPrompt)
                          handleSendChatMessage(cleanPrompt)
                        }}
                        disabled={isAnalyzing || isRunning}
                        className="shrink-0 px-2.5 py-1 rounded-lg border bg-slate-950 border-slate-800 hover:border-indigo-500 hover:bg-indigo-950/30 text-slate-300 hover:text-white text-[10px] transition cursor-pointer disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Target Project Routes & Test Data provision */}
                  <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {availableProjects && availableProjects.length > 0 && (
                        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
                          <Layers className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className="font-semibold text-slate-300">Project:</span>
                          <select
                            value={
                              availableProjects.find(
                                (p) => p.name === selectedProjectDir || p.path === selectedProjectDir
                              )?.path || "custom"
                            }
                            onChange={(e) => {
                              if (e.target.value !== "custom" && onSelectProjectDir) {
                                onSelectProjectDir(e.target.value)
                              }
                            }}
                            className="bg-transparent text-[10px] text-white font-mono outline-none cursor-pointer max-w-[140px]"
                          >
                            {availableProjects.map((p) => (
                              <option key={p.path} value={p.path} className="bg-slate-900 text-white">
                                {p.name}
                              </option>
                            ))}
                            <option value="custom" className="bg-slate-900 text-indigo-300">Custom Path/URL...</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Directory path or URL"
                            value={selectedProjectDir}
                            onChange={(e) => onSelectProjectDir && onSelectProjectDir(e.target.value)}
                            className="bg-slate-900 border border-slate-700/60 rounded px-1.5 py-0.5 text-[10px] text-slate-200 font-mono w-32 focus:border-indigo-500 outline-none"
                            title="Enter custom local project directory path (e.g. D:\wamp64\www\hh) or target URL"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
                        <FolderOpen className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="font-semibold text-slate-300">Test Folder:</span>
                        <select
                          value={
                            availableTestFolders.find(
                              (f) =>
                                f.path.toLowerCase() === (uploadFilesDir || "").replace(/\\/g, "/").toLowerCase() ||
                                f.label.toLowerCase() === (uploadFilesDir || "").replace(/\\/g, "/").toLowerCase()
                            )?.path || (uploadFilesDir ? uploadFilesDir : "")
                          }
                          onChange={(e) => {
                            if (onSelectUploadFilesDir) {
                              onSelectUploadFilesDir(e.target.value)
                            }
                          }}
                          className="bg-transparent text-[10px] text-amber-200 font-mono outline-none cursor-pointer max-w-[190px]"
                          title="Select which generated test-files folder to use for file upload testing"
                        >
                          {availableTestFolders.map((f) => (
                            <option key={f.path} value={f.path} className="bg-slate-900 text-white">
                              {f.label} ({f.filesCount} files)
                            </option>
                          ))}
                          {uploadFilesDir &&
                            !availableTestFolders.some(
                              (f) =>
                                f.path.toLowerCase() === uploadFilesDir.replace(/\\/g, "/").toLowerCase() ||
                                f.label.toLowerCase() === uploadFilesDir.replace(/\\/g, "/").toLowerCase()
                            ) && (
                              <option value={uploadFilesDir} className="bg-slate-900 text-amber-300">
                                {uploadFilesDir}
                              </option>
                            )}
                        </select>
                        <label
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 cursor-pointer transition text-[9px] font-semibold shrink-0"
                          title="Browse and select a folder of test files from your computer"
                        >
                          <FolderOpen className="h-2.5 w-2.5 text-indigo-400" />
                          <span>Select Folder</span>
                          <input
                            type="file"
                            {...({ webkitdirectory: "", directory: "" } as any)}
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = e.target.files
                              if (files && files.length > 0 && onUploadTestFiles) {
                                onUploadTestFiles(files)
                              }
                              e.target.value = ""
                            }}
                          />
                        </label>
                      </div>
                      {onGenerateTestData && (
                        <button
                          type="button"
                          onClick={() => onGenerateTestData()}
                          disabled={isGeneratingTestData}
                          className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 shrink-0"
                          title="Generate dummy files (PDFs, CSVs, images, notes) in target project"
                        >
                          {isGeneratingTestData ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-400" />
                          ) : (
                            <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                          )}
                          <span>Generate Test Data</span>
                        </button>
                      )}
                      {typeof testFilesCount === "number" && testFilesCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenTestDataModal && onOpenTestDataModal()}
                          className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-semibold transition cursor-pointer shrink-0"
                          title="View verified test files in target project"
                        >
                          {testFilesCount} test files ready
                        </button>
                      )}
                    </div>

                    {onRescanRoutes && (
                      <button
                        type="button"
                        onClick={onRescanRoutes}
                        disabled={isScanningRoutes}
                        className="text-[9px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition cursor-pointer shrink-0"
                        title="Rescan target project routes"
                      >
                        <RotateCcw className={`h-2.5 w-2.5 ${isScanningRoutes ? "animate-spin" : ""}`} />
                        <span>Rescan Routes</span>
                      </button>
                    )}
                  </div>

                  {discoveredRoutes && discoveredRoutes.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
                      {discoveredRoutes.map((r, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (onNavigateUrl) onNavigateUrl(r.url)
                            setChatInput(`Test and inspect route ${r.path}`)
                            handleSendChatMessage(`Test and inspect route ${r.path}`)
                          }}
                          disabled={isAnalyzing || isRunning}
                          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 hover:bg-indigo-950/40 text-slate-300 hover:text-white border border-slate-800 hover:border-indigo-500/50 transition cursor-pointer disabled:opacity-50"
                          title={`Click to test: ${r.path} (${r.url})`}
                        >
                          {r.path}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attached Image Preview */}
            {attachedImage && (
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs shrink-0 shadow-sm">
                <div className="flex items-center gap-2">
                  <img
                    src={attachedImage}
                    alt="Attached screen"
                    className="h-10 w-10 rounded-lg object-cover border border-slate-700 shadow-sm"
                  />
                  <div>
                    <span className="text-[11px] font-semibold text-white block">Image Attached</span>
                    <span className="text-[10px] text-slate-400">Testing bot will inspect this screen during planning and visual audit</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedImage(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Conversational Input Bar */}
            <div className="flex items-center gap-2 shrink-0 pt-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing || isRunning}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500 hover:text-indigo-400 text-slate-400 transition cursor-pointer shrink-0 disabled:opacity-50"
                title="Upload Mockup / Screenshot Image"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onCaptureCurrentScreen) {
                    onCaptureCurrentScreen()
                  } else if (job?.currentScreenshotUrl) {
                    setAttachedImage(job.currentScreenshotUrl)
                  }
                }}
                disabled={isAnalyzing || isRunning}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500 hover:text-indigo-400 text-slate-400 transition cursor-pointer shrink-0 disabled:opacity-50"
                title="Capture Live Simulator Screen & Test"
              >
                <Camera className="h-4 w-4" />
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && (chatInput.trim() || attachedImage)) {
                      e.preventDefault()
                      handleSendChatMessage()
                    }
                  }}
                  disabled={isAnalyzing || isRunning}
                  placeholder={
                    attachedImage
                      ? "Add instructions for attached image or press Send..."
                      : "Tell the testing bot what to test (e.g. 'Act as customer and test checkout', 'Test user profile update')..."
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner disabled:opacity-50"
                />
                {isAnalyzing && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-purple-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={(!chatInput.trim() && !attachedImage) || isAnalyzing || isRunning}
                onClick={() => handleSendChatMessage()}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-950 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>

              {isRunning && onCancelJob && (
                <button
                  type="button"
                  onClick={onCancelJob}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-md shadow-rose-950 shrink-0"
                  title="Stop Running Test"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 6. FULL-RESOLUTION SCREENSHOT PREVIEW MODAL */}
      {selectedScreenshotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedScreenshotModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs text-slate-300">
              <span className="font-bold">Step Evidence Screenshot</span>
              <button
                type="button"
                onClick={() => setSelectedScreenshotModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-2 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedScreenshotModal}
                alt="Screenshot Evidence"
                className="max-h-[75vh] w-auto object-contain mx-auto rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
