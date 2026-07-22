"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunCard, RunCardData } from "./RunCard";
import { SELECTED_MODEL_STORAGE_KEY } from "@/app/settings/SettingsForm";

export function ChatView({
  chatId,
  initialRuns,
}: {
  chatId?: string;
  initialRuns: RunCardData[];
}) {
  const [runs, setRuns] = useState<RunCardData[]>(initialRuns);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    setInput("");
    setLoading(true);

    const tempRunId = `run_${Date.now()}`;
    const newRun: RunCardData = {
      run_id: tempRunId,
      userQuery,
      steps: [],
      finalAnswer: "Agent is thinking and processing tool steps...",
    };

    setRuns((prev) => [...prev, newRun]);

    try {
      const selectedModel =
        typeof window !== "undefined"
          ? localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) || undefined
          : undefined;

      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, prompt: userQuery, model: selectedModel }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Agent execution failed.");
      }

      // Update the run card with actual response
      setRuns((prev) =>
        prev.map((r) =>
          r.run_id === tempRunId
            ? {
                run_id: data.run_id || tempRunId,
                userQuery,
                steps: data.steps || [],
                finalAnswer: data.finalAnswer || "Completed.",
                pdfUrl: data.pdfUrl,
              }
            : r
        )
      );
    } catch (err: any) {
      setRuns((prev) =>
        prev.map((r) =>
          r.run_id === tempRunId
            ? {
                ...r,
                finalAnswer: `Error: ${err.message || "Failed to process query."}`,
              }
            : r
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Thread Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100">What can I help you research today?</h2>
            <p className="text-sm text-zinc-400 max-w-md">
              Ask anything — ChatAgent can run web searches, analyze data, and generate PDF reports.
            </p>
          </div>
        ) : (
          runs.map((run) => <RunCard key={run.run_id} run={run} />)
        )}
      </div>

      {/* Fixed Bottom Input Bar */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Type your prompt... (e.g. 'Report on California forest fires')"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 h-11 rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700 disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 px-5 bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold rounded-xl"
          >
            {loading ? "Running..." : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
