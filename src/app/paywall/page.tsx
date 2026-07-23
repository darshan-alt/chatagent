"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function PaywallPage() {
  const [coupon, setCoupon] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  const handleStripeCheckout = async () => {
    setCheckoutLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const contentType = res.headers.get("content-type");
      let data: any = {};

      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error("Server returned an invalid response. Please check your Stripe keys in .env.local.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate Stripe Checkout.");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No Checkout URL returned from Stripe.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred with Stripe Checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupon.trim()) return;

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: coupon }),
      });

      const contentType = res.headers.get("content-type");
      let data: any = {};
      
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error("Server returned an invalid response. Please check your configuration.");
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to redeem promo code.");
      }

      // Success: Display usage stats message and redirect
      const message = data.message || `Promo code redeemed! (Used ${data.usesCount || 1} of ${data.maxUses || 5} times)`;
      setSuccessMsg(message);

      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] items-center justify-center bg-zinc-950 text-zinc-50 px-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tighter">Out of Credits</h1>
          <p className="text-zinc-400 text-sm">
            You've run out of credits. Purchase 5 credits for $5 or enter a promo code to continue using ChatAgent.
          </p>
        </div>
        
        <div className="space-y-4">
          <Button 
            onClick={handleStripeCheckout}
            disabled={checkoutLoading}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-semibold" 
            size="lg"
          >
            {checkoutLoading ? "Connecting to Stripe..." : "Purchase 5 Credits ($5)"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500 font-medium">Or enter a promo code</span>
            </div>
          </div>

          <form onSubmit={handleRedeem} className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter promo code (e.g. SID_DRDROID)"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                required
              />
            </div>
            
            {error && (
              <div className="p-3 text-xs rounded border border-red-500/50 bg-red-500/10 text-red-400">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-3 text-xs rounded border border-green-500/50 bg-green-500/10 text-green-400">
                {successMsg}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-zinc-900 text-zinc-100 border border-zinc-700 hover:bg-zinc-800 font-semibold" 
              size="lg" 
              disabled={loading}
            >
              {loading ? "Redeeming..." : "Redeem Promo Code"}
            </Button>
          </form>

          <div className="pt-2 text-center">
            <Link href="/chat" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              Explore chat →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
