import crypto from 'crypto';
import express, { Router } from 'express';
import Stripe from 'stripe';
import { db, getAiSetting, logAudit, nowIso, uuid } from '../db.ts';
import { isGeminiConfigured } from '../ai.ts';
import {
  type AuthenticatedRequest,
  generateSecureToken,
  getHydratedUser,
  rateLimit,
  requireAuth,
} from '../security.ts';

export const billingRouter = Router();
export const webhookRouter = Router();

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_')) return null;
  return new Stripe(key);
}

export function getProviderStatuses() {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const paymeMerchant = process.env.PAYME_MERCHANT_ID || '';
  const paymeSecret = process.env.PAYME_SECRET_KEY || process.env.PAYME_TEST_SECRET_KEY || '';
  const clickMerchant = process.env.CLICK_MERCHANT_ID || '';
  const clickService = process.env.CLICK_SERVICE_ID || '';
  const clickSecret = process.env.CLICK_SECRET_KEY || '';

  return {
    stripe: {
      configured: stripeKey.startsWith('sk_'),
      mode: stripeKey.startsWith('sk_live_')
        ? 'live'
        : stripeKey.startsWith('sk_test_')
        ? 'sandbox'
        : 'unconfigured',
    },
    payme: {
      configured: Boolean(paymeMerchant && paymeSecret),
      mode:
        paymeMerchant && paymeSecret
          ? process.env.PAYME_SANDBOX_MODE === 'false'
            ? 'live'
            : 'sandbox'
          : 'unconfigured',
      checkoutUrl: process.env.PAYME_CHECKOUT_URL || 'https://test.paycom.uz',
    },
    click: {
      configured: Boolean(clickMerchant && clickService && clickSecret),
      mode:
        clickMerchant && clickService && clickSecret
          ? process.env.CLICK_SANDBOX_MODE === 'false'
            ? 'live'
            : 'sandbox'
          : 'unconfigured',
      checkoutUrl: process.env.CLICK_CHECKOUT_URL || 'https://my.click.uz/services/pay',
    },
    gemini: {
      configured: isGeminiConfigured(),
      defaultModel: getAiSetting('text_model', 'gemini-3.8-flash'),
      ttsModel: getAiSetting('tts_model', 'gemini-3.8-flash-lite-tts'),
    },
    usdToUzsRate: parseFloat(getAiSetting('usd_to_uzs_rate', '12850')) || 12850,
  };
}

