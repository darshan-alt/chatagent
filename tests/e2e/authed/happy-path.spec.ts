import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Authenticated happy-path. The `authed` Playwright project supplies the seeded
// storageState (see tests/e2e/global-setup.ts). These specs skip themselves when
// no session could be minted (e.g. SUPABASE_SERVICE_ROLE_KEY absent).

const META_FILE = path.join(__dirname, "..", ".auth", "meta.json");

function meta(): { authenticated: boolean; hasLlmKey?: boolean } {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch {
    return { authenticated: false };
  }
}

const SHOT_DIR = "test-results/screenshots";

test.beforeEach(() => {
  test.skip(!meta().authenticated, "No seeded Supabase session (set SUPABASE_SERVICE_ROLE_KEY).");
});

test("authenticated user reaches /settings (no redirect)", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: /LLM API Settings/i })).toBeVisible();
  await expect(page.getByText("Select Default LLM Model")).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/authed-settings.png`, fullPage: true });
});

test("selecting a model persists across reloads (RISK-6)", async ({ page }) => {
  await page.goto("/settings");
  const select = page.locator("select");
  await select.selectOption("gpt-4o");
  await page.reload();
  await expect(page.locator("select")).toHaveValue("gpt-4o");
});

test("authenticated user reaches /stats (no redirect)", async ({ page }) => {
  await page.goto("/stats");
  await expect(page).toHaveURL(/\/stats/);
  await expect(page.getByRole("heading", { name: /Usage & Cost Breakdown/i })).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/authed-stats.png`, fullPage: true });
});

test("authenticated user reaches /chat with seeded credits", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByPlaceholder(/Type your prompt/i)).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/authed-chat.png`, fullPage: true });
});

test("agent run produces an answer (AGENT-09/10)", async ({ page }) => {
  test.skip(!meta().hasLlmKey, "No E2E_LLM_API_KEY seeded — agent cannot call an LLM.");
  test.setTimeout(90_000);

  await page.goto("/chat");
  await page.getByPlaceholder(/Type your prompt/i).fill("In one sentence, what is a unit test?");
  await page.getByRole("button", { name: /send/i }).click().catch(async () => {
    // Fallback: submit via Enter if the icon button isn't matched by name.
    await page.getByPlaceholder(/Type your prompt/i).press("Enter");
  });

  // The optimistic placeholder is replaced by the real answer.
  await expect(
    page.getByText("Agent is thinking and processing tool steps...")
  ).toHaveCount(0, { timeout: 80_000 });
  await page.screenshot({ path: `${SHOT_DIR}/authed-agent-run.png`, fullPage: true });
});
