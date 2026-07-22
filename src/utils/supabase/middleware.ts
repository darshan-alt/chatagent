import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseUrl() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
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

    const isExemptPath = 
      request.nextUrl.pathname.startsWith("/paywall") ||
      request.nextUrl.pathname.startsWith("/auth") ||
      request.nextUrl.pathname.startsWith("/api/stripe/webhook");

    if (user) {
      // User is logged in: Check paywall conditions unless on an exempt path
      if (!isExemptPath) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, has_paid")
          .eq("id", user.id)
          .single();

        // If no profile found yet or credits <= 0 and has_paid is false -> redirect to paywall
        const credits = profile?.credits ?? 0;
        const hasPaid = profile?.has_paid ?? false;

        if (credits <= 0 && !hasPaid) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/paywall";
          return NextResponse.redirect(redirectUrl);
        }
      }
    } else {
      // User is NOT logged in: protect all non-public pages
      const isPublicPath = 
        request.nextUrl.pathname === "/" ||
        request.nextUrl.pathname.startsWith("/login") ||
        request.nextUrl.pathname.startsWith("/auth") ||
        request.nextUrl.pathname.startsWith("/api/stripe/webhook");

      if (!isPublicPath) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        return NextResponse.redirect(redirectUrl);
      }
    }
  } catch (err) {
    console.error("Middleware session error:", err);
  }

  return supabaseResponse;
}
