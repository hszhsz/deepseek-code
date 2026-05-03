/**
 * DeepSeek Context Management Optimization
 *
 * DeepSeek V4 models support 1M token context windows.
 * This module provides optimized compaction thresholds and
 * cache-aware context management strategies.
 *
 * Key optimizations:
 * 1. Delayed compaction - leverage the full 1M window before compacting
 * 2. Stable prefix ordering - keep system prompts and project context
 *    at the beginning for DeepSeek's automatic context caching
 * 3. Larger retention of recent messages after compaction
 * 4. Higher tool output limits for code-heavy workflows
 */

/**
 * DeepSeek-specific compaction thresholds.
 * These override the defaults in compaction.ts when a DeepSeek model is detected.
 */
export const DEEPSEEK_COMPACTION_CONFIG = {
  /**
   * Minimum tokens in tool output before pruning kicks in.
   * DeepSeek's large context allows us to keep more tool output.
   * Default in opencode: 20_000
   */
  PRUNE_MINIMUM: 80_000,

  /**
   * Protected token count for tool outputs (won't be pruned).
   * Default in opencode: 40_000
   */
  PRUNE_PROTECT: 160_000,

  /**
   * Maximum chars for tool output before truncation.
   * Default in opencode: 2_000
   */
  TOOL_OUTPUT_MAX_CHARS: 8_000,

  /**
   * Number of tail turns to preserve during compaction.
   * Default in opencode: 2
   */
  DEFAULT_TAIL_TURNS: 6,

  /**
   * Minimum tokens to preserve from recent messages.
   * Default in opencode: 2_000
   */
  MIN_PRESERVE_RECENT_TOKENS: 8_000,

  /**
   * Maximum tokens to preserve from recent messages.
   * Default in opencode: 8_000
   */
  MAX_PRESERVE_RECENT_TOKENS: 32_000,
} as const

/**
 * Determines if the current model is a DeepSeek model.
 */
export function isDeepSeekModel(modelID: string): boolean {
  return modelID.toLowerCase().includes("deepseek")
}

/**
 * Gets the effective context limit for a DeepSeek model.
 * DeepSeek V4 models support 1M tokens, but we set the compaction
 * trigger at 80% to leave room for the response.
 */
export function getEffectiveContextLimit(modelContextLimit: number): number {
  // Trigger compaction at 80% of context window
  return Math.floor(modelContextLimit * 0.8)
}

/**
 * Context Caching Strategy
 *
 * DeepSeek automatically caches repeated context prefixes.
 * Cache hit pricing is 1/50th of regular input pricing.
 *
 * To maximize cache hits:
 * 1. System prompt should be stable and placed first
 * 2. Project structure / file tree should follow system prompt
 * 3. User messages and tool results come last (most volatile)
 *
 * This function provides ordering hints for message assembly.
 */
export interface ContextOrderingHint {
  /** Messages that should remain stable at the prefix (high cache hit potential) */
  stablePrefix: string[]
  /** Messages that change frequently (will not benefit from caching) */
  volatileSuffix: string[]
}

export function getContextOrderingStrategy(): ContextOrderingHint {
  return {
    stablePrefix: [
      "system_prompt",      // Always first
      "project_context",    // Project structure, barely changes
      "instructions",       // User instructions from config
      "skills",            // Loaded skills
    ],
    volatileSuffix: [
      "tool_results",      // Frequently changing
      "user_messages",     // New each turn
      "assistant_messages", // New each turn
    ],
  }
}

/**
 * Calculates estimated cost savings from context caching.
 * Useful for displaying to users in the cost panel.
 */
export function estimateCacheSavings(input: {
  totalInputTokens: number
  cacheHitTokens: number
  model: "deepseek-v4-pro" | "deepseek-v4-flash"
}): { withoutCache: number; withCache: number; saved: number; savingsPercent: number } {
  const pricing = {
    "deepseek-v4-pro": { input: 0.435, cacheHit: 0.003625 },
    "deepseek-v4-flash": { input: 0.14, cacheHit: 0.0028 },
  }

  const p = pricing[input.model]
  const cacheMissTokens = input.totalInputTokens - input.cacheHitTokens

  const withoutCache = (input.totalInputTokens * p.input) / 1_000_000
  const withCache = (cacheMissTokens * p.input + input.cacheHitTokens * p.cacheHit) / 1_000_000
  const saved = withoutCache - withCache
  const savingsPercent = withoutCache > 0 ? (saved / withoutCache) * 100 : 0

  return { withoutCache, withCache, saved, savingsPercent }
}
