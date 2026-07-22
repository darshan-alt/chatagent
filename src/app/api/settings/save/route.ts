import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { base_url, api_key } = await request.json();
    if (!api_key) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Upsert into user_keys
    const { error } = await supabase
      .from("user_keys")
      .upsert({
        user_id: user.id,
        base_url: base_url || "https://api.openai.com/v1",
        api_key,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to save settings" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
