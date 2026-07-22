import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, jsonRequest, type QueryCtx, type Resolver } from "./helpers/supabase-mock";

const state = vi.hoisted(() => ({ client: null as any }));
const oa = vi.hoisted(() => ({ create: null as any }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => state.client),
}));

vi.mock("openai", () => ({
  OpenAI: class {
    chat = { completions: { create: (...a: any[]) => oa.create(...a) } };
  },
}));

vi.mock("@/lib/agent/search", () => ({
  performWebSearch: vi.fn(async () => "search result"),
}));
vi.mock("@/lib/agent/pdf", () => ({
  generatePdfReport: vi.fn(async () => "https://example.test/report.pdf"),
}));

import { POST } from "@/app/api/agent/run/route";

const USER = { id: "user-1" };

// Default resolver: authed user with 3 credits and a saved API key.
const defaultResolver: Resolver = (ctx: QueryCtx) => {
  if (ctx.table === "profiles" && ctx.op === "select") {
    return { data: { credits: 3, has_paid: false } };
  }
  if (ctx.table === "user_keys" && ctx.op === "select") {
    return { data: { base_url: "", api_key: "sk-test" } };
  }
  if (ctx.table === "chats" && ctx.op === "insert") {
    return { data: { id: "chat-1" } };
  }
  return { data: null, error: null };
};

function install(resolver: Resolver = defaultResolver) {
  const mock = createSupabaseMock(USER, resolver);
  state.client = mock.client;
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/agent/run — credit safety (RISK-1)", () => {
  it("does NOT deduct a credit when the LLM call fails", async () => {
    const { calls } = install();
    oa.create = vi.fn(async () => {
      throw new Error("upstream 500");
    });

    const res = await POST(jsonRequest({ prompt: "hello" }));
    expect(res.status).toBe(500);

    const deducted = calls.some((c) => c.table === "profiles" && c.op === "update");
    expect(deducted).toBe(false);
  });

  it("deducts exactly one credit on a successful run", async () => {
    const { calls } = install();
    oa.create = vi.fn(async () => ({
      choices: [{ message: { content: "final answer", tool_calls: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));

    const res = await POST(jsonRequest({ prompt: "hello" }));
    expect(res.status).toBe(200);

    const deductions = calls.filter((c) => c.table === "profiles" && c.op === "update");
    expect(deductions).toHaveLength(1);
    expect((deductions[0].payload as any).credits).toBe(2); // 3 -> 2
  });
});

describe("POST /api/agent/run — malformed tool args (RISK-4)", () => {
  it("does not 500 when tool arguments are invalid JSON", async () => {
    install();
    let call = 0;
    oa.create = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "tc-1",
                type: "function",
                function: { name: "web_search", arguments: "{ not valid json" },
              }],
            },
          }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        };
      }
      return {
        choices: [{ message: { content: "recovered", tool_calls: null } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      };
    });

    const res = await POST(jsonRequest({ prompt: "search something" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finalAnswer).toBe("recovered");
  });
});

describe("POST /api/agent/run — guards", () => {
  it("rejects an empty prompt", async () => {
    install();
    const res = await POST(jsonRequest({ prompt: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 402 when out of credits and not paid", async () => {
    install((ctx) => {
      if (ctx.table === "profiles" && ctx.op === "select") {
        return { data: { credits: 0, has_paid: false } };
      }
      return { data: null };
    });
    const res = await POST(jsonRequest({ prompt: "hello" }));
    expect(res.status).toBe(402);
  });

  it("returns 401 when unauthenticated", async () => {
    const mock = createSupabaseMock(null, defaultResolver);
    state.client = mock.client;
    const res = await POST(jsonRequest({ prompt: "hello" }));
    expect(res.status).toBe(401);
  });
});
