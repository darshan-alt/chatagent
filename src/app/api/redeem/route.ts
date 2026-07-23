import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MAX_PROMO_USES = 5;

// Granting credits is a privileged operation. Prefer the service-role key
// (bypasses RLS) so redemption tracking and credit updates work regardless of
// row-level security. Falls back to null when the key isn't configured.
function getServiceDb() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

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

    // Use the privileged client for coupon/redemption/credit work when
    // available; otherwise fall back to the user's session client.
    const db = getServiceDb() ?? supabase;

    let couponValue = 0;
    let couponCode = cleanCode;

    // Standard check against DB
    const { data: coupon } = await db
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

    // 1. Reject if this user already redeemed the code, and enforce the total
    //    usage cap. Both reads are best-effort — if the redemptions table can't
    //    be read, we don't block a legitimate redemption.
    const { data: existingRedemption } = await db
      .from("redemptions")
      .select("id")
      .eq("user_id", user.id)
      .ilike("coupon_code", couponCode)
      .maybeSingle();

    const { count: totalRedemptionsCount } = await db
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .ilike("coupon_code", couponCode);

    const currentUsageCount = totalRedemptionsCount || 0;

    if (existingRedemption) {
      return NextResponse.json({
        error: `You have already redeemed this promo code. (Total code uses: ${currentUsageCount}/${MAX_PROMO_USES})`
      }, { status: 400 });
    }

    if (currentUsageCount >= MAX_PROMO_USES) {
      return NextResponse.json({
        error: `This promo code has reached its maximum usage limit (${currentUsageCount}/${MAX_PROMO_USES} uses).`
      }, { status: 400 });
    }

    // 2. Record the redemption. Best-effort: tracking must not block the credit
    //    grant if the redemptions table has restrictive RLS or is missing.
    const { error: insertErr } = await db
      .from("redemptions")
      .insert([{ user_id: user.id, coupon_code: couponCode }]);
    if (insertErr) {
      console.warn("Redemption tracking insert failed (continuing):", insertErr.message);
    }

    // 3. Fetch current profile & update credits (the critical step).
    const { data: profile } = await db
      .from("profiles")
      .select("credits, has_paid")
      .eq("id", user.id)
      .single();

    const currentCredits = profile?.credits || 0;
    const hasPaid = profile?.has_paid || false;
    const newCredits = currentCredits + couponValue;

    // Update in place when the profile already exists (needs only an UPDATE
    // policy under the user-session fallback); upsert only to create a missing
    // row. The service-role client bypasses RLS entirely when configured.
    const { error: updateError } = profile
      ? await db.from("profiles").update({ credits: newCredits }).eq("id", user.id)
      : await db.from("profiles").upsert({ id: user.id, credits: newCredits, has_paid: hasPaid });

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
