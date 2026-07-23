import { test, expect } from "@playwright/test";

// These cover everything reachable WITHOUT GitHub OAuth: public pages, the
// paywall UI, and middleware auth-gating. The authenticated happy-path
// (run agent -> stats) requires a real OAuth session and is out of scope here.

const SHOT_DIR = "test-results/screenshots";

test("landing page renders", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await page.screenshot({ path: `${SHOT_DIR}/landing.png`, fullPage: true });
});

test("login page shows GitHub sign-in (AUTH-01 entry point)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Welcome Back")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with GitHub/i })).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/login.png`, fullPage: true });
});

test("login shows error banner from query param", async ({ page }) => {
  await page.goto("/login?error=Could%20not%20authenticate");
  await expect(page.getByText("Could not authenticate")).toBeVisible();
});

test("paywall renders purchase + promo UI (public)", async ({ page }) => {
  const res = await page.goto("/paywall");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Out of Credits" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Purchase 5 Credits/i })).toBeVisible();
  await expect(page.getByPlaceholder(/promo code/i)).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/paywall.png`, fullPage: true });
});

test("empty promo code is blocked client-side (required field)", async ({ page }) => {
  await page.goto("/paywall");
  await page.getByRole("button", { name: /Redeem Promo Code/i }).click();
  // HTML5 required validation keeps us on the paywall; no navigation to "/".
  await expect(page).toHaveURL(/\/paywall/);
});

test.describe("API routes return JSON, never an HTML redirect (paywall/login)", () => {
  // Regression: middleware used to redirect /api/stripe/checkout to /paywall for
  // out-of-credits users, so the browser fetch received HTML and the paywall
  // reported "Server returned an invalid response. Please check your Stripe keys".
  for (const ep of ["/api/stripe/checkout", "/api/agent/run", "/api/settings/save"]) {
    test(`POST ${ep} responds with JSON`, async ({ request }) => {
      const res = await request.post(ep, { data: {}, maxRedirects: 0 });
      const status = res.status();
      const isRedirect = status >= 300 && status < 400;
      expect(isRedirect, `must not be a 3xx redirect (got ${status})`).toBe(false);
      expect(res.headers()["content-type"] ?? "").toContain("application/json");
    });
  }
});

test.describe("GATE-02: protected routes redirect to /login when logged out", () => {
  for (const path of ["/chat", "/settings", "/stats"]) {
    test(`GET ${path} -> /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
