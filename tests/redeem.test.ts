import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, jsonRequest, type QueryCtx } from "./helpers/supabase-mock";

const state = vi.hoisted(() => ({ client: null as any }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => state.client),
}));

import { POST } from "@/app/api/redeem/route";

const USER = { id: "user-1" };

interface Scenario {
  coupon?: { code: string; credits_value: number } | null;
  existing?: { id: string } | null;
  totalCount: number; // count AFTER the claim insert
}

function install(s: Scenario) {
  const resolver = (ctx: QueryCtx) => {
    if (ctx.table === "coupons") return { data: s.coupon ?? null };
    if (ctx.table === "redemptions") {
      if (ctx.op === "select" && ctx.single) return { data: s.existing ?? null };
      if (ctx.op === "insert") return { data: { id: "redemption-1" }, error: null };
      if (ctx.op === "select" && ctx.head) return { count: s.totalCount };
      if (ctx.op === "delete") return { error: null };
    }
    if (ctx.table === "profiles") {
      if (ctx.op === "select") return { data: { credits: 1, has_paid: false } };
      if (ctx.op === "update") return { error: null };
    }
    return { data: null, error: null };
  };
  const mock = createSupabaseMock(USER, resolver);
  state.client = mock.client;
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/redeem — cap enforcement (RISK-3)", () => {
  it("rolls back the claim and rejects when the claim pushes usage over the cap", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 6, // over MAX_PROMO_USES (5)
    });

    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(400);

    // The claim was inserted then rolled back (deleted); credits never granted.
    expect(calls.some((c) => c.table === "redemptions" && c.op === "insert")).toBe(true);
    expect(calls.some((c) => c.table === "redemptions" && c.op === "delete")).toBe(true);
    expect(calls.some((c) => c.table === "profiles" && c.op === "update")).toBe(false);
  });

  it("grants credits when within the cap and does not roll back", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 3,
    });

    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAdded).toBe(5);
    expect(body.usesCount).toBe(3);

    expect(calls.some((c) => c.table === "redemptions" && c.op === "delete")).toBe(false);
    const update = calls.find((c) => c.table === "profiles" && c.op === "update");
    expect((update?.payload as any).credits).toBe(6); // 1 + 5
  });

  it("inserts the claim BEFORE counting (ordering that closes the race)", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 3,
    });
    await POST(jsonRequest({ code: "PROMO5" }));

    const insertIdx = calls.findIndex((c) => c.table === "redemptions" && c.op === "insert");
    const countIdx = calls.findIndex((c) => c.table === "redemptions" && c.op === "select" && c.head);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(countIdx).toBeGreaterThan(insertIdx);
  });
});

describe("POST /api/redeem — guards", () => {
  it("rejects an empty code", async () => {
    install({ totalCount: 0 });
    const res = await POST(jsonRequest({ code: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid code", async () => {
    install({ coupon: null, existing: null, totalCount: 0 });
    const res = await POST(jsonRequest({ code: "NOPE" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid promo code");
  });

  it("rejects a code the user already redeemed", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: { id: "r-existing" },
      totalCount: 2,
    });
    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(400);
    // No new claim inserted.
    expect(calls.some((c) => c.table === "redemptions" && c.op === "insert")).toBe(false);
  });

  it("honors the SID_DRDROID seed fallback when the coupon table is empty", async () => {
    install({ coupon: null, existing: null, totalCount: 1 });
    const res = await POST(jsonRequest({ code: "sid_drdroid" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAdded).toBe(5);
  });
});
