import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Paywall Logic
  // Exclude auth routes, paywall route, public assets, and root landing page
  const isPublicRoute = 
    request.nextUrl.pathname.startsWith("/auth") || 
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/paywall") ||
    request.nextUrl.pathname.startsWith("/api/stripe/webhook");

  if (!isPublicRoute) {
    if (!user) {
      // not logged in -> redirect to login
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    } else {
      // logged in, check profile credits and has_paid
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, has_paid")
        .eq("id", user.id)
        .single();
      
      if (profile && profile.credits <= 0 && !profile.has_paid) {
        const url = request.nextUrl.clone();
        url.pathname = "/paywall";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
