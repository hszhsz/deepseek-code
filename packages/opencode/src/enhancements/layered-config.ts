/**
 * Layered Settings — Inspired by Claude Code's three-tier configuration.
 *
 * Layers (lowest to highest priority):
 * 1. Global: ~/.deepseek-code/settings.json
 * 2. Project: <project-root>/.deepseek-code/settings.json
 * 3. Local: <project-root>/.deepseek-code/settings.local.json (gitignored)
 *
 * Merge strategy:
 * - Objects: deep merge (project overrides global, local overrides project)
 * - Arrays: concatenate (hooks, permissions) — later layers append
 * - Scalars: last writer wins
 *
 * This enables:
 * - Per-user global preferences (model, shell, theme)
 * - Per-project enforced rules (hooks, permissions, disabled providers)
 * - Local secrets/overrides that never hit VCS
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayeredSettings {
  /** Final merged result. */
  merged: Record<string, any>
  /** Source layers for debugging. */
  layers: {
    global: Record<string, any> | null
    project: Record<string, any> | null
    local: Record<string, any> | null
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const CONFIG_DIR_NAME = ".deepseek-code"
const SETTINGS_FILE = "settings.json"
const LOCAL_SETTINGS_FILE = "settings.local.json"

export function globalSettingsPath(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME, SETTINGS_FILE)
}

export function projectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR_NAME, SETTINGS_FILE)
}

export function localSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR_NAME, LOCAL_SETTINGS_FILE)
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function loadJson(filepath: string): Record<string, any> | null {
  try {
    const content = fs.readFileSync(filepath, "utf-8")
    // Strip comments (JSONC support: // and /* */)
    const stripped = content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    return JSON.parse(stripped)
  } catch {
    return null
  }
}

// ─── Merge ────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Deep merge with array concatenation.
 */
function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value)
    } else if (Array.isArray(value) && Array.isArray(result[key])) {
      // Arrays concatenate (hooks, permissions, etc.)
      result[key] = [...result[key], ...value]
    } else {
      result[key] = value
    }
  }
  return result
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load and merge all three layers of settings.
 */
export function loadSettings(projectRoot: string): LayeredSettings {
  const global = loadJson(globalSettingsPath())
  const project = loadJson(projectSettingsPath(projectRoot))
  const local = loadJson(localSettingsPath(projectRoot))

  let merged: Record<string, any> = {}
  if (global) merged = deepMerge(merged, global)
  if (project) merged = deepMerge(merged, project)
  if (local) merged = deepMerge(merged, local)

  return { merged, layers: { global, project, local } }
}

/**
 * Write to a specific layer.
 */
export function writeSettings(
  layer: "global" | "project" | "local",
  projectRoot: string,
  settings: Record<string, any>,
): void {
  let filepath: string
  switch (layer) {
    case "global":
      filepath = globalSettingsPath()
      break
    case "project":
      filepath = projectSettingsPath(projectRoot)
      break
    case "local":
      filepath = localSettingsPath(projectRoot)
      break
  }

  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(filepath, JSON.stringify(settings, null, 2) + "\n", "utf-8")
}

/**
 * Read a specific key from the merged settings with type assertion.
 */
export function getSetting<T = unknown>(
  settings: LayeredSettings,
  key: string,
  defaultValue?: T,
): T {
  const parts = key.split(".")
  let current: any = settings.merged
  for (const part of parts) {
    if (!isPlainObject(current)) return defaultValue as T
    current = current[part]
  }
  return (current ?? defaultValue) as T
}

export * as LayeredConfig from "./layered-config"
