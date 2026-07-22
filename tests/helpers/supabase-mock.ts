import { vi } from "vitest";

export interface QueryCtx {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  single: boolean;
  head: boolean;
  count: boolean;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

export type Resolver = (ctx: QueryCtx) => { data?: any; error?: any; count?: number };

/**
 * Minimal chainable Supabase client mock. Every terminal `.single()` / await
 * calls `resolver(ctx)` with the accumulated query context, and each call is
 * recorded in `.calls` for assertions.
 */
export function createSupabaseMock(user: any, resolver: Resolver) {
  const calls: QueryCtx[] = [];

  function from(table: string) {
    const ctx: QueryCtx = {
      table,
      op: "select",
      single: false,
      head: false,
      count: false,
      filters: [],
      payload: undefined,
    };

    const resolve = (single: boolean) => {
      const finalCtx = { ...ctx, single };
      calls.push(finalCtx);
      return Promise.resolve(resolver(finalCtx));
    };

    const builder: any = {
      insert: (payload: unknown) => { ctx.op = "insert"; ctx.payload = payload; return builder; },
      update: (payload: unknown) => { ctx.op = "update"; ctx.payload = payload; return builder; },
      upsert: (payload: unknown) => { ctx.op = "upsert"; ctx.payload = payload; return builder; },
      delete: () => { ctx.op = "delete"; return builder; },
      select: (_sel?: string, opts?: { head?: boolean; count?: string }) => {
        if (opts?.head) ctx.head = true;
        if (opts?.count) ctx.count = true;
        return builder;
      },
      eq: (k: string, v: unknown) => { ctx.filters.push(["eq", k, v]); return builder; },
      ilike: (k: string, v: unknown) => { ctx.filters.push(["ilike", k, v]); return builder; },
      order: () => builder,
      range: () => builder,
      single: () => resolve(true),
      maybeSingle: () => resolve(true),
      then: (onF: any, onR: any) => resolve(false).then(onF, onR),
    };
    return builder;
  }

  const client = {
    from: vi.fn(from),
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.test/report.pdf" } }),
      }),
    },
  };

  return { client, calls };
}

export function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
