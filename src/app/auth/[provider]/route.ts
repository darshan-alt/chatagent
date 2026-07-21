import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { type Provider } from "@supabase/supabase-js";

export async function POST(
  request: Request,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as Provider;
  
  if (provider !== "github" && provider !== "google") {
    return new Response("Invalid provider", { status: 400 });
  }

  const supabase = createClient();
  const requestUrl = new URL(request.url);
  const redirectUrl = `${requestUrl.origin}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    return redirect("/login?error=Could not authenticate");
  }

  return redirect(data.url);
}
