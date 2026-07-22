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
    // refreshing the auth token
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Paywall Logic
    const isPublicRoute = 
      request.nextUrl.pathname.startsWith("/auth") || 
      request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname === "/" ||
      request.nextUrl.pathname.startsWith("/paywall") ||
      request.nextUrl.pathname.startsWith("/api/stripe/webhook");

    if (!isPublicRoute) {
      if (!user) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        return NextResponse.redirect(redirectUrl);
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, has_paid")
          .eq("id", user.id)
          .single();
        
        if (profile && profile.credits <= 0 && !profile.has_paid) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/paywall";
          return NextResponse.redirect(redirectUrl);
        }
      }
    }
  } catch (err) {
    // Log error gracefully and proceed
    console.error("Middleware Supabase session error:", err);
  }

  return supabaseResponse;
}
