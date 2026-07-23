import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  // After a fresh sign-in, land the user in the app (middleware sends them to
  // /paywall if they have no credits) instead of the marketing landing page.
  const next = requestUrl.searchParams.get("next") ?? "/chat";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.user) {
      // Ensure profile exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.user.id)
        .single();
        
      if (!profile) {
        // Insert new profile
        await supabase.from("profiles").insert([
          { id: data.user.id, credits: 0, has_paid: false }
        ]);
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(new URL("/login?error=Could not authenticate", requestUrl.origin));
}
