/**
 * Session Compactor — Automatic context compression for long conversations.
 *
 * Inspired by Claude Code's /dream + conversation-summary approach.
 * Optimized for DeepSeek's cache-aware billing: keeps prompt prefix stable
 * so context cache hits remain high even after compaction.
 *
 * Strategy:
 * 1. Monitor token usage per session.
 * 2. When usage exceeds a threshold (configurable, default 60% of context
 *    window), trigger compaction.
 * 3. Compaction summarizes older conversation turns into a `<conversation-summary>`
 *    block that is prepended AFTER the system prompt (preserving the stable
 *    prefix for DeepSeek caching).
 * 4. The original messages are archived (not deleted) for auditing.
 *
 * This module provides the compaction prompt template and the decision logic.
 * Actual LLM summarization is delegated to the existing "compaction" agent.
 */

export interface CompactionConfig {
  /** Fraction of max context at which to trigger compaction (0.0 - 1.0). */
  triggerThreshold: number
  /** Fraction of context to keep after compaction. */
  targetThreshold: number
  /** Minimum number of messages before compaction is eligible. */
  minMessages: number
  /** Maximum tokens for the summary itself. */
  maxSummaryTokens: number
  /** Whether to preserve the N most recent messages uncompacted. */
  preserveRecentCount: number
}

export const DEFAULT_CONFIG: CompactionConfig = {
  triggerThreshold: 0.6,
  targetThreshold: 0.3,
  minMessages: 10,
  maxSummaryTokens: 2000,
  preserveRecentCount: 4,
}

export interface CompactionDecision {
  shouldCompact: boolean
  messagesCountToCompact: number
  estimatedSavedTokens: number
}

/**
 * Decide whether the session needs compaction.
 */
export function shouldCompact(
  currentTokens: number,
  maxContextTokens: number,
  messageCount: number,
  config: CompactionConfig = DEFAULT_CONFIG,
): CompactionDecision {
  const ratio = currentTokens / maxContextTokens
  if (ratio < config.triggerThreshold || messageCount < config.minMessages) {
    return { shouldCompact: false, messagesCountToCompact: 0, estimatedSavedTokens: 0 }
  }

  // How many messages we'd need to remove to get below target
  const targetTokens = maxContextTokens * config.targetThreshold
  const tokensToFree = currentTokens - targetTokens
  // Rough estimate: assume uniform distribution across messages
  const avgTokensPerMsg = currentTokens / messageCount
  const msgsToCompact = Math.max(
    config.minMessages,
    Math.min(
      messageCount - config.preserveRecentCount,
      Math.ceil(tokensToFree / avgTokensPerMsg),
    ),
  )

  return {
    shouldCompact: true,
    messagesCountToCompact: msgsToCompact,
    estimatedSavedTokens: msgsToCompact * avgTokensPerMsg,
  }
}

/**
 * Generate the compaction prompt for the summarization agent.
 *
 * The generated summary should:
 * - Capture key decisions, file paths modified, and outstanding tasks
 * - Use structured format (bullet list) for easy parsing
 * - Be idempotent-safe (re-summarizing a summary should not lose info)
 */
export function compactionPrompt(conversationSnippet: string): string {
  return `You are a conversation compactor. Summarize the following conversation history into a concise structured summary that preserves:

1. **Key decisions made** (technology choices, architecture decisions, rejected alternatives)
2. **Files created/modified** (path + what was done)
3. **Outstanding issues** (errors encountered, unresolved questions)
4. **Current task state** (what the user was working on, what comes next)

Rules:
- Use bullet points, not prose
- Keep file paths exact (do not abbreviate)
- Preserve code snippets only if they are critical to understanding next steps
- Target length: 500-1500 tokens
- Do NOT include greetings, meta-commentary, or filler

<conversation_to_summarize>
${conversationSnippet}
</conversation_to_summarize>

Output your summary inside <conversation-summary> tags.`
}

/**
 * Wrap a completed summary into the format that gets injected after system prompt.
 */
export function formatSummaryBlock(summary: string, compactedAt: Date, originalMessageCount: number): string {
  return [
    `<conversation-summary compacted-at="${compactedAt.toISOString()}" original-messages="${originalMessageCount}">`,
    summary.trim(),
    `</conversation-summary>`,
  ].join("\n")
}

/**
 * Extract an existing summary block from messages (for incremental compaction).
 */
export function extractExistingSummary(text: string): string | null {
  const match = text.match(/<conversation-summary[^>]*>([\s\S]*?)<\/conversation-summary>/)
  return match ? match[1].trim() : null
}

export * as SessionCompactor from "./session-compactor"
