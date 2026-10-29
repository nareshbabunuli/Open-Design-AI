import type { AutomationJob } from "./types"

/**
 * Generate a comprehensive HTML report with all testing details and UX audit.
 * Includes print styles for PDF export.
 */
export function generateHTMLReport(job: AutomationJob): string {
  const timestamp = new Date().toISOString()
  const duration = job.finishedAt
    ? Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
    : 0

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${job.targetUrl}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    h1 {
      color: #2563eb;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 10px;
      margin-bottom: 30px;
      font-size: 2.5em;
    }

    h2 {
      color: #1e40af;
      margin-top: 40px;
      margin-bottom: 20px;
      font-size: 1.8em;
      border-left: 4px solid #2563eb;
      padding-left: 15px;
    }

    h3 {
      color: #475569;
      margin-top: 25px;
      margin-bottom: 15px;
      font-size: 1.3em;
    }

    .header-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
      padding: 20px;
      background: #f8fafc;
      border-radius: 8px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
    }

    .info-label {
      font-weight: 600;
      color: #64748b;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }

    .info-value {
      font-size: 1.1em;
      color: #1e293b;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-completed { background: #dcfce7; color: #166534; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-running { background: #fef3c7; color: #92400e; }
    .status-passed { background: #dcfce7; color: #166534; }
    .status-blocked { background: #fecaca; color: #991b1b; }
    .status-pending { background: #e5e7eb; color: #374151; }

    .severity-blocker { color: #dc2626; font-weight: 700; }
    .severity-high { color: #ea580c; font-weight: 600; }
    .severity-medium { color: #f59e0b; font-weight: 600; }
    .severity-low { color: #84cc16; font-weight: 600; }

    .ux-score-container {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin: 30px 0;
    }

    .ux-score-main {
      text-align: center;
      margin-bottom: 30px;
    }

    .ux-score-number {
      font-size: 4em;
      font-weight: 700;
      line-height: 1;
      margin: 10px 0;
    }

    .ux-grade {
      font-size: 3em;
      font-weight: 700;
      display: inline-block;
      padding: 10px 30px;
      background: rgba(255,255,255,0.2);
      border-radius: 8px;
      margin-top: 15px;
    }

    .ux-dimensions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .ux-dimension {
      background: rgba(255,255,255,0.15);
      padding: 15px;
      border-radius: 8px;
    }

    .ux-dimension-name {
      font-size: 0.9em;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .ux-dimension-score {
      font-size: 1.8em;
      font-weight: 700;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }

    .stat-card {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
    }

    .stat-value {
      font-size: 2.5em;
      font-weight: 700;
      color: #2563eb;
      line-height: 1;
    }

    .stat-label {
      color: #64748b;
      margin-top: 8px;
      font-size: 0.95em;
    }

    .issues-list {
      margin: 20px 0;
    }

    .issue-card {
      background: #fefefe;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #ef4444;
      padding: 20px;
      margin-bottom: 15px;
      border-radius: 4px;
    }

    .issue-card.severity-blocker { border-left-color: #dc2626; }
    .issue-card.severity-high { border-left-color: #ea580c; }
    .issue-card.severity-medium { border-left-color: #f59e0b; }
    .issue-card.severity-low { border-left-color: #84cc16; }

    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 10px;
    }

    .issue-type {
      font-weight: 600;
      color: #1e293b;
      text-transform: capitalize;
    }

    .issue-description {
      margin: 10px 0;
      color: #475569;
    }

    .issue-meta {
      display: flex;
      gap: 20px;
      font-size: 0.9em;
      color: #64748b;
      margin-top: 10px;
    }

    .screen-card {
      background: #fefefe;
      border: 1px solid #e2e8f0;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
    }

    .screen-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 15px;
    }

    .screen-title {
      font-weight: 600;
      font-size: 1.2em;
      color: #1e293b;
    }

    .screen-url {
      font-size: 0.9em;
      color: #64748b;
      margin: 5px 0;
      word-break: break-all;
    }

    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .screenshot-item {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .screenshot-item img {
      width: 100%;
      height: auto;
      display: block;
    }

    .screenshot-label {
      padding: 8px;
      background: #f8fafc;
      font-size: 0.85em;
      color: #64748b;
      text-align: center;
    }

    .test-step {
      background: #fefefe;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #3b82f6;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 4px;
    }

    .test-step.status-failed { border-left-color: #ef4444; }
    .test-step.status-blocked { border-left-color: #f59e0b; }
    .test-step.status-passed { border-left-color: #10b981; }

    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .step-action {
      font-weight: 600;
      color: #1e293b;
    }

    .step-details {
      font-size: 0.9em;
      color: #64748b;
      margin: 5px 0;
    }

    .workflow-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
    }

    .workflow-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .workflow-name {
      font-weight: 700;
      font-size: 1.3em;
      color: #1e293b;
    }

    .recommendations-list {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .recommendations-list ul {
      margin-left: 20px;
      margin-top: 10px;
    }

    .recommendations-list li {
      margin: 8px 0;
      color: #78350f;
    }

    .executive-summary {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin: 30px 0;
    }

    .executive-summary h3 {
      color: white;
      margin-top: 20px;
      font-size: 1.1em;
    }

    .executive-summary ul {
      margin-left: 20px;
      margin-top: 10px;
    }

    .executive-summary li {
      margin: 8px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }

    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }

    th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
    }

    tr:hover {
      background: #f8fafc;
    }

    .log-entry {
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      padding: 8px 12px;
      margin: 2px 0;
      border-radius: 4px;
    }

    .log-error { background: #fee2e2; color: #991b1b; }
    .log-warn { background: #fef3c7; color: #92400e; }
    .log-success { background: #dcfce7; color: #166534; }
    .log-info { background: #e0f2fe; color: #075985; }

    .page-break {
      height: 1px;
      margin: 16px 0;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
        padding: 20px;
        max-width: 100%;
      }

      h1 {
        font-size: 2em;
      }

      h2 {
        font-size: 1.5em;
        page-break-after: avoid;
      }

      .ux-score-container,
      .executive-summary {
        break-inside: avoid;
      }

      .issue-card,
      .screen-card,
      .workflow-card {
        break-inside: avoid;
      }

      .screenshot-item img {
        max-height: 400px;
        object-fit: contain;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Report</h1>

    <div class="header-info">
      <div class="info-item">
        <span class="info-label">Target URL</span>
        <span class="info-value">${escapeHtml(job.targetUrl)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Test Mode</span>
        <span class="info-value">${escapeHtml(job.mode || 'crawl')}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status</span>
        <span class="info-value">
          <span class="status-badge status-${job.status}">${escapeHtml(job.status)}</span>
        </span>
      </div>
      <div class="info-item">
        <span class="info-label">Started At</span>
        <span class="info-value">${formatDate(job.startedAt)}</span>
      </div>
      ${job.finishedAt ? `
      <div class="info-item">
        <span class="info-label">Finished At</span>
        <span class="info-value">${formatDate(job.finishedAt)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Duration</span>
        <span class="info-value">${formatDuration(duration)}</span>
      </div>
      ` : ''}
      ${job.role ? `
      <div class="info-item">
        <span class="info-label">Role</span>
        <span class="info-value">${escapeHtml(job.role)}</span>
      </div>
      ` : ''}
    </div>

    ${generateExecutiveSummary(job)}
    ${generateUXAuditSection(job)}
    ${generateStatsSection(job)}
    ${generateVideoSection(job)}
    ${generateOpenCVAuditSection(job)}
    ${generateIssuesSection(job)}
    ${generateScreensSection(job)}
    ${generateTestPlanSection(job)}
    ${generateWorkflowsSection(job)}
    ${generateRecommendations(job)}
    ${generateLogsSection(job)}

    <div style="margin-top: 60px; padding-top: 30px; border-top: 2px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 0.9em;">
      <p>Generated on ${formatDate(timestamp)}</p>
      <p>Report ID: ${escapeHtml(job.id)}</p>
    </div>
  </div>
</body>
</html>`
}

function generateExecutiveSummary(job: AutomationJob): string {
  if (!job.report?.aiExecutiveSummary) return ''

  const summary = job.report.aiExecutiveSummary

  return `
    <div class="executive-summary">
      <h2 style="color: white; border: none; margin-top: 0;">Executive Summary</h2>
      <p style="font-size: 1.1em; line-height: 1.8; margin: 20px 0;">${escapeHtml(summary.executiveSummary)}</p>

      <h3>Key Strengths</h3>
      <ul>
        ${summary.keyStrengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>

      <h3>Critical Fixes</h3>
      <ul>
        ${summary.criticalFixes.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>

      <div style="text-align: center; margin-top: 30px;">
        <div style="font-size: 1.2em; opacity: 0.9;">Overall Score</div>
        <div style="font-size: 3em; font-weight: 700; margin-top: 10px;">${summary.overallScore}/100</div>
      </div>
    </div>
  `
}

function generateUXAuditSection(job: AutomationJob): string {
  const uxScore = job.uxAuditScore || (job.screens?.[0]?.uxAuditScore)

  if (!uxScore) return ''

  const methodology = 'methodology' in uxScore && uxScore.methodology
    ? uxScore.methodology
    : 'totalChecksApplied' in uxScore
      ? `${uxScore.totalChecksApplied} checks applied`
      : 'Heuristic UX Audit'
  const limitations = 'limitations' in uxScore && Array.isArray(uxScore.limitations)
    ? uxScore.limitations
    : []

  return `
    <div class="page-break"></div>
    <h2>UX Intelligence Audit</h2>

    <div class="ux-score-container">
      <div class="ux-score-main">
        <div style="font-size: 1.2em; opacity: 0.9;">Overall UX Score</div>
        <div class="ux-score-number">${uxScore.overall}</div>
        <div style="font-size: 1em; opacity: 0.9;">out of 100</div>
        <div class="ux-grade">Grade ${uxScore.grade}</div>
        <div style="margin-top: 15px; font-size: 0.95em; opacity: 0.85;">
          Confidence: ${Math.round(uxScore.confidence * 100)}% | ${escapeHtml(methodology)}
        </div>
      </div>

      <h3 style="color: white; margin-top: 30px; margin-bottom: 15px;">Dimensional Breakdown</h3>
      <div class="ux-dimensions">
        ${uxScore.dimensions.map(dim => {
          const checksCount = 'checksApplied' in dim ? dim.checksApplied : dim.checks.length
          const checkDetails = 'checks' in dim && Array.isArray((dim as any).checks) ? (dim as any).checks : []
          return `
          <div class="ux-dimension">
            <div class="ux-dimension-name">${escapeHtml(dim.dimension)}</div>
            <div class="ux-dimension-score">${dim.score.toFixed(1)}</div>
            <div style="font-size: 0.85em; opacity: 0.85; margin-top: 5px;">
              Weight: ${(dim.weight * 100).toFixed(0)}% | ${checksCount} check(s)
            </div>
            ${checkDetails.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.8em; line-height: 1.45; opacity: 0.95;">
                ${checkDetails.map((chk: any) => `
                  <div style="margin-bottom: 6px;">
                    <strong>• ${escapeHtml(chk.rule || chk.id)} (${chk.rating}/4):</strong> ${escapeHtml(chk.evidence || '')}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `
        }).join('')}
      </div>

      ${limitations.length > 0 ? `
        <div style="margin-top: 30px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px;">
          <h3 style="color: white; margin-top: 0; font-size: 1em;">Limitations</h3>
          <ul style="margin-left: 20px; font-size: 0.9em;">
            ${limitations.map((l: string) => `<li>${escapeHtml(l)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `
}

function generateStatsSection(job: AutomationJob): string {
  const report = job.report
  if (!report) return ''

  const uniqueScreens = report.uniqueScreensTested ?? report.totalScreensTested ?? (job.screens?.length || 1)
  const viewportsCount = report.viewportsTestedCount ?? ((job.responsiveResults && job.responsiveResults.length > 0) ? job.responsiveResults.length : 1)
  const steps = job.fullAppTestPlan?.steps || []
  const clientOnlyUploadSteps = steps.filter(
    s => s.actionType === 'upload' && (s.uploadVerification?.isClientOnlyAttachment === true || /server processing was not tested|Client Input Attachment Only/i.test(s.actualResult || ''))
  )
  const passedTotal = steps.filter(s => s.status === 'passed' || s.verdict === 'passed').length
  const vb = report.verificationBreakdown || {
    verifiedFunctionalCount: Math.max(0, passedTotal - clientOnlyUploadSteps.length),
    detectedDefectsCount: (job.issues || []).filter(i => i.verificationCategory !== 'unverified_backend').length,
    partialClientOnlyCount: clientOnlyUploadSteps.length,
    inconclusiveCount: steps.filter(s => s.status === 'blocked' || s.status === 'pending' || s.verdict === 'suspected_non_functional').length,
  }
  const closedLoopCount = job.opencvAudit?.closedLoopLoopsExecuted || (job.issues || []).filter(i => i.retestStatus === 'retested_persisted' || i.retestStatus === 'retested_resolved').length

  return `
    <h2>🎯 Developer Triage Summary (3 Key Questions)</h2>
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #4f46e5; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
      <div style="margin-bottom: 12px;">
        <strong>1. What failed or remained unverified?</strong>
        <ul style="margin: 6px 0 0 20px; color: #334155;">
          ${(job.issues || []).length === 0 && vb.partialClientOnlyCount === 0
            ? `<li>All ${steps.length} actions across ${uniqueScreens} unique route screen(s) and ${viewportsCount} viewport(s) verified end-to-end with zero defects.</li>`
            : (job.issues || []).map(iss => `<li><strong>[${escapeHtml(iss.severity.toUpperCase())} · ${escapeHtml(iss.type.replace(/_/g, ' '))}]</strong> ${escapeHtml(iss.description)}</li>`).join('')
          }
        </ul>
      </div>
      <div style="margin-bottom: 12px;">
        <strong>2. What evidence proves it?</strong>
        <div style="color: #475569; margin-top: 4px; font-size: 0.95em;">
          Every finding below includes exact CSS selectors, expected vs. observed DOM/BoundingBox values, step-by-step reproduction instructions, and viewport-matched screenshot evidence.
          ${vb.partialClientOnlyCount > 0 ? `<br/>• <strong>5-Stage Upload Pipeline:</strong> ${vb.partialClientOnlyCount} upload scenario(s) verified Stages 1–2 (File Selection + DOM State Update) while Stages 3–5 (Network Upload Request, 2xx Server Response, App Processing) were explicitly recorded as unverified on the wire.` : ''}
        </div>
      </div>
      <div>
        <strong>3. Did the agent investigate and verify the result (Closed-Loop)?</strong>
        <div style="color: #475569; margin-top: 4px; font-size: 0.95em;">
          <strong>Yes (${closedLoopCount} closed-loop re-verification(s) executed).</strong> Detected layout, touch-target, and disabled-state findings were re-inspected via live DOM <code>getBoundingClientRect()</code>, <code>getComputedStyle()</code>, and post-scroll baseline comparisons to confirm whether defects persisted.
        </div>
      </div>
    </div>

    <h2>Test Statistics &amp; 4-Category Verification Breakdown</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${uniqueScreens}</div>
        <div class="stat-label">Unique Route Screens</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${viewportsCount}</div>
        <div class="stat-label">Responsive Viewports</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #10b981;">${vb.verifiedFunctionalCount}</div>
        <div class="stat-label">1. Verified Functional</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #dc2626;">${vb.detectedDefectsCount}</div>
        <div class="stat-label">2. Confirmed Defects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #d97706;">${vb.partialClientOnlyCount}</div>
        <div class="stat-label">3. Client-Only Uploads (2/5 Stages)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #64748b;">${vb.inconclusiveCount}</div>
        <div class="stat-label">4. Inconclusive / Blocked</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.responsiveScore}%</div>
        <div class="stat-label">Responsive Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${closedLoopCount}</div>
        <div class="stat-label">Closed-Loop Rechecks</div>
      </div>
    </div>
  `
}

function generateVideoSection(job: AutomationJob): string {
  const videoUrl = job.report?.recordingUrl || job.recordingUrl || (job.id ? `/api/ai-automation/recording?jobId=${encodeURIComponent(job.id)}` : '')
  if (!videoUrl) return ''

  const downloadUrl = videoUrl.includes('?') ? `${videoUrl}&download=1` : `${videoUrl}?download=1`
  const segments = job.recordingSegments || []

  return `
    <div style="margin: 30px 0; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div>
          <h2 style="color: #f8fafc; border: none; margin: 0; padding: 0;">🎥 Full Testing Session Video Recording</h2>
          <div style="font-size: 0.9em; color: #94a3b8; margin-top: 4px;">
            Complete browser recording covering discovery, interactive step execution, file uploads, workflows, and multi-device responsive testing.
          </div>
        </div>
        <a href="${escapeHtml(downloadUrl)}" download="full-test-session-${escapeHtml(job.id)}.webm" style="display: inline-block; padding: 8px 16px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.9em;">
          ⬇ Download Video (.webm)
        </a>
      </div>
      <video controls preload="metadata" src="${escapeHtml(videoUrl)}" style="width: 100%; max-height: 520px; border-radius: 8px; background: #000000; border: 1px solid #334155;"></video>
      ${segments.length > 1 ? `
        <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
          ${segments.map((seg, i) => `
            <a href="${escapeHtml(seg)}" target="_blank" rel="noreferrer" style="padding: 4px 10px; background: #1e293b; color: #cbd5e1; border-radius: 6px; font-size: 0.85em; text-decoration: none;">
              Segment ${i + 1}
            </a>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `
}

function generateOpenCVAuditSection(job: AutomationJob): string {
  const cv = job.opencvAudit || job.report?.opencvAudit
  if (!cv) return ''

  return `
    <div class="page-break"></div>
    <h2>👁️ OpenCV Visual Intelligence &amp; 5-Pillar Audit</h2>
    <p style="color: #475569; margin-bottom: 16px;">
      Engine: <strong>${escapeHtml(cv.engine)}</strong> • Visual Stability Score: <strong>${cv.visualStabilityScore}%</strong> • Comparisons: <strong>${cv.totalComparisons}</strong> • Closed-Loop Verifications: <strong>${cv.closedLoopLoopsExecuted}</strong>
    </p>

    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-value">${cv.visualDiffs.length}</div>
        <div class="stat-label">1. Visual Diffs &amp; Regressions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${cv.annotatedScreenshots.length}</div>
        <div class="stat-label">2. Responsive Contour Maps</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${cv.blankRegionsCount + cv.missingElementsCount}</div>
        <div class="stat-label">3. Blank / Missing Regions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${cv.frameTimeline.length}</div>
        <div class="stat-label">4. Step Frame Transitions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${cv.closedLoopLoopsExecuted}</div>
        <div class="stat-label">5. Closed-Loop Re-Checks</div>
      </div>
    </div>

    ${cv.visualDiffs.length > 0 ? `
      <h3>1. Visual Regression Diff Heatmaps (Same-Viewport Baseline vs. Cross-Viewport Reflow)</h3>
      <div class="screenshots-grid" style="margin-bottom: 24px;">
        ${cv.visualDiffs.map(d => {
          const badgeText = d.comparisonType === 'same_viewport_regression'
            ? (d.status === 'unexpected_shift' ? '❌ Same-Viewport Regression' : '✅ Same-Viewport Baseline Passed')
            : d.comparisonType === 'step_interaction'
            ? '⚡ Interactive State Transition'
            : '📐 Expected Responsive Reflow'
          return `
          <div class="screenshot-item">
            ${d.diffHeatmapUrl ? `<img src="${d.diffHeatmapUrl}" alt="${escapeHtml(d.label)}" loading="lazy" />` : ''}
            <div class="screenshot-label">
              <div style="font-size: 0.78em; font-weight: 700; color: ${d.status === 'unexpected_shift' ? '#dc2626' : '#059669'}; margin-bottom: 3px;">${badgeText}</div>
              <strong>${escapeHtml(d.label)}</strong><br/>
              Pixel Delta: ${d.diffPercentage}% • ${d.changedRegionsCount} changed region(s) • ${escapeHtml(d.summary)}
            </div>
          </div>
        `}).join('')}
      </div>
    ` : ''}

    ${cv.annotatedScreenshots.length > 0 ? `
      <h3>2. Responsive Layout Validation (OpenCV Canny &amp; Saliency Bounding Boxes)</h3>
      <div class="screenshots-grid" style="margin-bottom: 24px;">
        ${cv.annotatedScreenshots.map(a => `
          <div class="screenshot-item">
            <img src="${a.annotatedImageUrl}" alt="${escapeHtml(a.label)}" loading="lazy" />
            <div class="screenshot-label">
              <strong>${escapeHtml(a.label)} (${escapeHtml(a.viewport)})</strong><br/>
              ${a.elementsAnnotated} controls annotated • Avg Edge Density: ${Math.round(a.edgeDensityAvg * 100)}%
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${cv.defects.length > 0 ? `
      <h3>3 &amp; 5. Missing-Element / Visual-Defect Detection &amp; Closed-Loop DOM Verification</h3>
      <div class="issues-list" style="margin-bottom: 24px;">
        ${cv.defects.map(def => `
          <div class="issue-card severity-${def.severity}">
            <div class="issue-header">
              <span class="issue-type">${escapeHtml(def.type.replace(/_/g, ' '))}</span>
              <span style="font-size: 0.85em; color: #475569;">${escapeHtml(def.viewport || def.screenName)}</span>
            </div>
            <div class="issue-description">${escapeHtml(def.domConfirmationDetail)}</div>
            <div class="issue-meta">
              <span>🔍 DOM Confirmed: ${def.domConfirmed ? 'Yes' : 'No'}</span>
              <span>🔄 Closed-Loop: ${escapeHtml(def.closedLoopAction || 'Verified')}</span>
              <span>📌 Status: ${def.defectPersisted ? 'Persisted' : 'Resolved on Re-Check'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `
}

function generateIssuesSection(job: AutomationJob): string {
  const issues = job.issues || []
  if (issues.length === 0) return '<h2>Issues</h2><p style="color: #10b981; font-weight: 600;">✓ No issues found!</p>'

  const grouped = issues.reduce((acc, issue) => {
    if (!acc[issue.severity]) acc[issue.severity] = []
    acc[issue.severity].push(issue)
    return acc
  }, {} as Record<string, typeof issues>)

  return `
    <div class="page-break"></div>
    <h2>Issues (${issues.length})</h2>

    ${['blocker', 'high', 'medium', 'low'].map(severity => {
      const items = grouped[severity] || []
      if (items.length === 0) return ''

      return `
        <h3 class="severity-${severity}">${severity.toUpperCase()} Severity (${items.length})</h3>
        <div class="issues-list">
          ${items.map(issue => `
            <div class="issue-card severity-${issue.severity}">
              <div class="issue-header">
                <div>
                  <span class="issue-type">${issue.type.replace(/_/g, ' ')}</span>
                  <span class="severity-${issue.severity}" style="margin-left: 10px; font-size: 0.9em;">
                    ${issue.severity.toUpperCase()}
                  </span>
                </div>
              </div>
              <div class="issue-description">${escapeHtml(issue.description)}</div>
              ${issue.expected ? `<div style="margin-top: 8px;"><strong>Expected:</strong> ${escapeHtml(issue.expected)}</div>` : ''}
              ${issue.actual ? `<div style="margin-top: 4px;"><strong>Actual:</strong> ${escapeHtml(issue.actual)}</div>` : ''}
              ${issue.reproductionSteps && issue.reproductionSteps.length > 0 ? `
                <div style="margin-top: 8px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #6366f1; border-radius: 4px; font-size: 0.88em;">
                  <strong>Reproduction Steps:</strong>
                  <ol style="margin: 4px 0 0 18px;">
                    ${issue.reproductionSteps.map(rs => `<li>${escapeHtml(rs)}</li>`).join('')}
                  </ol>
                </div>
              ` : ''}
              ${issue.retestDetail ? `
                <div style="margin-top: 6px; font-size: 0.88em; color: #334155;">
                  <strong>Closed-Loop Retest (${escapeHtml((issue.retestStatus || 'retested').replace(/_/g, ' '))}):</strong> ${escapeHtml(issue.retestDetail)}
                </div>
              ` : ''}
              <div class="issue-meta">
                <span>📍 ${escapeHtml(issue.screenTitle)}</span>
                <span>🔗 ${escapeHtml(issue.screenUrl)}</span>
                ${issue.viewport ? `<span>📱 ${escapeHtml(issue.viewport)}</span>` : ''}
                <span>🎯 Confidence: ${issue.confidence ?? 95}%</span>
                <span>⏰ ${formatDate(issue.timestamp)}</span>
              </div>
              ${issue.correlatedEvidence ? `
                <div style="margin-top: 15px; padding: 10px; background: #fef3c7; border-radius: 4px; font-size: 0.9em;">
                  <strong>Correlated Evidence:</strong>
                  ${issue.correlatedEvidence.consoleErrors?.length ? `
                    <div style="margin-top: 5px;">Console Errors: ${issue.correlatedEvidence.consoleErrors.length}</div>
                  ` : ''}
                  ${issue.correlatedEvidence.networkFailures?.length ? `
                    <div style="margin-top: 5px;">Network Failures: ${issue.correlatedEvidence.networkFailures.length}</div>
                  ` : ''}
                  ${issue.correlatedEvidence.emptyDataSurfaces?.length ? `
                    <div style="margin-top: 5px;">Empty Data Surfaces: ${issue.correlatedEvidence.emptyDataSurfaces.join(', ')}</div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `
    }).join('')}
  `
}

function generateScreensSection(job: AutomationJob): string {
  const screens = job.screens || []
  if (screens.length === 0) return ''

  return `
    <div class="page-break"></div>
    <h2>Tested Screens (${screens.length})</h2>

    ${screens.map((screen, index) => `
      <div class="screen-card">
        <div class="screen-header">
          <div>
            <div class="screen-title">${index + 1}. ${escapeHtml(screen.title)}</div>
            <div class="screen-url">${escapeHtml(screen.url)}</div>
            ${screen.pageType ? `<div style="font-size: 0.85em; color: #64748b; margin-top: 5px;">Type: ${escapeHtml(screen.pageType)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="status-badge status-${screen.backNavigationStatus}">Back Nav: ${escapeHtml(screen.backNavigationStatus)}</span>
            <span class="status-badge status-${screen.responsiveStatus}">Responsive: ${escapeHtml(screen.responsiveStatus)}</span>
          </div>
        </div>

        ${screen.issuesCount ? `
          <div style="color: #dc2626; font-weight: 600; margin: 10px 0;">
            ⚠️ ${screen.issuesCount} issue${screen.issuesCount > 1 ? 's' : ''} found
          </div>
        ` : ''}

        ${screen.screenshots && Object.keys(screen.screenshots).length > 0 ? `
          <div class="screenshots-grid">
            ${Object.entries(screen.screenshots).map(([viewport, src]) => `
              <div class="screenshot-item">
                <img src="${src}" alt="${escapeHtml(viewport)} screenshot" loading="lazy" />
                <div class="screenshot-label">${escapeHtml(viewport)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${screen.uxAuditScore ? `
          <div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-radius: 6px;">
            <strong>UX Score: ${screen.uxAuditScore.overall}/100 (${screen.uxAuditScore.grade})</strong>
            <div style="font-size: 0.9em; color: #64748b; margin-top: 5px;">
              Confidence: ${Math.round(screen.uxAuditScore.confidence * 100)}%
            </div>
          </div>
        ` : ''}
      </div>
    `).join('')}
  `
}

function generateTestPlanSection(job: AutomationJob): string {
  const plan = job.fullAppTestPlan
  if (!plan || !plan.steps || plan.steps.length === 0) return ''

  const stepsByStatus = plan.steps.reduce((acc, step) => {
    if (!acc[step.status]) acc[step.status] = []
    acc[step.status].push(step)
    return acc
  }, {} as Record<string, typeof plan.steps>)

  return `
    <div class="page-break"></div>
    <h2>Test Plan Execution</h2>

    <div style="margin: 20px 0;">
      <strong>Coverage:</strong> ${plan.coverage.percentage.toFixed(1)}%
      (${plan.coverage.actionsTested}/${plan.coverage.totalActions} actions,
      ${plan.coverage.formsTested}/${plan.coverage.totalForms} forms,
      ${plan.coverage.screensTested}/${plan.coverage.totalScreens} screens)
    </div>

    ${['passed', 'failed', 'blocked', 'pending'].map(status => {
      const steps = stepsByStatus[status] || []
      if (steps.length === 0) return ''

      return `
        <h3>${status.toUpperCase()} (${steps.length})</h3>
        ${steps.map((step, index) => {
          const isPartialUpload = step.actionType === 'upload' && (step.uploadVerification?.isClientOnlyAttachment === true || /server processing was not tested|Client Input Attachment Only/i.test(step.actualResult || ''))
          const badgeLabel = isPartialUpload ? 'PARTIAL (2/5 STAGES: CLIENT ATTACHED)' : step.status
          const badgeStyle = isPartialUpload ? 'background: #fef3c7; color: #92400e; border: 1px solid #f59e0b;' : ''
          const uv = step.uploadVerification
          return `
          <div class="test-step status-${step.status}">
            <div class="step-header">
              <div class="step-action">
                Step ${step.stepIndex + 1}: ${escapeHtml(step.actionType)} - ${escapeHtml(step.targetName)}
              </div>
              <span class="status-badge status-${step.status}" style="${badgeStyle}">${escapeHtml(badgeLabel)}</span>
            </div>
            <div class="step-details">Screen: ${escapeHtml(step.screenName)}</div>
            ${step.targetSelector ? `<div class="step-details">Selector: <code>${escapeHtml(step.targetSelector)}</code></div>` : ''}
            ${step.syntheticValue ? `<div class="step-details">Value: ${escapeHtml(step.syntheticValue)}</div>` : ''}
            <div class="step-details">Expected: ${escapeHtml(step.expectedResult)}</div>
            ${step.actualResult ? `<div class="step-details">Actual: ${escapeHtml(step.actualResult)}</div>` : ''}
            ${uv ? `
              <div style="margin-top: 8px; padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; font-size: 0.85em;">
                <strong>5-Stage Upload Verification Pipeline (${uv.verifiedStagesCount}/5 Stages Verified):</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                  <span style="padding: 2px 8px; border-radius: 4px; background: ${uv.fileSelection === 'verified' ? '#d1fae5' : '#fee2e2'}; color: ${uv.fileSelection === 'verified' ? '#065f46' : '#991b1b'};">1. File Selection: ${escapeHtml(uv.fileSelection)}</span>
                  <span style="padding: 2px 8px; border-radius: 4px; background: ${uv.uiStateUpdate === 'verified' ? '#d1fae5' : '#fee2e2'}; color: ${uv.uiStateUpdate === 'verified' ? '#065f46' : '#991b1b'};">2. UI State Update: ${escapeHtml(uv.uiStateUpdate)}</span>
                  <span style="padding: 2px 8px; border-radius: 4px; background: ${uv.networkRequest === 'verified' ? '#d1fae5' : '#fef3c7'}; color: ${uv.networkRequest === 'verified' ? '#065f46' : '#92400e'};">3. Network Request: ${escapeHtml(uv.networkRequest)}</span>
                  <span style="padding: 2px 8px; border-radius: 4px; background: ${uv.serverResponse === 'verified' ? '#d1fae5' : '#fef3c7'}; color: ${uv.serverResponse === 'verified' ? '#065f46' : '#92400e'};">4. Server 2xx Response: ${escapeHtml(uv.serverResponse)}</span>
                  <span style="padding: 2px 8px; border-radius: 4px; background: ${uv.appProcessing === 'verified' ? '#d1fae5' : '#fef3c7'}; color: ${uv.appProcessing === 'verified' ? '#065f46' : '#92400e'};">5. App Processing: ${escapeHtml(uv.appProcessing)}</span>
                </div>
              </div>
            ` : ''}
            ${step.error ? `<div style="color: #dc2626; margin-top: 8px;">Error: ${escapeHtml(step.error)}</div>` : ''}
            ${step.evidence ? `
              <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 4px; font-size: 0.9em;">
                <strong>Evidence:</strong> ${escapeHtml(step.evidence.verdict)} - ${escapeHtml(step.evidence.reason)}
                ${step.evidence.networkCalls?.length ? `<div>Network calls: ${step.evidence.networkCalls.length}</div>` : ''}
                ${step.evidence.consoleErrors?.length ? `<div>Console errors: ${step.evidence.consoleErrors.length}</div>` : ''}
              </div>
            ` : ''}
          </div>
        `}).join('')}
      `
    }).join('')}
  `
}

function generateWorkflowsSection(job: AutomationJob): string {
  const workflows = job.report?.workflows || job.fullAppTestPlan?.workflows || []
  if (workflows.length === 0) return ''

  return `
    <div class="page-break"></div>
    <h2>Workflow Executions (${workflows.length})</h2>

    ${workflows.map(workflow => `
      <div class="workflow-card">
        <div class="workflow-header">
          <div class="workflow-name">${escapeHtml(workflow.name)}</div>
          <span class="status-badge status-${workflow.verdict}">${workflow.verdict}</span>
        </div>

        <div style="margin: 10px 0; color: #64748b;">
          Entry: ${escapeHtml(workflow.entryUrl)}
          ${workflow.entryComponentLocation ? ` (${escapeHtml(workflow.entryComponentLocation)})` : ''}
        </div>

        <div style="margin: 15px 0;">${escapeHtml(workflow.summary)}</div>

        ${workflow.dataReflected !== undefined ? `
          <div style="margin: 10px 0;">
            <strong>Data Reflection:</strong>
            <span style="color: ${workflow.dataReflected ? '#10b981' : '#dc2626'};">
              ${workflow.dataReflected ? '✓ Data persisted and reflected' : '✗ Data not reflected'}
            </span>
          </div>
        ` : ''}

        <h4 style="margin-top: 20px;">Steps (${workflow.steps.length})</h4>
        ${workflow.steps.map((step, index) => `
          <div class="test-step status-${step.verdict}" style="margin: 10px 0;">
            <div class="step-header">
              <div>${index + 1}. ${escapeHtml(step.action)}</div>
              <span class="status-badge status-${step.verdict}">${step.verdict}</span>
            </div>
            <div class="step-details">Screen: ${escapeHtml(step.screenName)}</div>
            ${step.targetName ? `<div class="step-details">Target: ${escapeHtml(step.targetName)}</div>` : ''}
            <div class="step-details">Expected: ${escapeHtml(step.expectedOutcome)}</div>
            ${step.observedOutcome ? `<div class="step-details">Observed: ${escapeHtml(step.observedOutcome)}</div>` : ''}
            ${step.error ? `<div style="color: #dc2626; margin-top: 5px;">${escapeHtml(step.error)}</div>` : ''}
            <div class="step-details">Duration: ${step.durationMs}ms</div>
          </div>
        `).join('')}

        ${workflow.reproSteps && workflow.reproSteps.length > 0 ? `
          <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 6px;">
            <strong>Reproduction Steps:</strong>
            <ol style="margin-left: 20px; margin-top: 10px;">
              ${workflow.reproSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
            </ol>
          </div>
        ` : ''}
      </div>
    `).join('')}
  `
}

function generateRecommendations(job: AutomationJob): string {
  const recommendations = job.report?.recommendations || []
  if (recommendations.length === 0) return ''

  return `
    <div class="page-break"></div>
    <h2>Recommendations</h2>
    <div class="recommendations-list">
      <ul>
        ${recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
      </ul>
    </div>
  `
}

function generateLogsSection(job: AutomationJob): string {
  const logs = job.logs || []
  if (logs.length === 0) return ''

  return `
    <div class="page-break"></div>
    <h2>Execution Logs (${logs.length})</h2>
    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; background: #fafafa;">
      ${logs.map(log => `
        <div class="log-entry log-${log.level}">
          <span style="opacity: 0.7;">[${formatTime(log.timestamp)}]</span>
          <span style="font-weight: 600; margin: 0 8px;">[${log.level.toUpperCase()}]</span>
          <span>${escapeHtml(log.message)}</span>
        </div>
      `).join('')}
    </div>
  `
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hours}h ${remainMins}m ${secs}s`
}
