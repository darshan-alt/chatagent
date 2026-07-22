import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { type Provider } from "@supabase/supabase-js";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const resolvedParams = await params;
  const provider = resolvedParams.provider as Provider;
  
  if (provider !== "github" && provider !== "google") {
    return new Response("Invalid provider", { status: 400 });
  }

  const supabase = await createClient();
  const requestUrl = new URL(request.url);
  const redirectUrl = `${requestUrl.origin}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  return redirect(data.url);
}
