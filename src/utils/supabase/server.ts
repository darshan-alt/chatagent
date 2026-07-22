import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseUrl() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

// When Supabase env is not configured, createServerClient() throws ("supabaseUrl
// is required"), which 500s every server-rendered page. Return a no-op stub
// instead so the app degrades to a signed-out state (pages render, middleware
// fails closed to /login) rather than crashing. Used in CI e2e and guards
// against a misconfigured deployment.
function createStubClient() {
  const emptyResult = Promise.resolve({ data: null, error: null, count: 0 });
  const makeBuilder = () => {
    const b: any = {
      select: () => b, insert: () => b, update: () => b, upsert: () => b, delete: () => b,
      eq: () => b, neq: () => b, in: () => b, is: () => b, ilike: () => b, like: () => b,
      gte: () => b, lte: () => b, order: () => b, range: () => b, limit: () => b,
      single: () => emptyResult, maybeSingle: () => emptyResult,
      then: (onF: any, onR: any) => emptyResult.then(onF, onR),
    };
    return b;
  };
  const notConfigured = { message: "Supabase is not configured" };
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: { url: null, provider: "" }, error: notConfigured }),
      exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: notConfigured }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: notConfigured }),
    },
    from: () => makeBuilder(),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: notConfigured }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  // Defining the real client in a closure lets us type the stub as exactly its
  // return type, so both branches unify without degrading query-result typing.
  const createReal = () =>
    createServerClient(url, anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Server Component ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (error) {
            // Server Component ignore
          }
        },
      },
    });

  if (!url || !anonKey) {
    return createStubClient() as unknown as ReturnType<typeof createReal>;
  }

  return createReal();
}
