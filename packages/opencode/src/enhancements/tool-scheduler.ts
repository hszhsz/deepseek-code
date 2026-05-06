/**
 * Tool Metadata — readOnly flag + parallel scheduling hints.
 *
 * Inspired by Claude Code's policy: read-only tools can be dispatched in
 * parallel (glob, grep, read, webfetch, websearch, lsp), while write tools
 * (edit, write, shell, apply_patch, task) must be serialized to prevent
 * race conditions.
 *
 * This module provides a static registry queried by the session runner to
 * decide whether multiple tool calls in the same turn can be parallelized.
 */

export interface ToolMeta {
  /** If true, tool makes no persistent changes; safe to run concurrently. */
  readOnly: boolean
  /** Max concurrent invocations of this tool per turn (0 = unlimited). */
  maxConcurrency: number
  /** Priority hint — lower number = scheduled first (default 5). */
  priority: number
}

const DEFAULTS: ToolMeta = { readOnly: false, maxConcurrency: 1, priority: 5 }

const TOOL_META: Record<string, Partial<ToolMeta>> = {
  // ─── Read-only tools (parallelizable) ───────────────────────────
  read: { readOnly: true, maxConcurrency: 0, priority: 1 },
  glob: { readOnly: true, maxConcurrency: 0, priority: 2 },
  grep: { readOnly: true, maxConcurrency: 0, priority: 2 },
  lsp: { readOnly: true, maxConcurrency: 0, priority: 3 },
  webfetch: { readOnly: true, maxConcurrency: 4, priority: 4 },
  websearch: { readOnly: true, maxConcurrency: 2, priority: 4 },
  question: { readOnly: true, maxConcurrency: 1, priority: 0 },
  todo: { readOnly: true, maxConcurrency: 1, priority: 6 },

  // ─── Write tools (serialized) ──────────────────────────────────
  edit: { readOnly: false, maxConcurrency: 1, priority: 5 },
  write: { readOnly: false, maxConcurrency: 1, priority: 5 },
  apply_patch: { readOnly: false, maxConcurrency: 1, priority: 5 },
  shell: { readOnly: false, maxConcurrency: 1, priority: 5 },
  task: { readOnly: false, maxConcurrency: 2, priority: 7 },
  skill: { readOnly: false, maxConcurrency: 1, priority: 3 },
  fim: { readOnly: true, maxConcurrency: 1, priority: 6 },
  plan: { readOnly: false, maxConcurrency: 1, priority: 1 },
}

/**
 * Get metadata for a given tool ID.
 * Falls back to conservative defaults (readOnly=false, maxConcurrency=1).
 */
export function getMeta(toolID: string): ToolMeta {
  const overrides = TOOL_META[toolID]
  if (!overrides) return DEFAULTS
  return { ...DEFAULTS, ...overrides }
}

/**
 * Given a list of tool IDs to invoke in a turn, partition them into groups
 * that can be run concurrently.
 *
 * Algorithm:
 * 1. Separate read-only and write tools.
 * 2. All read-only tools form one concurrent group (respecting maxConcurrency).
 * 3. Write tools each form their own sequential group (order preserved).
 * 4. Read group runs first, then writes sequentially.
 */
export function scheduleParallel(toolIDs: string[]): { parallel: string[]; sequential: string[] } {
  const parallel: string[] = []
  const sequential: string[] = []

  for (const id of toolIDs) {
    const meta = getMeta(id)
    if (meta.readOnly) {
      parallel.push(id)
    } else {
      sequential.push(id)
    }
  }

  return { parallel, sequential }
}

/**
 * Check if a set of tool calls can all be dispatched concurrently.
 */
export function canParallelize(toolIDs: string[]): boolean {
  return toolIDs.every((id) => getMeta(id).readOnly)
}

export * as ToolScheduler from "./tool-scheduler"
