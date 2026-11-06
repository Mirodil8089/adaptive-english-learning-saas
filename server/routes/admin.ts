import { Router } from 'express';
import Stripe from 'stripe';
import { db, logAudit, nowIso, uuid } from '../db.ts';
import { type AuthenticatedRequest, requireAuth, requireRole } from '../security.ts';
import { getProviderStatuses } from './billing.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth);

// GET /api/admin/overview — Real database KPIs separating live revenue, sandbox tests, refunds, fees, and AI expenses
adminRouter.get('/overview', requireRole(['super_admin', 'moderator', 'support']), (_req, res) => {
  const totalUsers = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE status != 'deleted'").get() as { c: number }
  ).c;
  const activeUsers = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get() as { c: number }
  ).c;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const newRegistrations7d = (
    db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ?').get(sevenDaysAgo) as { c: number }
  ).c;

  const freeSubscribers = (
    db
      .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan_id = 'FREE' OR status NOT IN ('active', 'trialing')")
      .get() as { c: number }
  ).c;
  const paidSubscribers = (
    db
      .prepare("SELECT COUNT(*) as c FROM subscriptions WHERE plan_id != 'FREE' AND status = 'active'")
      .get() as { c: number }
  ).c;
  const trialingSubscribers = (
    db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'trialing'").get() as { c: number }
  ).c;
  const canceledSubscriptions = (
    db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'canceled' OR cancel_at_period_end = 1").get() as {
      c: number;
    }
  ).c;

  // MRR & ARR computed strictly from active non-sandbox paid subscriptions
  const activeSubRows = db
    .prepare(
      `SELECT p.price_usd, p.billing_interval, s.provider
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active' AND s.plan_id != 'FREE'`
    )
    .all() as Array<{ price_usd: number; billing_interval: string; provider: string }>;

  let estimatedMrrUsd = 0;
  for (const row of activeSubRows) {
    if (row.provider === 'internal_trial') continue;
    estimatedMrrUsd += row.billing_interval === 'year' ? row.price_usd / 12 : row.price_usd;
  }
  estimatedMrrUsd = Number(estimatedMrrUsd.toFixed(2));
  const estimatedArrUsd = Number((estimatedMrrUsd * 12).toFixed(2));

  // Strictly separate Real Live Payments (is_sandbox = 0) from Sandbox Test Payments (is_sandbox = 1)
  const livePayments = db
    .prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) as collected, COALESCE(SUM(provider_fee_usd), 0) as fees
       FROM payments WHERE status = 'succeeded' AND is_sandbox = 0`
    )
    .get() as { collected: number; fees: number };

  const sandboxPayments = db
    .prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) as collected, COUNT(*) as count
       FROM payments WHERE status = 'succeeded' AND is_sandbox = 1`
    )
    .get() as { collected: number; count: number };

  const failedPaymentsCount = (
    db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'failed'").get() as { c: number }
  ).c;

  const totalRefundsUsd = (
    db.prepare("SELECT COALESCE(SUM(amount_usd), 0) as r FROM refunds WHERE status = 'succeeded'").get() as {
      r: number;
    }
  ).r;

  const aiTotals = db
    .prepare(
      `SELECT COUNT(*) as requests,
              COALESCE(SUM(total_tokens), 0) as tokens,
              COALESCE(SUM(audio_seconds), 0) as voiceSeconds,
              COALESCE(SUM(estimated_cost_usd), 0) as costUsd,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
       FROM usage_logs`
    )
    .get() as {
    requests: number;
    tokens: number;
    voiceSeconds: number;
    costUsd: number;
    errors: number;
  };

  const netLiveRevenueUsd = Number(
    (livePayments.collected - totalRefundsUsd - livePayments.fees).toFixed(2)
  );
  const estimatedGrossProfitUsd = Number((netLiveRevenueUsd - (aiTotals.costUsd || 0)).toFixed(4));
  const conversionRatePct =
    totalUsers > 0 ? Number(((paidSubscribers / totalUsers) * 100).toFixed(1)) : 0;

  // Popular modes engagement breakdown
  const modePopularity = db
    .prepare(
      `SELECT feature_mode as mode,
              COUNT(*) as requests,
              COALESCE(SUM(total_tokens), 0) as tokens,
              ROUND(COALESCE(SUM(estimated_cost_usd), 0), 5) as costUsd
       FROM usage_logs
       GROUP BY feature_mode
       ORDER BY requests DESC`
    )
    .all();

  // Daily registration & AI usage series (last 14 days)
  const dailyRegistrations = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day, COUNT(*) as users
       FROM users
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC LIMIT 14`
    )
    .all();

  const dailyAiSpend = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day,
              COUNT(*) as requests,
              ROUND(COALESCE(SUM(estimated_cost_usd), 0), 5) as costUsd
       FROM usage_logs
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC LIMIT 14`
    )
    .all();

  res.json({
    kpis: {
      totalUsers,
      activeUsers,
      newRegistrations7d,
      freeSubscribers,
      paidSubscribers,
      trialingSubscribers,
      canceledSubscriptions,
      conversionRatePct,
      estimatedMrrUsd,
      estimatedArrUsd,
      liveCollectedRevenueUsd: Number(livePayments.collected.toFixed(2)),
      liveProviderFeesUsd: Number(livePayments.fees.toFixed(2)),
      totalRefundsUsd: Number(totalRefundsUsd.toFixed(2)),
      netLiveRevenueUsd,
      sandboxSimulatedVolumeUsd: Number(sandboxPayments.collected.toFixed(2)),
      sandboxTransactionsCount: sandboxPayments.count,
      failedPaymentsCount,
      aiExpensesUsd: Number((aiTotals.costUsd || 0).toFixed(5)),
      aiRequestsCount: aiTotals.requests || 0,
      aiTotalTokens: aiTotals.tokens || 0,
      aiVoiceMinutes: Number(((aiTotals.voiceSeconds || 0) / 60).toFixed(1)),
      aiErrorsCount: aiTotals.errors || 0,
      estimatedGrossProfitUsd,
    },
    charts: {
      modePopularity,
      dailyRegistrations,
      dailyAiSpend,
    },
    providers: getProviderStatuses(),
  });
});

