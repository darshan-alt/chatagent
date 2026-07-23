import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatView } from "@/components/chat/ChatView";
import { RunCardData, MessageItem } from "@/components/chat/RunCard";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const resolvedParams = await searchParams;
  const currentChatId = resolvedParams?.id;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/chat");
  }

  // Fetch profile for credits
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, has_paid")
    .eq("id", user.id)
    .single();

  const credits = profile?.credits ?? 0;
  const hasPaid = profile?.has_paid ?? false;
  const outOfCredits = credits <= 0 && !hasPaid;

  // Fetch user chats list
  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch messages if a chatId is selected
  let initialRuns: RunCardData[] = [];

  if (currentChatId) {
    const { data: rawMessages } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", currentChatId)
      .order("seq", { ascending: true });

    if (rawMessages && rawMessages.length > 0) {
      // Group by run_id
      const runMap = new Map<string, MessageItem[]>();
      rawMessages.forEach((msg) => {
        const list = runMap.get(msg.run_id) || [];
        list.push(msg);
        runMap.set(msg.run_id, list);
      });

      runMap.forEach((msgs, run_id) => {
        const userMsg = msgs.find((m) => m.role === "user");
        const assistantMsg = msgs.filter((m) => m.role === "assistant").pop();

        // Check if any message contains a PDF artifact URL
        const pdfMsg = msgs.find((m) => m.content?.includes("http") && m.content?.includes(".pdf"));
        let pdfUrl: string | undefined = undefined;
        if (pdfMsg?.content) {
          const match = pdfMsg.content.match(/https?:\/\/[^\s"]+\.pdf/);
          if (match) pdfUrl = match[0];
        }

        initialRuns.push({
          run_id,
          userQuery: userMsg?.content || "User Query",
          steps: msgs,
          finalAnswer: assistantMsg?.content || "",
          pdfUrl,
        });
      });
    }
  }

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden">
      <Sidebar chats={chats || []} currentChatId={currentChatId} credits={credits} />
      <ChatView chatId={currentChatId} initialRuns={initialRuns} outOfCredits={outOfCredits} />
    </div>
  );
}
