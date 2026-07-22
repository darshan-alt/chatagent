import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const cleanCode = (code || "").trim();

    if (!cleanCode) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let couponValue = 0;
    let couponCode = cleanCode;

    // Standard check against DB
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .ilike("code", cleanCode)
      .single();

    if (coupon) {
      couponValue = coupon.credits_value;
      couponCode = coupon.code;
    } else if (cleanCode.toUpperCase() === "SID_DRDROID") {
      // Fallback seed coupon if user hasn't run seed SQL in Supabase DB yet
      couponValue = 5;
      couponCode = "SID_DRDROID";
    } else {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    // Check if user already redeemed
    const { data: existingRedemption } = await supabase
      .from("redemptions")
      .select("*")
      .eq("user_id", user.id)
      .ilike("coupon_code", couponCode)
      .single();

    if (existingRedemption) {
      return NextResponse.json({ error: "You have already redeemed this coupon" }, { status: 400 });
    }

    // Insert redemption record (ignore if RLS or table missing in fallback mode)
    try {
      await supabase
        .from("redemptions")
        .insert([{ user_id: user.id, coupon_code: couponCode }]);
    } catch (e) {
      console.warn("Redemption record insert warning:", e);
    }

    // Fetch current profile to grant credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits, has_paid")
      .eq("id", user.id)
      .single();
      
    const currentCredits = profile?.credits || 0;
    const hasPaid = profile?.has_paid || false;
    const newCredits = currentCredits + couponValue;

    let updateError = null;

    if (profile) {
      // Profile exists: UPDATE
      const res = await supabase
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", user.id);
      updateError = res.error;
    } else {
      // Profile missing: INSERT or UPSERT
      const res = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          credits: newCredits,
          has_paid: hasPaid,
        });
      updateError = res.error;
    }

    if (updateError) {
      console.error("Profile credits update error:", updateError);
      return NextResponse.json({ 
        error: `Failed to update credits: ${updateError.message || "RLS policy error"}. Please run the updated SQL migration.` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, creditsAdded: couponValue });
  } catch (error: any) {
    console.error("Redeem API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
