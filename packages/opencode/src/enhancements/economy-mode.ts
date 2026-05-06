/**
 * Economy Mode — "Poor Mode" inspired by Claude Code.
 *
 * When enabled, forces cost-saving behavior:
 * - Always routes to DeepSeek V4 Flash (never Pro)
 * - Disables auto-reasoning (effort = "off")
 * - Disables websearch/mcp-exa tools
 * - Reduces subagent parallelism to 1
 * - Disables memory extraction
 *
 * Activated via:
 * - CLI flag: --economy
 * - Config: { "economy": true }
 * - Env: DEEPSEEK_CODE_ECONOMY=1
 */

import { type ReasoningEffort } from "../provider/auto-reasoning"

export interface EconomyConfig {
  enabled: boolean
  /** Force this model for all requests (override router). */
  forceModel?: string
  /** Cap reasoning effort. */
  maxReasoningEffort: ReasoningEffort
  /** Disable these tools entirely. */
  disabledTools: string[]
  /** Max concurrent subagent tasks. */
  maxSubagentParallelism: number
  /** Disable memory/instruction extraction. */
  disableMemory: boolean
  /** Disable websearch. */
  disableWebSearch: boolean
}

export const ECONOMY_DEFAULTS: EconomyConfig = {
  enabled: false,
  forceModel: undefined,
  maxReasoningEffort: "off",
  disabledTools: ["websearch", "mcp-exa", "webfetch"],
  maxSubagentParallelism: 1,
  disableMemory: true,
  disableWebSearch: true,
}

export const NORMAL_DEFAULTS: EconomyConfig = {
  enabled: false,
  forceModel: undefined,
  maxReasoningEffort: "max",
  disabledTools: [],
  maxSubagentParallelism: 4,
  disableMemory: false,
  disableWebSearch: false,
}

/**
 * Resolve the active economy config from environment + config.
 */
export function resolveEconomyConfig(
  configValue?: boolean | Partial<EconomyConfig>,
): EconomyConfig {
  // Env override
  const envEnabled = process.env.DEEPSEEK_CODE_ECONOMY === "1" || process.env.DEEPSEEK_CODE_ECONOMY === "true"

  if (!envEnabled && !configValue) {
    return NORMAL_DEFAULTS
  }

  if (envEnabled || configValue === true) {
    return { ...ECONOMY_DEFAULTS, enabled: true }
  }

  if (typeof configValue === "object") {
    return { ...ECONOMY_DEFAULTS, ...configValue, enabled: true }
  }

  return NORMAL_DEFAULTS
}

/**
 * Check if a tool should be disabled under current economy settings.
 */
export function isToolDisabled(toolID: string, config: EconomyConfig): boolean {
  if (!config.enabled) return false
  return config.disabledTools.includes(toolID)
}

/**
 * Cap reasoning effort to the economy maximum.
 */
export function capReasoningEffort(effort: ReasoningEffort, config: EconomyConfig): ReasoningEffort {
  if (!config.enabled) return effort
  const levels: ReasoningEffort[] = ["off", "low", "high", "max"]
  const maxIdx = levels.indexOf(config.maxReasoningEffort)
  const currentIdx = levels.indexOf(effort)
  return currentIdx > maxIdx ? config.maxReasoningEffort : effort
}

export * as EconomyMode from "./economy-mode"