// Helper to fulfill a verified payment idempotently on the server
function fulfillVerifiedPayment(paymentId: string, providerTxId: string, isSandbox: boolean): void {
  const tx = db.transaction(() => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
      | Record<string, any>
      | undefined;
    if (!payment || payment.status === 'succeeded') return;

    const now = nowIso();
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(payment.plan_id) as Record<string, any>;
    const durationDays = plan.billing_interval === 'year' ? 365 : 30;
    const periodEnd = new Date(Date.now() + durationDays * 86400 * 1000).toISOString();
    const feeUsd = isSandbox ? 0 : Number((payment.amount_usd * 0.029 + 0.3).toFixed(2));

    db.prepare(`
      UPDATE payments
      SET status = 'succeeded',
          provider_tx_id = ?,
          provider_fee_usd = ?,
          is_sandbox = ?,
          updated_at = ?
      WHERE id = ?
    `).run(providerTxId, feeUsd, isSandbox ? 1 : 0, now, paymentId);

    db.prepare(`
      UPDATE subscriptions
      SET plan_id = ?,
          status = 'active',
          provider = ?,
          current_period_start = ?,
          current_period_end = ?,
          trial_ends_at = NULL,
          cancel_at_period_end = 0,
          scheduled_downgrade_plan_id = NULL,
          updated_at = ?
      WHERE user_id = ?
    `).run(payment.plan_id, payment.provider, now, periodEnd, now, payment.user_id);

    db.prepare(`
      UPDATE credits
      SET monthly_allowance = ?,
          monthly_used = 0
      WHERE user_id = ?
    `).run(plan.monthly_ai_credits, payment.user_id);

    if (payment.promo_code_id) {
      db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(payment.promo_code_id);
    }

    const invoiceNum = `INV-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, user_id, payment_id, plan_id, subtotal_usd,
        discount_usd, total_usd, total_uzs, currency, status, is_sandbox, issued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)
    `).run(
      uuid(),
      invoiceNum,
      payment.user_id,
      paymentId,
      payment.plan_id,
      plan.price_usd,
      Math.max(0, Number((plan.price_usd - payment.amount_usd).toFixed(2))),
      payment.amount_usd,
      payment.amount_uzs,
      payment.currency,
      isSandbox ? 1 : 0,
      now
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
      VALUES (?, ?, 'billing', ?, ?, 0, ?)
    `).run(
      uuid(),
      payment.user_id,
      `${plan.name} Activated${isSandbox ? ' (Sandbox Test)' : ''}`,
      `Invoice ${invoiceNum} recorded. Your entitlements and ${plan.monthly_ai_credits} monthly AI credits are active.`,
      now
    );
  });

  tx();
}

// GET /api/billing/plans — Public plans & provider availability
billingRouter.get('/plans', (_req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC').all();
  res.json({
    plans,
    providers: getProviderStatuses(),
  });
});

// POST /api/billing/validate-promo
billingRouter.post('/validate-promo', requireAuth, (req: AuthenticatedRequest, res) => {
  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ error: 'Enter a promo code.' });
    return;
  }
  const promo = db
    .prepare('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1')
    .get(String(code).trim().toUpperCase()) as Record<string, any> | undefined;

  if (!promo) {
    res.status(404).json({ error: 'Promo code not found or inactive.' });
    return;
  }
  if (promo.used_count >= promo.max_uses) {
    res.status(400).json({ error: 'This promo code has reached its redemption limit.' });
    return;
  }
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    res.status(400).json({ error: 'This promo code has expired.' });
    return;
  }

  res.json({
    valid: true,
    code: promo.code,
    discount_percent: promo.discount_percent,
  });
});

// POST /api/billing/start-trial — Start configurable free trial (once per user)
billingRouter.post('/start-trial', requireAuth, rateLimit('billing_trial', 5, 60_000), (req: AuthenticatedRequest, res) => {
  const { planId } = req.body || {};
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').get(planId) as
    | Record<string, any>
    | undefined;

  if (!plan || plan.id === 'FREE' || plan.trial_days <= 0) {
    res.status(400).json({ error: 'Selected plan does not offer a trial period.' });
    return;
  }

  const alreadyTrialed = db
    .prepare("SELECT id FROM audit_logs WHERE actor_user_id = ? AND action = 'subscription.start_trial'")
    .get(req.userId!);
  if (alreadyTrialed) {
    res.status(400).json({ error: 'Your account has already used its one-time trial.' });
    return;
  }

  const now = nowIso();
  const trialEnds = new Date(Date.now() + plan.trial_days * 86400 * 1000).toISOString();

  db.prepare(`
    UPDATE subscriptions
    SET plan_id = ?,
        status = 'trialing',
        provider = 'internal_trial',
        current_period_start = ?,
        current_period_end = ?,
        trial_ends_at = ?,
        cancel_at_period_end = 0,
        updated_at = ?
    WHERE user_id = ?
  `).run(plan.id, now, trialEnds, trialEnds, now, req.userId!);

  db.prepare('UPDATE credits SET monthly_allowance = ? WHERE user_id = ?').run(
    plan.monthly_ai_credits,
    req.userId!
  );

  logAudit(req.userId!, 'subscription.start_trial', 'subscription', req.userId!, {
    planId: plan.id,
    trialDays: plan.trial_days,
  }, req.ip);

  res.json({ user: getHydratedUser(req.userId!) });
});

// POST /api/billing/checkout — Initiate modular server-side checkout (Stripe / Payme / Click)
billingRouter.post('/checkout', requireAuth, rateLimit('billing_checkout', 10, 60_000), async (req: AuthenticatedRequest, res) => {
  const { planId, provider, promoCode, idempotencyKey, runSandboxSimulation = false } = req.body || {};

  if (!['stripe', 'payme', 'click'].includes(provider)) {
    res.status(400).json({ error: 'Unsupported payment provider.' });
    return;
  }

  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').get(planId) as
    | Record<string, any>
    | undefined;
  if (!plan || plan.price_usd <= 0) {
    res.status(400).json({ error: 'Select a valid paid subscription plan.' });
    return;
  }

  const idemKey = String(idempotencyKey || `${req.userId}:${planId}:${provider}:${Date.now()}`);
  const existingTx = db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').get(idemKey) as
    | Record<string, any>
    | undefined;
  if (existingTx) {
    res.json({ payment: existingTx, idempotentReplay: true });
    return;
  }

  let discountPct = 0;
  let promoId: string | null = null;
  if (promoCode) {
    const promo = db
      .prepare('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1')
      .get(String(promoCode).trim().toUpperCase()) as Record<string, any> | undefined;
    if (promo && promo.used_count < promo.max_uses && (!promo.expires_at || new Date(promo.expires_at) > new Date())) {
      discountPct = promo.discount_percent;
      promoId = promo.id;
    }
  }

  const amountUsd = Number((plan.price_usd * (1 - discountPct / 100)).toFixed(2));
  const rate = parseFloat(getAiSetting('usd_to_uzs_rate', '12850')) || 12850;
  const baseUzs = plan.price_uzs > 0 ? plan.price_uzs : Math.round(plan.price_usd * rate);
  const amountUzs = Math.round(baseUzs * (1 - discountPct / 100));
  const currency = provider === 'stripe' ? 'USD' : 'UZS';

  const sub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(req.userId!) as { id: string };
  const paymentId = uuid();
  const now = nowIso();

  const statuses = getProviderStatuses();

  // Explicit Sandbox Simulation Mode (clearly flagged is_sandbox=1 so live MRR/Revenue is never faked)
  if (runSandboxSimulation && process.env.NODE_ENV !== 'production') {
    db.prepare(`
      INSERT INTO payments (
        id, user_id, subscription_id, plan_id, provider, idempotency_key,
        amount_usd, amount_uzs, currency, promo_code_id, status, is_sandbox, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)
    `).run(
      paymentId,
      req.userId!,
      sub.id,
      plan.id,
      provider,
      idemKey,
      amountUsd,
      amountUzs,
      currency,
      promoId,
      JSON.stringify({ mode: 'developer_sandbox_webhook_simulation' }),
      now,
      now
    );

    fulfillVerifiedPayment(paymentId, `sandbox_${provider}_${generateSecureToken(6)}`, true);
    logAudit(req.userId!, 'payment.sandbox_simulated', 'payment', paymentId, { provider, planId: plan.id }, req.ip);

    res.json({
      sandboxCompleted: true,
      paymentId,
      user: getHydratedUser(req.userId!),
    });
    return;
  }

  // Real Provider Flows
  if (provider === 'stripe') {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({
        error: 'Stripe is currently unconfigured (STRIPE_SECRET_KEY not set). Configure sandbox/live credentials in .env or use the labeled Sandbox Test Simulator.',
        providerStatus: statuses.stripe,
      });
      return;
    }

    db.prepare(`
      INSERT INTO payments (
        id, user_id, subscription_id, plan_id, provider, idempotency_key,
        amount_usd, amount_uzs, currency, promo_code_id, status, is_sandbox, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'stripe', ?, ?, ?, 'USD', ?, 'pending', ?, ?, ?)
    `).run(
      paymentId,
      req.userId!,
      sub.id,
      plan.id,
      idemKey,
      amountUsd,
      amountUzs,
      promoId,
      statuses.stripe.mode === 'sandbox' ? 1 : 0,
      now,
      now
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: paymentId,
      metadata: { paymentId, userId: req.userId!, planId: plan.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amountUsd * 100),
            product_data: {
              name: `MINDQUEST AI — ${plan.name}`,
              description: plan.tagline,
            },
          },
        },
      ],
      success_url: `${appUrl}/?checkout=stripe_success`,
      cancel_url: `${appUrl}/?checkout=canceled`,
    });

    res.json({ redirectUrl: session.url, paymentId });
    return;
  }

  if (provider === 'payme') {
    if (!statuses.payme.configured) {
      res.status(503).json({
        error: 'Payme Merchant credentials (PAYME_MERCHANT_ID / PAYME_SECRET_KEY) are not configured yet.',
        providerStatus: statuses.payme,
      });
      return;
    }

    db.prepare(`
      INSERT INTO payments (
        id, user_id, subscription_id, plan_id, provider, idempotency_key,
        amount_usd, amount_uzs, currency, promo_code_id, status, is_sandbox, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'payme', ?, ?, ?, 'UZS', ?, 'pending', ?, ?, ?)
    `).run(
      paymentId,
      req.userId!,
      sub.id,
      plan.id,
      idemKey,
      amountUsd,
      amountUzs,
      promoId,
      statuses.payme.mode === 'sandbox' ? 1 : 0,
      now,
      now
    );

    // Official Paycom Uzbekistan Base64 Checkout URL (amount in tiyin = UZS * 100)
    const tiyin = amountUzs * 100;
    const paramsStr = `m=${process.env.PAYME_MERCHANT_ID};ac.payment_id=${paymentId};a=${tiyin}`;
    const encoded = Buffer.from(paramsStr, 'utf8').toString('base64');
    const redirectUrl = `${statuses.payme.checkoutUrl}/${encoded}`;

    res.json({ redirectUrl, paymentId });
    return;
  }

  if (provider === 'click') {
    if (!statuses.click.configured) {
      res.status(503).json({
        error: 'Click Uzbekistan credentials (CLICK_MERCHANT_ID / CLICK_SERVICE_ID / CLICK_SECRET_KEY) are not configured yet.',
        providerStatus: statuses.click,
      });
      return;
    }

    db.prepare(`
      INSERT INTO payments (
        id, user_id, subscription_id, plan_id, provider, idempotency_key,
        amount_usd, amount_uzs, currency, promo_code_id, status, is_sandbox, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'click', ?, ?, ?, 'UZS', ?, 'pending', ?, ?, ?)
    `).run(
      paymentId,
      req.userId!,
      sub.id,
      plan.id,
      idemKey,
      amountUsd,
      amountUzs,
      promoId,
      statuses.click.mode === 'sandbox' ? 1 : 0,
      now,
      now
    );

    const url = new URL(statuses.click.checkoutUrl);
    url.searchParams.set('service_id', process.env.CLICK_SERVICE_ID!);
    url.searchParams.set('merchant_id', process.env.CLICK_MERCHANT_ID!);
    url.searchParams.set('amount', String(amountUzs));
    url.searchParams.set('transaction_param', paymentId);

    res.json({ redirectUrl: url.toString(), paymentId });
  }
});

// POST /api/billing/downgrade-or-cancel
billingRouter.post('/downgrade-or-cancel', requireAuth, (req: AuthenticatedRequest, res) => {
  const { action, targetPlanId } = req.body || {};
  const now = nowIso();

  if (action === 'cancel') {
    db.prepare(`
      UPDATE subscriptions SET cancel_at_period_end = 1, status = 'canceled', updated_at = ?
      WHERE user_id = ?
    `).run(now, req.userId!);
    logAudit(req.userId!, 'subscription.cancel_scheduled', 'subscription', req.userId!, {}, req.ip);
  } else if (action === 'resume') {
    db.prepare(`
      UPDATE subscriptions SET cancel_at_period_end = 0, scheduled_downgrade_plan_id = NULL, status = 'active', updated_at = ?
      WHERE user_id = ?
    `).run(now, req.userId!);
    logAudit(req.userId!, 'subscription.resumed', 'subscription', req.userId!, {}, req.ip);
  } else if (action === 'downgrade' && targetPlanId) {
    db.prepare(`
      UPDATE subscriptions SET scheduled_downgrade_plan_id = ?, updated_at = ?
      WHERE user_id = ?
    `).run(targetPlanId, now, req.userId!);
    logAudit(req.userId!, 'subscription.downgrade_scheduled', 'subscription', req.userId!, { targetPlanId }, req.ip);
  }

  res.json({ user: getHydratedUser(req.userId!) });
});

// GET /api/billing/history — User invoices, payments, referrals, gifts, team, affiliate
billingRouter.get('/history', requireAuth, (req: AuthenticatedRequest, res) => {
  const invoices = db
    .prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY issued_at DESC LIMIT 25')
    .all(req.userId!);
  const payments = db
    .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 25')
    .all(req.userId!);
  const referrals = db
    .prepare(
      `SELECT r.*, u.full_name as referred_name
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(req.userId!);
  const rewards = db
    .prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.userId!);
  const gifts = db
    .prepare('SELECT * FROM gift_subscriptions WHERE purchaser_user_id = ? ORDER BY created_at DESC')
    .all(req.userId!);
  const teams = db
    .prepare('SELECT * FROM team_licenses WHERE owner_user_id = ? ORDER BY created_at DESC')
    .all(req.userId!);
  const affiliate = db.prepare('SELECT * FROM affiliates WHERE user_id = ?').get(req.userId!);

  res.json({
    invoices,
    payments,
    referrals,
    rewards,
    gifts,
    teams,
    affiliate: affiliate || null,
    providers: getProviderStatuses(),
  });
});