// GET /api/admin/users — Paginated search & filter
adminRouter.get('/users', requireRole(['super_admin', 'support']), (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all');
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  let where = "WHERE u.status != 'deleted'";
  const params: any[] = [];
  if (q) {
    where += ' AND (LOWER(u.email) LIKE ? OR LOWER(u.full_name) LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (statusFilter !== 'all') {
    where += ' AND u.status = ?';
    params.push(statusFilter);
  }

  const users = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.email_verified, u.created_at,
              p.cefr_level, p.xp, p.streak_days,
              s.plan_id, s.status as sub_status,
              c.monthly_used, c.monthly_allowance, c.bonus_credits
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN credits c ON c.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM users u ${where}`).get(...params) as { c: number }
  ).c;

  res.json({ users, total, page, limit });
});

// PATCH /api/admin/users/:id — Suspend / Restore / Role / Bonus Credits / Plan Override
adminRouter.patch('/users/:id', requireRole(['super_admin']), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const { status, role, grantBonusCredits, overridePlanId } = req.body || {};
  const now = nowIso();

  if (status && ['active', 'suspended'].includes(status)) {
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, targetId);
    if (status === 'suspended') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    }
  }
  if (role && ['learner', 'support', 'moderator', 'super_admin'].includes(role)) {
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, targetId);
  }
  if (typeof grantBonusCredits === 'number' && grantBonusCredits !== 0) {
    db.prepare('UPDATE credits SET bonus_credits = MAX(0, bonus_credits + ?) WHERE user_id = ?').run(
      grantBonusCredits,
      targetId
    );
    db.prepare(`
      INSERT INTO rewards (id, user_id, source_type, credits_granted, description, created_at)
      VALUES (?, ?, 'admin_grant', ?, 'Admin credit adjustment', ?)
    `).run(uuid(), targetId, grantBonusCredits, now);
  }
  if (overridePlanId) {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(overridePlanId) as Record<string, any> | undefined;
    if (plan) {
      db.prepare(`
        UPDATE subscriptions
        SET plan_id = ?, status = 'active', current_period_end = ?, updated_at = ?
        WHERE user_id = ?
      `).run(plan.id, new Date(Date.now() + 30 * 86400 * 1000).toISOString(), now, targetId);
      db.prepare('UPDATE credits SET monthly_allowance = ? WHERE user_id = ?').run(plan.monthly_ai_credits, targetId);
    }
  }

  logAudit(req.userId!, 'admin.update_user', 'user', targetId, req.body || {}, req.ip);
  res.json({ ok: true });
});

// PUT /api/admin/plans/:id — Edit Plan Prices, Trial Days, Quotas & Entitlements
adminRouter.put('/plans/:id', requireRole(['super_admin']), (req: AuthenticatedRequest, res) => {
  const planId = req.params.id;
  const b = req.body || {};
  db.prepare(`
    UPDATE plans
    SET price_usd = ?,
        price_uzs = ?,
        trial_days = ?,
        daily_vocab_limit = ?,
        daily_story_limit = ?,
        daily_simulator_turns = ?,
        daily_detective_cases = ?,
        daily_ai_teacher_msgs = ?,
        monthly_voice_minutes = ?,
        monthly_ai_credits = ?,
        has_ai_teacher = ?,
        has_voice_mode = ?,
        has_advanced_analytics = ?,
        has_personalized_plan = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    Number(b.price_usd ?? 0),
    Math.round(Number(b.price_uzs ?? 0)),
    Math.max(0, Math.round(Number(b.trial_days ?? 0))),
    Math.max(1, Math.round(Number(b.daily_vocab_limit ?? 5))),
    Math.max(1, Math.round(Number(b.daily_story_limit ?? 1))),
    Math.max(1, Math.round(Number(b.daily_simulator_turns ?? 5))),
    Math.max(1, Math.round(Number(b.daily_detective_cases ?? 1))),
    Math.max(0, Math.round(Number(b.daily_ai_teacher_msgs ?? 0))),
    Math.max(0, Math.round(Number(b.monthly_voice_minutes ?? 0))),
    Math.max(10, Math.round(Number(b.monthly_ai_credits ?? 50))),
    b.has_ai_teacher ? 1 : 0,
    b.has_voice_mode ? 1 : 0,
    b.has_advanced_analytics ? 1 : 0,
    b.has_personalized_plan ? 1 : 0,
    nowIso(),
    planId
  );

  logAudit(req.userId!, 'admin.update_plan', 'plan', planId, b, req.ip);
  const plans = db.prepare('SELECT * FROM plans ORDER BY sort_order ASC').all();
  res.json({ plans });
});

