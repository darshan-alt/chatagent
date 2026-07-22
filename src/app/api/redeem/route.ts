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

    // 1. Reject if this user already redeemed the code.
    const { data: existingRedemption } = await supabase
      .from("redemptions")
      .select("id")
      .eq("user_id", user.id)
      .ilike("coupon_code", couponCode)
      .single();

    if (existingRedemption) {
      const { count: usedCount } = await supabase
        .from("redemptions")
        .select("id", { count: "exact", head: true })
        .ilike("coupon_code", couponCode);
      return NextResponse.json({
        error: `You have already redeemed this promo code. (Total code uses: ${usedCount ?? 0}/${MAX_PROMO_USES})`
      }, { status: 400 });
    }

    // 2. Claim a redemption slot BEFORE checking the cap. Counting first and
    // inserting after leaves a race window where many parallel requests all
    // pass the check and blow past MAX_PROMO_USES. By inserting first and then
    // counting, an over-limit claim can be detected and rolled back.
    const { data: claimed, error: claimError } = await supabase
      .from("redemptions")
      .insert([{ user_id: user.id, coupon_code: couponCode }])
      .select("id")
      .single();

    if (claimError || !claimed) {
      return NextResponse.json({
        error: "Could not redeem this promo code right now. Please try again."
      }, { status: 500 });
    }

    // 3. Enforce the cap. If this claim pushed usage over the limit, roll it back.
    const { count: totalRedemptionsCount } = await supabase
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .ilike("coupon_code", couponCode);

    const currentUsageCount = totalRedemptionsCount || 0;

    if (currentUsageCount > MAX_PROMO_USES) {
      await supabase.from("redemptions").delete().eq("id", claimed.id);
      return NextResponse.json({
        error: `This promo code has reached its maximum usage limit (${MAX_PROMO_USES}/${MAX_PROMO_USES} uses).`
      }, { status: 400 });
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
      // Roll back the claimed redemption so the user can retry.
      await supabase.from("redemptions").delete().eq("id", claimed.id);
      return NextResponse.json({
        error: `Failed to update credits: ${updateError.message || "RLS policy error"}.`
      }, { status: 500 });
    }

    // currentUsageCount already includes this redemption (claimed in step 2).
    const newUsageCount = currentUsageCount;

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
