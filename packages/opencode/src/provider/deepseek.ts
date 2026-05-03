import { Effect } from "effect"

export const DEEPSEEK_PROVIDER_ID = "deepseek"
export const DEEPSEEK_API_BASE = "https://api.deepseek.com"
export const DEEPSEEK_BETA_API_BASE = "https://api.deepseek.com/beta"

// DeepSeek model definitions matching the models.ts Model schema format
export const DEEPSEEK_MODELS = {
  "deepseek-v4-pro": {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    family: "deepseek-v4",
    release_date: "2026-04-24",
    attachment: true,
    reasoning: true,
    temperature: false, // thinking mode doesn't support temperature
    tool_call: true,
    interleaved: { field: "reasoning_content" as const },
    cost: {
      input: 0.435,
      output: 0.87,
      cache_read: 0.003625,
    },
    limit: {
      context: 1_000_000,
      output: 384_000,
    },
    modalities: {
      input: ["text" as const, "image" as const, "pdf" as const],
      output: ["text" as const],
    },
  },
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    family: "deepseek-v4",
    release_date: "2026-04-24",
    attachment: true,
    reasoning: true,
    temperature: false,
    tool_call: true,
    interleaved: { field: "reasoning_content" as const },
    cost: {
      input: 0.14,
      output: 0.28,
      cache_read: 0.0028,
    },
    limit: {
      context: 1_000_000,
      output: 384_000,
    },
    modalities: {
      input: ["text" as const, "image" as const, "pdf" as const],
      output: ["text" as const],
    },
  },
}

// Default model selection based on agent type
export function selectDefaultModel(agentName: string): string {
  switch (agentName) {
    case "plan":
    case "explore":
    case "complete":
      return "deepseek-v4-flash"
    case "build":
    default:
      return "deepseek-v4-pro"
  }
}

// Reasoning effort configuration
export type ReasoningEffort = "high" | "max"

export function getThinkingConfig(effort: ReasoningEffort = "high") {
  return {
    thinking: { type: "enabled" },
    reasoning_effort: effort,
  }
}
