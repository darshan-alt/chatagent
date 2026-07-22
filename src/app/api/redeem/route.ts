import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const MAX_PROMO_USES = 5;

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
      return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
    }

    // 1. Check total redemptions for this promo code
    const { data: allRedemptions, count: totalRedemptionsCount } = await supabase
      .from("redemptions")
      .select("id", { count: "exact" })
      .ilike("coupon_code", couponCode);

    const currentUsageCount = totalRedemptionsCount || allRedemptions?.length || 0;

    if (currentUsageCount >= MAX_PROMO_USES) {
      return NextResponse.json({ 
        error: `This promo code has reached its maximum usage limit (${currentUsageCount}/${MAX_PROMO_USES} uses).` 
      }, { status: 400 });
    }

    // 2. Check if user already redeemed
    const { data: existingRedemption } = await supabase
      .from("redemptions")
      .select("*")
      .eq("user_id", user.id)
      .ilike("coupon_code", couponCode)
      .single();

    if (existingRedemption) {
      return NextResponse.json({ 
        error: `You have already redeemed this promo code. (Total code uses: ${currentUsageCount}/${MAX_PROMO_USES})` 
      }, { status: 400 });
    }

    // 3. Insert redemption record
    try {
      await supabase
        .from("redemptions")
        .insert([{ user_id: user.id, coupon_code: couponCode }]);
    } catch (e) {
      console.warn("Redemption record insert warning:", e);
    }

    // 4. Fetch current profile & update credits
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
      const res = await supabase
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", user.id);
      updateError = res.error;
    } else {
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
        error: `Failed to update credits: ${updateError.message || "RLS policy error"}.` 
      }, { status: 500 });
    }

    const newUsageCount = currentUsageCount + 1;

    return NextResponse.json({ 
      success: true, 
      creditsAdded: couponValue,
      usesCount: newUsageCount,
      maxUses: MAX_PROMO_USES,
      message: `Coupon redeemed! Added ${couponValue} credits. Code has been used ${newUsageCount} of ${MAX_PROMO_USES} times.`
    });
  } catch (error: any) {
    console.error("Redeem API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
