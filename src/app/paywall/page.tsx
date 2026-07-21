"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function PaywallPage() {
  const [coupon, setCoupon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupon.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: coupon }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to redeem coupon");
      }

      // Success, redirect to main app
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tighter">Out of Credits</h1>
          <p className="text-zinc-400 text-sm">
            You've run out of credits. Please purchase a plan or enter a promo code to continue using MicroManus.
          </p>
        </div>
        
        <div className="space-y-4">
          <Button className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200" size="lg" disabled>
            Purchase Credits ($5) - Coming Soon
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500">Or use a coupon</span>
            </div>
          </div>

          <form onSubmit={handleRedeem} className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full border-zinc-700" variant="outline" size="lg" disabled={loading}>
              {loading ? "Redeeming..." : "Redeem"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
