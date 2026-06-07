import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const db = getFirestore();

export const handleStripeWebhook = onDocumentCreated(
  'stripe_events/{eventId}',
  async (event) => {
    if (!event.data) return;

    const stripe = new Stripe(await stripeSecretKey.value(), {
      apiVersion: '2026-04-22.dahlia' as any,
    });

    const data = event.data.data();
    if (!data) {
      console.log('[Stripe Webhook] No data in event');
      return;
    }

    const sig = data.signature || '';
    const payload = data.body || '';

    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        payload,
        sig,
        await stripeWebhookSecret.value()
      );
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err);
      await event.data.ref.update({ verified: false, error: String(err) });
      return;
    }

    await event.data.ref.update({ verified: true, type: stripeEvent.type });

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const deletedSubscription = stripeEvent.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(deletedSubscription);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${stripeEvent.type}`);
    }
  }
);

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  const seatCount = parseInt(session.metadata?.seatCount || '1', 10);
  const userId = session.metadata?.userId;

  if (!organizationId) {
    console.error('[Stripe Webhook] No organizationId in session metadata');
    return;
  }

  console.log(`[Stripe Webhook] Checkout completed for org ${organizationId}, seats: ${seatCount}`);

  await db.collection('organizations').doc(organizationId).update({
    status: 'active',
    seatCount: seatCount,
    stripeCustomerId: session.customer,
    stripeSessionId: session.id,
    paymentVerifiedAt: new Date().toISOString(),
  });

  if (userId) {
    await db.collection('users').doc(userId).update({
      credits: (session.amount_total ? Math.floor(session.amount_total / 100) : 50) * 10,
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const orgSnapshot = await db.collection('organizations')
    .where('stripeCustomerId', '==', subscription.customer)
    .limit(1)
    .get();

  if (orgSnapshot.empty) {
    console.log('[Stripe Webhook] No organization found for customer', subscription.customer);
    return;
  }

  const orgDoc = orgSnapshot.docs[0];
  const items = subscription.items.data;
  const totalSeats = items.reduce((sum, item) => {
    return sum + (item.quantity || 1);
  }, 0);

  await orgDoc.ref.update({
    seatCount: totalSeats,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
  });

  console.log(`[Stripe Webhook] Subscription updated for org ${orgDoc.id}: ${totalSeats} seats, status: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgSnapshot = await db.collection('organizations')
    .where('stripeCustomerId', '==', subscription.customer)
    .limit(1)
    .get();

  if (orgSnapshot.empty) {
    console.log('[Stripe Webhook] No organization found for deleted subscription');
    return;
  }

  const orgDoc = orgSnapshot.docs[0];
  await orgDoc.ref.update({
    status: 'suspended',
    seatCount: 0,
    subscriptionStatus: 'canceled',
  });

  await db.collection('users')
    .where('organizationId', '==', orgDoc.id)
    .get()
    .then((snapshot) => {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { role: 'recruiter', credits: 0 });
      });
      return batch.commit();
    });

  console.log(`[Stripe Webhook] Subscription deleted for org ${orgDoc.id}. Organization suspended.`);
}

export const createStripeCheckoutSession = onDocumentCreated(
  'stripe_checkout_requests/{requestId}',
  async (event) => {
    if (!event.data) return;

    const stripe = new Stripe(await stripeSecretKey.value(), {
      apiVersion: '2026-04-22.dahlia' as any,
    });

    const data = event.data.data();
    if (!data) return;

    const { organizationId, userId, seatCount, priceId, successUrl, cancelUrl } = data;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId || 'price_default',
            quantity: seatCount || 1,
          },
        ],
        metadata: {
          organizationId,
          userId,
          seatCount: String(seatCount || 1),
        },
        success_url: successUrl || `${process.env.APP_URL || 'http://localhost:5173'}/org-admin?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:5173'}/org-admin`,
      });

      await event.data.ref.update({
        sessionId: session.id,
        url: session.url,
        status: 'created',
        createdAt: new Date().toISOString(),
      });

      console.log(`[Stripe] Checkout session created: ${session.id}`);
    } catch (error) {
      console.error('[Stripe] Failed to create checkout session:', error);
      await event.data.ref.update({
        status: 'failed',
        error: String(error),
      });
    }
  }
);
