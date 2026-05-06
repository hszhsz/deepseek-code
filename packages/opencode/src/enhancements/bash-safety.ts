/**
 * Bash Safety — Dangerous command blocklist & network-listen ban.
 *
 * Inspired by Claude Code's strict safety rules:
 * - Blocks destructive patterns (rm -rf /, fork bombs, etc.)
 * - Blocks network listeners (http.server, nc -l, flask run, etc.)
 * - Blocks piped-curl execution (curl|sh, wget|bash, etc.)
 * - Provides clear error messages guiding the model to safe alternatives.
 *
 * This module exports a synchronous `checkCommand` function that should be
 * called BEFORE the shell tool spawns the process. It throws on violation.
 */

export interface BashSafetyResult {
  blocked: boolean
  reason?: string
  suggestion?: string
}

// ─── Destructive command patterns ─────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion: string }> = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,
    reason: "Refusing `rm` targeting root filesystem",
    suggestion: "Specify exact paths instead of root-level wildcards",
  },
  {
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+[~$]/,
    reason: "Refusing recursive force-delete on home/variable path",
    suggestion: "Be specific about which files to remove; use trash-cli for safety",
  },
  {
    pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
    reason: "Fork bomb detected",
    suggestion: "This is a destructive command; there is no safe alternative",
  },
  {
    pattern: /\bmkfs\b/,
    reason: "Filesystem format command blocked",
    suggestion: "Do not format filesystems from the coding agent",
  },
  {
    pattern: /\bdd\b.*\bof\s*=\s*\/dev\/[hs]d/,
    reason: "Direct disk write via dd blocked",
    suggestion: "Do not write directly to block devices",
  },
  {
    pattern: />\s*\/dev\/[hs]d/,
    reason: "Redirect to block device blocked",
    suggestion: "Do not write directly to block devices",
  },
  {
    pattern: /\bchmod\s+(-[a-zA-Z]*\s+)?777\s+\//,
    reason: "chmod 777 on root path blocked",
    suggestion: "Use minimal permissions on specific paths",
  },
]

// ─── Network listener patterns ────────────────────────────────────────────────

const NETWORK_LISTEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bpython[23]?\s+-m\s+http\.server\b/, reason: "python http.server" },
  { pattern: /\bpython[23]?\s+-m\s+SimpleHTTPServer\b/, reason: "python SimpleHTTPServer" },
  { pattern: /\bnc\s+(-[a-zA-Z]*)?l/, reason: "netcat listener (nc -l)" },
  { pattern: /\bncat\b.*--listen/, reason: "ncat listener" },
  { pattern: /\bsocat\b.*LISTEN/, reason: "socat listener" },
  { pattern: /\bflask\s+run\b/, reason: "Flask dev server" },
  { pattern: /\buvicorn\b/, reason: "uvicorn ASGI server" },
  { pattern: /\bgunicorn\b/, reason: "gunicorn WSGI server" },
  { pattern: /\bnode\b.*\b(server|app|index)\.(js|ts|mjs)\b/, reason: "Node.js server script" },
  { pattern: /\bnpx\s+(serve|http-server|live-server)\b/, reason: "npx HTTP server" },
  { pattern: /\bnginx\b/, reason: "nginx" },
  { pattern: /\bapache2?\b/, reason: "Apache httpd" },
  { pattern: /\bredis-server\b/, reason: "Redis server" },
  { pattern: /\bmongod\b/, reason: "MongoDB daemon" },
  { pattern: /\bpostgres\b/, reason: "PostgreSQL server" },
  { pattern: /\bmysqld\b/, reason: "MySQL daemon" },
  { pattern: /\.listen\s*\(\s*\d+/, reason: "Binding to a port (.listen(port))" },
  { pattern: /\bphp\s+-S\b/, reason: "PHP built-in server" },
  { pattern: /\bruby\s+-run\b/, reason: "Ruby HTTP server" },
  { pattern: /\bcargo\s+run\b.*--\s*--port/, reason: "Cargo server with port binding" },
]

// ─── Piped execution patterns ─────────────────────────────────────────────────

const PIPED_EXEC_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion: string }> = [
  {
    pattern: /\bcurl\b.*\|\s*(ba)?sh\b/,
    reason: "Piped curl to shell execution blocked",
    suggestion: "Download the script first, review it, then execute",
  },
  {
    pattern: /\bwget\b.*\|\s*(ba)?sh\b/,
    reason: "Piped wget to shell execution blocked",
    suggestion: "Download the script first, review it, then execute",
  },
  {
    pattern: /\bcurl\b.*\|\s*python/,
    reason: "Piped curl to python blocked",
    suggestion: "Download the script first, review it, then execute",
  },
  {
    pattern: /\beval\s*\"\$\(curl/,
    reason: "eval of remote curl content blocked",
    suggestion: "Download the script first, review it, then execute",
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check a shell command for safety violations.
 * Returns immediately for safe commands. Throws an Error for violations.
 */
export function checkCommand(command: string): BashSafetyResult {
  // Normalize: collapse whitespace, trim
  const cmd = command.replace(/\s+/g, " ").trim()

  // 1. Check destructive patterns
  for (const { pattern, reason, suggestion } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(cmd)) {
      return { blocked: true, reason, suggestion }
    }
  }

  // 2. Check network listeners
  for (const { pattern, reason } of NETWORK_LISTEN_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        blocked: true,
        reason: `Network listener blocked: ${reason}`,
        suggestion:
          "Starting network-listening processes is forbidden in this environment. " +
          "If you need to test an endpoint, use curl/httpie against an already-running service.",
      }
    }
  }

  // 3. Check piped execution
  for (const { pattern, reason, suggestion } of PIPED_EXEC_PATTERNS) {
    if (pattern.test(cmd)) {
      return { blocked: true, reason, suggestion }
    }
  }

  return { blocked: false }
}

/**
 * Throws an error if the command is blocked. Use this in the shell tool
 * execute path for a one-liner guard.
 */
export function assertCommandSafe(command: string): void {
  const result = checkCommand(command)
  if (result.blocked) {
    throw new Error(
      [
        `[BashSafety] ${result.reason}`,
        "",
        `Command: ${command.slice(0, 200)}${command.length > 200 ? "..." : ""}`,
        "",
        `Suggestion: ${result.suggestion}`,
      ].join("\n"),
    )
  }
}

export * as BashSafety from "./bash-safety"
