import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia" as any,
  });

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, signature || "", webhookSecret);
    } else {
      // In dev mode without webhook secret configured, parse body directly (with warning)
      console.warn("STRIPE_WEBHOOK_SECRET not set. Parsing event directly.");
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err: any) {
    console.error(`Webhook Signature Verification Failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;

    if (userId) {
      // Use service role key if available to bypass RLS, fallback to anon key
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch current profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, has_paid")
        .eq("id", userId)
        .single();

      const currentCredits = profile?.credits || 0;
      const newCredits = currentCredits + 5;

      // Grant 5 credits & set has_paid = true ONLY IN THE WEBHOOK
      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          credits: newCredits,
          has_paid: true,
        });

      if (updateError) {
        console.error("Failed to update user profile in webhook:", updateError);
        return NextResponse.json({ error: "Failed to update profile credits" }, { status: 500 });
      }

      console.log(`Successfully granted 5 credits and set has_paid=true for user: ${userId}`);
    }
  }

  return NextResponse.json({ received: true });
}
