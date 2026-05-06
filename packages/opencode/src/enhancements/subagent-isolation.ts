/**
 * Subagent Isolation — Summary-based context bridge.
 *
 * Inspired by Claude Code's fork-agent design where subagents work in
 * isolated contexts and only return structured summaries to the parent.
 *
 * Benefits:
 * - Parent agent's context window isn't bloated by subagent tool calls
 * - Cache-friendly: parent's prefix stays stable (better DeepSeek caching)
 * - Cost reduction: subagent failures don't pollute parent's token budget
 *
 * This module provides utilities used by the task tool to:
 * 1. Generate structured summary from subagent output
 * 2. Validate summary length constraints
 * 3. Extract key artifacts (file paths, decisions) from verbose output
 */

export interface SubagentSummary {
  /** One-line description of what the subagent did. */
  title: string
  /** Structured summary (max ~500 tokens). */
  summary: string
  /** Key file paths that were read or modified. */
  filesMentioned: string[]
  /** Whether the subagent completed successfully. */
  success: boolean
  /** If the subagent encountered an error, brief description. */
  error?: string
}

const MAX_SUMMARY_CHARS = 3000
const FILE_PATH_REGEX = /(?:^|\s)((?:\/[\w.-]+)+(?:\.\w+)?)/gm

/**
 * Extract a concise summary from raw subagent output text.
 * Used when the subagent doesn't produce its own structured summary.
 */
export function extractSummary(rawOutput: string, title: string): SubagentSummary {
  // Extract file paths mentioned
  const filesMentioned = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = FILE_PATH_REGEX.exec(rawOutput)) !== null) {
    const p = match[1]
    // Filter out common false positives
    if (p.length > 4 && !p.startsWith("/dev/") && !p.startsWith("/proc/")) {
      filesMentioned.add(p)
    }
  }

  // Detect success/failure
  const hasError = /\b(error|failed|failure|exception|cannot|unable)\b/i.test(rawOutput.slice(-500))
  const success = !hasError

  // Build summary: take last portion if too long (most relevant)
  let summary = rawOutput
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = "...(truncated)...\n" + rawOutput.slice(-MAX_SUMMARY_CHARS)
  }

  return {
    title,
    summary,
    filesMentioned: [...filesMentioned].slice(0, 20),
    success,
    error: hasError ? "Subagent encountered errors — see summary for details" : undefined,
  }
}

/**
 * Format a SubagentSummary into the text returned to the parent agent.
 * This replaces the raw task output in the parent's context.
 */
export function formatForParent(summary: SubagentSummary, taskId: string): string {
  const lines: string[] = [
    `task_id: ${taskId} (for resuming if needed)`,
    "",
    "<task_result>",
    `## ${summary.title}`,
    "",
    `**Status**: ${summary.success ? "✓ Completed" : "✗ Failed"}`,
  ]

  if (summary.filesMentioned.length > 0) {
    lines.push("", "**Files touched:**")
    for (const f of summary.filesMentioned.slice(0, 10)) {
      lines.push(`- ${f}`)
    }
  }

  if (summary.error) {
    lines.push("", `**Error:** ${summary.error}`)
  }

  lines.push("", "**Summary:**", summary.summary, "</task_result>")

  return lines.join("\n")
}

/**
 * Determine the maximum output the parent should accept from a subagent.
 * In economy mode this is more aggressive.
 */
export function maxOutputChars(economyMode: boolean): number {
  return economyMode ? 1500 : 4000
}

export * as SubagentIsolation from "./subagent-isolation"
