"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SettingsForm({
  initialBaseUrl,
  initialApiKey,
}: {
  initialBaseUrl: string;
  initialApiKey: string;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl || "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save API settings.");
      }

      setMsg({ type: "success", text: "API key and Base URL saved successfully!" });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "An error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-zinc-900 p-6 rounded-xl border border-zinc-800">
      {msg && (
        <div
          className={`p-3 text-sm rounded border ${
            msg.type === "success"
              ? "border-green-500/50 bg-green-500/10 text-green-400"
              : "border-red-500/50 bg-red-500/10 text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
          required
        />
        <p className="text-xs text-zinc-500">Default: https://api.openai.com/v1 or custom proxy/Ollama URL</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
          required
        />
        <p className="text-xs text-zinc-500">Your API key is never preloaded and is used only on server-side agent runs.</p>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold"
      >
        {loading ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
