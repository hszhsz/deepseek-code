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
 * 5. Cache-aware compaction decisions - avoid destroying KV cache when
 *    the cost of re-prefill outweighs compaction benefits
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
 * Cache-Aware Compaction Configuration
 *
 * DeepSeek automatically caches repeated prefixes. Compacting early
 * destroys this cache and forces expensive re-prefill. This config
 * sets the "cache safety floor" - below this token count, compaction
 * is skipped because the cache savings outweigh context pressure.
 *
 * Economics:
 * - Cache hit rate: ~1/50th of regular input price
 * - If 300K tokens are cached: saves ~$0.13/call for V4-Pro
 * - Compaction destroys ALL cached prefixes (cache miss on next call)
 * - After compaction: next call pays full input price on entire context
 *
 * Therefore: don't compact unless context pressure is genuinely high.
 */
export const CACHE_AWARE_CONFIG = {
  /**
   * Hard floor for compaction - never compact below this token count.
   * At 500K tokens with typical cache hit rates (~70%), the cache saves
   * more than the context pressure costs. Only compact when exceeding
   * this floor AND the overflow threshold.
   */
  COMPACTION_FLOOR_TOKENS: 500_000,

  /**
   * Minimum cache hit ratio to consider cache "healthy".
   * If recent calls show >60% cache hits, prefer keeping context intact.
   */
  HEALTHY_CACHE_HIT_RATIO: 0.6,

  /**
   * Cost multiplier threshold. Only compact when estimated cost of
   * maintaining current context exceeds this multiple of post-compaction cost.
   * 2.0 means: only compact if current cost > 2x what compacted cost would be.
   */
  COMPACTION_COST_THRESHOLD: 2.0,

  /**
   * Number of recent turns to sample for cache hit rate estimation.
   */
  CACHE_SAMPLE_TURNS: 5,
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
 * Determines whether compaction should be skipped based on cache economics.
 *
 * @param currentTokens - Current token usage in the context
 * @param contextLimit - Model's total context limit
 * @param recentCacheHitRatio - Estimated cache hit ratio from recent turns (0-1)
 * @returns true if compaction should be SKIPPED (cache is too valuable to destroy)
 */
export function shouldSkipCompaction(input: {
  currentTokens: number
  contextLimit: number
  recentCacheHitRatio?: number
}): boolean {
  // Never skip if we're critically close to overflow (>95% of context)
  if (input.currentTokens > input.contextLimit * 0.95) {
    return false
  }

  // Skip compaction if below the hard floor
  if (input.currentTokens < CACHE_AWARE_CONFIG.COMPACTION_FLOOR_TOKENS) {
    return true
  }

  // If we have cache hit data and it's healthy, prefer keeping context
  if (
    input.recentCacheHitRatio !== undefined &&
    input.recentCacheHitRatio >= CACHE_AWARE_CONFIG.HEALTHY_CACHE_HIT_RATIO &&
    input.currentTokens < input.contextLimit * 0.85
  ) {
    return true
  }

  return false
}

/**
 * Estimates the cost impact of compaction vs keeping current context.
 * Returns the ratio: (cost_after_compaction / cost_without_compaction)
 * Values > 1.0 mean compaction is MORE expensive (due to cache loss).
 */
export function estimateCompactionCostImpact(input: {
  currentTokens: number
  estimatedPostCompactionTokens: number
  cacheHitRatio: number
  model: "deepseek-v4-pro" | "deepseek-v4-flash"
}): { ratio: number; shouldCompact: boolean } {
  const pricing = {
    "deepseek-v4-pro": { input: 0.435, cacheHit: 0.003625 },
    "deepseek-v4-flash": { input: 0.14, cacheHit: 0.0028 },
  }
  const p = pricing[input.model]

  // Current cost per call (with cache benefits)
  const cachedTokens = input.currentTokens * input.cacheHitRatio
  const uncachedTokens = input.currentTokens * (1 - input.cacheHitRatio)
  const currentCostPerCall = (uncachedTokens * p.input + cachedTokens * p.cacheHit) / 1_000_000

  // Cost after compaction (no cache on first call - all tokens are cache miss)
  const postCompactionCost = (input.estimatedPostCompactionTokens * p.input) / 1_000_000

  const ratio = postCompactionCost / (currentCostPerCall || 0.0001)
  return {
    ratio,
    shouldCompact: ratio < CACHE_AWARE_CONFIG.COMPACTION_COST_THRESHOLD,
  }
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
