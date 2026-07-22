import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if coupon exists
    const { data: coupon, error: couponError } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", code)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    // Attempt to insert redemption (fails if already redeemed due to unique constraint)
    const { error: redemptionError } = await supabase
      .from("redemptions")
      .insert([
        { user_id: user.id, coupon_code: coupon.code }
      ]);

    if (redemptionError) {
      if (redemptionError.code === "23505") { // Unique violation
        return NextResponse.json({ error: "You have already redeemed this coupon" }, { status: 400 });
      }
      return NextResponse.json({ error: "Failed to redeem coupon" }, { status: 500 });
    }

    // Grant credits
    // Note: Since we are using an Anon key here, the RLS on profiles must allow the user to update their own profile,
    // OR we should use a service role key / database function to ensure atomic updates safely.
    // For this prototype, we'll fetch current and add, assuming standard user permissions or a secure RPC.
    
    // Fetch current profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();
      
    const currentCredits = profile?.credits || 0;
    
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ credits: currentCredits + coupon.credits_value })
      .eq("id", user.id);

    if (updateError) {
      // In a robust system, we would rollback the redemption here if this fails.
      return NextResponse.json({ error: "Failed to update credits" }, { status: 500 });
    }

    return NextResponse.json({ success: true, creditsAdded: coupon.credits_value });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
