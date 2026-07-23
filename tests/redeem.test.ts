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
  totalCount: number;
  insertError?: { message: string } | null;
  profileError?: { message: string } | null;
}

function install(s: Scenario) {
  const resolver = (ctx: QueryCtx) => {
    if (ctx.table === "coupons") return { data: s.coupon ?? null };
    if (ctx.table === "redemptions") {
      if (ctx.op === "select" && ctx.single) return { data: s.existing ?? null };
      if (ctx.op === "select" && ctx.head) return { count: s.totalCount };
      if (ctx.op === "insert") return { error: s.insertError ?? null };
    }
    if (ctx.table === "profiles") {
      if (ctx.op === "select") return { data: { credits: 1, has_paid: false } };
      if (ctx.op === "update" || ctx.op === "upsert") return { error: s.profileError ?? null };
    }
    return { data: null, error: null };
  };
  const mock = createSupabaseMock(USER, resolver);
  state.client = mock.client;
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Force the user-session client path (no service-role shortcut) in tests.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("POST /api/redeem — grants credits", () => {
  it("grants credits within the cap and records the redemption", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 3,
    });

    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAdded).toBe(5);
    expect(body.usesCount).toBe(4); // 3 existing + this one

    expect(calls.some((c) => c.table === "redemptions" && c.op === "insert")).toBe(true);
    const write = calls.find((c) => c.table === "profiles" && (c.op === "update" || c.op === "upsert"));
    expect((write?.payload as any).credits).toBe(6); // 1 + 5
  });

  it("still grants credits when redemption tracking insert fails (best-effort)", async () => {
    // Reproduces the RLS-blocked redemptions insert that used to hard-fail.
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 0,
      insertError: { message: "new row violates row-level security policy" },
    });

    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAdded).toBe(5);
    // Credits were still granted despite the tracking insert error.
    expect(calls.some((c) => c.table === "profiles" && (c.op === "update" || c.op === "upsert"))).toBe(true);
  });

  it("honors the SID_DRDROID seed fallback when the coupon table is empty", async () => {
    install({ coupon: null, existing: null, totalCount: 1 });
    const res = await POST(jsonRequest({ code: "sid_drdroid" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAdded).toBe(5);
  });
});

describe("POST /api/redeem — cap and guards", () => {
  it("rejects when the code has reached its usage limit (before granting)", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 5, // == MAX_PROMO_USES
    });

    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.table === "redemptions" && c.op === "insert")).toBe(false);
    expect(calls.some((c) => c.table === "profiles" && (c.op === "update" || c.op === "upsert"))).toBe(false);
  });

  it("rejects a code the user already redeemed (no insert, no credit grant)", async () => {
    const { calls } = install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: { id: "r-existing" },
      totalCount: 2,
    });
    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.table === "redemptions" && c.op === "insert")).toBe(false);
    expect(calls.some((c) => c.table === "profiles" && (c.op === "update" || c.op === "upsert"))).toBe(false);
  });

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

  it("returns 500 when the credit update itself fails", async () => {
    install({
      coupon: { code: "PROMO5", credits_value: 5 },
      existing: null,
      totalCount: 0,
      profileError: { message: "permission denied" },
    });
    const res = await POST(jsonRequest({ code: "PROMO5" }));
    expect(res.status).toBe(500);
  });
});
