import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: "Stripe secret key is not configured in .env.local" }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "ChatAgent 5 Credits",
              description: "5 Credits for AI Research & Analysis Agent",
            },
            unit_amount: 500, // $5.00
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/chat?checkout=success`,
      cancel_url: `${origin}/paywall?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Session Error:", error);
    return NextResponse.json({ error: error.message || "Failed to create Stripe Checkout session" }, { status: 500 });
  }
}
