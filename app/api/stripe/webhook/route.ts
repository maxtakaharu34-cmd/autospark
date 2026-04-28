import type Stripe from "stripe";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { stripe, planFromPriceId } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/monitoring/logError";
import { postToSlack } from "@/lib/notify/slack";

export const runtime = "nodejs";

const SUSPEND_GRACE_DAYS = 3;

async function handleCheckoutCompleted(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const clientId = session.metadata?.client_id;
  if (!clientId || !subscriptionId) return;

  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan = planFromPriceId(priceId);

  await supabaseAdmin().from("clients").update({
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    suspend_at: null,
  }).eq("id", clientId);
}

async function handlePaymentFailed(event: Stripe.InvoicePaymentFailedEvent) {
  const invoice = event.data.object;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  const suspendAt = new Date(Date.now() + SUSPEND_GRACE_DAYS * 86_400_000).toISOString();
  await supabaseAdmin().from("clients").update({ suspend_at: suspendAt }).eq("stripe_customer_id", customerId);
  await postToSlack({
    channel: "errors",
    text: `:credit_card: payment failed for customer \`${customerId}\` — suspending in ${SUSPEND_GRACE_DAYS} days.`,
  });
}

async function handleSubscriptionDeleted(event: Stripe.CustomerSubscriptionDeletedEvent) {
  const sub = event.data.object;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return;
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  await supabaseAdmin().from("clients").update({
    plan: "suspended",
    suspend_at: periodEnd,
  }).eq("stripe_customer_id", customerId);
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail(503, "Stripe webhook secret is not configured.");
  const sig = request.headers.get("stripe-signature");
  if (!sig) return fail(400, "Missing stripe-signature header.");

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "signature verification failed";
    await logError({ severity: "warning", kind: "stripe_signature_invalid", message });
    return fail(400, "Invalid signature.");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      default:
        // Ignore other events for now.
        break;
    }
    return ok({ received: true, type: event.type });
  } catch (e) {
    await logError({
      severity: "critical",
      kind: "stripe_handler_failure",
      message: e instanceof Error ? e.message : String(e),
      meta: { eventType: event.type, eventId: event.id },
    });
    return fail(500, "Webhook handler failed.");
  }
}
