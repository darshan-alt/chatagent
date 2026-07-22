import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import SettingsForm from "./SettingsForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  // Fetch current user_keys
  const { data: userKey } = await supabase
    .from("user_keys")
    .select("base_url, api_key")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      <header className="px-6 h-16 flex items-center border-b border-zinc-800 justify-between">
        <Link href="/" className="font-bold text-xl tracking-tighter">
          ChatAgent
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/chat">
            <Button variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800">
              Go to Chat
            </Button>
          </Link>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLM API Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configure your custom LLM Base URL and API key. These are stored securely in server-only database state.
          </p>
        </div>
        <SettingsForm initialBaseUrl={userKey?.base_url || ""} initialApiKey={userKey?.api_key || ""} />
      </main>
    </div>
  );
}
