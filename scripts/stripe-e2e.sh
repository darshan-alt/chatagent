#!/usr/bin/env bash
#
# Local end-to-end test of the Stripe checkout -> webhook -> credits loop.
#
# The webhook now REQUIRES a signing secret (security fix RISK-2), so you must
# run `stripe listen` to obtain one and export it before starting the dev server.
#
# Usage:
#   1. Terminal A:  ./scripts/stripe-e2e.sh listen
#      -> prints:   "Ready! Your webhook signing secret is whsec_xxx"
#      Copy that secret into .env.local as STRIPE_WEBHOOK_SECRET, then start
#      the app:     npm run dev
#
#   2. Terminal B:  ./scripts/stripe-e2e.sh grant <SUPABASE_USER_ID>
#      -> fires a completed, paid checkout session for that user; the webhook
#         grants +5 credits and sets has_paid=true. Fire it twice to confirm
#         idempotency (RISK-3): the replay must NOT add another 5.
#
# Requires: Stripe CLI (https://stripe.com/docs/stripe-cli) logged in to your
# test-mode account (`stripe login`).

set -euo pipefail

CMD="${1:-help}"
FORWARD_URL="${WEBHOOK_URL:-http://localhost:3000/api/stripe/webhook}"

case "$CMD" in
  listen)
    echo "Forwarding Stripe events to $FORWARD_URL"
    echo "Copy the printed whsec_... into .env.local as STRIPE_WEBHOOK_SECRET."
    exec stripe listen --forward-to "$FORWARD_URL"
    ;;
  grant)
    USER_ID="${2:?Usage: stripe-e2e.sh grant <SUPABASE_USER_ID>}"
    echo "Triggering a paid checkout.session.completed for user $USER_ID ..."
    stripe trigger checkout.session.completed \
      --add "checkout_session:client_reference_id=$USER_ID" \
      --add "checkout_session:payment_status=paid" \
      --add "checkout_session:metadata[userId]=$USER_ID"
    echo "Done. Check the user's profile.credits in Supabase and the app /stats page."
    ;;
  *)
    sed -n '2,30p' "$0"
    ;;
esac
