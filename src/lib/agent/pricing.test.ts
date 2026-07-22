import { describe, it, expect } from "vitest";
import { calculateCost, SUPPORTED_MODELS } from "./pricing";

describe("calculateCost", () => {
  it("computes cost for gpt-4o-mini from input/output tokens", () => {
    // 1M input @ $0.15, 1M output @ $0.60
    expect(calculateCost("gpt-4o-mini", 1_000_000, 1_000_000, 0)).toBeCloseTo(0.75, 6);
  });

  it("includes cache tokens at the cache rate", () => {
    // gpt-4o-mini cache @ $0.075 / 1M
    expect(calculateCost("gpt-4o-mini", 0, 0, 1_000_000)).toBeCloseTo(0.075, 6);
  });

  it("uses per-model rates for gpt-4o", () => {
    // 1M in @ $2.50, 1M out @ $10.00
    expect(calculateCost("gpt-4o", 1_000_000, 1_000_000, 0)).toBeCloseTo(12.5, 6);
  });

  it("falls back to the first model's pricing for an unknown model", () => {
    const unknown = calculateCost("does-not-exist", 1_000_000, 0, 0);
    const fallback = calculateCost(SUPPORTED_MODELS[0].modelId, 1_000_000, 0, 0);
    expect(unknown).toBe(fallback);
  });

  it("returns 0 for zero usage", () => {
    expect(calculateCost("gpt-4o", 0, 0, 0)).toBe(0);
  });

  it("rounds to 6 decimal places", () => {
    const cost = calculateCost("gpt-4o-mini", 1, 1, 0);
    expect(cost.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });

  it("prices every supported model without throwing", () => {
    for (const m of SUPPORTED_MODELS) {
      expect(calculateCost(m.modelId, 1000, 1000, 100)).toBeGreaterThan(0);
    }
  });
});