// GET & POST /api/admin/billing — Transactions, Promo Codes, Affiliates, Refunds
adminRouter.get('/billing', requireRole(['super_admin', 'support']), (_req, res) => {
  const payments = db
    .prepare(
      `SELECT p.*, u.email as user_email
       FROM payments p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    )
    .all();
  const refunds = db.prepare('SELECT * FROM refunds ORDER BY created_at DESC LIMIT 30').all();
  const promoCodes = db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
  const affiliates = db
    .prepare(
      `SELECT a.*, u.email as user_email, u.full_name
       FROM affiliates a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC`
    )
    .all();
  const supportMessages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 30').all();

  res.json({ payments, refunds, promoCodes, affiliates, supportMessages });
});

adminRouter.post('/promo-codes', requireRole(['super_admin']), (req: AuthenticatedRequest, res) => {
  const { code, discountPercent, maxUses = 100, expiresAt } = req.body || {};
  if (!code || !discountPercent) {
    res.status(400).json({ error: 'Code and discountPercent required.' });
    return;
  }
  const cleanCode = String(code).trim().toUpperCase();
  db.prepare(`
    INSERT INTO promo_codes (id, code, discount_percent, max_uses, used_count, expires_at, is_active, created_at)
    VALUES (?, ?, ?, ?, 0, ?, 1, ?)
  `).run(uuid(), cleanCode, Math.min(100, Math.max(1, Number(discountPercent))), Number(maxUses), expiresAt || null, nowIso());

  logAudit(req.userId!, 'admin.create_promo', 'promo_code', cleanCode, { discountPercent }, req.ip);
  res.status(201).json({ promoCodes: db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all() });
});

adminRouter.post('/refund/:paymentId', requireRole(['super_admin']), async (req: AuthenticatedRequest, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId) as
    | Record<string, any>
    | undefined;
  if (!payment || payment.status !== 'succeeded') {
    res.status(400).json({ error: 'Only succeeded payments can be refunded.' });
    return;
  }

  const { reason = 'Customer requested refund' } = req.body || {};
  let providerRefundId = `internal_ref_${uuid().slice(0, 8)}`;

  if (payment.provider === 'stripe' && !payment.is_sandbox && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    if (payment.provider_tx_id) {
      const session = await stripe.checkout.sessions.retrieve(payment.provider_tx_id);
      if (typeof session.payment_intent === 'string') {
        const ref = await stripe.refunds.create({ payment_intent: session.payment_intent });
        providerRefundId = ref.id;
      }
    }
  }

  const now = nowIso();
  db.prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?").run(now, payment.id);
  db.prepare("UPDATE invoices SET status = 'refunded' WHERE payment_id = ?").run(payment.id);
  db.prepare("UPDATE subscriptions SET plan_id = 'FREE', status = 'canceled', updated_at = ? WHERE user_id = ?").run(
    now,
    payment.user_id
  );
  db.prepare(`
    INSERT INTO refunds (id, payment_id, user_id, amount_usd, reason, provider_refund_id, status, processed_by_admin_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?)
  `).run(uuid(), payment.id, payment.user_id, payment.amount_usd, String(reason), providerRefundId, req.userId!, now);

  logAudit(req.userId!, 'admin.refund_payment', 'payment', payment.id, { amountUsd: payment.amount_usd }, req.ip);
  res.json({ ok: true });
});

adminRouter.patch('/affiliates/:id', requireRole(['super_admin']), (req: AuthenticatedRequest, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    res.status(400).json({ error: 'Invalid affiliate status.' });
    return;
  }
  db.prepare('UPDATE affiliates SET status = ? WHERE id = ?').run(status, req.params.id);
  logAudit(req.userId!, 'admin.affiliate_status', 'affiliate', req.params.id, { status }, req.ip);
  res.json({ ok: true });
});

// GET & PUT /api/admin/ai-config — Models, Cost Guardrails, System Prompts & Error Logs
adminRouter.get('/ai-config', requireRole(['super_admin']), (_req, res) => {
  const settingsRows = db.prepare('SELECT key, value_text FROM ai_settings').all() as Array<{
    key: string;
    value_text: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value_text;

  const recentLogs = db
    .prepare(
      `SELECT l.*, u.email as user_email
       FROM usage_logs l
       JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC LIMIT 40`
    )
    .all();

  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 40').all();
  res.json({ settings, recentLogs, auditLogs });
});

adminRouter.put('/ai-config', requireRole(['super_admin']), (req: AuthenticatedRequest, res) => {
  const updates = req.body || {};
  const allowedKeys = [
    'text_model',
    'tts_model',
    'transcribe_model',
    'input_cost_per_1m_usd',
    'output_cost_per_1m_usd',
    'tts_cost_per_minute_usd',
    'global_daily_usd_cap',
    'usd_to_uzs_rate',
    'referral_reward_credits',
    'teacher_system_prompt',
  ];
  const upsert = db.prepare(`
    INSERT INTO ai_settings (key, value_text, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_text = excluded.value_text, updated_at = excluded.updated_at
  `);
  const now = nowIso();
  for (const k of allowedKeys) {
    if (typeof updates[k] === 'string') {
      upsert.run(k, updates[k].trim(), now);
    }
  }
  logAudit(req.userId!, 'admin.update_ai_settings', 'ai_settings', 'global', updates, req.ip);
  res.json({ ok: true });
});

// Content Management (CMS) — Vocabulary & Scenarios
adminRouter.get('/content', requireRole(['super_admin', 'moderator']), (_req, res) => {
  const vocabulary = db.prepare('SELECT * FROM vocabulary ORDER BY created_at DESC LIMIT 50').all();
  const scenarios = db.prepare('SELECT * FROM scenarios').all();
  const cases = db.prepare('SELECT id, title, grammar_topic, cefr_level, is_curated, created_at FROM detective_cases ORDER BY created_at DESC LIMIT 30').all();
  res.json({ vocabulary, scenarios, cases });
});

adminRouter.post('/content/vocabulary', requireRole(['super_admin', 'moderator']), (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.word || !b.translation_uz || !b.definition_en) {
    res.status(400).json({ error: 'Word, English definition, and Uzbek translation are required.' });
    return;
  }
  db.prepare(`
    INSERT INTO vocabulary (
      id, word, phonetic, part_of_speech, cefr_level, mood_tag,
      definition_en, translation_uz, translation_ru, example_en, example_uz, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(),
    b.word.trim(),
    b.phonetic || '/wɜːd/',
    b.part_of_speech || 'noun',
    b.cefr_level || 'B1',
    b.mood_tag || 'Curious',
    b.definition_en.trim(),
    b.translation_uz.trim(),
    b.translation_ru || '',
    b.example_en || '',
    b.example_uz || '',
    nowIso()
  );
  logAudit(req.userId!, 'cms.create_vocabulary', 'vocabulary', b.word, {}, req.ip);
  res.status(201).json({ ok: true });
});

// GET /api/admin/export/:dataset — CSV Export for Users, Payments, AI Usage
adminRouter.get('/export/:dataset', requireRole(['super_admin']), (req, res) => {
  const dataset = req.params.dataset;
  let rows: Array<Record<string, any>> = [];
  if (dataset === 'users') {
    rows = db
      .prepare(
        `SELECT u.id, u.email, u.full_name, u.role, u.status, s.plan_id, s.status as sub_status, p.xp, p.streak_days, u.created_at
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
         LEFT JOIN profiles p ON p.user_id = u.id`
      )
      .all() as Array<Record<string, any>>;
  } else if (dataset === 'payments') {
    rows = db
      .prepare('SELECT id, user_id, plan_id, provider, amount_usd, amount_uzs, currency, status, is_sandbox, created_at FROM payments')
      .all() as Array<Record<string, any>>;
  } else {
    rows = db
      .prepare('SELECT id, user_id, feature_mode, model_name, total_tokens, audio_seconds, estimated_cost_usd, status, created_at FROM usage_logs')
      .all() as Array<Record<string, any>>;
  }

  if (rows.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.send('empty\n');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mindquest_${dataset}.csv"`);
  res.send(csvLines.join('\n'));
});