// POST /api/billing/redeem-gift
billingRouter.post('/redeem-gift', requireAuth, (req: AuthenticatedRequest, res) => {
  const { code } = req.body || {};
  const gift = db
    .prepare("SELECT * FROM gift_subscriptions WHERE code = ? AND status = 'available'")
    .get(String(code || '').trim().toUpperCase()) as Record<string, any> | undefined;

  if (!gift) {
    res.status(404).json({ error: 'Gift code not found or already redeemed.' });
    return;
  }

  const now = nowIso();
  const periodEnd = new Date(Date.now() + gift.duration_days * 86400 * 1000).toISOString();
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(gift.plan_id) as Record<string, any>;

  db.prepare(`
    UPDATE gift_subscriptions SET status = 'redeemed', redeemed_by_user_id = ?, redeemed_at = ?
    WHERE id = ?
  `).run(req.userId!, now, gift.id);

  db.prepare(`
    UPDATE subscriptions
    SET plan_id = ?, status = 'active', provider = 'gift', current_period_start = ?, current_period_end = ?, updated_at = ?
    WHERE user_id = ?
  `).run(gift.plan_id, now, periodEnd, now, req.userId!);

  db.prepare('UPDATE credits SET monthly_allowance = ? WHERE user_id = ?').run(
    plan.monthly_ai_credits,
    req.userId!
  );

  res.json({ user: getHydratedUser(req.userId!) });
});

