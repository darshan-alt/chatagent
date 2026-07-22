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

  // A webhook secret is REQUIRED. Without signature verification anyone could
  // POST a forged checkout.session.completed event to grant themselves credits.
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set; refusing to process unsigned webhooks.");
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia" as any,
  });

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature || "", webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Signature Verification Failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;

    // Only grant credits for a fully-paid session.
    if (session.payment_status !== "paid") {
      console.warn(`Ignoring checkout session ${session.id} with payment_status=${session.payment_status}`);
      return NextResponse.json({ received: true });
    }

    if (userId) {
      // Use service role key if available to bypass RLS, fallback to anon key
      const supabaseUrl = getSupabaseUrl();
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Idempotency guard: claim this event id before granting credits so that
      // Stripe retries / replays don't stack additional credits. If the row
      // already exists, we've processed this event before -> no-op.
      const { error: claimError } = await supabase
        .from("stripe_events")
        .insert({ id: event.id });

      if (claimError) {
        // 23505 = unique_violation -> already processed. Anything else (e.g.
        // 42P01 missing table) is logged and we proceed best-effort.
        if (claimError.code === "23505") {
          console.log(`Stripe event ${event.id} already processed; skipping.`);
          return NextResponse.json({ received: true, duplicate: true });
        }
        console.warn(`Could not record stripe event ${event.id} for idempotency:`, claimError.message);
      }

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
