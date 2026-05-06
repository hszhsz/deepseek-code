/**
 * Hooks System — Event-driven extension points inspired by Claude Code.
 *
 * Hook types:
 * - PreToolUse: Fires before a tool executes. Can modify args or block execution.
 * - PostToolUse: Fires after a tool completes. Can transform output.
 * - UserPromptSubmit: Fires when user submits a prompt.
 * - SessionStart: Fires when a new session begins.
 * - SessionEnd: Fires when a session closes.
 * - Stop: Fires when the agent loop terminates (natural or forced).
 * - CompactionTrigger: Fires when context compaction is triggered.
 *
 * Hooks are configured in settings.json (layered: global → project → local):
 *
 * ```jsonc
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       { "match": "shell", "command": "echo 'About to run shell'" }
 *     ],
 *     "PostToolUse": [
 *       { "match": "*", "command": "echo 'Tool $TOOL_ID completed'" }
 *     ]
 *   }
 * }
 * ```
 *
 * Design: Hooks are executed by the HARNESS (this module), not by the LLM.
 * This makes them deterministic and reliable for automation.
 */

import { execSync } from "child_process"
import * as path from "path"

// ─── Types ────────────────────────────────────────────────────────────────────

export type HookType =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "CompactionTrigger"

export interface HookDefinition {
  /** Glob pattern matching tool IDs (for PreToolUse/PostToolUse) or "*" for all. */
  match: string
  /** Shell command to execute. Has access to env vars: $TOOL_ID, $SESSION_ID, etc. */
  command: string
  /** Timeout in ms (default 10000). */
  timeout?: number
  /** If true, a non-zero exit code blocks tool execution (PreToolUse only). */
  blocking?: boolean
}

export interface HookContext {
  hookType: HookType
  toolID?: string
  sessionID: string
  workingDirectory: string
  /** Additional env vars passed to the hook command. */
  env?: Record<string, string>
}

export interface HookResult {
  executed: boolean
  exitCode?: number
  stdout?: string
  stderr?: string
  blocked?: boolean
  error?: string
}

// ─── Configuration ────────────────────────────────────────────────────────────

export type HooksConfig = Partial<Record<HookType, HookDefinition[]>>

/**
 * Merge hook configs from multiple layers (global → project → local).
 * Later layers append; they don't replace.
 */
export function mergeHookConfigs(...layers: (HooksConfig | undefined)[]): HooksConfig {
  const merged: HooksConfig = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [type, defs] of Object.entries(layer)) {
      const key = type as HookType
      if (!merged[key]) merged[key] = []
      merged[key]!.push(...(defs ?? []))
    }
  }
  return merged
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function matchesPattern(pattern: string, value: string | undefined): boolean {
  if (pattern === "*") return true
  if (!value) return false
  // Simple glob: exact match or prefix-*
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1))
  }
  return pattern === value
}

// ─── Execution ────────────────────────────────────────────────────────────────

/**
 * Run all matching hooks for a given event.
 * Returns results for each hook that was executed.
 */
export function runHooks(
  config: HooksConfig,
  ctx: HookContext,
): HookResult[] {
  const defs = config[ctx.hookType]
  if (!defs || defs.length === 0) return []

  const results: HookResult[] = []

  for (const def of defs) {
    if (!matchesPattern(def.match, ctx.toolID ?? "*")) continue

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOOK_TYPE: ctx.hookType,
      SESSION_ID: ctx.sessionID,
      WORKING_DIR: ctx.workingDirectory,
      ...(ctx.toolID ? { TOOL_ID: ctx.toolID } : {}),
      ...(ctx.env ?? {}),
    }

    const timeout = def.timeout ?? 10_000

    try {
      const stdout = execSync(def.command, {
        cwd: ctx.workingDirectory,
        env,
        timeout,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })

      results.push({ executed: true, exitCode: 0, stdout: stdout.slice(0, 4096) })
    } catch (err: any) {
      const exitCode = err.status ?? 1
      const blocked = def.blocking === true && ctx.hookType === "PreToolUse" && exitCode !== 0

      results.push({
        executed: true,
        exitCode,
        stdout: err.stdout?.slice(0, 2048),
        stderr: err.stderr?.slice(0, 2048),
        blocked,
        error: blocked
          ? `Hook blocked tool execution: ${def.command} (exit ${exitCode})`
          : undefined,
      })
    }
  }

  return results
}

/**
 * Convenience: run PreToolUse hooks and check if any blocked.
 */
export function runPreToolUse(
  config: HooksConfig,
  toolID: string,
  sessionID: string,
  cwd: string,
): { blocked: boolean; reason?: string } {
  const results = runHooks(config, {
    hookType: "PreToolUse",
    toolID,
    sessionID,
    workingDirectory: cwd,
  })

  const blocker = results.find((r) => r.blocked)
  if (blocker) {
    return { blocked: true, reason: blocker.error ?? `PreToolUse hook blocked ${toolID}` }
  }
  return { blocked: false }
}

/**
 * Convenience: run PostToolUse hooks (never blocks, just runs).
 */
export function runPostToolUse(
  config: HooksConfig,
  toolID: string,
  sessionID: string,
  cwd: string,
  extraEnv?: Record<string, string>,
): HookResult[] {
  return runHooks(config, {
    hookType: "PostToolUse",
    toolID,
    sessionID,
    workingDirectory: cwd,
    env: extraEnv,
  })
}

export * as Hooks from "./hooks"
