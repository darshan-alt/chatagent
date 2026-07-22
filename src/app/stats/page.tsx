import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Coins, Database, Activity, ArrowLeft } from "lucide-react";

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/stats");
  }

  // Fetch token usage records for current user
  const { data: records } = await supabase
    .from("token_usage")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const usageRecords = records || [];

  // Summary Metrics
  const totalRuns = usageRecords.length;
  const totalInputTokens = usageRecords.reduce((acc, r) => acc + (r.input_tokens || 0), 0);
  const totalOutputTokens = usageRecords.reduce((acc, r) => acc + (r.output_tokens || 0), 0);
  const totalCacheTokens = usageRecords.reduce((acc, r) => acc + (r.cache_tokens || 0), 0);
  const totalCostUsd = usageRecords.reduce((acc, r) => acc + Number(r.cost_usd || 0), 0);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      <header className="px-6 h-16 flex items-center border-b border-zinc-800 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/chat">
            <Button variant="ghost" size="sm" className="gap-1 text-zinc-400 hover:text-zinc-100">
              <ArrowLeft className="w-4 h-4" />
              Back to Chat
            </Button>
          </Link>
          <span className="font-bold text-xl tracking-tighter">Token & Cost Stats</span>
        </div>
        <Link href="/settings">
          <Button variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800">
            Settings
          </Button>
        </Link>
      </header>

      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage & Cost Breakdown</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time analytics on token usage, model costs, and per-run performance metrics.
          </p>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total Cost</span>
              <Coins className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">${totalCostUsd.toFixed(5)}</p>
          </div>

          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total Runs</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-zinc-100">{totalRuns}</p>
          </div>

          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Input Tokens</span>
              <Database className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-purple-400">{totalInputTokens.toLocaleString()}</p>
          </div>

          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Output Tokens</span>
              <Database className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">{totalOutputTokens.toLocaleString()}</p>
          </div>
        </div>

        {/* Per-Run Breakdown Table */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-zinc-800 font-semibold text-sm">
            Per-Run Token & Cost Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-medium border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-3">Run ID</th>
                  <th className="px-6 py-3">Model</th>
                  <th className="px-6 py-3">Input Tokens</th>
                  <th className="px-6 py-3">Output Tokens</th>
                  <th className="px-6 py-3">Cache Tokens</th>
                  <th className="px-6 py-3">Cost (USD)</th>
                  <th className="px-6 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {usageRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                      No agent runs executed yet. Run a prompt in Chat to see real-time metrics!
                    </td>
                  </tr>
                ) : (
                  usageRecords.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-950/50 transition-colors">
                      <td className="px-6 py-3.5 font-mono text-zinc-200">{row.run_id}</td>
                      <td className="px-6 py-3.5 font-medium text-blue-400">{row.model_id}</td>
                      <td className="px-6 py-3.5">{row.input_tokens?.toLocaleString()}</td>
                      <td className="px-6 py-3.5">{row.output_tokens?.toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-zinc-500">{row.cache_tokens?.toLocaleString() || 0}</td>
                      <td className="px-6 py-3.5 font-bold text-emerald-400">
                        ${Number(row.cost_usd || 0).toFixed(6)}
                      </td>
                      <td className="px-6 py-3.5 text-zinc-500">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
