import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const supabase = createClient();
  
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    redirect("/chat"); // or wherever the main dashboard is
  }

  return (
    <div className="flex flex-col min-h-[100dvh] items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="w-full max-w-sm p-8 space-y-6 bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tighter">Welcome Back</h1>
          <p className="text-zinc-400 text-sm">Sign in to continue to MicroManus</p>
        </div>
        <div className="space-y-4">
          <form action="/auth/github" method="POST">
            <Button type="submit" className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200" size="lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-5 w-5"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              Continue with GitHub
            </Button>
          </form>
          <form action="/auth/google" method="POST">
            <Button type="submit" variant="outline" className="w-full border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50" size="lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              Continue with Google
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