// POST /api/billing/join-team
billingRouter.post('/join-team', requireAuth, (req: AuthenticatedRequest, res) => {
  const { inviteCode } = req.body || {};
  const team = db
    .prepare("SELECT * FROM team_licenses WHERE invite_code = ? AND status = 'active'")
    .get(String(inviteCode || '').trim().toUpperCase()) as Record<string, any> | undefined;

  if (!team) {
    res.status(404).json({ error: 'School/Team invite code not found.' });
    return;
  }
  if (team.seats_used >= team.seat_limit) {
    res.status(400).json({ error: 'All seats on this organization license are currently occupied.' });
    return;
  }

  const now = nowIso();
  const periodEnd = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(team.plan_id) as Record<string, any>;

  db.prepare('UPDATE team_licenses SET seats_used = seats_used + 1 WHERE id = ?').run(team.id);
  db.prepare(`
    UPDATE subscriptions
    SET plan_id = ?, status = 'active', provider = 'team', current_period_start = ?, current_period_end = ?, updated_at = ?
    WHERE user_id = ?
  `).run(team.plan_id, now, periodEnd, now, req.userId!);
  db.prepare('UPDATE credits SET monthly_allowance = ? WHERE user_id = ?').run(
    plan.monthly_ai_credits,
    req.userId!
  );

  res.json({ user: getHydratedUser(req.userId!), organization: team.organization_name });
});

