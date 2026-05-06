/**
 * deepseek-code enhancements — Inspired by Claude Code best practices.
 *
 * This package provides:
 * - ReadTracker: Read-before-Edit file safety guard
 * - BashSafety: Dangerous command blocklist + network listener ban
 * - ToolScheduler: Read-only vs write-tool parallel scheduling
 * - SessionCompactor: Automatic context compression
 * - EconomyMode: Cost-saving "Poor Mode"
 * - Hooks: Event-driven extension points (PreToolUse/PostToolUse/etc.)
 * - LayeredConfig: Three-tier settings.json merge
 * - PromptBlocks: Composable system prompt architecture
 * - SubagentIsolation: Summary-based context bridge for task tool
 */

export { markRead, assertReadBeforeEdit, clearSession } from "./read-tracker"
export { checkCommand, assertCommandSafe } from "./bash-safety"
export { getMeta, scheduleParallel, canParallelize } from "./tool-scheduler"
export { shouldCompact, compactionPrompt, formatSummaryBlock, extractExistingSummary, DEFAULT_CONFIG as COMPACTION_DEFAULTS } from "./session-compactor"
export { resolveEconomyConfig, isToolDisabled, capReasoningEffort, ECONOMY_DEFAULTS, NORMAL_DEFAULTS } from "./economy-mode"
export { runHooks, runPreToolUse, runPostToolUse, mergeHookConfigs } from "./hooks"
export type { HooksConfig, HookDefinition, HookType, HookContext, HookResult } from "./hooks"
export { loadSettings, writeSettings, getSetting, globalSettingsPath, projectSettingsPath, localSettingsPath } from "./layered-config"
export type { LayeredSettings } from "./layered-config"
export { renderSystemPrompt, registerBlock, removeBlock, activeBlockNames } from "./prompt-blocks/index"
export type { PromptBlock, PromptContext } from "./prompt-blocks/index"
export { extractSummary, formatForParent, maxOutputChars } from "./subagent-isolation"
export type { SubagentSummary } from "./subagent-isolation"
