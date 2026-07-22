import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { performWebSearch } from "@/lib/agent/search";
import { generatePdfReport } from "@/lib/agent/pdf";
import { calculateCost } from "@/lib/agent/pricing";

const MAX_ITERATIONS = 6;

export async function POST(request: Request) {
  try {
    const { chatId: inputChatId, prompt, model: requestedModel } = await request.json();

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Check user profile credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits, has_paid")
      .eq("id", user.id)
      .single();

    const credits = profile?.credits ?? 0;
    const hasPaid = profile?.has_paid ?? false;

    if (credits <= 0 && !hasPaid) {
      return NextResponse.json({ 
        error: "Out of credits. Please purchase credits or redeem a promo code to continue." 
      }, { status: 402 });
    }

    // 2. Fetch server-only user_keys
    const { data: userKey } = await supabase
      .from("user_keys")
      .select("base_url, api_key")
      .eq("user_id", user.id)
      .single();

    if (!userKey?.api_key) {
      return NextResponse.json({ 
        error: "No LLM API Key found. Please add your API key in Settings first." 
      }, { status: 400 });
    }

    // 3. Deduct 1 credit
    if (credits > 0) {
      await supabase
        .from("profiles")
        .update({ credits: credits - 1 })
        .eq("id", user.id);
    }

    // 4. Ensure Chat ID exists
    let chatId = inputChatId;
    if (!chatId) {
      const { data: newChat } = await supabase
        .from("chats")
        .insert([{ user_id: user.id, title: prompt.substring(0, 30) }])
        .select()
        .single();
      chatId = newChat?.id || crypto.randomUUID();
    }

    const runId = `run_${Date.now()}`;
    let seq = 1;
    let pdfUrl: string | undefined = undefined;
    const selectedModel = requestedModel || "gpt-4o-mini";

    // 5. Save initial User Message
    await supabase.from("messages").insert([{
      chat_id: chatId,
      user_id: user.id,
      run_id: runId,
      seq: seq++,
      role: "user",
      content: prompt,
    }]);

    // 6. Initialize OpenAI SDK with user_keys
    const openai = new OpenAI({
      baseURL: userKey.base_url || "https://api.openai.com/v1",
      apiKey: userKey.api_key,
    });

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for up-to-date information, news, or reports.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query string" },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_report",
          description: "Generate a downloadable PDF report and upload it for the user.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Report Title" },
              content: { type: "string", description: "Comprehensive report contents in plain text or markdown" },
            },
            required: ["title", "content"],
          },
        },
      },
    ];

    const messageHistory: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are ChatAgent, an advanced AI research assistant. Use tools when helpful to search the web or generate PDF reports.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const allSteps: any[] = [];
    let finalAnswer = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheTokens = 0;

    // 7. Agent Execution Loop (Max 6 Iterations)
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await openai.chat.completions.create({
        model: selectedModel,
        messages: messageHistory,
        tools,
        tool_choice: "auto",
      });

      // Track usage metrics
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens || 0;
        totalOutputTokens += response.usage.completion_tokens || 0;
        totalCacheTokens += (response.usage as any).prompt_tokens_details?.cached_tokens || 0;
      }

      const choice = response.choices[0];
      const message = choice.message;

      messageHistory.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Save Assistant Tool Call Message
        await supabase.from("messages").insert([{
          chat_id: chatId,
          user_id: user.id,
          run_id: runId,
          seq: seq++,
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls as any,
        }]);

        allSteps.push({
          id: `step_${seq}`,
          run_id: runId,
          seq: seq,
          role: "assistant",
          tool_calls: message.tool_calls,
        });

        // Execute Tool Calls
        for (const toolCall of message.tool_calls) {
          if (toolCall.type === "function") {
            const fnName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || "{}");
            let resultStr = "";

            if (fnName === "web_search") {
              resultStr = await performWebSearch(args.query);
            } else if (fnName === "create_report") {
              pdfUrl = await generatePdfReport(args.title, args.content, user.id);
              resultStr = `PDF Report successfully generated and uploaded. URL: ${pdfUrl}`;
            }

            messageHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: resultStr,
            });

            // Save Tool Result Message
            await supabase.from("messages").insert([{
              chat_id: chatId,
              user_id: user.id,
              run_id: runId,
              seq: seq++,
              role: "tool",
              content: resultStr,
              tool_call_id: toolCall.id,
            }]);

            allSteps.push({
              id: `step_${seq}`,
              run_id: runId,
              seq: seq,
              role: "tool",
              content: resultStr,
              tool_call_id: toolCall.id,
            });
          }
        }
      } else {
        // Final Answer Reached
        finalAnswer = message.content || "Completed.";
        
        await supabase.from("messages").insert([{
          chat_id: chatId,
          user_id: user.id,
          run_id: runId,
          seq: seq++,
          role: "assistant",
          content: finalAnswer,
        }]);

        break;
      }
    }

    // 8. Calculate Cost & Store in token_usage table
    const costUsd = calculateCost(selectedModel, totalInputTokens, totalOutputTokens, totalCacheTokens);

    await supabase.from("token_usage").insert([{
      user_id: user.id,
      run_id: runId,
      model_id: selectedModel,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_tokens: totalCacheTokens,
      cost_usd: costUsd,
    }]);

    return NextResponse.json({
      run_id: runId,
      chatId,
      steps: allSteps,
      finalAnswer,
      pdfUrl,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheTokens: totalCacheTokens,
        costUsd,
      },
    });
  } catch (error: any) {
    console.error("Agent Run Error:", error);
    return NextResponse.json({ error: error.message || "Failed to execute agent loop" }, { status: 500 });
  }
}
