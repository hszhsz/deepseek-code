/**
 * Anti-Loop Guard - Detects and prevents repeated identical tool calls.
 *
 * When the model enters a "doom loop" (calling the same tool with the same
 * arguments repeatedly), this guard detects the pattern and injects a
 * corrective synthetic result to break the cycle.
 *
 * Behavior:
 * - Tracks (tool_name, normalized_args) pairs within a session
 * - 1st call: normal execution
 * - 2nd call: normal execution (retries are legitimate)
 * - 3rd identical call: returns synthetic error asking model to try a different approach
 * - Per-tool failure tracking: warns at 3 failures, halts tool at 8 failures
 *
 * Configuration:
 * - MAX_IDENTICAL_CALLS: threshold before synthetic intervention (default: 3)
 * - MAX_TOOL_FAILURES: per-tool failure cap before disabling (default: 8)
 * - WARN_TOOL_FAILURES: per-tool failure count that triggers a warning (default: 3)
 * - WINDOW_SIZE: number of recent calls to track (default: 50)
 */

export const ANTI_LOOP_CONFIG = {
  /** Maximum identical calls before synthetic intervention */
  MAX_IDENTICAL_CALLS: 3,
  /** Maximum failures per tool before disabling it for the session turn */
  MAX_TOOL_FAILURES: 8,
  /** Failure count that triggers a warning message */
  WARN_TOOL_FAILURES: 3,
  /** Number of recent calls to track in the sliding window */
  WINDOW_SIZE: 50,
} as const

interface CallRecord {
  tool: string
  argsHash: string
  timestamp: number
  failed: boolean
}

interface ToolFailureCount {
  failures: number
  warned: boolean
}

export class AntiLoopGuard {
  private calls: CallRecord[] = []
  private toolFailures: Map<string, ToolFailureCount> = new Map()

  /**
   * Records a tool call and checks if it should be blocked.
   *
   * @returns null if the call should proceed normally,
   *          or a string message to return as synthetic output
   */
  check(tool: string, args: unknown): string | null {
    const argsHash = this.hashArgs(args)

    // Check per-tool failure cap
    const failures = this.toolFailures.get(tool)
    if (failures && failures.failures >= ANTI_LOOP_CONFIG.MAX_TOOL_FAILURES) {
      return `Tool "${tool}" has failed ${failures.failures} times in this turn. It has been temporarily disabled. Please use a different approach to accomplish your goal.`
    }

    // Count identical calls in the window
    const identicalCount = this.calls.filter(
      (c) => c.tool === tool && c.argsHash === argsHash,
    ).length

    if (identicalCount >= ANTI_LOOP_CONFIG.MAX_IDENTICAL_CALLS) {
      return [
        `LOOP DETECTED: You have called "${tool}" with identical arguments ${identicalCount + 1} times.`,
        `This is not productive. Please try a DIFFERENT approach:`,
        `- Use different arguments or parameters`,
        `- Try an alternative tool that achieves the same goal`,
        `- If the tool is failing, analyze the error and address the root cause`,
        `- If you're stuck, ask the user for clarification`,
      ].join("\n")
    }

    // Record the call
    this.calls.push({ tool, argsHash, timestamp: Date.now(), failed: false })

    // Trim sliding window
    if (this.calls.length > ANTI_LOOP_CONFIG.WINDOW_SIZE) {
      this.calls = this.calls.slice(-ANTI_LOOP_CONFIG.WINDOW_SIZE)
    }

    return null
  }

  /**
   * Records a tool failure for per-tool failure tracking.
   * @returns warning message if threshold reached, null otherwise
   */
  recordFailure(tool: string): string | null {
    const existing = this.toolFailures.get(tool) ?? { failures: 0, warned: false }
    existing.failures++
    this.toolFailures.set(tool, existing)

    // Mark the most recent call for this tool as failed
    for (let i = this.calls.length - 1; i >= 0; i--) {
      if (this.calls[i].tool === tool && !this.calls[i].failed) {
        this.calls[i].failed = true
        break
      }
    }

    if (existing.failures >= ANTI_LOOP_CONFIG.MAX_TOOL_FAILURES) {
      return `Tool "${tool}" has reached the maximum failure count (${ANTI_LOOP_CONFIG.MAX_TOOL_FAILURES}). It will be disabled for the remainder of this turn. Consider using a different approach.`
    }

    if (existing.failures >= ANTI_LOOP_CONFIG.WARN_TOOL_FAILURES && !existing.warned) {
      existing.warned = true
      return `Warning: Tool "${tool}" has failed ${existing.failures} times. If the next attempt also fails, consider trying a different approach.`
    }

    return null
  }

  /**
   * Resets the guard state. Call at the start of a new turn.
   */
  reset(): void {
    this.calls = []
    this.toolFailures.clear()
  }

  /**
   * Gets statistics about the current state.
   */
  stats(): { totalCalls: number; uniqueTools: number; failedTools: string[] } {
    const uniqueTools = new Set(this.calls.map((c) => c.tool)).size
    const failedTools = Array.from(this.toolFailures.entries())
      .filter(([_, v]) => v.failures >= ANTI_LOOP_CONFIG.WARN_TOOL_FAILURES)
      .map(([k]) => k)
    return { totalCalls: this.calls.length, uniqueTools, failedTools }
  }

  private hashArgs(args: unknown): string {
    try {
      // Normalize by sorting keys for stable comparison
      return JSON.stringify(args, Object.keys(args as object ?? {}).sort())
    } catch {
      return String(args)
    }
  }
}

/**
 * Creates a new AntiLoopGuard instance for a session turn.
 */
export function createAntiLoopGuard(): AntiLoopGuard {
  return new AntiLoopGuard()
}

export * as AntiLoop from "./anti-loop"