// POST /api/billing/create-team-request — Create a School/Team workspace (admin-activated or sandbox)
billingRouter.post('/create-team', requireAuth, (req: AuthenticatedRequest, res) => {
  const { organizationName, seatLimit = 10 } = req.body || {};
  if (!organizationName || String(organizationName).trim().length < 2) {
    res.status(400).json({ error: 'Organization or school name is required.' });
    return;
  }
  const code = `TEAM-${generateSecureToken(3).toUpperCase()}`;
  db.prepare(`
    INSERT INTO team_licenses (id, organization_name, owner_user_id, plan_id, seat_limit, seats_used, invite_code, status, created_at)
    VALUES (?, ?, ?, 'PREMIUM', ?, 1, ?, 'active', ?)
  `).run(uuid(), String(organizationName).trim(), req.userId!, Math.max(2, Math.min(500, Number(seatLimit))), code, nowIso());

  res.status(201).json({ inviteCode: code });
});

// POST /api/billing/affiliate-apply
billingRouter.post('/affiliate-apply', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT * FROM affiliates WHERE user_id = ?').get(req.userId!);
  if (existing) {
    res.json({ affiliate: existing });
    return;
  }
  const code = `PARTNER-${generateSecureToken(3).toUpperCase()}`;
  const id = uuid();
  db.prepare(`
    INSERT INTO affiliates (id, user_id, affiliate_code, commission_rate_pct, status, created_at)
    VALUES (?, ?, ?, 20, 'pending', ?)
  `).run(id, req.userId!, code, nowIso());

  const affiliate = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(id);
  res.status(201).json({ affiliate });
});

