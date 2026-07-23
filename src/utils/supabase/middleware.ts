import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseUrl() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

// Public/exempt routes accessible without a session (landing, auth, login,
// paywall, redeem API, Stripe webhook).
function isPublicRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/paywall") ||
    pathname.startsWith("/api/redeem") ||
    pathname.startsWith("/api/stripe/webhook")
  );
}

// API routes must never be redirected to an HTML page (login/paywall): the
// browser fetch would follow the redirect and receive HTML instead of JSON.
// Every /api route handler enforces its own auth (401) and credit (402) checks
// and returns JSON, so middleware leaves them alone. This is what lets an
// out-of-credits user actually reach /api/stripe/checkout to buy credits.
function isApiRoute(pathname: string) {
  return pathname.startsWith("/api");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    // Supabase not configured: fail closed. Allow only public routes; send
    // page requests to /login. API routes are left to their handlers (JSON).
    const pathname = request.nextUrl.pathname;
    if (!isPublicRoute(pathname) && !isApiRoute(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // Protected pages require a session. Credit gating is NOT enforced here:
    // pages like /chat render for signed-in users even with 0 credits and show
    // a "get credits" prompt. The credit check lives in the agent-run API.
    if (!isPublicRoute(pathname) && !isApiRoute(pathname) && !user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }
  } catch (err) {
    console.error("Middleware session error:", err);
  }

  return supabaseResponse;
}
