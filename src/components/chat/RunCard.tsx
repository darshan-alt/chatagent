"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain, Search, FileText, Download } from "lucide-react";

export interface ToolStep {
  id: string;
  name: string;
  args?: any;
  result?: any;
}

export interface MessageItem {
  id: string;
  run_id: string;
  seq: number;
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  tool_calls?: any;
  tool_call_id?: string;
  created_at: string;
}

export interface RunCardData {
  run_id: string;
  userQuery: string;
  steps: MessageItem[];
  finalAnswer: string;
  pdfUrl?: string;
}

export function RunCard({ run }: { run: RunCardData }) {
  const [isOpen, setIsOpen] = useState(false);

  // Identify tool / intermediate steps
  const toolSteps = run.steps.filter((s) => s.role === "tool" || s.tool_calls);

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-lg">
      {/* User Query Header */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold text-zinc-100">{run.userQuery}</h3>
      </div>

      {/* Collapsed Trace: Agent Worked · N Steps */}
      {toolSteps.length > 0 && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-950/60 overflow-hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span>Agent worked · {toolSteps.length} steps</span>
              <div className="flex items-center gap-1 ml-2 text-zinc-500">
                <Search className="w-3 h-3" />
                <FileText className="w-3 h-3" />
              </div>
            </div>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Expanded Step Trace */}
          {isOpen && (
            <div className="px-4 py-3 border-t border-zinc-800/80 space-y-2 text-xs text-zinc-400 bg-zinc-950/90 font-mono">
              {toolSteps.map((step, idx) => (
                <div key={step.id || idx} className="flex items-start gap-2">
                  <span className="text-zinc-600 font-sans">Step {idx + 1}:</span>
                  <div className="flex-1">
                    {step.tool_calls && (
                      <span className="text-blue-400">
                        Tool call: {JSON.stringify(step.tool_calls)}
                      </span>
                    )}
                    {step.role === "tool" && (
                      <span className="text-emerald-400">
                        Result: {step.content?.substring(0, 150)}...
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Final Answer */}
      {run.finalAnswer && (
        <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap pt-1">
          {run.finalAnswer}
        </div>
      )}

      {/* PDF Artifact Chip */}
      {run.pdfUrl && (
        <div className="pt-2">
          <a
            href={run.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-xs font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>Download Report (PDF)</span>
            <Download className="w-3 h-3 ml-1" />
          </a>
        </div>
      )}
    </div>
  );
}
