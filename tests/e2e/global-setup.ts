import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

/**
 * Playwright global setup: mints a real Supabase session for a seeded test user
 * and writes it to a storageState file the `authed` project reuses. This is the
 * ONLY way to exercise the authenticated happy-path without GitHub OAuth.
 *
 * It requires (typically from CI secrets / .env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY   (to create the user + seed credits/keys)
 * Optional:
 *   - E2E_USER_EMAIL / E2E_USER_PASSWORD   (defaults provided)
 *   - E2E_LLM_API_KEY / E2E_LLM_BASE_URL   (seeds user_keys so agent runs work)
 *
 * When SUPABASE_SERVICE_ROLE_KEY is absent it writes an unauthenticated marker
 * and the authed specs skip themselves — the public suite still runs.
 */

const AUTH_DIR = path.join(__dirname, ".auth");
const STATE_FILE = path.join(AUTH_DIR, "state.json");
const META_FILE = path.join(AUTH_DIR, "meta.json");

// Minimal .env.local loader so `npx playwright test` works locally without a
// separate dotenv dependency. CI sets these in the environment directly.
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function writeMeta(meta: Record<string, unknown>) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

function writeEmptyState() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

export default async function globalSetup() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    console.warn(
      "[e2e] SUPABASE_SERVICE_ROLE_KEY (or URL/anon) not set — skipping authed setup. " +
        "Authed specs will be skipped; public specs still run."
    );
    writeEmptyState();
    writeMeta({ authenticated: false, reason: "missing supabase service credentials" });
    return;
  }

  const email = process.env.E2E_USER_EMAIL || "e2e-tester@example.test";
  const password = process.env.E2E_USER_PASSWORD || "E2e-Password-123!";
  const llmKey = process.env.E2E_LLM_API_KEY;
  const llmBaseUrl = process.env.E2E_LLM_BASE_URL || "https://api.openai.com/v1";

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Ensure the test user exists (idempotent).
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error && !/already/i.test(created.error.message)) {
    console.warn(`[e2e] createUser failed: ${created.error.message}`);
  }

  // 2. Sign in through an @supabase/ssr server client backed by an in-memory
  //    cookie jar. This produces cookies in the EXACT format the app's
  //    middleware/server client expects for this installed ssr version.
  const jar: Record<string, string> = {};
  const supa = createServerClient(url, anon, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach((c) => { jar[c.name] = c.value; }),
    },
  });

  const { data: signIn, error: signInError } = await supa.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn.user) {
    console.warn(`[e2e] sign-in failed: ${signInError?.message}. Skipping authed specs.`);
    writeEmptyState();
    writeMeta({ authenticated: false, reason: signInError?.message ?? "sign-in failed" });
    return;
  }

  const userId = signIn.user.id;

  // 3. Seed profile credits (so the paywall doesn't block) and, if provided,
  //    an LLM key (so agent runs succeed).
  await admin.from("profiles").upsert({ id: userId, credits: 50, has_paid: false });
  if (llmKey) {
    await admin.from("user_keys").upsert(
      { user_id: userId, base_url: llmBaseUrl, api_key: llmKey, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }

  // 4. Persist the session as a Playwright storageState.
  const cookies = Object.entries(jar).map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
    expires: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
  }));

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies, origins: [] }, null, 2));
  writeMeta({ authenticated: true, userId, email, hasLlmKey: Boolean(llmKey) });

  console.log(`[e2e] authenticated as ${email} (credits seeded=50, llmKey=${Boolean(llmKey)})`);
}
