import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, type QueryCtx, type Resolver } from "./helpers/supabase-mock";

const sb = vi.hoisted(() => ({ client: null as any }));
const stripeState = vi.hoisted(() => ({ event: null as any, throwSig: false }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => sb.client),
}));

vi.mock("stripe", () => ({
  default: class {
    webhooks = {
      constructEvent: (_b: string, _s: string, _sec: string) => {
        if (stripeState.throwSig) throw new Error("bad signature");
        return stripeState.event;
      },
    };
  },
}));

import { POST } from "@/app/api/stripe/webhook/route";

const ENV = { ...process.env };

function rawRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig", ...headers },
    body: JSON.stringify({ any: "body" }),
  });
}

function install(resolver: Resolver) {
  const mock = createSupabaseMock(null, resolver);
  sb.client = mock.client;
  return mock;
}

const paidEvent = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "user-1" } },
};

function grantResolver(stripeEventsResult: any = { error: null }): Resolver {
  return (ctx: QueryCtx) => {
    if (ctx.table === "stripe_events" && ctx.op === "insert") return stripeEventsResult;
    if (ctx.table === "profiles" && ctx.op === "select") return { data: { credits: 2, has_paid: false } };
    if (ctx.table === "profiles" && ctx.op === "upsert") return { error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  stripeState.throwSig = false;
  stripeState.event = paidEvent;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("stripe webhook — signature required (RISK-2)", () => {
  it("refuses to process when STRIPE_WEBHOOK_SECRET is not set", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { calls } = install(grantResolver());

    const res = await POST(rawRequest());
    expect(res.status).toBe(500);
    // No credit grant attempted.
    expect(calls.some((c) => c.table === "profiles" && c.op === "upsert")).toBe(false);
  });

  it("returns 400 on a bad signature", async () => {
    stripeState.throwSig = true;
    const { calls } = install(grantResolver());
    const res = await POST(rawRequest());
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.table === "profiles" && c.op === "upsert")).toBe(false);
  });
});

describe("stripe webhook — idempotency (RISK-3)", () => {
  it("grants credits on the first delivery", async () => {
    const { calls } = install(grantResolver({ error: null }));
    const res = await POST(rawRequest());
    expect(res.status).toBe(200);
    const upserts = calls.filter((c) => c.table === "profiles" && c.op === "upsert");
    expect(upserts).toHaveLength(1);
    expect((upserts[0].payload as any).credits).toBe(7); // 2 + 5
    expect((upserts[0].payload as any).has_paid).toBe(true);
  });

  it("skips a replayed event (unique violation) without re-granting", async () => {
    const { calls } = install(grantResolver({ error: { code: "23505" } }));
    const res = await POST(rawRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(calls.some((c) => c.table === "profiles" && c.op === "upsert")).toBe(false);
  });
});

describe("stripe webhook — payment status (RISK-5)", () => {
  it("ignores an unpaid session", async () => {
    stripeState.event = {
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_2", payment_status: "unpaid", client_reference_id: "user-1" } },
    };
    const { calls } = install(grantResolver());
    const res = await POST(rawRequest());
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.table === "profiles" && c.op === "upsert")).toBe(false);
  });
});
