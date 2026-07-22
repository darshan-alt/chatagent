export interface ModelPricing {
  modelId: string;
  name: string;
  provider: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachePerMillion: number;
}

export const SUPPORTED_MODELS: ModelPricing[] = [
  {
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    cachePerMillion: 0.075,
  },
  {
    modelId: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    inputPerMillion: 2.50,
    outputPerMillion: 10.00,
    cachePerMillion: 1.25,
  },
  {
    modelId: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cachePerMillion: 0.30,
  },
  {
    modelId: "moonshot-v1-8k",
    name: "Kimi (Moonshot 8k)",
    provider: "Moonshot AI",
    inputPerMillion: 1.60,
    outputPerMillion: 1.60,
    cachePerMillion: 0.80,
  },
];

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheTokens: number = 0
): number {
  const pricing = SUPPORTED_MODELS.find((m) => m.modelId === modelId) || SUPPORTED_MODELS[0];
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheCost = (cacheTokens / 1_000_000) * pricing.cachePerMillion;

  return Number((inputCost + outputCost + cacheCost).toFixed(6));
}
