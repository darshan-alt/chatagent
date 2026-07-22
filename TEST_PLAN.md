# ChatAgent — Test Case Plan

AI research assistant (Next.js 16 / React 19) with Supabase auth + DB, a credits/paywall
system, an OpenAI-compatible multi-step agent loop (Brave web search + React-PDF report
generation), Stripe checkout, promo-code redemption, and a token/cost stats page.

---

## 1. Scope

| # | Module | Key files |
|---|--------|-----------|
| M1 | Authentication (GitHub OAuth) | `auth/[provider]/route.ts`, `auth/callback/route.ts`, `auth/signout`, `login/page.tsx` |
| M2 | Route protection / paywall gating | `middleware.ts`, `utils/supabase/middleware.ts` |
| M3 | Agent run loop | `api/agent/run/route.ts`, `lib/agent/search.ts`, `lib/agent/pdf.ts` |
| M4 | Settings (API key / base URL / model) | `api/settings/save/route.ts`, `settings/SettingsForm.tsx` |
| M5 | Stripe checkout + webhook | `api/stripe/checkout/route.ts`, `api/stripe/webhook/route.ts` |
| M6 | Promo-code redemption | `api/redeem/route.ts`, `paywall/page.tsx` |
| M7 | Token usage & cost stats | `stats/page.tsx`, `lib/agent/pricing.ts` |
| M8 | Chat UI | `chat/page.tsx`, `components/chat/*` |

**Out of scope:** third-party internals (Stripe/Supabase/Brave/OpenAI availability), visual/pixel regression.

## 2. Test environment & data

- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BRAVE_SEARCH_API_KEY`. Test **with** and **without** the optional ones (service role, webhook secret, Brave key) since the code has explicit fallbacks for each.
- **DB tables:** `profiles(id, credits, has_paid)`, `user_keys(user_id, base_url, api_key)`, `chats`, `messages`, `token_usage`, `coupons(code, credits_value)`, `redemptions(user_id, coupon_code)`. Storage bucket: `reports`.
- **Test accounts:** (A) new user, 0 credits, `has_paid=false`; (B) user with credits > 0; (C) `has_paid=true`, 0 credits; (D) user with a saved API key; (E) user with no `user_keys` row.
- **Stripe:** test-mode keys, `4242…` card, Stripe CLI to replay/forge webhooks.

---

## 3. Test cases

### M1 — Authentication

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| AUTH-01 | GitHub sign-in happy path | Logged out | Visit `/login` → "Continue with GitHub" → approve | Redirect via `/auth/callback`, session cookie set, land on `/` |
| AUTH-02 | New user profile auto-created | First-ever login | Complete OAuth | `profiles` row inserted with `credits=0, has_paid=false` (callback) |
| AUTH-03 | Existing user, no duplicate profile | User logged in before | Log in again | No second `profiles` row; existing credits preserved |
| AUTH-04 | Invalid provider | — | POST `/auth/google` (button not shown) then an unsupported value | `google`/`github` allowed; any other → 400 "Invalid provider" |
| AUTH-05 | OAuth provider error | Force `signInWithOAuth` error | — | Redirect to `/login?error=…`, message rendered in red banner |
| AUTH-06 | Callback with no `code` | — | GET `/auth/callback` without `code` | Redirect `/login?error=Could not authenticate` |
| AUTH-07 | Callback code exchange fails | Reused/expired code | — | Redirect to login error page, no session |
| AUTH-08 | `next` param honored | — | `/auth/callback?code=…&next=/stats` | Redirect to `/stats` after auth |
| AUTH-09 | Sign out | Logged in | Trigger `/auth/signout` | Session cleared, protected routes redirect to `/login` |
| AUTH-10 | Already-authed hits `/login` | Logged in | Visit `/login` | Redirect to `/` |

### M2 — Route protection & paywall gating

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| GATE-01 | Public routes open when logged out | Logged out | Visit `/`, `/login`, `/paywall`, `/auth/*` | Reachable, no redirect |
| GATE-02 | Protected route while logged out | Logged out | Visit `/chat`, `/settings`, `/stats` | Redirect to `/login` |
| GATE-03 | 0 credits + not paid → paywall | Account A | Visit `/chat` | Redirect to `/paywall` |
| GATE-04 | Credits > 0 → access granted | Account B | Visit `/chat` | Page loads |
| GATE-05 | has_paid=true, 0 credits → access | Account C | Visit `/chat` | Page loads (paid bypasses credit check) |
| GATE-06 | Redeem/webhook API exempt from gating | Account A (0 credits) | POST `/api/redeem`, `/api/stripe/webhook` | Not redirected to `/paywall` by middleware |
| GATE-07 | Missing Supabase env | Unset URL/anon key | Any request | Middleware short-circuits (`NextResponse.next`), no crash |
| GATE-08 | Static assets bypass middleware | — | Request `/_next/static/*`, `favicon.ico`, `*.png` | Served without auth logic |

### M3 — Agent run loop (`POST /api/agent/run`)

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| AGENT-01 | Empty/whitespace prompt | Any | POST with `prompt:""` / `"   "` | 400 "Prompt is required" |
| AGENT-02 | Unauthenticated | Logged out | POST valid prompt | 401 Unauthorized |
| AGENT-03 | No credits, not paid | Account A | POST | 402 "Out of credits…" |
| AGENT-04 | No API key saved | Account E (credits>0) | POST | 400 "No LLM API Key found…" |
| AGENT-05 | Credit deducted on run | Account B (credits=n>0) | POST valid prompt | `credits` becomes `n-1`; run completes |
| AGENT-06 | Paid user, 0 credits, no deduction | Account C | POST | Runs; `credits` NOT decremented (stays ≤0) |
| AGENT-07 | New chat auto-created | No `chatId` | POST | New `chats` row (`title` = first 30 chars of prompt); `chatId` returned |
| AGENT-08 | Existing chat reused | Valid `chatId` | POST | Messages appended to same chat |
| AGENT-09 | Direct final answer (no tools) | Prompt needing no tool | POST | `finalAnswer` returned; user + assistant messages persisted |
| AGENT-10 | web_search tool invoked | Prompt like "Report on CA fires" | POST | `web_search` tool-call + tool-result rows persisted; results fed back to model |
| AGENT-11 | create_report tool → PDF | Prompt requesting a report | POST | PDF generated, `pdfUrl` returned & surfaced in `RunCard` |
| AGENT-12 | Brave key present | `BRAVE_SEARCH_API_KEY` set | Trigger search | Real Brave results formatted; on non-200 → error string, loop continues |
| AGENT-13 | Brave key absent → mock | Key unset | Trigger search | Returns hard-coded mock fire results (no crash) |
| AGENT-14 | Brave returns 0 results | Query with no hits | Trigger search | "No web search results found…" string |
| AGENT-15 | PDF upload to storage | `reports` bucket + service key | Report tool | Public URL from `reports` bucket returned |
| AGENT-16 | PDF storage failure → base64 fallback | No bucket / bad key | Report tool | `data:application/pdf;base64,…` URL returned, run still succeeds |
| AGENT-17 | Max-iteration cap | Model keeps calling tools | POST | Loop stops at 6 iterations; no infinite loop; `finalAnswer` may be empty |
| AGENT-18 | Model selection passed through | `model:"gpt-4o"` in body | POST | That model used; unknown/absent → defaults to `gpt-4o-mini` |
| AGENT-19 | Token usage recorded | Any successful run | POST | `token_usage` row: input/output/cache tokens + `cost_usd` |
| AGENT-20 | Cost matches pricing table | Known token counts | POST | `cost_usd` equals `calculateCost()` for that model |
| AGENT-21 | Upstream LLM error | Invalid API key in `user_keys` | POST | 500 with error message; **credit already deducted (see RISK-1)** |
| AGENT-22 | Malformed tool arguments | Model emits bad JSON args | POST | `JSON.parse` on `arguments` — verify it doesn't 500 the whole run (**RISK-4**) |
| AGENT-23 | Multiple tool calls in one turn | Model returns 2 tool_calls | POST | Each executed, each result persisted with matching `tool_call_id` |

### M4 — Settings

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| SET-01 | Save key + base URL | Logged in | Submit form with key | Upsert into `user_keys` by `user_id`; success banner |
| SET-02 | Missing API key | — | Submit empty key | 400 "API key is required" (field also `required` client-side) |
| SET-03 | Default base URL applied | Blank base URL | Save | Stored as `https://api.openai.com/v1` |
| SET-04 | Update existing key | Account D | Save new key | Row updated (onConflict `user_id`), not duplicated |
| SET-05 | Unauthenticated save | Logged out | POST `/api/settings/save` | 401 Unauthorized |
| SET-06 | API key masked in UI | — | Type in key field | `type="password"`; not preloaded on reload |
| SET-07 | Custom proxy/Ollama URL | — | Save `http://localhost:11434/v1` | Accepted and used by agent run |
| SET-08 | Model dropdown lists all | — | Open select | 4 models (GPT-4o Mini/GPT-4o/Claude 3.5 Sonnet/Kimi) with pricing labels |

### M5 — Stripe checkout & webhook

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| PAY-01 | Create checkout session | Logged in | POST `/api/stripe/checkout` | Returns Stripe `url`; `client_reference_id`+`metadata.userId` = user id; $5 / 5 credits line item |
| PAY-02 | Missing secret key | Unset `STRIPE_SECRET_KEY` | POST | 500 "Stripe secret key is not configured" |
| PAY-03 | Unauthenticated checkout | Logged out | POST | 401 Unauthorized |
| PAY-04 | Success/cancel URLs | Complete/cancel checkout | — | Success → `/?checkout=success`; cancel → `/paywall?canceled=true` |
| PAY-05 | Webhook grants credits | Valid signed `checkout.session.completed` | Deliver webhook | `profiles.credits += 5`, `has_paid=true`; log line printed |
| PAY-06 | Signature verification | `STRIPE_WEBHOOK_SECRET` set | Send bad/absent signature | 400 "Webhook Error…"; no credit grant |
| PAY-07 | Dev mode without secret | Secret unset | Send raw JSON body | Parsed directly, warning logged, credits granted (**RISK-2: forgeable**) |
| PAY-08 | Missing userId in event | Event w/o `client_reference_id`/`metadata` | Deliver | No profile update; returns `{received:true}` |
| PAY-09 | Service-role vs anon fallback | With / without `SUPABASE_SERVICE_ROLE_KEY` | Deliver | With service key bypasses RLS; anon-only path may fail update (RLS) → 500 |
| PAY-10 | Idempotency / replay | Replay same event twice | Deliver 2× | Each replay adds +5 (no dedupe — document as **RISK-3**) |
| PAY-11 | Non-checkout event type | e.g. `payment_intent.*` | Deliver | Ignored, `{received:true}` |
| PAY-12 | End-to-end | Real test checkout | Pay → webhook → return | Credits reflect in middleware/agent; paywall no longer blocks |

### M6 — Promo-code redemption (`POST /api/redeem`)

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| PROMO-01 | Empty code | — | POST `code:""` | 400 "Coupon code is required" |
| PROMO-02 | Unauthenticated | Logged out | POST | 401 Unauthorized |
| PROMO-03 | Valid DB coupon | Coupon in `coupons` | POST code | Credits += `credits_value`; success message with usage count |
| PROMO-04 | Case-insensitive match | Coupon `SID_DRDROID` | POST `sid_drdroid` | Matched via `ilike` |
| PROMO-05 | Seed fallback coupon | `coupons` empty | POST `SID_DRDROID` | +5 credits via hard-coded fallback |
| PROMO-06 | Invalid code | Unknown code | POST | 400 "Invalid promo code" |
| PROMO-07 | Max total uses reached | Code used 5× already | POST (new user) | 400 "reached its maximum usage limit (5/5)" |
| PROMO-08 | Already redeemed by same user | User has a `redemptions` row | POST same code | 400 "already redeemed…" |
| PROMO-09 | Usage counter increments | Redeem sequentially | POST by different users | `usesCount` increments 1→…→5 across users |
| PROMO-10 | Credits added to existing profile | Profile exists | Redeem | `update` path used, `has_paid` preserved |
| PROMO-11 | Profile missing → upsert | No profile row | Redeem | `upsert` path creates profile with credits |
| PROMO-12 | Redirect after success | On `/paywall` | Redeem valid code | Success banner, then redirect to `/` after ~1.5s |
| PROMO-13 | Concurrent redemptions | 6 users redeem simultaneously | Fire in parallel | Verify cap holds; document race if >5 slip through (**RISK-3**) |

### M7 — Token usage & cost stats

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| STATS-01 | Empty state | No runs | Visit `/stats` | "No agent runs executed yet…" row |
| STATS-02 | Summary aggregates | Several runs | Visit `/stats` | Total cost / runs / input / output tokens summed correctly |
| STATS-03 | Per-run table | Runs exist | Visit `/stats` | Rows: run id, model, tokens, cache, cost (6dp), timestamp; newest first |
| STATS-04 | Only own data (RLS) | Two users w/ runs | User A visits `/stats` | Sees only A's `token_usage` rows |
| STATS-05 | Unauthenticated | Logged out | Visit `/stats` | Redirect `/login?next=/stats` |
| STATS-06 | Cost formula per model | Known usage per model | — | `calculateCost` matches rate table; unknown model defaults to GPT-4o Mini rates |
| STATS-07 | Cache-token pricing | Run with cached tokens | — | Cache cost added at `cachePerMillion` |

### M8 — Chat UI

| ID | Title | Preconditions | Steps | Expected |
|----|-------|---------------|-------|----------|
| UI-01 | Empty thread state | New chat | Open `/chat` | "What can I help you research today?" empty state |
| UI-02 | Submit disabled when blank | — | Empty input | Send button disabled |
| UI-03 | Optimistic pending run | — | Submit prompt | Temp RunCard "Agent is thinking…", input cleared, input disabled while loading |
| UI-04 | Successful response render | — | Await run | RunCard updated with steps + final answer; PDF link if present |
| UI-05 | Error surfaced in card | Force API error (e.g. 402/500) | Submit | RunCard shows "Error: …" message |
| UI-06 | Double-submit guard | — | Press Enter twice fast | Second ignored while `loading` |
| UI-07 | Sidebar chat list/navigation | Multiple chats | — | Chats listed; selecting loads that chat's runs |

---

## 4. Cross-cutting

- **Security:** SEC-01 IDOR — attempt to read/mutate another user's `profiles`/`user_keys`/`messages`/`token_usage` directly (verify RLS). SEC-02 `user_keys.api_key` never returned to client. SEC-03 verify webhook is the *only* path that sets `has_paid`/adds paid credits (checkout route must not). SEC-04 prompt content sanitized before PDF (no injection into rendered text). SEC-05 rate-limit `/api/agent/run`, `/api/redeem`.
- **Regression from git history:** promo 5-use cap (commit 3701… / 37010ac), RLS + credit-update logic (19bc445), verified webhook (bea8192) — re-run PROMO-07/09, PAY-05/06, GATE-05.
- **Non-functional:** agent-run latency with 6 iterations; large `create_report` content → PDF size/timeout; concurrent runs by same user.

## 5. Risks / defects — FIXED in this branch

All six are now fixed and covered by the automated suite (see §6). Retest the linked
manual cases before release.

- **RISK-1 — Credit charged on failure** ✅ Fixed. Credit deduction moved to *after* the
  agent loop succeeds (`api/agent/run` step 8); failed runs no longer charge. → AGENT-21;
  test: `tests/agent-run.test.ts`.
- **RISK-2 — Forgeable webhook without secret** ✅ Fixed. The webhook now returns 500 if
  `STRIPE_WEBHOOK_SECRET` is unset and never parses unsigned bodies. → PAY-07; test:
  `tests/stripe-webhook.test.ts`.
- **RISK-3 — No idempotency / redemption race** ✅ Fixed. Webhook records each event id in
  `stripe_events` and skips replays; redemption now claims a slot (insert) *before*
  counting and rolls back if over the cap. Requires migration
  `supabase/migrations/0001_bugfix_hardening.sql`. → PAY-10, PROMO-13; tests:
  `tests/stripe-webhook.test.ts`, `tests/redeem.test.ts`.
- **RISK-4 — Unguarded `JSON.parse(tool_call.arguments)`** ✅ Fixed. Parse is wrapped;
  malformed args feed an error back to the model instead of crashing the run. → AGENT-22;
  test: `tests/agent-run.test.ts`.
- **RISK-5 — `client_reference_id` / payment trust** ✅ Fixed. Webhook now grants credits
  only when `payment_status === "paid"`. → PAY-05; test: `tests/stripe-webhook.test.ts`.
- **RISK-6 — Model dropdown not persisted** ✅ Fixed. Settings persists the chosen model
  to `localStorage`; `ChatView` sends it as `model` on each run. → SET-08 / AGENT-18.

> **DB note:** RISK-3's full protection needs the migration applied. The
> `stripe_events` write and the `redemptions (user_id, lower(coupon_code))` unique index
> are what make replay/duplicate protection airtight; an optional advisory-lock RPC for a
> fully-atomic cap is sketched in the migration file.

## 6. Automation

**Implemented** (Vitest — run `npm test`). 29 tests, all passing:

| File | Covers |
|------|--------|
| `src/lib/agent/pricing.test.ts` | `calculateCost` — all 4 models, cache tokens, unknown-model fallback, rounding |
| `src/lib/agent/search.test.ts` | `performWebSearch` — no-key mock, real-result formatting, empty results, non-OK error |
| `tests/agent-run.test.ts` | Agent route — RISK-1 (no charge on failure / charge on success), RISK-4 (bad tool args), guards (empty prompt, 402, 401) |
| `tests/stripe-webhook.test.ts` | Webhook — RISK-2 (secret required, bad sig), RISK-3 (idempotent replay), RISK-5 (unpaid ignored), happy-path grant |
| `tests/redeem.test.ts` | Redeem — RISK-3 (claim-before-count ordering + over-cap rollback), guards (empty/invalid/already-redeemed/seed fallback) |

Route tests use a chainable Supabase client mock (`tests/helpers/supabase-mock.ts`) with
mocked Stripe/OpenAI/search/PDF modules — no live services needed.

**E2E (Playwright — `npm run test:e2e`, needs `npm run dev` on :3000).** 8 tests passing
against the live app; `tests/e2e/public-flows.spec.ts`, config `playwright.config.ts`:

- Landing, `/login` (GitHub button + error banner), `/paywall` (purchase + promo UI) render — with screenshots in `test-results/screenshots/`.
- GATE-02: `/chat`, `/settings`, `/stats` redirect to `/login` when logged out.
- Promo empty-field client-side validation.

Also verified live over HTTP against the running server:
- **RISK-2 fix:** `POST /api/stripe/webhook` with an empty `STRIPE_WEBHOOK_SECRET` returns
  `500 {"error":"Webhook secret is not configured"}` — a forged `paid` event grants no credits.
- `/api/redeem` returns 401 unauthenticated. `/api/agent/run` and `/api/stripe/checkout`
  are gated by middleware (307 → `/login`) before reaching their own 401 handlers.

**Not automatable in this environment:** the authenticated happy-path (OAuth login → save
API key → run agent → PDF → `/stats`) and the real Stripe checkout→webhook→credits loop.
GitHub OAuth needs real credentials/2FA, and there is no service-role key or seeded test
session. Run these manually or wire a Supabase test user + `storageState` in CI.
