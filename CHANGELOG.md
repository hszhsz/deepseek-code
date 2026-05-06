# Changelog

## [Unreleased] - Phase 2: Claude Code Inspired Enhancements

### Added

#### Safety & Stability (P0)
- **Read-Before-Edit Guard** (`enhancements/read-tracker.ts`)
  - Tracks file reads per session; blocks edits to files not previously read
  - Stale-read protection: detects if file changed on disk since last read
  - Integrated into `edit.ts`, `write.ts` — brand-new file writes are exempt
  
- **Bash Danger Blocklist** (`enhancements/bash-safety.ts`)
  - Blocks destructive commands: `rm -rf /`, fork bombs, `mkfs`, `dd` to devices
  - Blocks network listeners: http.server, nc -l, flask run, uvicorn, nginx, etc.
  - Blocks piped remote execution: `curl|sh`, `wget|bash`, `eval "$(curl..."`
  - Integrated into `shell.ts` — fires before process spawn
  
- **Parallel Tool Scheduling** (`enhancements/tool-scheduler.ts`)
  - Read-only tool metadata (glob, grep, read, webfetch, websearch → parallelizable)
  - Write tools (edit, write, shell, apply_patch) forced sequential
  - `scheduleParallel()` and `canParallelize()` utilities for session runner

#### Architecture Upgrades (P1)
- **Subagent Context Isolation** (`enhancements/subagent-isolation.ts`)
  - Summarizes subagent output before returning to parent agent
  - Extracts key file paths, success/failure status, structured summary
  - Reduces parent agent context bloat; preserves DeepSeek cache prefix stability
  - Integrated into `task.ts` output path

- **Session Compactor** (`enhancements/session-compactor.ts`)
  - Automatic context compression when token usage exceeds threshold (default 60%)
  - Generates `<conversation-summary>` blocks preserving key decisions and file paths
  - Cache-aware: summary injected AFTER system prompt to preserve prefix stability
  - Configurable thresholds, minimum message count, preserve-recent-count

- **System Prompt Blocks** (`enhancements/prompt-blocks/index.ts`)
  - Refactored monolithic prompt into named, prioritized, composable blocks
  - Blocks: identity, deepseek_advantages, tone_and_style, proactiveness,
    following_conventions, tool_use_policy, task_management, code_references,
    safety_rules, economy_mode, help_info, url_policy
  - `registerBlock()` / `removeBlock()` API for plugins/skills to extend
  - Conditional blocks (e.g., economy_mode only rendered when active)

#### Cost Optimization & Ecosystem (P2)
- **Economy Mode** (`enhancements/economy-mode.ts`)
  - "Poor Mode" inspired by Claude Code: forces V4 Flash, disables reasoning,
    disables websearch/webfetch/mcp-exa, limits subagent parallelism
  - Activated via `DEEPSEEK_CODE_ECONOMY=1` env or `{ "economy": true }` config
  - `capReasoningEffort()` utility clamps auto-reasoning to economy max

- **Hooks Dispatcher** (`enhancements/hooks.ts`)
  - Event-driven extension points: PreToolUse, PostToolUse, UserPromptSubmit,
    SessionStart, SessionEnd, Stop, CompactionTrigger
  - Configured in settings.json with match patterns and shell commands
  - PreToolUse hooks can block tool execution (blocking: true)
  - Harness-executed (deterministic, not LLM-dependent)

- **Layered Configuration** (`enhancements/layered-config.ts`)
  - Three-tier settings merge: global → project → local
  - Paths: `~/.deepseek-code/settings.json`, `<project>/.deepseek-code/settings.json`,
    `<project>/.deepseek-code/settings.local.json` (gitignored)
  - Deep merge with array concatenation for hooks/permissions
  - JSONC support (// and /* */ comments stripped)

### Changed
- `tool/read.ts`: Now calls `markRead()` after successful file read
- `tool/edit.ts`: Now calls `assertReadBeforeEdit()` before modifications
- `tool/write.ts`: Now calls `assertReadBeforeEdit()` for existing files
- `tool/shell.ts`: Now calls `assertCommandSafe()` before spawning processes
- `tool/task.ts`: Uses `extractSummary()` + `formatForParent()` for output

### Architecture Notes
All enhancements are in `packages/opencode/src/enhancements/` as self-contained
modules with a barrel export (`index.ts`). Integration into existing tools is
minimal and additive (import + single function call), preserving backward
compatibility with the opencode upstream.
