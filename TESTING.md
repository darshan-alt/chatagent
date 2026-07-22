# Testing

Three layers. See `TEST_PLAN.md` for the full case matrix and the fixed-bug tracker.

## 1. Unit + integration (Vitest)

```bash
npm test          # run once
npm run test:watch
```

- `src/lib/agent/*.test.ts` — pure logic (pricing, web search).
- `tests/*.test.ts` — API route handlers against a chainable Supabase mock
  (`tests/helpers/supabase-mock.ts`) with Stripe/OpenAI/PDF/search mocked. No
  live services required. Covers the bug fixes RISK-1..RISK-5.

## 2. Public E2E (Playwright) — no auth required

```bash
npm run dev        # in one terminal (or let Playwright start it)
npm run test:e2e   # runs the `public` + `authed` projects
```

The `public` project covers landing/login/paywall rendering and the
middleware auth-gating redirects. It needs no secrets.

## 3. Authenticated E2E (Playwright) — seeded Supabase session

The app only supports GitHub OAuth, which can't be scripted. Instead,
`tests/e2e/global-setup.ts` mints a real session for a seeded test user using
the **service-role key**, writing it to `tests/e2e/.auth/state.json` (gitignored).
The `authed` project reuses that state. Specs self-skip when no session exists.

Set these (locally in `.env.local`, or as CI secrets):

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required |
| `SUPABASE_SERVICE_ROLE_KEY` | create the test user + seed credits/keys |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | optional; sensible defaults |
| `E2E_LLM_API_KEY`, `E2E_LLM_BASE_URL` | optional; enables the real agent-run spec |

Then:

```bash
npm run test:e2e
```

Covers: authed access to `/settings` `/stats` `/chat` (no redirect), model-choice
persistence (RISK-6), and — when `E2E_LLM_API_KEY` is set — a live agent run.

> Apply `supabase/migrations/0001_bugfix_hardening.sql` to the target project
> first; the webhook idempotency + redemption uniqueness depend on it.

## 4. Stripe checkout → webhook → credits (manual, Stripe CLI)

The webhook now requires a signing secret (RISK-2). Use the helper:

```bash
./scripts/stripe-e2e.sh listen                 # prints whsec_...  -> put in .env.local
# restart `npm run dev` so it picks up STRIPE_WEBHOOK_SECRET
./scripts/stripe-e2e.sh grant <SUPABASE_USER_ID>   # +5 credits, has_paid=true
./scripts/stripe-e2e.sh grant <SUPABASE_USER_ID>   # replay: must NOT add another 5 (idempotency)
```
