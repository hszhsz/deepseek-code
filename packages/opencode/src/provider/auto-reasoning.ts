/**
 * Auto Reasoning - Adaptive reasoning effort selection for DeepSeek models.
 *
 * Inspired by DeepSeek-TUI's auto-reasoning system:
 * - Analyzes message content to determine optimal reasoning effort
 * - Routes sub-agents to lower effort levels for cost savings
 * - Detects complex tasks (debugging, architecture) for maximum reasoning
 * - Detects simple tasks (search, lookup) for minimal reasoning
 *
 * Reasoning effort levels:
 * - "off"  : No extended thinking (fastest, cheapest)
 * - "low"  : Minimal reasoning (quick lookups, simple queries)
 * - "high" : Standard reasoning (default for most coding tasks)
 * - "max"  : Maximum reasoning (complex debugging, architecture decisions)
 */

export type ReasoningEffort = "off" | "low" | "high" | "max"

/**
 * Keywords/patterns that indicate high-complexity tasks requiring maximum reasoning.
 */
const HIGH_COMPLEXITY_PATTERNS = [
  /\b(debug|debugging)\b/i,
  /\b(error|exception|crash|segfault|sigtrap|panic)\b/i,
  /\b(architect|architecture|design pattern|refactor)\b/i,
  /\b(security|vulnerability|exploit|injection)\b/i,
  /\b(performance|optimize|bottleneck|profil)/i,
  /\b(concurren|deadlock|race condition|thread.safe)/i,
  /\b(memory leak|heap|stack overflow)\b/i,
  /\bwhy\s+(is|does|did|doesn't|isn't|won't)\b/i,
  /\b(fix|solve|resolve)\b.*\b(bug|issue|problem)\b/i,
  /\b(complex|complicated|tricky|subtle)\b/i,
]

/**
 * Keywords/patterns that indicate simple tasks requiring minimal reasoning.
 */
const LOW_COMPLEXITY_PATTERNS = [
  /\b(search|find|grep|locate|where)\b/i,
  /\b(list|show|display|print|cat)\b/i,
  /\b(lookup|look up|check)\b/i,
  /\b(rename|move|copy|delete)\s+(file|dir|folder)/i,
  /\b(what is|what's) the (path|name|version|status)\b/i,
  /\b(read|open|view)\s+(file|this)/i,
  /\b(format|indent|lint|prettier)\b/i,
  /\b(install|update|upgrade)\s+(package|dep|dependency)/i,
]

export interface AutoReasoningContext {
  /** The agent handling this request */
  agent: string
  /** The user's message text */
  messageText: string
  /** Whether this is a sub-agent call */
  isSubAgent: boolean
  /** User's configured preference (overrides auto) */
  userPreference?: ReasoningEffort
}

/**
 * Determines the optimal reasoning effort level based on context.
 *
 * Priority:
 * 1. User explicit preference (if set in config)
 * 2. Sub-agent → always "low" (cost optimization)
 * 3. Content-based heuristic analysis
 */
export function selectReasoningEffort(ctx: AutoReasoningContext): ReasoningEffort {
  // User override takes priority
  if (ctx.userPreference) {
    return ctx.userPreference
  }

  // Sub-agents always use low effort for cost savings
  if (ctx.isSubAgent) {
    return "low"
  }

  // Agent-specific defaults
  switch (ctx.agent) {
    case "explore":
    case "complete":
      return "low"
    case "plan":
      return "high"
    case "compaction":
    case "title":
    case "summary":
      return "off"
  }

  // Content-based heuristic analysis
  return analyzeMessageComplexity(ctx.messageText)
}

/**
 * Analyzes message content to determine complexity level.
 */
function analyzeMessageComplexity(text: string): ReasoningEffort {
  if (!text || text.length < 10) {
    return "high" // Default for very short messages
  }

  let highScore = 0
  let lowScore = 0

  for (const pattern of HIGH_COMPLEXITY_PATTERNS) {
    if (pattern.test(text)) highScore++
  }

  for (const pattern of LOW_COMPLEXITY_PATTERNS) {
    if (pattern.test(text)) lowScore++
  }

  // Multiple high-complexity signals → max reasoning
  if (highScore >= 2) return "max"
  // Single high-complexity signal → high reasoning
  if (highScore >= 1 && lowScore === 0) return "high"
  // Strong low-complexity signals → low reasoning
  if (lowScore >= 2 && highScore === 0) return "low"

  // Default to high for ambiguous cases
  return "high"
}

/**
 * Maps reasoning effort to the provider option value expected by DeepSeek API.
 * Returns the options object to merge into the provider call.
 */
export function reasoningEffortToOptions(effort: ReasoningEffort): Record<string, unknown> {
  if (effort === "off") {
    return {}
  }
  return { reasoningEffort: effort }
}

/**
 * Checks if a model supports reasoning effort configuration.
 */
export function supportsReasoningEffort(modelID: string): boolean {
  const id = modelID.toLowerCase()
  return id.includes("deepseek") && (id.includes("v4") || id.includes("r1"))
}

export * as AutoReasoning from "./auto-reasoning"
