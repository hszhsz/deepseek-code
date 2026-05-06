/**
 * Read-Before-Edit guard.
 *
 * Inspired by Claude Code's strict "Edit/Write requires the file to have been
 * Read in the same session" invariant. Prevents the model from blindly
 * overwriting files it has not actually inspected — a common cause of data
 * loss when long-context coding agents hallucinate file contents.
 *
 * Design notes:
 * - Tracks (sessionID, normalizedFilePath) → mtimeMs at read time.
 * - On Edit/Write, if no read record exists OR the on-disk mtime is newer
 *   than the recorded one, we throw a structured error pointing the model
 *   at the read tool.
 * - Brand-new files (Write to a path that does not yet exist) are exempt.
 * - Internal/system invocations (ctx.extra.bypassReadCheck) are exempt.
 *
 * The tracker is intentionally process-local; long-running daemon mode is
 * fine because session IDs are unique.
 */

import * as path from "path"
import { promises as fs } from "fs"

type Key = string

interface Record {
  mtimeMs: number
  readAt: number
}

const records = new Map<Key, Record>()

const HARD_LIMIT = 5_000 // cap memory; LRU-ish trim

function key(sessionID: string, filePath: string): Key {
  // Normalize for case-sensitivity differences (Windows / macOS HFS+).
  const norm = path.resolve(filePath)
  return `${sessionID}::${process.platform === "win32" ? norm.toLowerCase() : norm}`
}

function trim() {
  if (records.size <= HARD_LIMIT) return
  const sorted = [...records.entries()].sort((a, b) => a[1].readAt - b[1].readAt)
  const drop = sorted.slice(0, sorted.length - HARD_LIMIT)
  for (const [k] of drop) records.delete(k)
}

export interface MarkOptions {
  sessionID: string
  filePath: string
  mtimeMs?: number
}

/** Mark a file as "read" within the given session. Called by the read tool. */
export function markRead(opts: MarkOptions): void {
  records.set(key(opts.sessionID, opts.filePath), {
    mtimeMs: opts.mtimeMs ?? Date.now(),
    readAt: Date.now(),
  })
  trim()
}

export interface AssertOptions {
  sessionID: string
  filePath: string
  /** Set when the model is creating a brand-new file. */
  isNewFile?: boolean
  /** Internal callers can bypass (e.g. plan-mode preview, formatter). */
  bypass?: boolean
}

/**
 * Throw if the file has not been read in this session, or if it was modified
 * on disk after our last read (stale-read protection).
 *
 * Soft-fails (returns without throwing) when we cannot stat the file —
 * file-system races shouldn't block legitimate edits.
 */
export async function assertReadBeforeEdit(opts: AssertOptions): Promise<void> {
  if (opts.bypass) return
  if (opts.isNewFile) return

  const k = key(opts.sessionID, opts.filePath)
  const rec = records.get(k)

  // Never read → block.
  if (!rec) {
    throw new Error(
      [
        `Refusing to modify ${opts.filePath} because it has not been read in this session.`,
        "Call the `read` tool on this file first, then re-issue the edit.",
        "(deepseek-code Read-Before-Edit guard — set ctx.extra.bypassReadCheck=true to override)",
      ].join("\n"),
    )
  }

  // Stale read → block. Disk is newer than what we cached.
  let stat: Awaited<ReturnType<typeof fs.stat>> | undefined
  try {
    stat = await fs.stat(opts.filePath)
  } catch {
    // File missing or unreadable — let the underlying tool produce its own
    // (more specific) error.
    return
  }

  // Allow a tiny clock-skew tolerance (200ms).
  if (stat.mtimeMs > rec.mtimeMs + 200) {
    throw new Error(
      [
        `Refusing to modify ${opts.filePath}: the file changed on disk since you last read it.`,
        `(disk mtime=${new Date(stat.mtimeMs).toISOString()}, last read=${new Date(rec.mtimeMs).toISOString()})`,
        "Re-read the file with the `read` tool to capture the latest contents, then edit again.",
      ].join("\n"),
    )
  }
}

/** Drop all records for a session (called on session close). */
export function clearSession(sessionID: string): void {
  for (const k of records.keys()) {
    if (k.startsWith(`${sessionID}::`)) records.delete(k)
  }
}

/** Test/debug helper. */
export function _debug() {
  return { size: records.size, records: [...records.entries()] }
}

export * as ReadTracker from "./read-tracker"
