import { DEEPSEEK_MODELS, selectDefaultModel } from "./deepseek"

export interface RouterContext {
  agent: string
  estimatedTokens?: number
  hasToolCalls?: boolean
  userPreference?: string
}

export function routeModel(ctx: RouterContext): string {
  // User preference overrides
  if (ctx.userPreference && ctx.userPreference in DEEPSEEK_MODELS) {
    return ctx.userPreference
  }

  // Agent-based default selection
  return selectDefaultModel(ctx.agent)
}

export function estimateCost(
  model: keyof typeof DEEPSEEK_MODELS,
  inputTokens: number,
  outputTokens: number,
  cacheHitRatio: number = 0.5,
): { inputCost: number; outputCost: number; totalCost: number } {
  const m = DEEPSEEK_MODELS[model]
  const cacheMissTokens = inputTokens * (1 - cacheHitRatio)
  const cacheHitTokens = inputTokens * cacheHitRatio
  const inputCost = (cacheMissTokens * m.cost.input + cacheHitTokens * (m.cost.cache_read ?? m.cost.input)) / 1_000_000
  const outputCost = (outputTokens * m.cost.output) / 1_000_000
  return { inputCost, outputCost, totalCost: inputCost + outputCost }
}