// ============================================================================
// SIGNED VERIFIED PAYMENT WEBHOOKS (STRIPE, PAYME JSON-RPC, CLICK SHOP-API)
// ============================================================================

// 1. Stripe Signed Webhook (raw body required)
webhookRouter.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];

  if (!stripe || !webhookSecret || typeof sig !== 'string') {
    res.status(400).json({ error: 'Stripe webhook not configured or missing signature.' });
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId || session.client_reference_id;
      if (paymentId) {
        const isTest = !event.livemode;
        fulfillVerifiedPayment(paymentId, session.id, isTest);
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }
});

// 2. Payme (Paycom Uzbekistan) JSON-RPC 2.0 Merchant API
webhookRouter.post('/payme', express.json(), (req, res) => {
  const secret = process.env.PAYME_SECRET_KEY || process.env.PAYME_TEST_SECRET_KEY;
  const authHeader = req.headers.authorization || '';
  const expectedAuth = secret ? `Basic ${Buffer.from(`Paycom:${secret}`).toString('base64')}` : '';

  const { id: rpcId, method, params } = req.body || {};

  if (!secret || authHeader !== expectedAuth) {
    res.status(200).json({
      jsonrpc: '2.0',
      id: rpcId || null,
      error: { code: -32504, message: 'Insufficient privilege to perform this method.' },
    });
    return;
  }

  const paymentId = params?.account?.payment_id;
  const payment = paymentId
    ? (db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as Record<string, any> | undefined)
    : undefined;

  if (method === 'CheckPerformTransaction') {
    if (!payment) {
      res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -31050, message: 'Order not found' } });
      return;
    }
    if (Number(params.amount) !== payment.amount_uzs * 100) {
      res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -31001, message: 'Incorrect amount in tiyin' } });
      return;
    }
    res.json({ jsonrpc: '2.0', id: rpcId, result: { allow: true } });
    return;
  }

  if (method === 'CreateTransaction') {
    if (!payment) {
      res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -31050, message: 'Order not found' } });
      return;
    }
    db.prepare('UPDATE payments SET provider_tx_id = ?, updated_at = ? WHERE id = ?').run(
      String(params.id),
      nowIso(),
      payment.id
    );
    res.json({
      jsonrpc: '2.0',
      id: rpcId,
      result: { create_time: Date.now(), transaction: payment.id, state: 1 },
    });
    return;
  }

  if (method === 'PerformTransaction') {
    const txRow = db.prepare('SELECT * FROM payments WHERE provider_tx_id = ?').get(String(params?.id)) as
      | Record<string, any>
      | undefined;
    if (!txRow) {
      res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -31003, message: 'Transaction not found' } });
      return;
    }
    fulfillVerifiedPayment(txRow.id, String(params.id), process.env.PAYME_SANDBOX_MODE !== 'false');
    res.json({
      jsonrpc: '2.0',
      id: rpcId,
      result: { transaction: txRow.id, perform_time: Date.now(), state: 2 },
    });
    return;
  }

  res.json({ jsonrpc: '2.0', id: rpcId, error: { code: -32601, message: 'Method not found' } });
});

