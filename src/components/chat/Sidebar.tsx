"use client";

import Link from "next/link";
import { Plus, MessageSquare, Settings, LogOut, Coins, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChatItem {
  id: string;
  title: string;
  created_at: string;
}

export function Sidebar({
  chats,
  currentChatId,
  credits,
}: {
  chats: ChatItem[];
  currentChatId?: string;
  credits: number;
}) {
  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen shrink-0">
      {/* Brand & New Chat */}
      <div className="p-4 border-b border-zinc-800 space-y-3">
        <Link href="/" className="font-bold text-lg tracking-tighter text-zinc-50 flex items-center gap-2">
          <span>ChatAgent</span>
        </Link>
        <Link href="/chat">
          <Button className="w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold gap-2" size="sm">
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </Link>
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.length === 0 ? (
          <p className="text-xs text-zinc-500 px-3 py-2">No past chats yet</p>
        ) : (
          chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chat?id=${chat.id}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                currentChatId === chat.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{chat.title || "Untitled Chat"}</span>
            </Link>
          ))
        )}
      </div>

      {/* Footer / Credits & Stats & Settings */}
      <div className="p-4 border-t border-zinc-800 space-y-3 bg-zinc-950">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Credits:</span>
          </div>
          <span className="font-bold text-amber-400">{credits}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
          <Link href="/stats" className="hover:text-zinc-100 flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
            Stats
          </Link>
          <Link href="/settings" className="hover:text-zinc-100 flex items-center gap-1">
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
          <form action="/auth/signout" method="POST">
            <button type="submit" className="hover:text-zinc-100 flex items-center gap-1 text-red-400 hover:text-red-300">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
