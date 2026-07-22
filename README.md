This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

[![test](https://github.com/darshan-alt/chatagent/actions/workflows/test.yml/badge.svg?branch=openai)](https://github.com/darshan-alt/chatagent/actions/workflows/test.yml)

## Continuous Integration

The [`test`](.github/workflows/test.yml) workflow runs on every push and pull request, with two jobs:

- **`unit`** — `tsc --noEmit` type-check + Vitest unit/integration suite (`npm test`).
- **`e2e`** — Playwright: public flows always run; the authenticated happy-path
  specs **skip automatically until the E2E secrets are configured** (see
  [`TESTING.md`](TESTING.md)).

To make these gate merges, enable branch protection on `main`:
**Settings → Branches → Add rule → Require status checks to pass**, then select
**`unit`** and **`e2e`**. To exercise the authenticated E2E in CI, add these repo
secrets (**Settings → Secrets and variables → Actions**): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`,
`E2E_LLM_API_KEY`. Without them the `e2e` job still passes (public specs only).

See [`TESTING.md`](TESTING.md) for how to run each layer locally.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