// 3. Click Uzbekistan Signed Prepare & Complete Webhooks
webhookRouter.post('/click/:stage', express.urlencoded({ extended: true }), express.json(), (req, res) => {
  const secretKey = process.env.CLICK_SECRET_KEY;
  if (!secretKey) {
    res.json({ error: -1, error_note: 'CLICK_SECRET_KEY not configured' });
    return;
  }

  const {
    click_trans_id = '',
    service_id = '',
    merchant_trans_id = '',
    merchant_prepare_id = '',
    amount = '',
    action = '',
    sign_time = '',
    sign_string = '',
  } = req.body || {};

  // Official Click MD5 signature formula
  const rawSign =
    String(action) === '1'
      ? `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`
      : `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;

  const computedMd5 = crypto.createHash('md5').update(rawSign).digest('hex');
  if (computedMd5 !== String(sign_string).toLowerCase()) {
    res.json({ error: -1, error_note: 'SIGN CHECK FAILED!' });
    return;
  }

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(String(merchant_trans_id)) as
    | Record<string, any>
    | undefined;
  if (!payment) {
    res.json({ error: -5, error_note: 'User/Order does not exist' });
    return;
  }
  if (Math.round(Number(amount)) !== payment.amount_uzs) {
    res.json({ error: -2, error_note: 'Incorrect parameter amount' });
    return;
  }
  if (payment.status === 'succeeded') {
    res.json({ error: -4, error_note: 'Already paid' });
    return;
  }

  if (req.params.stage === 'prepare' || String(action) === '0') {
    res.json({
      click_trans_id,
      merchant_trans_id: payment.id,
      merchant_prepare_id: payment.id,
      error: 0,
      error_note: 'Success',
    });
    return;
  }

  fulfillVerifiedPayment(payment.id, String(click_trans_id), process.env.CLICK_SANDBOX_MODE !== 'false');
  res.json({
    click_trans_id,
    merchant_trans_id: payment.id,
    merchant_confirm_id: payment.id,
    error: 0,
    error_note: 'Success',
  });
});
